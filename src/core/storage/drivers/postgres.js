import pg from 'pg';

/**
 * Driver PostgreSQL. Les valeurs sont stockées en JSONB dans une table
 * clé/valeur — `pg` (dés)sérialise le JSON automatiquement.
 *
 * @param {{ path: string, table?: string }} options - `path` est la chaîne
 *   de connexion (`postgres://user:pass@host/db`) ; `table` (par défaut
 *   `entries`) permet aux tests d'isoler leurs données.
 * @returns {import('../driver.js').StorageDriver}
 */
export const createPostgresDriver = ({ path, table = 'entries' }) => {
  /** @type {pg.Pool | null} */
  let pool = null;

  const requirePool = () => {
    if (!pool) throw new Error('Driver postgres utilisé avant init()');
    return pool;
  };

  return {
    async init() {
      pool = new pg.Pool({ connectionString: path });
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${table} (key TEXT PRIMARY KEY, value JSONB NOT NULL)`,
      );
    },
    async get(key) {
      const { rows } = await requirePool().query(`SELECT value FROM ${table} WHERE key = $1`, [
        key,
      ]);
      return rows[0]?.value;
    },
    async set(key, value) {
      await requirePool().query(
        `INSERT INTO ${table} (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [key, JSON.stringify(value)],
      );
    },
    async delete(key) {
      await requirePool().query(`DELETE FROM ${table} WHERE key = $1`, [key]);
    },
    async keys(prefix) {
      // ESCAPE protège les jokers de LIKE (% et _) présents dans nos clés —
      // sans échappement, un underscore matcherait n'importe quel caractère.
      const escaped = prefix.replace(/[\\%_]/g, (char) => `\\${char}`);
      const { rows } = await requirePool().query(
        `SELECT key FROM ${table} WHERE key LIKE $1 ESCAPE '\\'`,
        [`${escaped}%`],
      );
      return /** @type {{ key: string }[]} */ (rows).map((row) => row.key);
    },
    async close() {
      await pool?.end();
      pool = null;
    },
    raw() {
      return requirePool();
    },
  };
};
