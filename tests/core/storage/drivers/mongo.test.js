import { describe, it, expect } from 'vitest';
import { MongoClient } from 'mongodb';
import { createMongoDriver } from '../../../../src/core/storage/drivers/mongo.js';
import { runConformanceSuite } from '../../../storage-conformance.js';

// Pas d'infra CI pour Mongo dans ce repo : on tente une vraie connexion
// locale, et on saute la suite entière (pas un échec) si rien n'écoute.
// `TEST_MONGO_URL` permet de pointer vers une autre instance.
const connectionString = process.env.TEST_MONGO_URL ?? 'mongodb://localhost:27017/nexis_test';

// Collection dédiée aux tests pour ne jamais toucher une éventuelle
// collection `entries` applicative sur la même base.
const testCollection = 'entries_test';

const isReachable = async () => {
  const client = new MongoClient(connectionString, { serverSelectionTimeoutMS: 1000 });
  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => {});
  }
};

const makeDriver = async () => ({
  driver: createMongoDriver({ path: connectionString, collection: testCollection }),
  reopen: () => createMongoDriver({ path: connectionString, collection: testCollection }),
  cleanup: async () => {
    const cleanupDriver = createMongoDriver({ path: connectionString, collection: testCollection });
    await cleanupDriver.init();
    await /** @type {import('mongodb').Collection} */ (cleanupDriver.raw()).deleteMany({});
    await cleanupDriver.close();
  },
});

describe('createMongoDriver — spécifique', () => {
  it('devrait rejeter toute opération avant init()', async () => {
    const driver = createMongoDriver({ path: connectionString, collection: testCollection });
    await expect(driver.get('x')).rejects.toThrow(/init/);
  });
});

if (await isReachable()) {
  runConformanceSuite('mongo', makeDriver);

  describe('createMongoDriver — spécifique (DB requise)', () => {
    it('devrait exposer la collection native via raw()', async () => {
      const { driver, cleanup } = await makeDriver();
      await driver.init();
      expect(driver.raw()).toBeDefined();
      await driver.close();
      await cleanup();
    });

    it('ne devrait pas laisser un caractère spécial de regex sur-matcher un préfixe', async () => {
      const { driver, cleanup } = await makeDriver();
      await driver.init();
      await driver.set('guild.1:a', 1);
      await driver.set('guildX1:a', 2);
      expect(await driver.keys('guild.1:')).toEqual(['guild.1:a']);
      await driver.close();
      await cleanup();
    });
  });
} else {
  describe.skip('driver mongo — DB indisponible (définir TEST_MONGO_URL)', () => {
    it.skip('sauté', () => {});
  });
}
