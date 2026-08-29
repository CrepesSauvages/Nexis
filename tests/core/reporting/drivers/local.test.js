import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../../../src/core/storage/drivers/json.js';
import { createLocalReporter } from '../../../../src/core/reporting/drivers/local.js';

/** @param {number} n */
const entry = (n) => ({
  id: `id${n}`,
  timestamp: new Date(2026, 0, n).toISOString(),
  level: /** @type {'error'} */ ('error'),
  message: `erreur ${n}`,
  context: { n },
});

/** @type {string} */
let dir;
/** @type {import('../../../../src/core/storage/driver.js').StorageDriver} */
let storage;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-reporting-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('createLocalReporter', () => {
  it('devrait retourner un buffer vide avant tout rapport', async () => {
    const reporter = createLocalReporter({ storage });
    expect(await reporter.getRecent()).toEqual([]);
  });

  it('devrait stocker une entrée rapportée', async () => {
    const reporter = createLocalReporter({ storage });
    await reporter.report(entry(1));
    expect(await reporter.getRecent()).toEqual([entry(1)]);
  });

  it('devrait retourner les entrées les plus récentes en premier', async () => {
    const reporter = createLocalReporter({ storage });
    await reporter.report(entry(1));
    await reporter.report(entry(2));
    expect(await reporter.getRecent()).toEqual([entry(2), entry(1)]);
  });

  it('devrait respecter la limite en écrasant les plus anciennes (FIFO)', async () => {
    const reporter = createLocalReporter({ storage, limit: 2 });
    await reporter.report(entry(1));
    await reporter.report(entry(2));
    await reporter.report(entry(3));
    expect(await reporter.getRecent(10)).toEqual([entry(3), entry(2)]);
  });

  it('devrait limiter getRecent au nombre demandé', async () => {
    const reporter = createLocalReporter({ storage, limit: 10 });
    await reporter.report(entry(1));
    await reporter.report(entry(2));
    await reporter.report(entry(3));
    expect(await reporter.getRecent(2)).toEqual([entry(3), entry(2)]);
  });

  it('devrait persister entre deux instances sur le même storage', async () => {
    await createLocalReporter({ storage }).report(entry(1));
    const second = createLocalReporter({ storage });
    expect(await second.getRecent()).toEqual([entry(1)]);
  });

  it('devrait utiliser 500 comme limite par défaut', async () => {
    const reporter = createLocalReporter({ storage });
    for (let i = 1; i <= 501; i += 1) {
      await reporter.report(entry(i));
    }
    const recent = await reporter.getRecent(501);
    expect(recent).toHaveLength(500);
    expect(recent[0]).toEqual(entry(501));
    expect(recent.at(-1)).toEqual(entry(2));
  });

  it('ne devrait perdre aucune entrée quand deux report() se chevauchent (race condition)', async () => {
    // Storage maison plutôt que le driver JSON : on retarde volontairement
    // le premier get() (comme une vraie I/O réseau postgres/mongo) pour
    // vérifier que le second report() n'entame son propre get() qu'une fois
    // le premier entièrement terminé (get + set), pas avant.
    /** @type {Record<string, unknown>} */
    const store = {};
    let callIndex = 0;
    /** @type {import('../../../../src/core/storage/driver.js').StorageDriver} */
    const racyStorage = {
      async init() {},
      async get(key) {
        const i = callIndex++;
        // Capturé avant le délai : simule une lecture réseau dont la réponse
        // reflète l'état du serveur au moment de l'appel, pas au moment où
        // la promesse se résout — le scénario réel sur postgres/mongo.
        const value = store[key];
        if (i === 0) await new Promise((resolve) => setTimeout(resolve, 20));
        return value;
      },
      async set(key, value) {
        store[key] = value;
      },
      async delete(key) {
        delete store[key];
      },
      async keys(prefix) {
        return Object.keys(store).filter((key) => key.startsWith(prefix));
      },
      async close() {},
      raw: () => store,
    };

    const reporter = createLocalReporter({ storage: racyStorage });
    await Promise.all([reporter.report(entry(1)), reporter.report(entry(2))]);

    const recent = await reporter.getRecent();
    expect(recent).toHaveLength(2);
    expect(recent).toEqual(expect.arrayContaining([entry(1), entry(2)]));
  });

  it('ne devrait pas bloquer les report() suivants après un échec de storage.set', async () => {
    let calls = 0;
    /** @type {import('../../../../src/core/storage/driver.js').StorageDriver} */
    const flakyStorage = {
      async init() {},
      async get() {
        return undefined;
      },
      async set() {
        calls += 1;
        if (calls === 1) throw new Error('échec simulé');
      },
      async delete() {},
      async keys() {
        return [];
      },
      async close() {},
      raw: () => ({}),
    };

    const reporter = createLocalReporter({ storage: flakyStorage });
    await expect(reporter.report(entry(1))).rejects.toThrow('échec simulé');
    await expect(reporter.report(entry(2))).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });
});
