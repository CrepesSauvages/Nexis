/** Balayage des entrées périmées tous les N enregistrements. */
const DEFAULT_SWEEP_EVERY = 1000;

/**
 * Compte les temps de recharge des commandes, en mémoire.
 *
 * En mémoire et non en storage : une recharge dure quelques secondes et
 * n'a aucune valeur à survivre à un redémarrage — la persister coûterait
 * un aller-retour de storage sur chaque commande, sur le chemin le plus
 * chaud du bot, pour protéger un état que personne ne regrettera.
 *
 * `now` est injectable pour que les tests d'expiration ne dépendent pas de
 * l'horloge réelle.
 *
 * @param {{ now?: () => number, sweepEvery?: number }} [options]
 */
export const createCooldowns = ({ now = Date.now, sweepEvery = DEFAULT_SWEEP_EVERY } = {}) => {
  /** @type {Map<string, number>} */
  const expiries = new Map();
  let sinceSweep = 0;

  /** @param {number} current */
  const sweep = (current) => {
    for (const [key, expiry] of expiries) {
      if (expiry <= current) expiries.delete(key);
    }
  };

  return {
    /**
     * Consomme la recharge d'une clé. Rend `allowed: false` tant que la
     * précédente n'est pas écoulée, et ne la prolonge pas dans ce cas :
     * marteler une commande ne doit pas repousser indéfiniment le moment
     * où elle redevient utilisable.
     *
     * @param {string} key
     * @param {number} seconds
     * @returns {{ allowed: true } | { allowed: false, retryAfterMs: number }}
     */
    hit(key, seconds) {
      const current = now();
      const expiry = expiries.get(key);
      if (expiry !== undefined && expiry > current) {
        return { allowed: false, retryAfterMs: expiry - current };
      }
      expiries.set(key, current + seconds * 1000);

      // Purge amortie : une clé périmée n'est retirée que si quelqu'un la
      // relit, or la plupart ne le sont jamais — la Map grossirait sinon
      // avec le nombre d'utilisateurs vus depuis le démarrage.
      sinceSweep += 1;
      if (sinceSweep >= sweepEvery) {
        sinceSweep = 0;
        sweep(current);
      }
      return { allowed: true };
    },

    /** Nombre d'entrées retenues, périmées comprises. Pour les tests. */
    size: () => expiries.size,
  };
};
