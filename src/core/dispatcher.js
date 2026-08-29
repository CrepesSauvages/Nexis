import { PermissionFlagsBits } from 'discord.js';
import { guildIdOf } from './intents.js';
import { newErrorId, errorMessage, errorStack } from './errors.js';
import { resolveLocale } from './i18n/locale-resolver.js';

const EPHEMERAL = { flags: 64 };

/**
 * Un plugin est actif pour une guild s'il est explicitement activé, ou
 * s'il fait partie des plugins internes toujours disponibles.
 *
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} guildConfig
 * @param {string[]} alwaysEnabled
 * @returns {(plugin: string, guildId: string | null | undefined) => Promise<boolean>}
 */
const makeIsActive = (guildConfig, alwaysEnabled) => async (plugin, guildId) => {
  if (alwaysEnabled.includes(plugin)) return true;
  if (!guildId) return false;
  return guildConfig.isEnabled(guildId, plugin);
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

  /**
   * @param {import('./registry/commands.js').CommandDef} command
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @returns {boolean}
   */
  const isAllowed = (command, interaction) => {
    if (command.permissions === 'owner') return interaction.user.id === ownerId;
    if (command.permissions === 'guild-admin') {
      return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true;
    }
    return true;
  };

  /**
   * Répond à l'interaction sans jamais laisser une erreur de réponse
   * (token expiré, interaction déjà acquittée...) devenir un rejet non
   * intercepté : `client.on('interactionCreate', ...)` n'est jamais awaité
   * par discord.js, et un rejet non capturé y tue le process depuis Node 15.
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} content
   * @returns {Promise<void>}
   */
  const respond = async (interaction, content) => {
    try {
      const payload = { content, ...EPHEMERAL };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (error) {
      logger.warn(`Réponse à l'interaction impossible : ${errorMessage(error)}`, {
        command: interaction.commandName,
        guildId: interaction.guildId,
      });
    }
  };

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // Résolution de la locale une seule fois : même défense que la
    // vérification d'activation ci-dessous — une erreur de storage ne doit
    // jamais faire planter le dispatch, on retombe sur l'absence d'override.
    let guildOverride;
    try {
      guildOverride = interaction.guildId
        ? await guildConfig.getLocale(interaction.guildId)
        : undefined;
    } catch {
      guildOverride = undefined;
    }
    const locale = resolveLocale(interaction, guildOverride);

    const entry = registries.commands.get(interaction.commandName);
    if (!entry) {
      await respond(interaction, t(locale, 'dispatcher.command_removed'));
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
        command: interaction.commandName,
        guildId: interaction.guildId,
        stack: errorStack(error),
      });
    }
    if (!active) {
      await respond(
        interaction,
        t(locale, 'dispatcher.plugin_not_active', { plugin: entry.plugin }),
      );
      return;
    }

    if (!isAllowed(entry.command, interaction)) {
      await respond(interaction, t(locale, 'dispatcher.permission_denied'));
      return;
    }

    try {
      await entry.command.execute(interaction, contexts.get(entry.plugin));
    } catch (error) {
      const errorId = newErrorId();
      logger.error(`Erreur dans une commande : ${errorMessage(error)}`, {
        errorId,
        plugin: entry.plugin,
        command: interaction.commandName,
        guildId: interaction.guildId,
        stack: errorStack(error),
      });
      await respond(interaction, t(locale, 'dispatcher.command_error', { errorId }));
    }
  });
};
