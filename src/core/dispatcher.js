import { PermissionFlagsBits } from 'discord.js';
import { guildIdOf } from './intents.js';
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
    if (!interaction.isChatInputCommand()) return;

    const logContext = { command: interaction.commandName, guildId: interaction.guildId };
    const locale = await resolveInteractionLocale(guildConfig, logger, interaction, logContext);

    const entry = registries.commands.get(interaction.commandName);
    if (!entry) {
      await respondToInteraction(
        logger,
        interaction,
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
      active = await isActive(entry.plugin, interaction.guildId);
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
        interaction,
        t(locale, 'dispatcher.plugin_not_active', { plugin: entry.plugin }),
        logContext,
      );
      return;
    }

    if (!checkPermission(entry.command.permissions, interaction, ownerId)) {
      await respondToInteraction(
        logger,
        interaction,
        t(locale, 'dispatcher.permission_denied'),
        logContext,
      );
      return;
    }

    try {
      await entry.command.execute(interaction, contexts.get(entry.plugin));
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
        interaction,
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
