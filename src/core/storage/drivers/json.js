import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Driver fichier JSON. Tout est gardé en mémoire et réécrit à chaque
 * mutation, via un fichier temporaire renommé — une écriture interrompue
 * ne corrompt donc pas le store. Convient au développement et aux
 * petites installations, pas à un bot sur des centaines de serveurs.
 *
 * @param {{ path: string }} options
 * @returns {import('../driver.js').StorageDriver}
 */
export const createJsonDriver = ({ path }) => {
  // Prototype nul : une clé de données appelée "__proto__" doit rester une
  // clé comme une autre, jamais déclencher le setter hérité d'Object.prototype
  // qui changerait le prototype de `data` au lieu d'y créer une propriété.
  /** @type {Record<string, unknown>} */
  let data = Object.create(null);
  /** @type {Promise<void>} */
  let queue = Promise.resolve();

  // Les écritures sont sérialisées : deux set() concurrents ne peuvent pas
  // réécrire le fichier en même temps et en perdre un. Un échec d'écriture
  // ne doit pas bloquer la file pour la suite : `queue` (le séquenceur)
  // avale l'erreur pour continuer à accepter des écritures, mais `attempt`
  // (ce que reçoit l'appelant via `await flush()`) la propage toujours.
  const flush = () => {
    const attempt = queue.then(async () => {
      const temp = join(dirname(path), `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
      try {
        await writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
        await rename(temp, path);
      } catch (error) {
        // Le fichier temporaire peut être orphelin si writeFile a réussi
        // mais pas rename. Best-effort : rien à faire s'il n'existe pas
        // (writeFile a échoué avant de le créer) ou s'il a déjà été déplacé.
        await unlink(temp).catch(() => {
          // Ignoré : le fichier temporaire peut ne jamais avoir existé.
        });
        throw error;
      }
    });
    queue = attempt.catch(() => undefined);
    return attempt;
  };

  return {
    async init() {
      await mkdir(dirname(path), { recursive: true });
      try {
        data = Object.assign(Object.create(null), JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        if (
          !(error instanceof Error) ||
          /** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT'
        ) {
          throw error;
        }
        data = Object.create(null);
        await flush();
      }
    },
    async get(key) {
      return Object.hasOwn(data, key) ? structuredClone(data[key]) : undefined;
    },
    async set(key, value) {
      data[key] = structuredClone(value);
      await flush();
    },
    async delete(key) {
      delete data[key];
      await flush();
    },
    async keys(prefix) {
      return Object.keys(data).filter((key) => key.startsWith(prefix));
    },
    async close() {
      await queue;
    },
    raw() {
      return data;
    },
  };
};
