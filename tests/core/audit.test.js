import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../src/core/storage/drivers/json.js';
import { createAudit, NO_AUDIT } from '../../src/core/audit.js';

/** @type {string} */
let dir;
/** @type {import('../../src/core/storage/driver.js').StorageDriver} */
let storage;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-audit-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

/** @param {object} [overrides] */
const entry = (overrides = {}) => ({
  guildId: 'g1',
  actor: 'u1',
  action: 'plugin.enable',
  target: 'welcome',
  ...overrides,
});

describe('createAudit', () => {
  it('devrait enregistrer une entrée et la relire', async () => {
    const audit = createAudit({ storage });
    await audit.record(entry());

    expect(await audit.recent('g1')).toMatchObject([
      { actor: 'u1', action: 'plugin.enable', target: 'welcome' },
    ]);
  });

  it('devrait horodater et identifier chaque entrée', async () => {
    const audit = createAudit({ storage });
    await audit.record(entry());

    const [written] = await audit.recent('g1');
    expect(written.id).toMatch(/^[a-f0-9]{8}$/);
    expect(Date.parse(written.timestamp)).not.toBeNaN();
  });

  it('devrait rendre les plus récentes en premier', async () => {
    const audit = createAudit({ storage });
    await audit.record(entry({ target: 'un' }));
    await audit.record(entry({ target: 'deux' }));

    expect((await audit.recent('g1')).map((e) => e.target)).toEqual(['deux', 'un']);
  });

  it('devrait garder les détails quand il y en a', async () => {
    const audit = createAudit({ storage });
    await audit.record(entry({ details: { keys: ['greeting'] } }));

    expect((await audit.recent('g1'))[0].details).toEqual({ keys: ['greeting'] });
  });

  it("ne devrait pas poser de champ details quand il n'y en a pas", async () => {
    const audit = createAudit({ storage });
    await audit.record(entry());

    expect((await audit.recent('g1'))[0]).not.toHaveProperty('details');
  });

  it('devrait limiter le nombre d’entrées conservées', async () => {
    const audit = createAudit({ storage, limit: 3 });
    for (const target of ['a', 'b', 'c', 'd']) await audit.record(entry({ target }));

    const kept = (await audit.recent('g1')).map((e) => e.target);
    expect(kept).toEqual(['d', 'c', 'b']);
  });

  it('devrait borner la lecture au nombre demandé', async () => {
    const audit = createAudit({ storage });
    for (const target of ['a', 'b', 'c']) await audit.record(entry({ target }));

    expect(await audit.recent('g1', 2)).toHaveLength(2);
  });

  it('devrait garder les serveurs indépendants', async () => {
    const audit = createAudit({ storage });
    await audit.record(entry({ guildId: 'g1' }));

    expect(await audit.recent('g2')).toEqual([]);
  });

  it('ne devrait perdre aucune entrée écrite en parallèle', async () => {
    const audit = createAudit({ storage });
    // Sans sérialisation, ces get→set s'entrelacent et les derniers
    // écrasent les premiers.
    await Promise.all(
      Array.from({ length: 10 }, (_value, index) => audit.record(entry({ target: `p${index}` }))),
    );

    expect(await audit.recent('g1', 50)).toHaveLength(10);
  });

  it("devrait rendre un journal vide quand rien n'a été enregistré", async () => {
    expect(await createAudit({ storage }).recent('g1')).toEqual([]);
  });
});

describe('NO_AUDIT', () => {
  it('devrait accepter un enregistrement sans rien faire', async () => {
    await expect(NO_AUDIT.record(entry())).resolves.toBeUndefined();
  });
});
