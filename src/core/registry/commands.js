import { PluginError } from '../errors.js';

/**
 * @typedef {object} CommandDef
 * @property {{ name: string }} data - SlashCommandBuilder de discord.js
 * @property {(interaction: unknown, ctx: unknown) => Promise<void> | void} execute
 * @property {'guild-admin' | 'owner'} [permissions]
 */

export const createCommandRegistry = () => {
  /** @type {Map<string, { plugin: string, command: CommandDef }>} */
  const entries = new Map();

  return {
    /**
     * @param {string} plugin
     * @param {CommandDef} command
     */
    add(plugin, command) {
      const name = command?.data?.name;
      if (!name) {
        throw new PluginError('Commande sans data.name', { plugin });
      }
      if (typeof command.execute !== 'function') {
        throw new PluginError(`La commande "${name}" n'a pas de fonction execute`, {
          plugin,
          name,
        });
      }
      const existing = entries.get(name);
      if (existing) {
        throw new PluginError(
          `Conflit de commande "${name}" entre les plugins "${existing.plugin}" et "${plugin}"`,
          { name, plugins: [existing.plugin, plugin] },
        );
      }
      entries.set(name, { plugin, command });
    },
    /**
     * @param {string} name
     * @returns {{ plugin: string, command: CommandDef } | undefined}
     */
    get(name) {
      return entries.get(name);
    },
    /**
     * @param {string} plugin
     * @returns {Array<{ plugin: string, command: CommandDef }>}
     */
    byPlugin(plugin) {
      return [...entries.values()].filter((entry) => entry.plugin === plugin);
    },
    /**
     * @returns {Array<{ plugin: string, command: CommandDef }>}
     */
    all() {
      return [...entries.values()];
    },
  };
};
