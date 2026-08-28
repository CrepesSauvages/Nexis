import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Driver SQLite basé sur le module natif de Node — aucune dépendance
 * à compiler. Les valeurs sont stockées en JSON dans une table clé/valeur.
 *
 * Les méthodes sont asynchrones par contrat même si le pilote est
 * synchrone : c'est l'interface qui compte, pas l'implémentation.
 *
 * @param {{ path: string }} options
 * @returns {import('../driver.js').StorageDriver}
 */
export const createSqliteDriver = ({ path }) => {
  /** @type {DatabaseSync | null} */
  let db = null;

  const requireDb = () => {
    if (!db) throw new Error('Driver sqlite utilisé avant init()');
    return db;
  };

  return {
    async init() {
      mkdirSync(dirname(path), { recursive: true });
      db = new DatabaseSync(path);
      db.exec('CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    },
    async get(key) {
      const row = /** @type {{ value: string } | undefined} */ (
        requireDb().prepare('SELECT value FROM entries WHERE key = ?').get(key)
      );
      return row === undefined ? undefined : JSON.parse(row.value);
    },
    async set(key, value) {
      requireDb()
        .prepare(
          'INSERT INTO entries (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        )
        .run(key, JSON.stringify(value));
    },
    async delete(key) {
      requireDb().prepare('DELETE FROM entries WHERE key = ?').run(key);
    },
    async keys(prefix) {
      // ESCAPE protège les caractères jokers de LIKE (% et _) présents dans
      // nos clés — sans échappement, un underscore dans le préfixe
      // matcherait n'importe quel caractère et sur-matcherait le résultat.
      const escaped = prefix.replace(/[\\%_]/g, (char) => `\\${char}`);
      const rows = /** @type {{ key: string }[]} */ (
        requireDb()
          .prepare("SELECT key FROM entries WHERE key LIKE ? ESCAPE '\\'")
          .all(`${escaped}%`)
      );
      return rows.map((row) => row.key);
    },
    async close() {
      db?.close();
      db = null;
    },
    raw() {
      return requireDb();
    },
  };
};
