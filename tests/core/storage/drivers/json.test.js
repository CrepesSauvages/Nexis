import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../../../src/core/storage/drivers/json.js';
import { runConformanceSuite } from '../../../storage-conformance.js';

const makeDriver = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nexis-json-'));
  const path = join(dir, 'store.json');
  return {
    driver: createJsonDriver({ path }),
    reopen: () => createJsonDriver({ path }),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
};

runConformanceSuite('json', makeDriver);

describe('createJsonDriver — spécifique', () => {
  it('devrait créer le fichier et son répertoire parent au premier init', async () => {
    const { driver, cleanup } = await makeDriver();
    await driver.init();
    await driver.set('a', 1);
    expect(await driver.get('a')).toBe(1);
    await driver.close();
    await cleanup();
  });

  it('devrait exposer le handle natif via raw()', async () => {
    const { driver, cleanup } = await makeDriver();
    await driver.init();
    await driver.set('a', 1);
    expect(driver.raw()).toMatchObject({ a: 1 });
    await driver.close();
    await cleanup();
  });

  it("ne devrait pas rester bloquée après un échec d'écriture", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nexis-json-fail-'));
    const path = join(dir, 'store.json');
    const driver = createJsonDriver({ path });
    await driver.init();

    // On supprime le répertoire parent après l'init : la prochaine
    // écriture ne peut plus créer son fichier temporaire et doit échouer.
    await rm(dir, { recursive: true, force: true });
    await expect(driver.set('a', 1)).rejects.toThrow();

    // Le répertoire recréé, une écriture suivante doit réussir : la file
    // ne doit pas être restée bloquée par l'échec précédent, et les deux
    // clés (celle qui a échoué puis celle-ci) doivent atteindre le disque.
    await mkdir(dir, { recursive: true });
    await driver.set('b', 2);
    await driver.close();

    const reopened = createJsonDriver({ path });
    await reopened.init();
    expect(await reopened.get('a')).toBe(1);
    expect(await reopened.get('b')).toBe(2);
    await reopened.close();

    await rm(dir, { recursive: true, force: true });
  });
});
