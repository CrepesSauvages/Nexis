import { PluginError } from '../errors.js';

export const createEventRegistry = () => {
  /** @type {Map<string, Array<{ plugin: string, handler: Function }>>} */
  const entries = new Map();

  return {
    /**
     * @param {string} plugin
     * @param {string} eventName
     * @param {Function} handler
     */
    add(plugin, eventName, handler) {
      if (typeof handler !== 'function') {
        throw new PluginError(`Handler non fonction pour l'event "${eventName}"`, {
          plugin,
          eventName,
        });
      }
      const list = entries.get(eventName) ?? [];
      list.push({ plugin, handler });
      entries.set(eventName, list);
    },
    /**
     * @returns {Array<string>}
     */
    eventNames() {
      return [...entries.keys()];
    },
    /**
     * @param {string} eventName
     * @returns {Array<{ plugin: string, handler: Function }>}
     */
    handlersFor(eventName) {
      return entries.get(eventName) ?? [];
    },
  };
};
