import { describe, it, expect, vi } from 'vitest';
import { validateConfigValues } from '../../src/core/config-schema.js';

/** @type {Record<string, import('../../src/core/manifest.js').ConfigEntry>} */
const schema = {
  greeting: { type: 'string', label: 'Salutation' },
  delay: { type: 'number', label: 'Délai' },
  announce: { type: 'boolean', label: 'Annoncer' },
  mode: { type: 'select', label: 'Mode', options: ['doux', 'strict'] },
  salon: { type: 'channel', label: 'Salon' },
  role: { type: 'role', label: 'Rôle' },
  moderateur: { type: 'user', label: 'Modérateur' },
};

/**
 * Doublure de `exists` : le contenu du serveur réduit à ce que la
 * validation consulte. Une fonction plutôt qu'un objet `Guild` — c'est ce
 * que `validateConfigValues` demande depuis qu'elle ne suppose plus le
 * serveur servi par ce process.
 *
 * @param {{ channels?: string[], roles?: string[], members?: string[] }} [contents]
 * @returns {(type: 'channel' | 'role' | 'user', id: string) => Promise<boolean>}
 */
const fakeExists =
  ({ channels = [], roles = [], members = [] } = {}) =>
  async (type, id) => {
    if (type === 'channel') return channels.includes(id);
    if (type === 'role') return roles.includes(id);
    return members.includes(id);
  };

const ID = '123456789012345678';
const AUTRE_ID = '987654321098765432';

describe('types simples', () => {
  it('devrait accepter des valeurs bien typées', async () => {
    const result = await validateConfigValues({
      schema,
      values: { greeting: 'Bonjour', delay: 5, announce: true, mode: 'doux' },
      exists: fakeExists(),
    });
    expect(result).toEqual({
      ok: true,
      values: { greeting: 'Bonjour', delay: 5, announce: true, mode: 'doux' },
    });
  });

  it('devrait refuser un nombre passé en chaîne', async () => {
    const result = await validateConfigValues({
      schema,
      values: { delay: '5' },
      exists: fakeExists(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'delay', reason: 'wrong_type' }] });
  });

  it('devrait refuser un booléen passé en chaîne', async () => {
    const result = await validateConfigValues({
      schema,
      values: { announce: 'true' },
      exists: fakeExists(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'announce', reason: 'wrong_type' }] });
  });

  it('devrait refuser un nombre non fini', async () => {
    const result = await validateConfigValues({
      schema,
      values: { delay: Number.POSITIVE_INFINITY },
      exists: fakeExists(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'delay', reason: 'wrong_type' }] });
  });

  it('devrait refuser une valeur hors des options', async () => {
    const result = await validateConfigValues({
      schema,
      values: { mode: 'brutal' },
      exists: fakeExists(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'mode', reason: 'not_in_options' }] });
  });
});

describe('clés inconnues', () => {
  it('devrait refuser une clé absente du schéma', async () => {
    const result = await validateConfigValues({
      schema,
      values: { greting: 'faute de frappe' },
      exists: fakeExists(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'greting', reason: 'unknown_key' }] });
  });

  it('devrait refuser toute clé quand le schéma est absent', async () => {
    const result = await validateConfigValues({
      schema: undefined,
      values: { quoi: 1 },
      exists: fakeExists(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'quoi', reason: 'unknown_key' }] });
  });

  it('devrait refuser les clés héritées du prototype comme unknown_key', async () => {
    // `JSON.parse` fait de `__proto__` une propriété propre ordinaire (pas un
    // vrai changement de prototype) : ces trois clés sont donc de vraies
    // propriétés propres d'un objet sans jamais figurer dans le manifeste.
    const values = JSON.parse(
      '{"__proto__":"123456789012345678","constructor":"x","toString":"y"}',
    );
    const result = await validateConfigValues({ schema, values, exists: fakeExists() });
    expect(result).toEqual({
      ok: false,
      fields: [
        { key: '__proto__', reason: 'unknown_key' },
        { key: 'constructor', reason: 'unknown_key' },
        { key: 'toString', reason: 'unknown_key' },
      ],
    });
  });
});

describe('références au serveur', () => {
  it('devrait accepter un salon présent dans le serveur', async () => {
    const result = await validateConfigValues({
      schema,
      values: { salon: ID },
      exists: fakeExists({ channels: [ID] }),
    });
    expect(result.ok).toBe(true);
  });

  it('devrait refuser un salon absent du serveur', async () => {
    const result = await validateConfigValues({
      schema,
      values: { salon: AUTRE_ID },
      exists: fakeExists({ channels: [ID] }),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'salon', reason: 'not_found_in_guild' }] });
  });

  it('devrait refuser un identifiant qui n en est pas un', async () => {
    const result = await validateConfigValues({
      schema,
      values: { salon: 'general' },
      exists: fakeExists({ channels: [ID] }),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'salon', reason: 'wrong_type' }] });
  });

  it('devrait accepter un rôle présent dans le serveur', async () => {
    const result = await validateConfigValues({
      schema,
      values: { role: ID },
      exists: fakeExists({ roles: [ID] }),
    });
    expect(result.ok).toBe(true);
  });

  it('devrait déléguer la vérification du référencé', async () => {
    // Le « comment » — interroger Discord plutôt que son cache pour un
    // membre — appartient à guild-access.js et s'y teste ; ici, seul
    // compte le fait de poser la question avec le bon type.
    const exists = vi.fn().mockResolvedValue(true);
    const result = await validateConfigValues({ schema, values: { moderateur: ID }, exists });

    expect(result.ok).toBe(true);
    expect(exists).toHaveBeenCalledWith('user', ID);
  });

  it('devrait refuser un membre que Discord ne connaît pas', async () => {
    const result = await validateConfigValues({
      schema,
      values: { moderateur: AUTRE_ID },
      exists: fakeExists({ members: [ID] }),
    });
    expect(result).toEqual({
      ok: false,
      fields: [{ key: 'moderateur', reason: 'not_found_in_guild' }],
    });
  });
});

describe('exhaustivité', () => {
  it('devrait rapporter toutes les erreurs en une fois', async () => {
    const result = await validateConfigValues({
      schema,
      values: { delay: 'x', mode: 'brutal', inconnu: 1, greeting: 'ok' },
      exists: fakeExists(),
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fields).toEqual([
      { key: 'delay', reason: 'wrong_type' },
      { key: 'mode', reason: 'not_in_options' },
      { key: 'inconnu', reason: 'unknown_key' },
    ]);
  });

  it('devrait accepter un objet vide', async () => {
    expect(await validateConfigValues({ schema, values: {}, exists: fakeExists() })).toEqual({
      ok: true,
      values: {},
    });
  });
});
