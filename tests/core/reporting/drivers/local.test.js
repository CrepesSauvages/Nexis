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
});
