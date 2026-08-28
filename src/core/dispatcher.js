import { PermissionFlagsBits } from 'discord.js';
import { guildIdOf } from './intents.js';
import { newErrorId } from './errors.js';

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
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} content
   * @returns {Promise<unknown>}
   */
  const respond = (interaction, content) => {
    const payload = { content, ...EPHEMERAL };
    return interaction.replied || interaction.deferred
      ? interaction.followUp(payload)
      : interaction.reply(payload);
  };

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const raw = registries.commands.get(interaction.commandName);
    if (!raw) {
      await respond(interaction, "Cette commande n'existe plus. Elle a peut-être été désactivée.");
      return;
    }
    const entry =
      /** @type {{ plugin: string, command: import('./registry/commands.js').CommandDef }} */ (raw);

    if (!(await isActive(entry.plugin, interaction.guildId))) {
      await respond(interaction, `Le plugin \`${entry.plugin}\` n'est pas activé sur ce serveur.`);
      return;
    }

    if (!isAllowed(entry.command, interaction)) {
      await respond(interaction, "Vous n'avez pas la permission d'utiliser cette commande.");
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
      await respond(interaction, `Une erreur est survenue. Référence : \`${errorId}\``);
    }
  });
};

/**
 * @param {unknown} error
 * @returns {string}
 */
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

/**
 * @param {unknown} error
 * @returns {string | undefined}
 */
const errorStack = (error) => (error instanceof Error ? error.stack : undefined);
