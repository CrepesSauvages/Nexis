import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoreRoutesTestHarness } from './core-routes-harness.js';

const harness = new CoreRoutesTestHarness();
/** @type {string} */
let cookie;

beforeEach(async () => {
  await harness.setupTempDir();
});

afterEach(async () => {
  await harness.cleanup();
});

/** @param {number} n */
const entry = (n) => ({
  id: `id${n}`,
  timestamp: new Date(2026, 0, n).toISOString(),
  level: 'error',
  message: `erreur ${n}`,
  context: { plugin: 'core', errorId: `id${n}`, stack: `Error: erreur ${n}` },
});

/**
 * @param {number} count
 * @returns {ReturnType<typeof entry>[]}
 */
const entries = (count) => Array.from({ length: count }, (_, i) => entry(i + 1));

describe('GET /api/core/errors', () => {
  it('devrait refuser en 401 sans session', async () => {
    const base = await harness.boot({ ownerId: 'u1' });
    expect((await fetch(`${base}/api/core/errors`)).status).toBe(401);
  });

  it("devrait refuser en 403 à un administrateur de serveur qui n'est pas le propriétaire", async () => {
    const base = await harness.boot({ ownerId: 'quelquun-dautre' });
    cookie = harness.cookie;
    const response = await fetch(`${base}/api/core/errors`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(403);
  });

  it('devrait renvoyer les entrées au propriétaire', async () => {
    const base = await harness.boot({ ownerId: 'u1' });
    cookie = harness.cookie;
    await harness.app?.storage.set('core:errors', [entry(1)]);
    const response = await fetch(`${base}/api/core/errors`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      entries: [
        {
          id: 'id1',
          timestamp: entry(1).timestamp,
          message: 'erreur 1',
          context: entry(1).context,
        },
      ],
    });
  });

  it('devrait utiliser 50 comme limite par défaut', async () => {
    const base = await harness.boot({ ownerId: 'u1' });
    cookie = harness.cookie;
    await harness.app?.storage.set('core:errors', entries(60));
    const response = await fetch(`${base}/api/core/errors`, { headers: { Cookie: cookie } });
    const body = /** @type {{ entries: unknown[] }} */ (await response.json());
    expect(body.entries).toHaveLength(50);
  });

  it('devrait respecter ?limit=', async () => {
    const base = await harness.boot({ ownerId: 'u1' });
    cookie = harness.cookie;
    await harness.app?.storage.set('core:errors', entries(10));
    const response = await fetch(`${base}/api/core/errors?limit=3`, {
      headers: { Cookie: cookie },
    });
    const body = /** @type {{ entries: unknown[] }} */ (await response.json());
    expect(body.entries).toHaveLength(3);
  });

  it('devrait plafonner ?limit= à 200', async () => {
    const base = await harness.boot({ ownerId: 'u1' });
    cookie = harness.cookie;
    await harness.app?.storage.set('core:errors', entries(250));
    const response = await fetch(`${base}/api/core/errors?limit=500`, {
      headers: { Cookie: cookie },
    });
    const body = /** @type {{ entries: unknown[] }} */ (await response.json());
    expect(body.entries).toHaveLength(200);
  });

  it('devrait retomber sur la limite par défaut si ?limit= est négatif ou non numérique', async () => {
    const base = await harness.boot({ ownerId: 'u1' });
    cookie = harness.cookie;
    await harness.app?.storage.set('core:errors', entries(60));

    const negative = await fetch(`${base}/api/core/errors?limit=-5`, {
      headers: { Cookie: cookie },
    });
    expect((await negative.json()).entries).toHaveLength(50);

    const nonNumeric = await fetch(`${base}/api/core/errors?limit=abc`, {
      headers: { Cookie: cookie },
    });
    expect((await nonNumeric.json()).entries).toHaveLength(50);
  });
});

describe('DELETE /api/core/errors', () => {
  it('devrait refuser en 401 sans session', async () => {
    const base = await harness.boot({ ownerId: 'u1' });
    expect((await fetch(`${base}/api/core/errors`, { method: 'DELETE' })).status).toBe(401);
  });

  it("devrait refuser en 403 à un administrateur de serveur qui n'est pas le propriétaire", async () => {
    const base = await harness.boot({ ownerId: 'quelquun-dautre' });
    cookie = harness.cookie;
    const response = await fetch(`${base}/api/core/errors`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(403);
  });

  it('devrait vider le journal — vérifié par un GET qui suit, pas par le corps de la réponse', async () => {
    const base = await harness.boot({ ownerId: 'u1' });
    cookie = harness.cookie;
    await harness.app?.storage.set('core:errors', entries(5));

    const del = await fetch(`${base}/api/core/errors`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(del.status).toBe(200);

    const after = await fetch(`${base}/api/core/errors`, { headers: { Cookie: cookie } });
    expect(await after.json()).toEqual({ entries: [] });
  });
});
