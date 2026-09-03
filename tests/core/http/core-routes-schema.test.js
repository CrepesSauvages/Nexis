import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoreRoutesTestHarness, i18nFixtures } from './core-routes-harness.js';

const harness = new CoreRoutesTestHarness();
/** @type {string} */
let base;

beforeEach(async () => {
  await harness.setupTempDir();
  base = await harness.boot({ pluginsDir: i18nFixtures });
});

afterEach(async () => {
  await harness.cleanup();
});

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
const call = (path, init) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { cookie: harness.cookie, ...(init?.headers ?? {}) },
  });

/**
 * @returns {Promise<{ description: string, config: Record<string, unknown>, schema: Record<string, { label: string, options?: string[] }> }>}
 */
const greeter = async () => {
  const response = await call('/api/core/plugins?guild=g1');
  const body = /** @type {Array<{ name: string }>} */ (await response.json());
  return /** @type {never} */ (body.find((plugin) => plugin.name === 'greeter'));
};

describe('GET /api/core/plugins — libellés traduits', () => {
  it('devrait traduire un label qui est une clé de traduction du plugin', async () => {
    expect((await greeter()).schema.greeting.label).toBe('Salutation');
  });

  it("devrait rendre tel quel un label qui n'est pas une clé de traduction", async () => {
    expect((await greeter()).schema.logs.label).toBe('Salon des logs');
  });

  it('devrait traduire la description du plugin', async () => {
    expect((await greeter()).description).toBe('Plugin de salutations');
  });

  it('devrait traduire dans la langue du serveur', async () => {
    await call('/api/core/locale?guild=g1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'en' }),
    });
    const plugin = await greeter();
    expect(plugin.schema.greeting.label).toBe('Greeting');
    expect(plugin.description).toBe('Greeting plugin');
  });

  it("devrait laisser les options d'un select inchangées alors que son label est traduit", async () => {
    // Garde exigée par la spec : un helper naïf qui traduirait tout le schéma
    // (label ET options) romprait `validateConfigValues`, qui compare les
    // valeurs reçues aux options du manifeste — `not_in_options` sur un
    // enregistrement pourtant valide, en silence. `option.strict` est à la
    // fois une option de `mode` et une clé de traduction du plugin : si elle
    // était traduite, ce test le détecterait.
    const plugin = await greeter();
    expect(plugin.schema.mode.options).toEqual(['option.strict', 'doux']);
    expect(plugin.schema.mode.label).toBe('Mode (fr)');

    await call('/api/core/locale?guild=g1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'en' }),
    });
    const pluginEn = await greeter();
    expect(pluginEn.schema.mode.options).toEqual(['option.strict', 'doux']);
    expect(pluginEn.schema.mode.label).toBe('Mode (en)');
  });

  it("devrait laisser le manifeste d'origine intact", async () => {
    // `manifest.config` est partagé par tous les serveurs : traduire sur
    // place rendrait le libellé anglais visible partout. Un second appel en
    // français après un appel en anglais le prouve.
    await call('/api/core/locale?guild=g1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'en' }),
    });
    expect((await greeter()).schema.greeting.label).toBe('Greeting');

    await call('/api/core/locale?guild=g1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'fr' }),
    });
    expect((await greeter()).schema.greeting.label).toBe('Salutation');
  });
});

describe('PATCH /api/core/config — champs obligatoires', () => {
  /**
   * @param {Record<string, unknown>} values
   * @returns {Promise<Response>}
   */
  const patch = (values) =>
    call('/api/core/config?guild=g1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'greeter', values }),
    });

  it('devrait refuser un enregistrement laissant un champ obligatoire vide', async () => {
    const response = await patch({ greeting: 'Salut' });
    expect(response.status).toBe(400);
    const body = /** @type {{ fields: Array<{ key: string, reason: string }> }} */ (
      await response.json()
    );
    expect(body.fields).toEqual([{ key: 'logs', reason: 'missing_required' }]);
  });

  it("devrait n'avoir rien écrit après un refus", async () => {
    await patch({ greeting: 'Salut' });
    expect((await greeter()).config.greeting).toBe('Bonjour');
  });

  it('devrait accepter un enregistrement renseignant le champ obligatoire', async () => {
    const response = await patch({ greeting: 'Salut', logs: '123456789012345678' });
    expect(response.status).toBe(200);
  });

  it('devrait accepter une modification partielle une fois le champ obligatoire stocké', async () => {
    await patch({ logs: '123456789012345678' });
    const response = await patch({ greeting: 'Coucou' });
    expect(response.status).toBe(200);
  });
});
