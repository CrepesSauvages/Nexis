import { SlashCommandBuilder } from 'discord.js';
import { localizationsFor } from '../../../src/core/i18n/index.js';
import { createPluginAdmin } from '../../../src/core/plugin-admin.js';

const EPHEMERAL = { flags: 64 };

/**
 * Noms affichés des langues, indépendants des clés de traduction : ce sont
 * des noms propres (chaque langue s'auto-désigne dans sa propre graphie),
 * pas des phrases à traduire par locale.
 * @type {Record<string, string>}
 */
const LANGUAGE_NAMES = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  pt: 'Português',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
};

const data = new SlashCommandBuilder()
  .setName('nexis')
  .setDescription('Administration des plugins Nexis')
  .setDescriptionLocalizations(localizationsFor('nexis.command.description'))
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('Lister les plugins disponibles')
      .setDescriptionLocalizations(localizationsFor('nexis.command.list.description')),
  )
  .addSubcommand((sub) =>
    sub
      .setName('enable')
      .setDescription('Activer un plugin sur ce serveur')
      .setDescriptionLocalizations(localizationsFor('nexis.command.enable.description'))
      .addStringOption((option) =>
        option
          .setName('plugin')
          .setDescription('Nom du plugin')
          .setDescriptionLocalizations(localizationsFor('nexis.command.option.plugin.description'))
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('disable')
      .setDescription('Désactiver un plugin sur ce serveur')
      .setDescriptionLocalizations(localizationsFor('nexis.command.disable.description'))
      .addStringOption((option) =>
        option
          .setName('plugin')
          .setDescription('Nom du plugin')
          .setDescriptionLocalizations(localizationsFor('nexis.command.option.plugin.description'))
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('info')
      .setDescription("Détail d'un plugin et de sa configuration")
      .setDescriptionLocalizations(localizationsFor('nexis.command.info.description'))
      .addStringOption((option) =>
        option
          .setName('plugin')
          .setDescription('Nom du plugin')
          .setDescriptionLocalizations(localizationsFor('nexis.command.option.plugin.description'))
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('errors')
      .setDescription('Erreurs récentes (propriétaire uniquement)')
      .setDescriptionLocalizations(localizationsFor('nexis.command.errors.description')),
  )
  .addSubcommand((sub) =>
    sub
      .setName('locale')
      .setDescription('Définir la langue du bot sur ce serveur')
      .setDescriptionLocalizations(localizationsFor('nexis.command.locale.description'))
      .addStringOption((option) =>
        option
          .setName('langue')
          .setDescription('Langue à utiliser sur ce serveur')
          .setDescriptionLocalizations(localizationsFor('nexis.command.option.langue.description'))
          .setRequired(true)
          .addChoices(
            { name: 'Français', value: 'fr' },
            { name: 'English', value: 'en' },
            { name: 'Español', value: 'es' },
            { name: 'Deutsch', value: 'de' },
            { name: 'Português', value: 'pt' },
            { name: 'Italiano', value: 'it' },
            { name: 'Nederlands', value: 'nl' },
            { name: 'Polski', value: 'pl' },
          ),
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
 * @param {{ plugins: import('../../../src/core/loader.js').LoadedPlugin[], guildConfig: ReturnType<typeof import('../../../src/core/guild-config.js').createGuildConfig>, commandSync: { syncGuild: (guildId: string) => Promise<void> }, alwaysEnabled: string[], ownerId: string | undefined, errorReporting: { getRecent: (count?: number) => Promise<import('../../../src/core/reporting/driver.js').ReportEntry[]> }, t: (locale: string, key: string, params?: Record<string, string | number>) => string, resolveLocale: (interaction: { locale?: string, guildId?: string | null }) => Promise<string> }} core
 */
export const buildNexisCommand = (core) => {
  /** @param {string} name */
  const find = (name) => core.plugins.find((plugin) => plugin.name === name);

  /**
   * `core` (celui de `/nexis` lui-même) n'est jamais présent dans la liste
   * stockée des plugins activés par serveur : il est actif inconditionnellement
   * via `alwaysEnabled`. Le confondre avec un plugin normal le ferait
   * apparaître comme désactivé, et `enable`/`disable` deviendraient des
   * no-op silencieux avec une fausse confirmation.
   * @param {string} name
   * @returns {boolean}
   */
  const isAlwaysEnabled = (name) => core.alwaysEnabled.includes(name);

  /**
   * Les règles d'activation vivent dans le core : cette commande n'en est
   * qu'une des deux interfaces, l'API du dashboard étant l'autre.
   *
   * Construit une instance à chaque appel plutôt qu'une seule fois ici :
   * les tests réassignent `core.plugins` après la construction de la
   * commande, et une instance capturée une bonne fois pour toutes fermerait
   * sur le tableau désormais périmé.
   * @returns {ReturnType<typeof createPluginAdmin>}
   */
  const admin = () =>
    createPluginAdmin({
      plugins: core.plugins,
      guildConfig: core.guildConfig,
      commandSync: core.commandSync,
      alwaysEnabled: core.alwaysEnabled,
    });

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  const list = async (interaction) => {
    const locale = await core.resolveLocale(interaction);
    const enabled = await core.guildConfig.enabledPlugins(interaction.guildId ?? '');
    const lines = core.plugins.map((plugin) => {
      const mark = isAlwaysEnabled(plugin.name)
        ? core.t(locale, 'nexis.list.mark_always')
        : enabled.includes(plugin.name)
          ? '✅'
          : '◻️';
      return core.t(locale, 'nexis.list.entry', {
        mark,
        name: plugin.name,
        version: plugin.manifest.version,
        description: plugin.manifest.description ?? core.t(locale, 'nexis.list.no_description'),
      });
    });
    const body = lines.length ? lines.join('\n') : core.t(locale, 'nexis.list.empty');
    await reply(interaction, `${core.t(locale, 'nexis.list.title')}\n${body}`);
  };

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} name
   */
  const enable = async (interaction, name) => {
    const locale = await core.resolveLocale(interaction);
    const result = await admin().enable(interaction.guildId ?? '', name);

    if (result.ok) {
      await reply(interaction, core.t(locale, 'nexis.enable.success', { name }));
      return;
    }
    if (result.reason === 'not_found') {
      await reply(interaction, core.t(locale, 'nexis.plugin_not_found', { name }));
      return;
    }
    if (result.reason === 'always_enabled') {
      await reply(interaction, core.t(locale, 'nexis.always_enabled', { name }));
      return;
    }
    if (result.reason === 'already_enabled') {
      await reply(interaction, core.t(locale, 'nexis.enable.already', { name }));
      return;
    }

    const missing = result.deps ?? [];
    const deps = missing.map((dep) => `\`${dep}\``).join(', ');
    await reply(
      interaction,
      core.t(locale, 'nexis.enable.missing_deps', { name, deps, count: missing.length }),
    );
  };

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} name
   */
  const disable = async (interaction, name) => {
    const locale = await core.resolveLocale(interaction);
    const result = await admin().disable(interaction.guildId ?? '', name);

    if (result.ok) {
      await reply(interaction, core.t(locale, 'nexis.disable.success', { name }));
      return;
    }
    if (result.reason === 'not_found') {
      await reply(interaction, core.t(locale, 'nexis.plugin_not_found', { name }));
      return;
    }
    if (result.reason === 'always_enabled') {
      await reply(interaction, core.t(locale, 'nexis.always_enabled', { name }));
      return;
    }

    const dependents = result.deps ?? [];
    const deps = dependents.map((dep) => `\`${dep}\``).join(', ');
    await reply(
      interaction,
      core.t(locale, 'nexis.disable.dependents', { deps, count: dependents.length }),
    );
  };

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} name
   */
  const info = async (interaction, name) => {
    const locale = await core.resolveLocale(interaction);
    const plugin = find(name);
    if (!plugin) {
      await reply(interaction, core.t(locale, 'nexis.plugin_not_found', { name }));
      return;
    }

    const { manifest } = plugin;
    const guildId = interaction.guildId ?? '';
    const values = await core.guildConfig.getConfig(guildId, name, manifest.config);
    const enabled = await core.guildConfig.isEnabled(guildId, name);

    const settings = Object.entries(manifest.config ?? {}).map(([key, entry]) => {
      const current =
        values[key] === undefined
          ? core.t(locale, 'nexis.info.value_undefined')
          : `\`${values[key]}\``;
      const flag = entry.required ? core.t(locale, 'nexis.info.required_flag') : '';
      return core.t(locale, 'nexis.info.setting', {
        label: entry.label,
        key,
        type: entry.type,
        flag,
        current,
      });
    });

    const status = enabled
      ? core.t(locale, 'nexis.info.status_enabled')
      : core.t(locale, 'nexis.info.status_disabled');
    const parts = [
      core.t(locale, 'nexis.info.header', {
        name: manifest.name,
        version: manifest.version,
        status,
      }),
      manifest.description ?? core.t(locale, 'nexis.list.no_description'),
    ];
    if (manifest.dependsOn?.length) {
      const deps = manifest.dependsOn.map((dep) => `\`${dep}\``).join(', ');
      parts.push(core.t(locale, 'nexis.info.depends_on', { deps }));
    }
    parts.push(
      settings.length
        ? core.t(locale, 'nexis.info.settings_header', { settings: settings.join('\n') })
        : core.t(locale, 'nexis.info.no_settings'),
    );

    await reply(interaction, parts.join('\n'));
  };

  // Longueur max du contexte inliné par entrée. `/nexis errors` est une
  // liste de repérage rapide, pas une visionneuse de détail : la stack
  // complète (souvent 700-2500 caractères, cf. errorStack() dans errors.js)
  // resterait disponible dans Sentry et dans `core:errors` brut, mais
  // inlinée ici elle épuiserait à elle seule le budget des 1900 caractères
  // et ferait passer getRecent(10) pour un getRecent(1) en pratique.
  const CONTEXT_PREVIEW_LENGTH = 150;

  /**
   * @param {Record<string, unknown>} [context]
   * @returns {string}
   */
  const formatContext = (context) => {
    if (!context) return '';
    // `stack` est exclu : c'est lui qui fait exploser le budget par entrée.
    const rest = Object.fromEntries(Object.entries(context).filter(([key]) => key !== 'stack'));
    if (!Object.keys(rest).length) return '';
    const json = JSON.stringify(rest);
    return json.length > CONTEXT_PREVIEW_LENGTH
      ? ` ${json.slice(0, CONTEXT_PREVIEW_LENGTH)}…`
      : ` ${json}`;
  };

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  const errorsCmd = async (interaction) => {
    const locale = await core.resolveLocale(interaction);
    if (interaction.user.id !== core.ownerId) {
      await reply(interaction, core.t(locale, 'nexis.owner_only'));
      return;
    }

    const entries = await core.errorReporting.getRecent(10);
    if (!entries.length) {
      await reply(interaction, core.t(locale, 'nexis.errors.none'));
      return;
    }

    const lines = entries.map((entry) => {
      const context = formatContext(entry.context);
      return core.t(locale, 'nexis.errors.entry', {
        id: entry.id,
        timestamp: entry.timestamp,
        message: entry.message,
        context,
      });
    });

    // Garde-fou dur : une réponse Discord est plafonnée à 2000 caractères.
    // Tronque ligne par ligne plutôt que de risquer un échec de reply().
    const MAX_LENGTH = 1900;
    let body = `${core.t(locale, 'nexis.errors.title')}\n${lines.join('\n')}`;
    if (body.length > MAX_LENGTH) {
      body = `${body.slice(0, MAX_LENGTH)}…`;
    }

    await reply(interaction, body);
  };

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} locale
   */
  const setLocale = async (interaction, locale) => {
    await core.guildConfig.setLocale(interaction.guildId ?? '', locale);
    await reply(
      interaction,
      core.t(locale, 'nexis.locale.confirmed', { language: LANGUAGE_NAMES[locale] }),
    );
  };

  return {
    data,
    permissions: 'guild-admin',
    /** @param {unknown} interaction */
    async execute(interaction) {
      const typed = /** @type {import('discord.js').ChatInputCommandInteraction} */ (interaction);
      const subcommand = typed.options.getSubcommand();
      if (subcommand === 'list') return list(typed);
      if (subcommand === 'errors') return errorsCmd(typed);
      if (subcommand === 'locale') {
        const locale = /** @type {string} */ (typed.options.getString('langue'));
        return setLocale(typed, locale);
      }
      const name = /** @type {string} */ (typed.options.getString('plugin'));
      if (subcommand === 'enable') return enable(typed, name);
      if (subcommand === 'disable') return disable(typed, name);
      return info(typed, name);
    },
  };
};

/**
 * Fabrique de commande compatible avec la convention de chargement automatique.
 * @param {import('../../../src/core/context.js').PluginContext} ctx
 */
export default (ctx) => {
  const core =
    /** @type {{ plugins: import('../../../src/core/loader.js').LoadedPlugin[], guildConfig: ReturnType<typeof import('../../../src/core/guild-config.js').createGuildConfig>, commandSync: { syncGuild: (guildId: string) => Promise<void> }, alwaysEnabled: string[], ownerId: string | undefined, errorReporting: { getRecent: (count?: number) => Promise<import('../../../src/core/reporting/driver.js').ReportEntry[]> }, t: (locale: string, key: string, params?: Record<string, string | number>) => string, resolveLocale: (interaction: { locale?: string, guildId?: string | null }) => Promise<string> }} */ ({
      ...ctx.core,
      t: ctx.t,
      resolveLocale: ctx.resolveLocale,
    });
  return buildNexisCommand(core);
};
