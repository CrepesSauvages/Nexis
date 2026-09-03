import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoreRoutesTestHarness, ID } from './core-routes-harness.js';
import { createSessions, SESSION_COOKIE } from '../../../src/core/http/session.js';

const harness = new CoreRoutesTestHarness();
let app;
/** @type {string} */
let cookie;
/** @type {string} */
let base;

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

/**
 * @param {string} path
 * @returns {Promise<Response>}
 */
const call = (path) => fetch(`${base}${path}`, { headers: { Cookie: cookie } });

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

  it('devrait écarter un serveur dont les permissions sont mal formées, sans faire échouer la liste', async () => {
    const base = await harness.boot();
    app = harness.app;
    const sessions = createSessions({
      storage: /** @type {NonNullable<typeof app>} */ (app).storage,
    });
    const id = await sessions.create({
      userId: 'u2',
      username: 'malforme',
      avatar: null,
      guilds: [
        { id: 'g1', name: 'Serveur un', icon: null, permissions: 'pas-un-nombre' },
        { id: 'g4', name: 'Aussi géré', icon: null, permissions: '32' },
      ],
    });
    const response = await fetch(`${base}/api/core/guilds`, {
      headers: { Cookie: `${SESSION_COOKIE}=${id}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 'g4', name: 'Aussi géré', icon: null }]);
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

describe('autorisation bout en bout', () => {
  it('devrait refuser en 403 un membre réel du serveur sans la permission « Gérer le serveur »', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await fetch(`${base}/api/core/plugins/enable?guild=g5`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'alpha' }),
    });
    expect(response.status).toBe(403);
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

describe('GET /api/core/guild-resources', () => {
  it('devrait lister les salons triés par position', async () => {
    base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await call('/api/core/guild-resources?guild=g1');
    expect(response.status).toBe(200);
    const body = /** @type {{ channels: Array<{ id: string, name: string, type: number }> }} */ (
      await response.json()
    );
    expect(body.channels).toEqual([
      { id: 'c2', name: 'annonces', type: 0 },
      // Fil sans `rawPosition` : `positionOf` le compte pour 0, à égalité
      // avec `c2` — le tri stable le place ensuite, dans l'ordre où il
      // apparaît dans le cache.
      { id: 'c3', name: 'fil-support', type: 11 },
      { id: ID, name: 'general', type: 0 },
    ]);
  });

  it('devrait lister les rôles du plus haut au plus bas', async () => {
    base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await call('/api/core/guild-resources?guild=g1');
    const body = /** @type {{ roles: Array<{ id: string, name: string, color: string }> }} */ (
      await response.json()
    );
    expect(body.roles).toEqual([
      { id: ID, name: 'Staff', color: '#5865f2' },
      { id: 'r2', name: '@everyone', color: '#000000' },
    ]);
  });

  it("devrait rendre 404 si le bot n'est pas présent sur le serveur", async () => {
    base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await call('/api/core/guild-resources?guild=g2');
    expect(response.status).toBe(404);
  });

  it('devrait refuser un membre sans la permission Gérer le serveur', async () => {
    base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await call('/api/core/guild-resources?guild=g5');
    expect(response.status).toBe(403);
  });

  it('devrait refuser une requête sans session', async () => {
    base = await harness.boot();
    app = harness.app;
    const response = await fetch(`${base}/api/core/guild-resources?guild=g1`);
    expect(response.status).toBe(401);
  });
});
