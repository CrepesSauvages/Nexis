import { SlashCommandBuilder } from 'discord.js';

const EPHEMERAL = { flags: 64 };

const data = new SlashCommandBuilder()
  .setName('nexis')
  .setDescription('Administration des plugins Nexis')
  .addSubcommand((sub) => sub.setName('list').setDescription('Lister les plugins disponibles'))
  .addSubcommand((sub) =>
    sub
      .setName('enable')
      .setDescription('Activer un plugin sur ce serveur')
      .addStringOption((option) =>
        option.setName('plugin').setDescription('Nom du plugin').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('disable')
      .setDescription('Désactiver un plugin sur ce serveur')
      .addStringOption((option) =>
        option.setName('plugin').setDescription('Nom du plugin').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('info')
      .setDescription("Détail d'un plugin et de sa configuration")
      .addStringOption((option) =>
        option.setName('plugin').setDescription('Nom du plugin').setRequired(true),
      ),
  );

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} content
 * @returns {Promise<unknown>}
 */
const reply = (interaction, content) => interaction.reply({ content, ...EPHEMERAL });

/**
 * Construit la commande /nexis. Prend `core` en paramètre plutôt que de
 * le lire d'un contexte global : la commande se teste ainsi sans Discord.
 *
 * Le type de retour n'est volontairement pas forcé vers `CommandDef` ici :
 * cette annotation élargirait la signature réelle de `execute` (1 paramètre)
 * vers celle, plus large, du contrat partagé (2 paramètres), et empêcherait
 * les tests d'appeler `command.execute(interaction)` avec un seul argument.
 * L'appelant (`plugins/core/index.js`) fait le cast vers `CommandDef`
 * uniquement au point où `registerCommand` l'exige.
 *
 * @param {{ plugins: import('../../../src/core/loader.js').LoadedPlugin[], guildConfig: ReturnType<typeof import('../../../src/core/guild-config.js').createGuildConfig>, commandSync: { syncGuild: (guildId: string) => Promise<void> } }} core
 */
export const buildNexisCommand = (core) => {
  /** @param {string} name */
  const find = (name) => core.plugins.find((plugin) => plugin.name === name);

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  const list = async (interaction) => {
    const enabled = await core.guildConfig.enabledPlugins(interaction.guildId ?? '');
    const lines = core.plugins.map((plugin) => {
      const mark = enabled.includes(plugin.name) ? '✅' : '◻️';
      return `${mark} **${plugin.name}** \`${plugin.manifest.version}\` — ${plugin.manifest.description ?? 'sans description'}`;
    });
    const body = lines.length ? lines.join('\n') : 'Aucun plugin trouvé dans `plugins/`.';
    await reply(interaction, `**Plugins Nexis**\n${body}`);
  };

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} name
   */
  const enable = async (interaction, name) => {
    const plugin = find(name);
    if (!plugin) {
      await reply(interaction, `Plugin introuvable : \`${name}\``);
      return;
    }

    const guildId = interaction.guildId ?? '';
    if (await core.guildConfig.isEnabled(guildId, name)) {
      await reply(interaction, `\`${name}\` est déjà activé ici.`);
      return;
    }

    const enabled = await core.guildConfig.enabledPlugins(guildId);
    const missing = (plugin.manifest.dependsOn ?? []).filter((dep) => !enabled.includes(dep));
    if (missing.length) {
      await reply(
        interaction,
        `\`${name}\` dépend de ${missing.map((dep) => `\`${dep}\``).join(', ')}. Activez ${missing.length > 1 ? 'ces plugins' : 'ce plugin'} d'abord.`,
      );
      return;
    }

    await core.guildConfig.enable(guildId, name);
    await core.commandSync.syncGuild(guildId);
    await reply(interaction, `\`${name}\` activé sur ce serveur.`);
  };

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} name
   */
  const disable = async (interaction, name) => {
    const plugin = find(name);
    if (!plugin) {
      await reply(interaction, `Plugin introuvable : \`${name}\``);
      return;
    }

    const guildId = interaction.guildId ?? '';
    const enabled = await core.guildConfig.enabledPlugins(guildId);
    const dependents = core.plugins
      .filter((other) => enabled.includes(other.name))
      .filter((other) => (other.manifest.dependsOn ?? []).includes(name))
      .map((other) => other.name);

    if (dependents.length) {
      await reply(
        interaction,
        `Impossible : ${dependents.map((dep) => `\`${dep}\``).join(', ')} en dépend${dependents.length > 1 ? 'ent' : ''}.`,
      );
      return;
    }

    await core.guildConfig.disable(guildId, name);
    await core.commandSync.syncGuild(guildId);
    await reply(interaction, `\`${name}\` désactivé sur ce serveur.`);
  };

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} name
   */
  const info = async (interaction, name) => {
    const plugin = find(name);
    if (!plugin) {
      await reply(interaction, `Plugin introuvable : \`${name}\``);
      return;
    }

    const { manifest } = plugin;
    const guildId = interaction.guildId ?? '';
    const values = await core.guildConfig.getConfig(guildId, name, manifest.config);
    const enabled = await core.guildConfig.isEnabled(guildId, name);

    const settings = Object.entries(manifest.config ?? {}).map(([key, entry]) => {
      const current = values[key] === undefined ? '_non définie_' : `\`${values[key]}\``;
      const flag = entry.required ? ' *(requis)*' : '';
      return `• **${entry.label}** (\`${key}\`, ${entry.type})${flag} → ${current}`;
    });

    const parts = [
      `**${manifest.name}** \`${manifest.version}\` — ${enabled ? 'activé' : 'désactivé'}`,
      manifest.description ?? 'sans description',
    ];
    if (manifest.dependsOn?.length) {
      parts.push(`Dépend de : ${manifest.dependsOn.map((dep) => `\`${dep}\``).join(', ')}`);
    }
    parts.push(
      settings.length
        ? `\n**Configuration**\n${settings.join('\n')}`
        : '\nAucune option de configuration.',
    );

    await reply(interaction, parts.join('\n'));
  };

  return {
    data,
    permissions: 'guild-admin',
    /** @param {unknown} interaction */
    async execute(interaction) {
      const typed = /** @type {import('discord.js').ChatInputCommandInteraction} */ (interaction);
      const subcommand = typed.options.getSubcommand();
      if (subcommand === 'list') return list(typed);
      const name = /** @type {string} */ (typed.options.getString('plugin'));
      if (subcommand === 'enable') return enable(typed, name);
      if (subcommand === 'disable') return disable(typed, name);
      return info(typed, name);
    },
  };
};
