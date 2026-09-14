import { PermissionFlagsBits } from 'discord.js';
import { guildIdOf } from './intents.js';
import { CHAT_INPUT, USER_CONTEXT_MENU, MESSAGE_CONTEXT_MENU } from './registry/commands.js';
import { newErrorId, errorMessage, errorStack } from './errors.js';
import { resolveLocale } from './i18n/locale-resolver.js';

const EPHEMERAL = { flags: 64 };

/**
 * Un plugin est actif pour une guild s'il est explicitement activé, ou
 * s'il fait partie des plugins internes toujours disponibles.
 *
 * Exportée pour que le routeur HTTP (router.js) applique exactement la même
 * règle d'activation que les trois dispatchers Discord ci-dessous : un
 * plugin désactivé sur un serveur doit perdre sa surface HTTP au même
 * titre que ses commandes, events et jobs.
 *
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} guildConfig
 * @param {string[]} alwaysEnabled
 * @returns {(plugin: string, guildId: string | null | undefined) => Promise<boolean>}
 */
export const makeIsActive = (guildConfig, alwaysEnabled) => async (plugin, guildId) => {
  if (alwaysEnabled.includes(plugin)) return true;
  if (!guildId) return false;
  return guildConfig.isEnabled(guildId, plugin);
};

/**
 * Partagé entre commandes et components : même échelle de permissions,
 * même interprétation ("guild-admin" = ManageGuild, "owner" = propriétaire
 * du bot, absent = tout le monde).
 * @param {'guild-admin' | 'owner' | undefined} permissions
 * @param {import('discord.js').Interaction} interaction
 * @param {string | undefined} ownerId
 * @returns {boolean}
 */
const checkPermission = (permissions, interaction, ownerId) => {
  if (permissions === 'owner') return interaction.user.id === ownerId;
  if (permissions === 'guild-admin') {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true;
  }
  return true;
};

/**
 * Répond à l'interaction sans jamais laisser une erreur de réponse (token
 * expiré, interaction déjà acquittée...) devenir un rejet non intercepté :
 * `client.on('interactionCreate', ...)` n'est jamais awaité par discord.js,
 * un rejet non capturé y tue le process depuis Node 15.
 * @param {import('./logger.js').Logger} logger
 * @param {import('discord.js').CommandInteraction | import('discord.js').MessageComponentInteraction} interaction
 * @param {string} content
 * @param {Record<string, unknown>} logContext
 * @returns {Promise<void>}
 */
const respondToInteraction = async (logger, interaction, content, logContext) => {
  try {
    const payload = { content, ...EPHEMERAL };
    const typed =
      /** @type {import('discord.js').CommandInteraction | import('discord.js').MessageComponentInteraction} */ (
        interaction
      );
    if (typed.replied || typed.deferred) {
      await typed.followUp(payload);
    } else {
      await typed.reply(payload);
    }
  } catch (error) {
    logger.warn(`Réponse à l'interaction impossible : ${errorMessage(error)}`, logContext);
  }
};

/**
 * Résolution de la locale avec sa propre défense : une erreur de storage
 * ne doit jamais faire planter le dispatch, on retombe sur l'absence
 * d'override. Contrairement à la vérification d'activation, cette
 * dégradation ne touche pas à la sécurité : c'est un `warn`, pas un `error`.
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} guildConfig
 * @param {import('./logger.js').Logger} logger
 * @param {import('discord.js').Interaction} interaction
 * @param {Record<string, unknown>} logContext
 * @returns {Promise<string>}
 */
const resolveInteractionLocale = async (guildConfig, logger, interaction, logContext) => {
  let guildOverride;
  try {
    guildOverride = interaction.guildId
      ? await guildConfig.getLocale(interaction.guildId)
      : undefined;
  } catch (error) {
    logger.warn(`Résolution de la locale serveur impossible : ${errorMessage(error)}`, {
      ...logContext,
      stack: errorStack(error),
    });
    guildOverride = undefined;
  }
  return resolveLocale(interaction, guildOverride);
};

/**
 * Nombre maximal de choix qu'une réponse d'autocomplétion peut porter.
 * Au-delà, Discord rejette la réponse entière en 400 : le core tronque
 * plutôt que de laisser chaque plugin découvrir la limite en production.
 */
const MAX_AUTOCOMPLETE_CHOICES = 25;

/**
 * Déduit le type de commande d'application d'une interaction discord.js,
 * ou `undefined` si elle n'en est pas une. Les trois types partagent le
 * même dispatch : même activation, mêmes permissions, même traçabilité —
 * seul l'espace de noms du registre les distingue.
 *
 * Les prédicats sont appelés en optionnel : les doublures des tests
 * n'implémentent que celui qui les concerne.
 *
 * @param {import('discord.js').Interaction} interaction
 * @returns {number | undefined}
 */
const commandTypeOf = (interaction) => {
  if (interaction.isChatInputCommand?.()) return CHAT_INPUT;
  if (interaction.isUserContextMenuCommand?.()) return USER_CONTEXT_MENU;
  if (interaction.isMessageContextMenuCommand?.()) return MESSAGE_CONTEXT_MENU;
  return undefined;
};

/**
 * Répond à une interaction d'autocomplétion, avec la même protection que
 * `respondToInteraction` : un rejet ici (token expiré, interaction déjà
 * répondue) ne doit jamais remonter jusqu'à un listener non awaité.
 *
 * @param {import('./logger.js').Logger} logger
 * @param {import('discord.js').AutocompleteInteraction} interaction
 * @param {unknown} choices
 * @param {Record<string, unknown>} logContext
 * @returns {Promise<void>}
 */
const respondWithChoices = async (logger, interaction, choices, logContext) => {
  if (choices !== undefined && !Array.isArray(choices)) {
    logger.warn(
      'Autocomplétion ignorée : le handler doit retourner un tableau de choix, pas y répondre lui-même',
      logContext,
    );
  }
  const list = Array.isArray(choices) ? choices.slice(0, MAX_AUTOCOMPLETE_CHOICES) : [];
  try {
    await interaction.respond(list);
  } catch (error) {
    logger.warn(`Réponse à l'autocomplétion impossible : ${errorMessage(error)}`, logContext);
  }
};

/**
 * Attache un listener unique par type d'event déclaré. Chaque handler
 * est appelé dans son propre try/catch : un plugin qui échoue n'empêche
 * jamais ses voisins de recevoir l'event, ni les events suivants.
 *
 * @param {object} options
 * @param {import('discord.js').Client} options.client
 * @param {import('./loader.js').LoadedPlugin[]} options.plugins
 * @param {import('./registry/index.js').Registries} options.registries
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} options.guildConfig
 * @param {import('./logger.js').Logger} options.logger
 * @param {string[]} [options.alwaysEnabled]
 * @returns {void}
 */
export const attachEventDispatcher = ({
  client,
  plugins,
  registries,
  guildConfig,
  logger,
  alwaysEnabled = [],
}) => {
  /** @type {Map<string, boolean>} */
  const allowsDM = new Map(
    plugins.map((plugin) => [plugin.name, plugin.manifest.allowDM === true]),
  );
  const isActive = makeIsActive(guildConfig, alwaysEnabled);

  for (const eventName of registries.events.eventNames()) {
    client.on(eventName, async (...args) => {
      const guildId = guildIdOf(eventName, args);

      for (const { plugin, handler } of registries.events.handlersFor(eventName)) {
        const permitted = guildId ? await isActive(plugin, guildId) : allowsDM.get(plugin) === true;
        if (!permitted) continue;

        try {
          await handler(...args);
        } catch (error) {
          logger.error(`Erreur dans un handler d'event : ${errorMessage(error)}`, {
            plugin,
            event: eventName,
            guildId,
            stack: errorStack(error),
          });
        }
      }
    });
  }
};

/**
 * Attache le listener de commandes. Vérifie l'activation du plugin puis
 * les permissions, avant d'exécuter. Toute erreur renvoie à l'utilisateur
 * un identifiant court, présent aussi dans le log — un rapport de bug
 * devient traçable sans demander à l'utilisateur de décrire son écran.
 *
 * @param {object} options
 * @param {import('discord.js').Client} options.client
 * @param {Map<string, import('./context.js').PluginContext>} options.contexts
 * @param {import('./registry/index.js').Registries} options.registries
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} options.guildConfig
 * @param {import('./logger.js').Logger} options.logger
 * @param {string[]} [options.alwaysEnabled]
 * @param {string} [options.ownerId]
 * @param {(locale: string, key: string, params?: Record<string, string | number>) => string} [options.t]
 * @returns {void}
 */
export const attachCommandDispatcher = ({
  client,
  contexts,
  registries,
  guildConfig,
  logger,
  alwaysEnabled = [],
  ownerId = undefined,
  t = (_locale, key) => `[${key}]`,
}) => {
  const isActive = makeIsActive(guildConfig, alwaysEnabled);

  client.on('interactionCreate', async (interaction) => {
    const type = commandTypeOf(interaction);
    if (type === undefined) return;

    // `commandTypeOf` a déjà écarté tout ce qui n'est pas une commande ;
    // discord.js ne le sait pas, d'où ce rétrécissement explicite vers le
    // type commun aux trois (slash et menus contextuels).
    const typed = /** @type {import('discord.js').CommandInteraction} */ (interaction);
    const logContext = { command: typed.commandName, guildId: typed.guildId };
    const locale = await resolveInteractionLocale(
      guildConfig,
      logger,
      /** @type {import('discord.js').Interaction} */ (typed),
      logContext,
    );

    const entry = registries.commands.get(typed.commandName, type);
    if (!entry) {
      await respondToInteraction(
        logger,
        typed,
        t(locale, 'dispatcher.command_removed'),
        logContext,
      );
      return;
    }

    // La vérification d'activation a sa propre défense : une erreur de
    // storage ici ne doit ni planter le process (rejet non capturé), ni
    // laisser passer la commande — on ferme (fail closed), pas l'inverse.
    let active = false;
    try {
      active = await isActive(entry.plugin, typed.guildId);
    } catch (error) {
      logger.error(`Vérification d'activation impossible : ${errorMessage(error)}`, {
        plugin: entry.plugin,
        ...logContext,
        stack: errorStack(error),
      });
    }
    if (!active) {
      await respondToInteraction(
        logger,
        typed,
        t(locale, 'dispatcher.plugin_not_active', { plugin: entry.plugin }),
        logContext,
      );
      return;
    }

    if (
      !checkPermission(
        entry.command.permissions,
        /** @type {import('discord.js').Interaction} */ (typed),
        ownerId,
      )
    ) {
      await respondToInteraction(
        logger,
        typed,
        t(locale, 'dispatcher.permission_denied'),
        logContext,
      );
      return;
    }

    try {
      await entry.command.execute(typed, contexts.get(entry.plugin));
    } catch (error) {
      const errorId = newErrorId();
      logger.error(`Erreur dans une commande : ${errorMessage(error)}`, {
        errorId,
        plugin: entry.plugin,
        ...logContext,
        stack: errorStack(error),
      });
      await respondToInteraction(
        logger,
        typed,
        t(locale, 'dispatcher.command_error', { errorId }),
        logContext,
      );
    }
  });
};

/**
 * Déduit le type de component Nexis (`button` | `select` | `modal`) d'une
 * interaction discord.js, ou `undefined` si elle n'en est pas un.
 * @param {import('discord.js').Interaction} interaction
 * @returns {'button' | 'select' | 'modal' | undefined}
 */
const componentTypeOf = (interaction) => {
  if (interaction.isButton()) return 'button';
  if (interaction.isAnySelectMenu()) return 'select';
  if (interaction.isModalSubmit()) return 'modal';
  return undefined;
};

/**
 * Attache le listener de components (boutons, selects, modals). Même
 * politique que les commandes : activation puis permissions avant
 * exécution, erreur traçable via un errorId si le handler échoue.
 *
 * @param {object} options
 * @param {import('discord.js').Client} options.client
 * @param {Map<string, import('./context.js').PluginContext>} options.contexts
 * @param {import('./registry/index.js').Registries} options.registries
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} options.guildConfig
 * @param {import('./logger.js').Logger} options.logger
 * @param {string[]} [options.alwaysEnabled]
 * @param {string} [options.ownerId]
 * @param {(locale: string, key: string, params?: Record<string, string | number>) => string} [options.t]
 * @returns {void}
 */
export const attachComponentDispatcher = ({
  client,
  contexts,
  registries,
  guildConfig,
  logger,
  alwaysEnabled = [],
  ownerId = undefined,
  t = (_locale, key) => `[${key}]`,
}) => {
  const isActive = makeIsActive(guildConfig, alwaysEnabled);

  client.on('interactionCreate', async (interaction) => {
    const type = componentTypeOf(interaction);
    if (!type) return;

    const typed = /** @type {import('discord.js').MessageComponentInteraction} */ (interaction);
    const logContext = { customId: typed.customId, guildId: typed.guildId };
    const locale = await resolveInteractionLocale(
      guildConfig,
      logger,
      /** @type {import('discord.js').Interaction} */ (typed),
      logContext,
    );

    const entry = registries.components.find(typed.customId, type);
    if (!entry) {
      await respondToInteraction(
        logger,
        typed,
        t(locale, 'dispatcher.component_removed'),
        logContext,
      );
      return;
    }

    let active = false;
    try {
      active = await isActive(entry.plugin, typed.guildId);
    } catch (error) {
      logger.error(`Vérification d'activation impossible : ${errorMessage(error)}`, {
        plugin: entry.plugin,
        ...logContext,
        stack: errorStack(error),
      });
    }
    if (!active) {
      await respondToInteraction(
        logger,
        typed,
        t(locale, 'dispatcher.plugin_not_active', { plugin: entry.plugin }),
        logContext,
      );
      return;
    }

    if (
      !checkPermission(
        entry.permissions,
        /** @type {import('discord.js').Interaction} */ (typed),
        ownerId,
      )
    ) {
      await respondToInteraction(
        logger,
        typed,
        t(locale, 'dispatcher.permission_denied'),
        logContext,
      );
      return;
    }

    try {
      await entry.handler(typed, contexts.get(entry.plugin));
    } catch (error) {
      const errorId = newErrorId();
      logger.error(`Erreur dans un component : ${errorMessage(error)}`, {
        errorId,
        plugin: entry.plugin,
        ...logContext,
        stack: errorStack(error),
      });
      await respondToInteraction(
        logger,
        typed,
        t(locale, 'dispatcher.component_error', { errorId }),
        logContext,
      );
    }
  });
};

/**
 * Attache le listener d'autocomplétion.
 *
 * Discord attend une réponse en moins de trois secondes et n'en accepte
 * qu'une seule : c'est donc le core qui répond, à partir du tableau de
 * choix que le handler retourne. Le plugin n'a ni à répondre lui-même, ni
 * à connaître la limite de 25 choix.
 *
 * Une autocomplétion n'a aucun canal pour expliquer un refus — elle ne
 * peut ni envoyer de message, ni être différée. Un plugin désactivé, une
 * permission refusée, un handler absent ou en erreur rendent donc tous la
 * même chose : une liste vide, plutôt qu'un silence que Discord afficherait
 * à l'utilisateur comme « échec du chargement des options ».
 *
 * @param {object} options
 * @param {import('discord.js').Client} options.client
 * @param {Map<string, import('./context.js').PluginContext>} options.contexts
 * @param {import('./registry/index.js').Registries} options.registries
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} options.guildConfig
 * @param {import('./logger.js').Logger} options.logger
 * @param {string[]} [options.alwaysEnabled]
 * @param {string} [options.ownerId]
 * @returns {void}
 */
export const attachAutocompleteDispatcher = ({
  client,
  contexts,
  registries,
  guildConfig,
  logger,
  alwaysEnabled = [],
  ownerId = undefined,
}) => {
  const isActive = makeIsActive(guildConfig, alwaysEnabled);

  client.on('interactionCreate', async (interaction) => {
    if (interaction.isAutocomplete?.() !== true) return;

    const typed = /** @type {import('discord.js').AutocompleteInteraction} */ (interaction);
    const logContext = { command: typed.commandName, guildId: typed.guildId };

    // Seules les commandes slash ont des options, donc une autocomplétion.
    const entry = registries.commands.get(typed.commandName, CHAT_INPUT);
    const autocomplete = entry?.command.autocomplete;
    if (!entry || !autocomplete) {
      await respondWithChoices(logger, typed, [], logContext);
      return;
    }

    let active = false;
    try {
      active = await isActive(entry.plugin, typed.guildId);
    } catch (error) {
      logger.error(`Vérification d'activation impossible : ${errorMessage(error)}`, {
        plugin: entry.plugin,
        ...logContext,
        stack: errorStack(error),
      });
    }
    if (!active) {
      await respondWithChoices(logger, typed, [], logContext);
      return;
    }

    // Même échelle de permissions que la commande elle-même : les choix
    // proposés sont calculés par le plugin sur ses propres données, et
    // les suggérer à quelqu'un dont l'exécution serait refusée reviendrait
    // à lui montrer par la porte de derrière ce que la commande lui cache.
    if (
      !checkPermission(
        entry.command.permissions,
        /** @type {import('discord.js').Interaction} */ (typed),
        ownerId,
      )
    ) {
      await respondWithChoices(logger, typed, [], logContext);
      return;
    }

    try {
      const choices = await autocomplete(typed, contexts.get(entry.plugin));
      await respondWithChoices(logger, typed, choices, logContext);
    } catch (error) {
      // Pas d'errorId ici, contrairement aux commandes et aux components :
      // il n'y a personne à qui le montrer. La trace reste dans les logs et
      // dans le reporting.
      logger.error(`Erreur dans une autocomplétion : ${errorMessage(error)}`, {
        plugin: entry.plugin,
        ...logContext,
        stack: errorStack(error),
      });
      await respondWithChoices(logger, typed, [], logContext);
    }
  });
};
