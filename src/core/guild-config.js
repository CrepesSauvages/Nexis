/**
 * Plugins activés et configuration, par serveur.
 *
 * Un cache mémoire évite un aller-retour storage à chaque event —
 * le dispatcher consulte cette structure sur chaque message reçu.
 * Toute écriture invalide l'entrée concernée.
 *
 * @param {{ storage: import('./storage/driver.js').StorageDriver }} options
 */
export const createGuildConfig = ({ storage }) => {
  /** @type {Map<string, string[]>} */
  const enabledCache = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const configCache = new Map();
  /** @type {Map<string, string>} */
  const localeCache = new Map();
  /** @type {Map<string, Record<string, string[]>>} */
  const permissionsCache = new Map();

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
    const cached = permissionsCache.get(guildId);
    if (cached) return cached;
    const stored = /** @type {Record<string, string[]> | undefined} */ (
      await storage.get(permissionsKey(guildId))
    );
    const table = stored ?? {};
    permissionsCache.set(guildId, table);
    return table;
  };

  /**
   * @param {string} guildId
   * @returns {Promise<string[]>}
   */
  const readEnabled = async (guildId) => {
    const cached = enabledCache.get(guildId);
    if (cached) return cached;
    const stored = /** @type {string[] | undefined} */ (await storage.get(enabledKey(guildId)));
    const list = stored ?? [];
    enabledCache.set(guildId, list);
    return list;
  };

  /**
   * @param {string} guildId
   * @param {string[]} list
   * @returns {Promise<void>}
   */
  const writeEnabled = async (guildId, list) => {
    await storage.set(enabledKey(guildId), list);
    enabledCache.set(guildId, list);
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
      const cached = localeCache.get(guildId);
      if (cached) return cached;
      const stored = /** @type {string | undefined} */ (await storage.get(localeKey(guildId)));
      if (stored) localeCache.set(guildId, stored);
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
        localeCache.set(guildId, locale);
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
      const key = configKey(guildId, plugin);
      let stored = configCache.get(key);
      if (!stored) {
        stored = /** @type {Record<string, unknown>} */ ((await storage.get(key)) ?? {});
        configCache.set(key, stored);
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
        configCache.set(key, merged);
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
        permissionsCache.set(guildId, next);
      });
    },

    /**
     * Vide le cache d'une guild. À appeler si le storage est modifié hors de cette instance.
     * @param {string} guildId
     */
    invalidate(guildId) {
      enabledCache.delete(guildId);
      localeCache.delete(guildId);
      permissionsCache.delete(guildId);
      for (const key of configCache.keys()) {
        if (key.startsWith(`core:guild:${guildId}:`)) configCache.delete(key);
      }
    },
  };
};
