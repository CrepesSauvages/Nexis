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

  /** @param {string} guildId */
  const enabledKey = (guildId) => `core:guild:${guildId}:enabled`;
  /** @param {string} guildId @param {string} plugin */
  const configKey = (guildId, plugin) => `core:guild:${guildId}:config:${plugin}`;
  /** @param {string} guildId */
  const localeKey = (guildId) => `core:guild:${guildId}:locale`;

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
      const list = await readEnabled(guildId);
      if (list.includes(plugin)) return;
      await writeEnabled(guildId, [...list, plugin]);
    },

    /**
     * @param {string} guildId
     * @param {string} plugin
     * @returns {Promise<void>}
     */
    async disable(guildId, plugin) {
      const list = await readEnabled(guildId);
      if (!list.includes(plugin)) return;
      await writeEnabled(
        guildId,
        list.filter((name) => name !== plugin),
      );
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
      await storage.set(localeKey(guildId), locale);
      localeCache.set(guildId, locale);
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
      const key = configKey(guildId, plugin);
      const current = /** @type {Record<string, unknown>} */ ((await storage.get(key)) ?? {});
      const merged = { ...current, ...values };
      await storage.set(key, merged);
      configCache.set(key, merged);
    },

    /**
     * Vide le cache d'une guild. À appeler si le storage est modifié hors de cette instance.
     * @param {string} guildId
     */
    invalidate(guildId) {
      enabledCache.delete(guildId);
      localeCache.delete(guildId);
      for (const key of configCache.keys()) {
        if (key.startsWith(`core:guild:${guildId}:`)) configCache.delete(key);
      }
    },
  };
};
