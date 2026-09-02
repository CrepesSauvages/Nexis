import { randomBytes } from 'node:crypto';

/** Nom du cookie portant l'identifiant de session. */
export const SESSION_COOKIE = 'nexis_session';

/** Durée de vie d'une session, en millisecondes. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @typedef {object} SessionGuild
 * @property {string} id
 * @property {string} name
 * @property {string | null} icon
 * @property {string} permissions
 */

/**
 * @typedef {object} SessionData
 * @property {string} userId
 * @property {string} username
 * @property {string | null} avatar
 * @property {SessionGuild[]} guilds
 */

/**
 * @typedef {SessionData & { expiresAt: number }} StoredSession
 */

/**
 * Sessions du dashboard, persistées dans le storage déjà configuré : elles
 * survivent donc aux redémarrages, fréquents avec `npm run dev` en --watch.
 *
 * L'identifiant fait 32 octets tirés au hasard. Il est imprévisible, ce qui
 * le rend inutile à signer : une signature HMAC n'ajouterait qu'un secret
 * à gérer sans rien empêcher de plus.
 *
 * `now` et `ttlMs` sont injectables pour que les tests d'expiration ne
 * dépendent pas de l'horloge réelle.
 *
 * @param {object} options
 * @param {import('../storage/driver.js').StorageDriver} options.storage
 * @param {() => number} [options.now]
 * @param {number} [options.ttlMs]
 */
export const createSessions = ({ storage, now = Date.now, ttlMs = SESSION_TTL_MS }) => {
  /** @param {string} id */
  const key = (id) => `core:session:${id}`;

  return {
    /**
     * @param {SessionData} data
     * @returns {Promise<string>}
     */
    async create(data) {
      const id = randomBytes(32).toString('hex');
      await storage.set(key(id), { ...data, expiresAt: now() + ttlMs });
      return id;
    },

    /**
     * Le nettoyage est paresseux : une session périmée n'est supprimée
     * qu'au moment où on la relit. Une session jamais relue reste en
     * storage, ce qui est assumé — un job de purge s'ajouterait sans
     * toucher à cette interface.
     *
     * @param {string | undefined} id
     * @returns {Promise<StoredSession | undefined>}
     */
    async get(id) {
      if (!id) return undefined;
      const stored = /** @type {StoredSession | undefined} */ (await storage.get(key(id)));
      if (!stored) return undefined;
      if (stored.expiresAt <= now()) {
        await storage.delete(key(id));
        return undefined;
      }
      return stored;
    },

    /**
     * @param {string | undefined} id
     * @returns {Promise<void>}
     */
    async destroy(id) {
      if (!id) return;
      await storage.delete(key(id));
    },
  };
};
