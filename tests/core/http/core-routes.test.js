import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoreRoutesTestHarness } from './core-routes-harness.js';

const harness = new CoreRoutesTestHarness();
let app;
/** @type {string} */
let cookie;

beforeEach(async () => {
  await harness.setupTempDir();
});

afterEach(async () => {
  await harness.cleanup();
});

/**
 * @param {string} base
 * @param {string} action
 * @param {unknown} body
 */
const post = (base, action, body) =>
  fetch(`${base}/api/core/plugins/${action}?guild=g1`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('GET /api/core/guilds', () => {
  it('devrait refuser en 401 sans session', async () => {
    const base = await harness.boot();
    app = harness.app;
    expect((await fetch(`${base}/api/core/guilds`)).status).toBe(401);
  });

  it('devrait ne garder que les serveurs où le bot est présent et où on gère', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await fetch(`${base}/api/core/guilds`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 'g1', name: 'Serveur un', icon: null }]);
  });
});

describe('GET /api/core/plugins', () => {
  it('devrait refuser en 400 sans paramètre guild', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await fetch(`${base}/api/core/plugins`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(400);
  });

  it('devrait refuser en 401 sans session', async () => {
    const base = await harness.boot();
    app = harness.app;
    expect((await fetch(`${base}/api/core/plugins?guild=g1`)).status).toBe(401);
  });

  it('devrait lister chaque plugin avec son manifeste et son état', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await fetch(`${base}/api/core/plugins?guild=g1`, {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    const body = /** @type {{
      name: string,
      version: string,
      description: string | null,
      dependsOn: string[],
      alwaysEnabled: boolean,
      enabled: boolean,
      schema: object,
    }[]} */ (await response.json());
    const alpha = body.find((entry) => entry.name === 'alpha');
    expect(alpha).toBeDefined();
    expect(alpha?.version).toBe('1.0.0');
    expect(alpha?.description).toBe('Plugin de test');
    expect(alpha?.dependsOn).toEqual([]);
    expect(alpha?.alwaysEnabled).toBe(false);
    expect(alpha?.enabled).toBe(false);
    expect(alpha).toHaveProperty('schema');
    expect(alpha).toHaveProperty('config');
  });

  it('devrait refléter une activation', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    await app?.guildConfig.enable('g1', 'alpha');
    const body = /** @type {{ name: string, enabled: boolean }[]} */ (
      await (
        await fetch(`${base}/api/core/plugins?guild=g1`, { headers: { Cookie: cookie } })
      ).json()
    );
    expect(body.find((entry) => entry.name === 'alpha')?.enabled).toBe(true);
  });
});

describe('POST /api/core/plugins/enable', () => {
  it('devrait activer un plugin', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await post(base, 'enable', { name: 'alpha' });
    expect(response.status).toBe(200);
    expect(await app?.guildConfig.isEnabled('g1', 'alpha')).toBe(true);
  });

  it('devrait refuser en 404 un plugin inconnu', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await post(base, 'enable', { name: 'fantome' });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ reason: 'not_found' });
  });

  it('devrait refuser en 409 un plugin déjà activé', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    await post(base, 'enable', { name: 'alpha' });
    const response = await post(base, 'enable', { name: 'alpha' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'already_enabled' });
  });

  it('devrait refuser en 400 un corps sans nom', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    expect((await post(base, 'enable', {})).status).toBe(400);
  });

  it('devrait refuser en 401 sans session', async () => {
    const base = await harness.boot();
    app = harness.app;
    const response = await fetch(`${base}/api/core/plugins/enable?guild=g1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'alpha' }),
    });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/core/plugins/disable', () => {
  it('devrait désactiver un plugin activé', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    await post(base, 'enable', { name: 'alpha' });
    const response = await post(base, 'disable', { name: 'alpha' });
    expect(response.status).toBe(200);
    expect(await app?.guildConfig.isEnabled('g1', 'alpha')).toBe(false);
  });

  it('devrait réussir sur un plugin déjà inactif', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    expect((await post(base, 'disable', { name: 'alpha' })).status).toBe(200);
  });

  it('devrait refuser en 409 et nommer les dépendants', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    await post(base, 'enable', { name: 'alpha' });
    await post(base, 'enable', { name: 'beta' });
    const response = await post(base, 'disable', { name: 'alpha' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'has_dependents', deps: ['beta'] });
  });
});
