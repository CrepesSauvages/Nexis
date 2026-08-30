import { PluginError } from '../errors.js';

const TYPES = ['button', 'select', 'modal'];
const PERMISSION_LEVELS = ['guild-admin', 'owner'];

/**
 * @typedef {object} ComponentDef
 * @property {string} customId - relatif au plugin, sans le namespace
 * @property {'button' | 'select' | 'modal'} type
 * @property {'guild-admin' | 'owner'} [permissions]
 * @property {(interaction: unknown, ctx: unknown) => Promise<void> | void} handler
 */

/**
 * Les components sont matchés par préfixe : un plugin qui enregistre
 * "confirm" reçoit aussi bien "plugin:confirm" que "plugin:confirm:1234"
 * (customId dynamique), au handler de parser le reste.
 */
export const createComponentRegistry = () => {
  /** @type {Array<ComponentDef & { plugin: string }>} */
  const entries = [];

  return {
    /**
     * @param {string} plugin
     * @param {ComponentDef} component
     */
    add(plugin, component) {
      const { customId, type, permissions, handler } = component ?? {};
      if (!TYPES.includes(type)) {
        throw new PluginError(`Type de component invalide : "${type}"`, { plugin, type, TYPES });
      }
      if (typeof customId !== 'string' || customId.length === 0) {
        throw new PluginError('customId de component vide', { plugin, customId });
      }
      if (permissions !== undefined && !PERMISSION_LEVELS.includes(permissions)) {
        throw new PluginError(`Niveau de permission invalide : "${permissions}"`, {
          plugin,
          permissions,
          PERMISSION_LEVELS,
        });
      }
      if (typeof handler !== 'function') {
        throw new PluginError('Handler de component non fonction', { plugin, customId });
      }

      const fullCustomId = `${plugin}:${customId}`;
      if (entries.some((entry) => entry.type === type && entry.customId === fullCustomId)) {
        throw new PluginError(`Component déjà déclaré : ${type} ${fullCustomId}`, {
          plugin,
          fullCustomId,
        });
      }
      entries.push({ plugin, customId: fullCustomId, type, permissions, handler });
    },
    /**
     * @param {string} customId - customId brut de l'interaction Discord
     * @param {'button' | 'select' | 'modal'} type
     * @returns {(ComponentDef & { plugin: string }) | undefined}
     */
    find(customId, type) {
      return entries.find(
        (entry) =>
          entry.type === type &&
          (customId === entry.customId || customId.startsWith(`${entry.customId}:`)),
      );
    },
    /**
     * @returns {Array<ComponentDef & { plugin: string }>}
     */
    all() {
      return [...entries];
    },
  };
};
