import { MongoClient } from 'mongodb';

/**
 * Driver MongoDB. Chaque entrée est un document `{ key, value }` — pas
 * `{ _id: key }` : Mongo restreint les caractères `.` et `$` en tête de nom
 * de champ, ce qui interdirait certaines clés Nexis légitimes. `key` porte
 * plutôt un index unique.
 *
 * @param {{ path: string, collection?: string }} options - `path` est la
 *   chaîne de connexion (`mongodb://host/db`) ; `collection` (par défaut
 *   `entries`) permet aux tests d'isoler leurs données.
 * @returns {import('../driver.js').StorageDriver}
 */
export const createMongoDriver = ({ path, collection = 'entries' }) => {
  /** @type {MongoClient | null} */
  let client = null;
  /** @type {import('mongodb').Collection | null} */
  let col = null;

  const requireCollection = () => {
    if (!col) throw new Error('Driver mongo utilisé avant init()');
    return col;
  };

  return {
    async init() {
      client = new MongoClient(path);
      await client.connect();
      col = client.db().collection(collection);
      await col.createIndex({ key: 1 }, { unique: true });
    },
    async get(key) {
      const doc = await requireCollection().findOne({ key });
      return doc === null ? undefined : doc.value;
    },
    async set(key, value) {
      await requireCollection().updateOne({ key }, { $set: { value } }, { upsert: true });
    },
    async delete(key) {
      await requireCollection().deleteOne({ key });
    },
    async keys(prefix) {
      // Échappe les caractères spéciaux de regex présents dans nos clés —
      // sans échappement, un '.' matcherait n'importe quel caractère.
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const docs = await requireCollection()
        .find({ key: { $regex: `^${escaped}` } }, { projection: { key: 1, _id: 0 } })
        .toArray();
      return docs.map((doc) => doc.key);
    },
    async close() {
      await client?.close();
      client = null;
      col = null;
    },
    raw() {
      return requireCollection();
    },
  };
};
