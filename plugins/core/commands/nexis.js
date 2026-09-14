import { SlashCommandBuilder } from 'discord.js';
import { localizationsFor } from '../../../src/core/i18n/index.js';
import { createPluginAdmin } from '../../../src/core/plugin-admin.js';
import { createCommandPerms } from '../../../src/core/command-perms.js';

/**
 * Ce que `/nexis` consomme du core. Extrait en typedef plutôt que répété
 * en ligne : la même forme sert à la fabrique, au cast du chargement par
 * convention et aux doublures des tests.
 *
 * @typedef {object} NexisCore
 * @property {import('../../../src/core/loader.js').LoadedPlugin[]} plugins
 * @property {ReturnType<typeof import('../../../src/core/guild-config.js').createGuildConfig>} guildConfig
 * @property {{ syncGuild: (guildId: string) => Promise<void> }} commandSync
 * @property {import('../../../src/core/registry/index.js').Registries} registries
 * @property {string[]} alwaysEnabled
 * @property {string | undefined} ownerId
 * @property {{ getRecent: (count?: number) => Promise<import('../../../src/core/reporting/driver.js').ReportEntry[]> }} errorReporting
 * @property {ReturnType<typeof import('../../../src/core/audit.js').createAudit>} audit
 * @property {(locale: string, key: string, params?: Record<string, string | number>) => string} t
 * @property {(interaction: { locale?: string, guildId?: string | null }) => Promise<string>} resolveLocale
 */

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

/**
 * L'option « commande » du groupe perms, identique sur ses trois
 * sous-commandes. Autocomplétée : la liste des commandes déclarées est
 * connue du bot, personne n'a à la deviner.
 * @param {import('discord.js').SlashCommandStringOption} option
 */
const commandOption = (option) =>
  option
    .setName('commande')
    .setDescription('Nom de la commande')
    .setDescriptionLocalizations(localizationsFor('nexis.command.option.commande.description'))
    .setAutocomplete(true)
    .setRequired(true);

/**
 * Clé de confirmation de chaque action du groupe perms. Une table plutôt
 * qu'un nom construit à la volée : « deny » donnerait « denyed ».
 * @type {Record<'allow' | 'deny' | 'reset', string>}
 */
/** Marge sous le plafond de 2000 caractères d'une réponse Discord. */
const MAX_REPLY_LENGTH = 1900;

const PERMS_SUCCESS_KEYS = {
  allow: 'nexis.perms.allowed',
  deny: 'nexis.perms.denied',
  reset: 'nexis.perms.reset',
};

/** @param {import('discord.js').SlashCommandRoleOption} option */
const roleOption = (option) =>
  option
    .setName('role')
    .setDescription('Rôle concerné')
    .setDescriptionLocalizations(localizationsFor('nexis.command.option.role.description'))
    .setRequired(true);

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
  )
  .addSubcommand((sub) =>
    sub
      .setName('audit')
      .setDescription('Qui a changé quoi sur ce serveur')
      .setDescriptionLocalizations(localizationsFor('nexis.command.audit.description')),
  )
  .addSubcommandGroup((group) =>
    group
      .setName('perms')
      .setDescription('Qui peut utiliser quelle commande sur ce serveur')
      .setDescriptionLocalizations(localizationsFor('nexis.command.perms.description'))
      .addSubcommand((sub) =>
        sub
          .setName('list')
          .setDescription('Lister les commandes et leurs rôles autorisés')
          .setDescriptionLocalizations(localizationsFor('nexis.command.perms.list.description')),
      )
      .addSubcommand((sub) =>
        sub
          .setName('allow')
          .setDescription('Autoriser un rôle à utiliser une commande')
          .setDescriptionLocalizations(localizationsFor('nexis.command.perms.allow.description'))
          .addStringOption((option) => commandOption(option))
          .addRoleOption((option) => roleOption(option)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('deny')
          .setDescription("Retirer un rôle de la liste d'une commande")
          .setDescriptionLocalizations(localizationsFor('nexis.command.perms.deny.description'))
          .addStringOption((option) => commandOption(option))
          .addRoleOption((option) => roleOption(option)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('reset')
          .setDescription('Rendre à une commande ses permissions par défaut')
          .setDescriptionLocalizations(localizationsFor('nexis.command.perms.reset.description'))
          .addStringOption((option) => commandOption(option)),
      ),
  );

/**
 * Réponse éphémère, sans jamais notifier personne : `/nexis perms` affiche
 * des rôles, et lister une règle n'est pas une raison de sonner chez ceux
 * qui la portent.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} content
 * @returns {Promise<unknown>}
 */
const reply = (interaction, content) =>
  interaction.reply({ content, allowedMentions: { parse: [] }, ...EPHEMERAL });

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
 * @param {NexisCore} core
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
      audit: core.audit,
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
    const result = await admin().enable(interaction.guildId ?? '', name, interaction.user.id);

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
    const result = await admin().disable(interaction.guildId ?? '', name, interaction.user.id);

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
    // Tronque plutôt que de risquer un échec de reply().
    let body = `${core.t(locale, 'nexis.errors.title')}\n${lines.join('\n')}`;
    if (body.length > MAX_REPLY_LENGTH) {
      body = `${body.slice(0, MAX_REPLY_LENGTH)}…`;
    }

    await reply(interaction, body);
  };

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} locale
   */
  const setLocale = async (interaction, locale) => {
    const guildId = interaction.guildId ?? '';
    await core.guildConfig.setLocale(guildId, locale);
    await core.audit.record({
      guildId,
      actor: interaction.user.id,
      action: 'locale.set',
      target: locale,
    });
    await reply(
      interaction,
      core.t(locale, 'nexis.locale.confirmed', { language: LANGUAGE_NAMES[locale] }),
    );
  };

  /**
   * Détail d'une entrée du journal, tronqué : la liste sert à repérer un
   * changement, pas à l'auditer en profondeur — l'API du dashboard rend la
   * même donnée sans troncature.
   * @param {Record<string, unknown>} [details]
   * @returns {string}
   */
  const formatDetails = (details) => {
    if (!details || !Object.keys(details).length) return '';
    const json = JSON.stringify(details);
    return json.length > 80 ? ` ${json.slice(0, 80)}…` : ` ${json}`;
  };

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  const auditCmd = async (interaction) => {
    const locale = await core.resolveLocale(interaction);
    const entries = await core.audit.recent(interaction.guildId ?? '', 10);
    if (!entries.length) {
      await reply(interaction, core.t(locale, 'nexis.audit.empty'));
      return;
    }

    const lines = entries.map((entry) =>
      core.t(locale, 'nexis.audit.entry', {
        // L'ISO complet coûte 24 caractères par ligne pour une précision
        // à la milliseconde dont personne n'a l'usage ici.
        timestamp: entry.timestamp.slice(0, 16).replace('T', ' '),
        actor: entry.actor,
        action: entry.action,
        target: entry.target,
        details: formatDetails(entry.details),
      }),
    );

    let body = `${core.t(locale, 'nexis.audit.title')}\n${lines.join('\n')}`;
    if (body.length > MAX_REPLY_LENGTH) body = `${body.slice(0, MAX_REPLY_LENGTH)}…`;
    await reply(interaction, body);
  };

  /**
   * Les règles de permission vivent dans le core, comme celles
   * d'activation : cette commande n'en est qu'une des deux interfaces.
   * Reconstruite à chaque appel pour la même raison que `admin()` — les
   * tests réassignent les registres après la construction de la commande.
   * @returns {ReturnType<typeof createCommandPerms>}
   */
  const perms = () =>
    createCommandPerms({
      commands: core.registries.commands.all().map(({ plugin, command }) => ({
        name: command.data.name,
        plugin,
        permissions: command.permissions,
      })),
      guildConfig: core.guildConfig,
      audit: core.audit,
    });

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  const permsList = async (interaction) => {
    const locale = await core.resolveLocale(interaction);
    const overridden = (await perms().list(interaction.guildId ?? '')).filter(
      (entry) => entry.roles !== null,
    );
    if (!overridden.length) {
      await reply(interaction, core.t(locale, 'nexis.perms.empty'));
      return;
    }

    const lines = overridden.map(({ name, roles }) =>
      core.t(locale, 'nexis.perms.entry', {
        command: name,
        roles: roles?.length
          ? roles.map((roleId) => `<@&${roleId}>`).join(', ')
          : core.t(locale, 'nexis.perms.admins_only'),
      }),
    );
    await reply(interaction, `${core.t(locale, 'nexis.perms.title')}\n${lines.join('\n')}`);
  };

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {'allow' | 'deny' | 'reset'} action
   */
  const permsWrite = async (interaction, action) => {
    const locale = await core.resolveLocale(interaction);
    const guildId = interaction.guildId ?? '';
    const command = /** @type {string} */ (interaction.options.getString('commande'));
    const role = action === 'reset' ? undefined : interaction.options.getRole('role');

    const actor = interaction.user.id;
    const result =
      action === 'reset'
        ? await perms().reset(guildId, command, actor)
        : await perms()[action](guildId, command, /** @type {{ id: string }} */ (role).id, actor);

    if (!result.ok) {
      // Chaque motif de refus a sa clé de traduction, nommée d'après lui.
      await reply(
        interaction,
        core.t(locale, `nexis.perms.${result.reason}`, {
          command,
          role: role ? `<@&${role.id}>` : '',
        }),
      );
      return;
    }

    await reply(
      interaction,
      core.t(locale, PERMS_SUCCESS_KEYS[action], {
        command,
        role: role ? `<@&${role.id}>` : '',
      }),
    );
  };

  return {
    data,
    permissions: 'guild-admin',

    /**
     * Propose les commandes déclarées sur l'option `commande` du groupe
     * perms. Les commandes de propriétaire en sont exclues : leurs
     * permissions ne se délèguent pas, les suggérer n'inviterait qu'à un
     * refus.
     * @param {unknown} interaction
     * @returns {Array<{ name: string, value: string }>}
     */
    autocomplete(interaction) {
      const typed = /** @type {import('discord.js').AutocompleteInteraction} */ (interaction);
      const saisie = String(typed.options.getFocused()).toLowerCase();
      return core.registries.commands
        .all()
        .filter(({ command }) => command.permissions !== 'owner')
        .map(({ command }) => command.data.name)
        .filter((name) => name.toLowerCase().includes(saisie))
        .map((name) => ({ name, value: name }));
    },

    /** @param {unknown} interaction */
    async execute(interaction) {
      const typed = /** @type {import('discord.js').ChatInputCommandInteraction} */ (interaction);
      const group = typed.options.getSubcommandGroup();
      if (group === 'perms') {
        const action = typed.options.getSubcommand();
        if (action === 'list') return permsList(typed);
        return permsWrite(typed, /** @type {'allow' | 'deny' | 'reset'} */ (action));
      }
      const subcommand = typed.options.getSubcommand();
      if (subcommand === 'list') return list(typed);
      if (subcommand === 'errors') return errorsCmd(typed);
      if (subcommand === 'audit') return auditCmd(typed);
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
  const core = /** @type {NexisCore} */ ({
    ...ctx.core,
    t: ctx.t,
    resolveLocale: ctx.resolveLocale,
  });
  return buildNexisCommand(core);
};
