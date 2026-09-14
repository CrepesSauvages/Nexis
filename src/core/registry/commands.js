import { PluginError } from '../errors.js';

/**
 * Types de commande d'application Discord, tels que l'API les numérote.
 * Repris en constantes locales plutôt qu'importés d'`ApplicationCommandType`
 * (discord.js) : ce registre ne dépend d'aucune autre part de discord.js, et
 * ces trois valeurs font partie du protocole, pas de la bibliothèque.
 */
export const CHAT_INPUT = 1;
export const USER_CONTEXT_MENU = 2;
export const MESSAGE_CONTEXT_MENU = 3;

const TYPES = [CHAT_INPUT, USER_CONTEXT_MENU, MESSAGE_CONTEXT_MENU];

/** Portées d'un temps de recharge : qui, exactement, doit patienter. */
export const COOLDOWN_SCOPES = ['user', 'guild', 'channel'];

/** @type {Record<number, string>} */
const TYPE_LABELS = {
  [CHAT_INPUT]: 'slash',
  [USER_CONTEXT_MENU]: 'menu contextuel utilisateur',
  [MESSAGE_CONTEXT_MENU]: 'menu contextuel message',
};

/**
 * @typedef {object} CommandDef
 * @property {{ name: string, type?: number }} data - SlashCommandBuilder ou ContextMenuCommandBuilder de discord.js
 * @property {(interaction: unknown, ctx: unknown) => Promise<void> | void} execute
 * @property {(interaction: unknown, ctx: unknown) => Promise<Array<{ name: string, value: string | number }>> | Array<{ name: string, value: string | number }> | undefined} [autocomplete] - réservé aux commandes slash
 * @property {'guild-admin' | 'owner'} [permissions]
 * @property {{ seconds: number, scope?: 'user' | 'guild' | 'channel' }} [cooldown]
 * @property {boolean | 'ephemeral'} [defer] - acquitte l'interaction avant execute
 */

export const createCommandRegistry = () => {
  /** @type {Map<string, { plugin: string, command: CommandDef }>} */
  const entries = new Map();

  /**
   * Discord sépare ses espaces de noms par type : une commande slash
   * `report` et un menu contextuel `report` coexistent sans se gêner. La
   * clé du registre doit donc porter le type, sous peine de déclarer un
   * conflit là où Discord n'en voit aucun.
   * @param {string} name
   * @param {number} type
   */
  const keyOf = (name, type) => `${type}:${name}`;

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
      // Un SlashCommandBuilder n'expose aucun `type` — l'API Discord traite
      // son absence comme CHAT_INPUT. Seul un ContextMenuCommandBuilder en
      // porte un, posé par son `setType()`.
      const type = command.data.type ?? CHAT_INPUT;
      if (!TYPES.includes(type)) {
        throw new PluginError(`Type de commande invalide pour "${name}" : ${type}`, {
          plugin,
          name,
          type,
          TYPES,
        });
      }
      if (typeof command.execute !== 'function') {
        throw new PluginError(`La commande "${name}" n'a pas de fonction execute`, {
          plugin,
          name,
        });
      }
      if (command.autocomplete !== undefined && typeof command.autocomplete !== 'function') {
        throw new PluginError(`L'autocomplétion de "${name}" n'est pas une fonction`, {
          plugin,
          name,
        });
      }
      // Un menu contextuel n'a pas d'options : Discord ne lui enverra jamais
      // d'interaction d'autocomplétion, et un handler déclaré ici ne serait
      // jamais appelé. Le refuser au démarrage vaut mieux que de le laisser
      // dormir.
      if (command.autocomplete !== undefined && type !== CHAT_INPUT) {
        throw new PluginError(
          `La commande "${name}" est un ${TYPE_LABELS[type]} : elle ne peut pas déclarer d'autocomplétion`,
          { plugin, name, type },
        );
      }
      if (command.cooldown !== undefined) {
        const { seconds, scope = 'user' } = command.cooldown;
        if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
          throw new PluginError(
            `Le temps de recharge de "${name}" doit être un nombre de secondes positif`,
            { plugin, name, seconds },
          );
        }
        if (!COOLDOWN_SCOPES.includes(scope)) {
          throw new PluginError(`Portée de recharge invalide pour "${name}" : "${scope}"`, {
            plugin,
            name,
            scope,
            COOLDOWN_SCOPES,
          });
        }
      }
      if (
        command.defer !== undefined &&
        command.defer !== true &&
        command.defer !== false &&
        command.defer !== 'ephemeral'
      ) {
        throw new PluginError(`\`defer\` doit valoir true, false ou "ephemeral" pour "${name}"`, {
          plugin,
          name,
          defer: command.defer,
        });
      }
      const existing = entries.get(keyOf(name, type));
      if (existing) {
        throw new PluginError(
          `Conflit de commande "${name}" (${TYPE_LABELS[type]}) entre les plugins "${existing.plugin}" et "${plugin}"`,
          { name, type, plugins: [existing.plugin, plugin] },
        );
      }
      entries.set(keyOf(name, type), { plugin, command });
    },
    /**
     * @param {string} name
     * @param {number} [type] - CHAT_INPUT par défaut
     * @returns {{ plugin: string, command: CommandDef } | undefined}
     */
    get(name, type = CHAT_INPUT) {
      return entries.get(keyOf(name, type));
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
