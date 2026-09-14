import { randomBytes } from 'node:crypto';

/** Entrées conservées par serveur, sauf réglage contraire. */
const DEFAULT_LIMIT = 200;

/**
 * @typedef {object} AuditEntry
 * @property {string} id
 * @property {string} timestamp
 * @property {string} actor - identifiant Discord de l'auteur du changement
 * @property {string} action - code stable, ex. `plugin.enable`
 * @property {string} target - ce sur quoi il porte : nom de plugin, de commande, langue
 * @property {Record<string, unknown>} [details]
 */

/**
 * Journal des changements d'administration, par serveur.
 *
 * Le buffer est circulaire, sous `core:guild:<id>:audit` — même convention
 * de clés que le reste du core, et même mécanique de file que
 * `reporting/drivers/local.js` : deux `record()` simultanés sur un même
 * serveur entrelaceraient sinon leurs get→set, et le second effacerait le
 * premier en silence.
 *
 * Ce qu'on n'enregistre pas est aussi un choix : d'une écriture de
 * configuration, seules les clés touchées sont retenues, pas leurs valeurs.
 * Un journal n'a pas à devenir une seconde copie de la configuration, dont
 * il hériterait la durée de vie sans en hériter les précautions.
 *
 * @param {{ storage: import('./storage/driver.js').StorageDriver, limit?: number }} options
 */
export const createAudit = ({ storage, limit = DEFAULT_LIMIT }) => {
  /** @type {Map<string, Promise<void>>} */
  const queues = new Map();

  /** @param {string} guildId */
  const key = (guildId) => `core:guild:${guildId}:audit`;

  /**
   * @template T
   * @param {string} guildId
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  const serialize = (guildId, task) => {
    const previous = queues.get(guildId) ?? Promise.resolve();
    const attempt = previous.then(task);
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

  return {
    /**
     * @param {{ guildId: string, actor: string, action: string, target: string, details?: Record<string, unknown> }} entry
     * @returns {Promise<void>}
     */
    record({ guildId, actor, action, target, details }) {
      return serialize(guildId, async () => {
        const current = /** @type {AuditEntry[]} */ ((await storage.get(key(guildId))) ?? []);
        /** @type {AuditEntry} */
        const entry = {
          id: randomBytes(4).toString('hex'),
          timestamp: new Date().toISOString(),
          actor,
          action,
          target,
          ...(details ? { details } : {}),
        };
        await storage.set(key(guildId), [...current, entry].slice(-limit));
      });
    },

    /**
     * Les plus récentes d'abord — c'est l'ordre dans lequel on lit un
     * journal quand on cherche ce qui vient de changer.
     * @param {string} guildId
     * @param {number} [count]
     * @returns {Promise<AuditEntry[]>}
     */
    async recent(guildId, count = 25) {
      const current = /** @type {AuditEntry[]} */ ((await storage.get(key(guildId))) ?? []);
      return current.slice(-count).reverse();
    },
  };
};

/**
 * Journal inerte, utilisé partout où l'audit est optionnel — les tests
 * unitaires des règles, pour l'essentiel. Nommé plutôt qu'improvisé en
 * ligne, pour que « ici on n'enregistre rien » soit une décision visible.
 * @type {{ record: (entry: { guildId: string, actor: string, action: string, target: string, details?: Record<string, unknown> }) => Promise<void> }}
 */
export const NO_AUDIT = { record: async () => {} };
