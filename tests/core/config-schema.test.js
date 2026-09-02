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
 * Faux serveur réduit à ce que la validation consulte.
 * @param {{ channels?: string[], roles?: string[], members?: string[] }} [contents]
 * @returns {import('discord.js').Guild}
 */
const fakeGuild = ({ channels = [], roles = [], members = [] } = {}) =>
  /** @type {import('discord.js').Guild} */ (
    /** @type {unknown} */ ({
      channels: { cache: new Map(channels.map((id) => [id, {}])) },
      roles: { cache: new Map(roles.map((id) => [id, {}])) },
      members: {
        fetch: vi.fn(async (id) => {
          if (!members.includes(String(id))) throw new Error('Unknown Member');
          return {};
        }),
      },
    })
  );

const ID = '123456789012345678';
const AUTRE_ID = '987654321098765432';

describe('types simples', () => {
  it('devrait accepter des valeurs bien typées', async () => {
    const result = await validateConfigValues({
      schema,
      values: { greeting: 'Bonjour', delay: 5, announce: true, mode: 'doux' },
      guild: fakeGuild(),
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
      guild: fakeGuild(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'delay', reason: 'wrong_type' }] });
  });

  it('devrait refuser un booléen passé en chaîne', async () => {
    const result = await validateConfigValues({
      schema,
      values: { announce: 'true' },
      guild: fakeGuild(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'announce', reason: 'wrong_type' }] });
  });

  it('devrait refuser un nombre non fini', async () => {
    const result = await validateConfigValues({
      schema,
      values: { delay: Number.POSITIVE_INFINITY },
      guild: fakeGuild(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'delay', reason: 'wrong_type' }] });
  });

  it('devrait refuser une valeur hors des options', async () => {
    const result = await validateConfigValues({
      schema,
      values: { mode: 'brutal' },
      guild: fakeGuild(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'mode', reason: 'not_in_options' }] });
  });
});

describe('clés inconnues', () => {
  it('devrait refuser une clé absente du schéma', async () => {
    const result = await validateConfigValues({
      schema,
      values: { greting: 'faute de frappe' },
      guild: fakeGuild(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'greting', reason: 'unknown_key' }] });
  });

  it('devrait refuser toute clé quand le schéma est absent', async () => {
    const result = await validateConfigValues({
      schema: undefined,
      values: { quoi: 1 },
      guild: fakeGuild(),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'quoi', reason: 'unknown_key' }] });
  });
});

describe('références au serveur', () => {
  it('devrait accepter un salon présent dans le serveur', async () => {
    const result = await validateConfigValues({
      schema,
      values: { salon: ID },
      guild: fakeGuild({ channels: [ID] }),
    });
    expect(result.ok).toBe(true);
  });

  it('devrait refuser un salon absent du serveur', async () => {
    const result = await validateConfigValues({
      schema,
      values: { salon: AUTRE_ID },
      guild: fakeGuild({ channels: [ID] }),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'salon', reason: 'not_found_in_guild' }] });
  });

  it('devrait refuser un identifiant qui n en est pas un', async () => {
    const result = await validateConfigValues({
      schema,
      values: { salon: 'general' },
      guild: fakeGuild({ channels: [ID] }),
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'salon', reason: 'wrong_type' }] });
  });

  it('devrait accepter un rôle présent dans le serveur', async () => {
    const result = await validateConfigValues({
      schema,
      values: { role: ID },
      guild: fakeGuild({ roles: [ID] }),
    });
    expect(result.ok).toBe(true);
  });

  it('devrait interroger Discord pour un membre, pas son cache', async () => {
    const guild = fakeGuild({ members: [ID] });
    const result = await validateConfigValues({ schema, values: { moderateur: ID }, guild });
    expect(result.ok).toBe(true);
    expect(guild.members.fetch).toHaveBeenCalledWith(ID);
  });

  it('devrait refuser un membre que Discord ne connaît pas', async () => {
    const result = await validateConfigValues({
      schema,
      values: { moderateur: AUTRE_ID },
      guild: fakeGuild({ members: [ID] }),
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
      guild: fakeGuild(),
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fields).toEqual([
      { key: 'delay', reason: 'wrong_type' },
      { key: 'mode', reason: 'not_in_options' },
      { key: 'inconnu', reason: 'unknown_key' },
    ]);
  });

  it('devrait accepter un objet vide', async () => {
    expect(await validateConfigValues({ schema, values: {}, guild: fakeGuild() })).toEqual({
      ok: true,
      values: {},
    });
  });
});
