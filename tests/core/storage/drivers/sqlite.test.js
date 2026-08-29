import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteDriver } from '../../../../src/core/storage/drivers/sqlite.js';
import { runConformanceSuite } from '../../../storage-conformance.js';

// Le contrat de la suite de conformité est `{ driver, reopen, cleanup }` :
// `reopen()` doit rendre une instance NEUVE pointant sur le même fichier,
// pour que la suite puisse vérifier une vraie persistance sur disque et pas
// une simple survie de l'objet en mémoire. Voir le JSDoc de
// `runConformanceSuite` dans tests/storage-conformance.js.
const makeDriver = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nexis-sqlite-'));
  const path = join(dir, 'store.db');
  return {
    driver: createSqliteDriver({ path }),
    reopen: () => createSqliteDriver({ path }),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
};

runConformanceSuite('sqlite', makeDriver);

describe('createSqliteDriver — spécifique', () => {
  it('devrait exposer la connexion native via raw()', async () => {
    const { driver, cleanup } = await makeDriver();
    await driver.init();
    expect(driver.raw()).toBeDefined();
    await driver.close();
    await cleanup();
  });

  it('devrait rejeter toute opération avant init()', async () => {
    const { driver, cleanup } = await makeDriver();
    await expect(driver.get('x')).rejects.toThrow(/init/);
    await cleanup();
  });

  it("ne devrait pas laisser le joker '_' de LIKE sur-matcher un préfixe", async () => {
    // Sans échappement, "guild_1:" matcherait aussi "guildX1:" car '_' est
    // un joker SQL LIKE (un caractère quelconque). Les clés Nexis contiennent
    // couramment des underscores (ex: identifiants de plugin, "guild_id").
    const { driver, cleanup } = await makeDriver();
    await driver.init();
    await driver.set('guild_1:a', 1);
    await driver.set('guildX1:a', 2);
    expect(await driver.keys('guild_1:')).toEqual(['guild_1:a']);
    await driver.close();
    await cleanup();
  });
});
