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
 * @param {unknown} body
 */
const patchConfig = (base, body) =>
  fetch(`${base}/api/core/config?guild=g1`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('PATCH /api/core/config', () => {
  it('devrait écrire une valeur valide', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await patchConfig(base, { name: 'alpha', values: { greeting: 'Salut' } });
    expect(response.status).toBe(200);
    const stored = await app?.guildConfig.getConfig('g1', 'alpha', undefined);
    expect(stored).toMatchObject({ greeting: 'Salut' });
  });

  it('devrait refuser en 400 une clé absente du manifeste', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await patchConfig(base, { name: 'alpha', values: { inconnu: 1 } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fields: [{ key: 'inconnu', reason: 'unknown_key' }],
    });
  });

  it('ne devrait rien écrire quand un seul champ est invalide', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    await patchConfig(base, { name: 'alpha', values: { greeting: 'ok', inconnu: 1 } });
    const stored = /** @type {Record<string, unknown>} */ (
      await app?.guildConfig.getConfig('g1', 'alpha', undefined)
    );
    expect(stored.greeting).toBeUndefined();
  });

  it('devrait refuser en 404 un plugin inconnu', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    expect((await patchConfig(base, { name: 'fantome', values: {} })).status).toBe(404);
  });

  it('devrait refuser en 400 un corps sans values', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    expect((await patchConfig(base, { name: 'alpha' })).status).toBe(400);
  });
});

describe('PUT /api/core/locale', () => {
  /**
   * @param {string} base
   * @param {unknown} body
   */
  const putLocale = (base, body) =>
    fetch(`${base}/api/core/locale?guild=g1`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('devrait enregistrer une langue supportée', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await putLocale(base, { locale: 'pl' });
    expect(response.status).toBe(200);
    expect(await app?.guildConfig.getLocale('g1')).toBe('pl');
  });

  it('devrait refuser en 400 une langue non supportée', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    const response = await putLocale(base, { locale: 'kl' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ reason: 'unknown_locale' });
  });

  it('ne devrait pas enregistrer une langue refusée', async () => {
    const base = await harness.boot();
    app = harness.app;
    cookie = harness.cookie;
    await putLocale(base, { locale: 'kl' });
    expect(await app?.guildConfig.getLocale('g1')).toBeUndefined();
  });
});
