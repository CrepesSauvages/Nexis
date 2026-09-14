import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../../src/core/storage/drivers/json.js';
import { createSessions } from '../../../src/core/http/session.js';

/** @type {string} */
let dir;
/** @type {import('../../../src/core/storage/driver.js').StorageDriver} */
let storage;

/** @type {import('../../../src/core/http/session.js').SessionData} */
const data = {
  userId: 'u1',
  username: 'thomas',
  avatar: null,
  guilds: [{ id: 'g1', name: 'Serveur', icon: null, permissions: '8' }],
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-session-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('createSessions', () => {
  it('devrait créer un identifiant de 64 caractères hexadécimaux', async () => {
    const sessions = createSessions({ storage });
    expect(await sessions.create(data)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('devrait produire un identifiant différent à chaque création', async () => {
    const sessions = createSessions({ storage });
    expect(await sessions.create(data)).not.toBe(await sessions.create(data));
  });

  it('devrait relire une session créée', async () => {
    const sessions = createSessions({ storage });
    const id = await sessions.create(data);
    expect(await sessions.get(id)).toMatchObject(data);
  });

  it('devrait retourner undefined sur un identifiant inconnu', async () => {
    expect(await createSessions({ storage }).get('inconnu')).toBeUndefined();
  });

  it('devrait retourner undefined sans identifiant', async () => {
    expect(await createSessions({ storage }).get(undefined)).toBeUndefined();
  });

  it('devrait traiter une session expirée comme absente', async () => {
    let clock = 1000;
    const sessions = createSessions({ storage, now: () => clock, ttlMs: 100 });
    const id = await sessions.create(data);
    clock = 1101;
    expect(await sessions.get(id)).toBeUndefined();
  });

  it('devrait supprimer du storage une session expirée', async () => {
    let clock = 1000;
    const sessions = createSessions({ storage, now: () => clock, ttlMs: 100 });
    const id = await sessions.create(data);
    clock = 1101;
    await sessions.get(id);
    expect(await storage.get(`core:session:${id}`)).toBeUndefined();
  });

  it('devrait détruire une session à la demande', async () => {
    const sessions = createSessions({ storage });
    const id = await sessions.create(data);
    await sessions.destroy(id);
    expect(await sessions.get(id)).toBeUndefined();
  });

  it('devrait ignorer une destruction sans identifiant', async () => {
    await expect(createSessions({ storage }).destroy(undefined)).resolves.toBeUndefined();
  });
});

describe('purgeExpired', () => {
  it('devrait supprimer une session périmée', async () => {
    let clock = 1_000;
    const sessions = createSessions({ storage, now: () => clock, ttlMs: 100 });
    const id = await sessions.create(data);

    clock += 200;
    expect(await sessions.purgeExpired()).toBe(1);
    expect(await storage.get(`core:session:${id}`)).toBeUndefined();
  });

  it('devrait épargner une session encore valide', async () => {
    let clock = 1_000;
    const sessions = createSessions({ storage, now: () => clock, ttlMs: 10_000 });
    const id = await sessions.create(data);

    clock += 200;
    expect(await sessions.purgeExpired()).toBe(0);
    expect(await sessions.get(id)).toBeDefined();
  });

  it('devrait ne toucher qu’aux sessions', async () => {
    const sessions = createSessions({ storage, now: () => 1_000, ttlMs: 1 });
    await sessions.create(data);
    await storage.set('core:guild:g1:enabled', ['welcome']);

    await sessions.purgeExpired();
    expect(await storage.get('core:guild:g1:enabled')).toEqual(['welcome']);
  });

  it('devrait laisser une clé dont le contenu est illisible', async () => {
    const sessions = createSessions({ storage, now: () => 1_000 });
    // Ni périmée ni valide : rien ne justifie de la supprimer.
    await storage.set('core:session:cassée', null);

    expect(await sessions.purgeExpired()).toBe(0);
    expect(await storage.keys('core:session:')).toHaveLength(1);
  });
});
