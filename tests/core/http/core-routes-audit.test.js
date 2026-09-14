import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoreRoutesTestHarness, ID } from './core-routes-harness.js';

const harness = new CoreRoutesTestHarness();
/** @type {string} */
let cookie;

beforeEach(async () => {
  await harness.setupTempDir();
});

afterEach(async () => {
  await harness.cleanup();
});

const boot = async () => {
  const base = await harness.boot();
  cookie = harness.cookie;
  return base;
};

/** @param {string} base */
const readAudit = async (base) => {
  const response = await fetch(`${base}/api/core/audit?guild=g1`, { headers: { Cookie: cookie } });
  return { status: response.status, body: await response.json() };
};

/**
 * @param {string} base
 * @param {string} path
 * @param {string} method
 * @param {unknown} body
 */
const write = (base, path, method, body) =>
  fetch(`${base}${path}?guild=g1`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('GET /api/core/audit', () => {
  it('devrait rendre un journal vide au démarrage', async () => {
    const base = await boot();
    const { status, body } = await readAudit(base);

    expect(status).toBe(200);
    expect(body.entries).toEqual([]);
  });

  it('devrait exiger « Gérer le serveur »', async () => {
    const base = await boot();
    const response = await fetch(`${base}/api/core/audit?guild=g5`, {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(403);
  });
});

describe('ce que le journal retient', () => {
  it("devrait enregistrer l'activation d'un plugin et son auteur", async () => {
    const base = await boot();
    await write(base, '/api/core/plugins/enable', 'POST', { name: 'alpha' });

    const { body } = await readAudit(base);
    expect(body.entries[0]).toMatchObject({
      actor: 'u1',
      action: 'plugin.enable',
      target: 'alpha',
    });
  });

  it('devrait enregistrer une désactivation', async () => {
    const base = await boot();
    await write(base, '/api/core/plugins/enable', 'POST', { name: 'alpha' });
    await write(base, '/api/core/plugins/disable', 'POST', { name: 'alpha' });

    const { body } = await readAudit(base);
    expect(body.entries[0]).toMatchObject({ action: 'plugin.disable', target: 'alpha' });
  });

  it('devrait enregistrer les clés de configuration touchées, pas leurs valeurs', async () => {
    const base = await boot();
    await write(base, '/api/core/config', 'PATCH', {
      name: 'alpha',
      values: { greeting: 'Salut' },
    });

    const { body } = await readAudit(base);
    expect(body.entries[0]).toMatchObject({
      action: 'config.update',
      target: 'alpha',
      details: { keys: ['greeting'] },
    });
    expect(JSON.stringify(body.entries[0])).not.toContain('Salut');
  });

  it('devrait enregistrer un changement de langue', async () => {
    const base = await boot();
    await write(base, '/api/core/locale', 'PUT', { locale: 'en' });

    const { body } = await readAudit(base);
    expect(body.entries[0]).toMatchObject({ action: 'locale.set', target: 'en' });
  });

  it('devrait enregistrer une liste de rôles', async () => {
    const base = await boot();
    await write(base, '/api/core/permissions', 'PUT', { command: 'ping', roles: [ID] });

    const { body } = await readAudit(base);
    expect(body.entries[0]).toMatchObject({
      action: 'perms.set',
      target: 'ping',
      details: { roles: [ID] },
    });
  });

  it('devrait distinguer un retour au niveau déclaré', async () => {
    const base = await boot();
    await write(base, '/api/core/permissions', 'PUT', { command: 'ping', roles: null });

    const { body } = await readAudit(base);
    expect(body.entries[0]).toMatchObject({ action: 'perms.reset', target: 'ping' });
  });

  it("ne devrait rien enregistrer quand l'écriture est refusée", async () => {
    const base = await boot();
    await write(base, '/api/core/config', 'PATCH', { name: 'alpha', values: { inconnu: 1 } });
    await write(base, '/api/core/permissions', 'PUT', { command: 'fantome', roles: [] });

    const { body } = await readAudit(base);
    expect(body.entries).toEqual([]);
  });

  it('devrait garder les serveurs séparés', async () => {
    const base = await boot();
    await write(base, '/api/core/plugins/enable', 'POST', { name: 'alpha' });

    const response = await fetch(`${base}/api/core/audit?guild=g4`, {
      headers: { Cookie: cookie },
    });
    expect((await response.json()).entries).toEqual([]);
  });
});
