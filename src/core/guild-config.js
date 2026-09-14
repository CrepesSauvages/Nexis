/**
 * Serveurs gardés en cache. Au-delà, le plus anciennement utilisé est
 * oublié : sans borne, la mémoire croîtrait avec le nombre de serveurs vus
 * depuis le démarrage, sans jamais rien rendre.
 */
const DEFAULT_MAX_CACHED_GUILDS = 500;

/**
 * Plugins activés et configuration, par serveur.
 *
 * Un cache mémoire évite un aller-retour storage à chaque event —
 * le dispatcher consulte cette structure sur chaque message reçu.
 * Toute écriture invalide l'entrée concernée.
 *
 * @param {{ storage: import('./storage/driver.js').StorageDriver, maxCachedGuilds?: number }} options
 */
export const createGuildConfig = ({ storage, maxCachedGuilds = DEFAULT_MAX_CACHED_GUILDS }) => {
  /**
   * Tout ce qu'on retient d'un serveur, en un seul objet : un serveur
   * oublié l'est alors entièrement, et `invalidate` se résume à une
   * suppression. `locale` vaut `null` quand on a lu le storage et qu'il
   * n'y a pas d'override — distinct de `undefined`, qui veut dire « pas
   * encore lu ».
   *
   * @typedef {object} GuildCache
   * @property {string[]} [enabled]
   * @property {string | null} [locale]
   * @property {Record<string, string[]>} [permissions]
   * @property {Map<string, Record<string, unknown>>} configs
   */

  /** @type {Map<string, GuildCache>} */
  const cache = new Map();

  /**
   * L'entrée de ce serveur, créée au besoin et remise en fin de Map :
   * l'ordre d'insertion d'une Map fait office d'ordre d'usage, ce qui
   * suffit à borner le cache sans structure supplémentaire.
   *
   * Oublier un serveur ne coûte qu'une relecture : toute écriture passe
   * par le storage avant de toucher au cache, jamais l'inverse.
   *
   * @param {string} guildId
   * @returns {GuildCache}
   */
  const entryOf = (guildId) => {
    const existing = cache.get(guildId);
    if (existing) {
      cache.delete(guildId);
      cache.set(guildId, existing);
      return existing;
    }

    /** @type {GuildCache} */
    const fresh = { configs: new Map() };
    cache.set(guildId, fresh);
    if (cache.size > maxCachedGuilds) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return fresh;
  };

  // Une file par serveur. `enable`, `disable` et `setConfig` font un cycle
  // lecture → attente → écriture : sans sérialisation, deux appels simultanés
  // sur le même serveur lisent le même état et le second écrase le premier,
  // qui a pourtant rendu un succès à son appelant. Même mécanisme que la file
  // de `reporting/drivers/local.js`.
  /** @type {Map<string, Promise<void>>} */
  const queues = new Map();

  /**
   * @template T
   * @param {string} guildId
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  const serialize = (guildId, task) => {
    const previous = queues.get(guildId) ?? Promise.resolve();
    const attempt = previous.then(task);
    // La file avale le rejet — sinon un échec bloquerait toutes les écritures
    // suivantes du serveur — mais `attempt`, rendu à l'appelant, le propage.
    // L'entrée se supprime quand la file se vide, faute de quoi la Map
    // grandirait avec le nombre de serveurs vus.
    const settled = attempt.then(
      () => undefined,
      () => undefined,
    );
    const cleared = settled.then(() => {
      if (queues.get(guildId) === cleared) queues.delete(guildId);
    });
    queues.set(guildId, cleared);
    return attempt;
  };

  /** @param {string} guildId */
  const enabledKey = (guildId) => `core:guild:${guildId}:enabled`;
  /** @param {string} guildId @param {string} plugin */
  const configKey = (guildId, plugin) => `core:guild:${guildId}:config:${plugin}`;
  /** @param {string} guildId */
  const localeKey = (guildId) => `core:guild:${guildId}:locale`;
  /** @param {string} guildId */
  const permissionsKey = (guildId) => `core:guild:${guildId}:permissions`;

  /**
   * @param {string} guildId
   * @returns {Promise<Record<string, string[]>>}
   */
  const readPermissions = async (guildId) => {
    const cached = entryOf(guildId).permissions;
    if (cached) return cached;
    const stored = /** @type {Record<string, string[]> | undefined} */ (
      await storage.get(permissionsKey(guildId))
    );
    const table = stored ?? {};
    // L'entrée est re-résolue après l'attente : elle a pu être évincée
    // entre-temps, et écrire dans l'ancienne ne servirait à rien.
    entryOf(guildId).permissions = table;
    return table;
  };

  /**
   * @param {string} guildId
   * @returns {Promise<string[]>}
   */
  const readEnabled = async (guildId) => {
    const cached = entryOf(guildId).enabled;
    if (cached) return cached;
    const stored = /** @type {string[] | undefined} */ (await storage.get(enabledKey(guildId)));
    const list = stored ?? [];
    entryOf(guildId).enabled = list;
    return list;
  };

  /**
   * @param {string} guildId
   * @param {string[]} list
   * @returns {Promise<void>}
   */
  const writeEnabled = async (guildId, list) => {
    await storage.set(enabledKey(guildId), list);
    entryOf(guildId).enabled = list;
  };

  return {
    /**
     * @param {string} guildId
     * @returns {Promise<string[]>}
     */
    async enabledPlugins(guildId) {
      return [...(await readEnabled(guildId))];
    },

    /**
     * @param {string} guildId
     * @param {string} plugin
     * @returns {Promise<boolean>}
     */
    async isEnabled(guildId, plugin) {
      return (await readEnabled(guildId)).includes(plugin);
    },

    /**
     * @param {string} guildId
     * @param {string} plugin
     * @returns {Promise<void>}
     */
    async enable(guildId, plugin) {
      return serialize(guildId, async () => {
        const list = await readEnabled(guildId);
        if (list.includes(plugin)) return;
        await writeEnabled(guildId, [...list, plugin]);
      });
    },

    /**
     * @param {string} guildId
     * @param {string} plugin
     * @returns {Promise<void>}
     */
    async disable(guildId, plugin) {
      return serialize(guildId, async () => {
        const list = await readEnabled(guildId);
        if (!list.includes(plugin)) return;
        await writeEnabled(
          guildId,
          list.filter((name) => name !== plugin),
        );
      });
    },

    /**
     * @param {string} guildId
     * @returns {Promise<string | undefined>}
     */
    async getLocale(guildId) {
      const cached = entryOf(guildId).locale;
      // `null` est une réponse connue — « pas d'override » — et mérite
      // d'être retenue autant qu'une langue : sans cela, la majorité des
      // serveurs, qui n'en fixent aucune, relirait le storage à chaque
      // interaction.
      if (cached !== undefined) return cached ?? undefined;

      const stored = /** @type {string | undefined} */ (await storage.get(localeKey(guildId)));
      entryOf(guildId).locale = stored ?? null;
      return stored;
    },

    /**
     * @param {string} guildId
     * @param {string} locale
     * @returns {Promise<void>}
     */
    async setLocale(guildId, locale) {
      return serialize(guildId, async () => {
        await storage.set(localeKey(guildId), locale);
        entryOf(guildId).locale = locale;
      });
    },

    /**
     * Fusionne les valeurs par défaut du schéma avec ce qui est stocké.
     * @param {string} guildId
     * @param {string} plugin
     * @param {Record<string, import('./manifest.js').ConfigEntry> | undefined} schema
     * @returns {Promise<Record<string, unknown>>}
     */
    async getConfig(guildId, plugin, schema) {
      let stored = entryOf(guildId).configs.get(plugin);
      if (!stored) {
        stored = /** @type {Record<string, unknown>} */ (
          (await storage.get(configKey(guildId, plugin))) ?? {}
        );
        entryOf(guildId).configs.set(plugin, stored);
      }

      /** @type {Record<string, unknown>} */
      const defaults = {};
      for (const [field, entry] of Object.entries(schema ?? {})) {
        if (entry.default !== undefined) defaults[field] = entry.default;
      }
      return { ...defaults, ...stored };
    },

    /**
     * @param {string} guildId
     * @param {string} plugin
     * @param {Record<string, unknown>} values
     * @returns {Promise<void>}
     */
    async setConfig(guildId, plugin, values) {
      return serialize(guildId, async () => {
        const key = configKey(guildId, plugin);
        const current = /** @type {Record<string, unknown>} */ ((await storage.get(key)) ?? {});
        const merged = { ...current, ...values };
        await storage.set(key, merged);
        entryOf(guildId).configs.set(plugin, merged);
      });
    },

    /**
     * Rôles autorisés à utiliser une commande sur ce serveur, ou `undefined`
     * si aucun administrateur n'a rien défini pour elle — auquel cas c'est
     * le niveau déclaré par le plugin qui décide, seul.
     *
     * @param {string} guildId
     * @param {string} command
     * @returns {Promise<string[] | undefined>}
     */
    async getCommandRoles(guildId, command) {
      const roles = (await readPermissions(guildId))[command];
      return roles ? [...roles] : undefined;
    },

    /**
     * Toutes les surcharges du serveur, pour les afficher d'un bloc.
     * @param {string} guildId
     * @returns {Promise<Record<string, string[]>>}
     */
    async allCommandRoles(guildId) {
      return structuredClone(await readPermissions(guildId));
    },

    /**
     * Définit — ou retire, avec `undefined` — la surcharge d'une commande.
     * @param {string} guildId
     * @param {string} command
     * @param {string[] | undefined} roles
     * @returns {Promise<void>}
     */
    async setCommandRoles(guildId, command, roles) {
      return serialize(guildId, async () => {
        const key = permissionsKey(guildId);
        const current = /** @type {Record<string, string[]>} */ ((await storage.get(key)) ?? {});
        const next = { ...current };
        if (roles === undefined) {
          delete next[command];
        } else {
          next[command] = [...roles];
        }
        await storage.set(key, next);
        entryOf(guildId).permissions = next;
      });
    },

    /**
     * Vide le cache d'une guild. À appeler si le storage est modifié hors de cette instance.
     * @param {string} guildId
     */
    invalidate(guildId) {
      cache.delete(guildId);
    },
  };
};
