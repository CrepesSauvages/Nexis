/**
 * @typedef {{ ok: true } | { ok: false, reason: string, deps?: string[] }} AdminResult
 */

/**
 * Règles d'administration des plugins, partagées par la commande `/nexis` et
 * par l'API du dashboard.
 *
 * Ce module ne connaît ni discord.js ni node:http : il renvoie un résultat en
 * données, que chaque appelant traduit dans sa propre langue — un message
 * localisé d'un côté, un code HTTP de l'autre. Deux implémentations des mêmes
 * règles finiraient par diverger, et le jour où la commande refuse pendant que
 * l'API accepte, personne ne le remarque avant qu'un serveur casse.
 *
 * L'écriture et la resynchronisation des commandes restent ici : les deux
 * appelants en ont besoin, et les sortir inviterait l'un des deux à oublier
 * `syncGuild`.
 *
 * @param {object} options
 * @param {import('./loader.js').LoadedPlugin[]} options.plugins
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} options.guildConfig
 * @param {{ syncGuild: (guildId: string) => Promise<void> }} options.commandSync
 * @param {string[]} options.alwaysEnabled
 */
export const createPluginAdmin = ({ plugins, guildConfig, commandSync, alwaysEnabled }) => {
  /** @param {string} name */
  const find = (name) => plugins.find((plugin) => plugin.name === name);

  return {
    /**
     * @param {string} guildId
     * @param {string} name
     * @returns {Promise<AdminResult>}
     */
    async enable(guildId, name) {
      const plugin = find(name);
      if (!plugin) return { ok: false, reason: 'not_found' };
      if (alwaysEnabled.includes(name)) return { ok: false, reason: 'always_enabled' };
      if (await guildConfig.isEnabled(guildId, name)) {
        return { ok: false, reason: 'already_enabled' };
      }

      const enabled = await guildConfig.enabledPlugins(guildId);
      const missing = (plugin.manifest.dependsOn ?? []).filter((dep) => !enabled.includes(dep));
      if (missing.length) return { ok: false, reason: 'missing_deps', deps: missing };

      await guildConfig.enable(guildId, name);
      await commandSync.syncGuild(guildId);
      return { ok: true };
    },

    /**
     * Désactiver un plugin déjà inactif réussit : `guildConfig.disable` ne fait
     * rien dans ce cas, et c'est le comportement que `/nexis disable` a
     * toujours eu.
     *
     * @param {string} guildId
     * @param {string} name
     * @returns {Promise<AdminResult>}
     */
    async disable(guildId, name) {
      const plugin = find(name);
      if (!plugin) return { ok: false, reason: 'not_found' };
      if (alwaysEnabled.includes(name)) return { ok: false, reason: 'always_enabled' };

      const enabled = await guildConfig.enabledPlugins(guildId);
      const dependents = plugins
        .filter((other) => enabled.includes(other.name))
        .filter((other) => (other.manifest.dependsOn ?? []).includes(name))
        .map((other) => other.name);
      if (dependents.length) return { ok: false, reason: 'has_dependents', deps: dependents };

      await guildConfig.disable(guildId, name);
      await commandSync.syncGuild(guildId);
      return { ok: true };
    },
  };
};
