import { describe, it, expect } from 'vitest';
import pg from 'pg';
import { createPostgresDriver } from '../../../../src/core/storage/drivers/postgres.js';
import { runConformanceSuite } from '../../../storage-conformance.js';

// Pas d'infra CI pour Postgres dans ce repo : on tente une vraie connexion
// locale, et on saute la suite entière (pas un échec) si rien n'écoute.
// `TEST_POSTGRES_URL` permet de pointer vers une autre instance.
const connectionString =
  process.env.TEST_POSTGRES_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';

const isReachable = async () => {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 1000 });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
};

// Table dédiée aux tests pour ne jamais toucher une éventuelle table
// `entries` applicative sur la même base.
const testTable = 'entries_test';

const makeDriver = async () => ({
  driver: createPostgresDriver({ path: connectionString, table: testTable }),
  reopen: () => createPostgresDriver({ path: connectionString, table: testTable }),
  cleanup: async () => {
    const cleanupDriver = createPostgresDriver({ path: connectionString, table: testTable });
    await cleanupDriver.init();
    await /** @type {pg.Pool} */ (cleanupDriver.raw()).query(`DELETE FROM ${testTable}`);
    await cleanupDriver.close();
  },
});

describe('createPostgresDriver — spécifique', () => {
  it('devrait rejeter toute opération avant init()', async () => {
    const driver = createPostgresDriver({ path: connectionString, table: testTable });
    await expect(driver.get('x')).rejects.toThrow(/init/);
  });
});

if (await isReachable()) {
  runConformanceSuite('postgres', makeDriver);

  describe('createPostgresDriver — spécifique (DB requise)', () => {
    it('devrait exposer le pool natif via raw()', async () => {
      const { driver, cleanup } = await makeDriver();
      await driver.init();
      expect(driver.raw()).toBeDefined();
      await driver.close();
      await cleanup();
    });

    it("ne devrait pas laisser le joker '_' de LIKE sur-matcher un préfixe", async () => {
      const { driver, cleanup } = await makeDriver();
      await driver.init();
      await driver.set('guild_1:a', 1);
      await driver.set('guildX1:a', 2);
      expect(await driver.keys('guild_1:')).toEqual(['guild_1:a']);
      await driver.close();
      await cleanup();
    });
  });
} else {
  describe.skip('driver postgres — DB indisponible (définir TEST_POSTGRES_URL)', () => {
    it.skip('sauté', () => {});
  });
}
