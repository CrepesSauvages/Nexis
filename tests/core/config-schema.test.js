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

/** Faux serveur générique, réutilisé par les tests qui ne portent pas sur les références au serveur. */
const guild = fakeGuild();

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

  it('devrait refuser les clés héritées du prototype comme unknown_key', async () => {
    // `JSON.parse` fait de `__proto__` une propriété propre ordinaire (pas un
    // vrai changement de prototype) : ces trois clés sont donc de vraies
    // propriétés propres d'un objet sans jamais figurer dans le manifeste.
    const values = JSON.parse(
      '{"__proto__":"123456789012345678","constructor":"x","toString":"y"}',
    );
    const result = await validateConfigValues({ schema, values, guild: fakeGuild() });
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

describe('champs obligatoires', () => {
  const schema = {
    logs: { type: 'string', label: 'Journal', required: true },
    quota: { type: 'number', label: 'Quota', required: true },
    actif: { type: 'boolean', label: 'Actif', required: true },
  };

  it('devrait refuser un champ obligatoire absent du corps et du stocké', async () => {
    const result = await validateConfigValues({
      schema: { logs: schema.logs },
      values: {},
      guild,
      current: {},
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'logs', reason: 'missing_required' }] });
  });

  it('devrait accepter un champ obligatoire déjà stocké et absent du corps', async () => {
    // La requête est une fusion partielle : ne pas mentionner un champ le
    // laisse à sa valeur actuelle, ce n'est pas l'effacer.
    const result = await validateConfigValues({
      schema: { logs: schema.logs },
      values: {},
      guild,
      current: { logs: 'déjà là' },
    });
    expect(result).toEqual({ ok: true, values: {} });
  });

  it('devrait refuser une chaîne vide sur un champ obligatoire', async () => {
    const result = await validateConfigValues({
      schema: { logs: schema.logs },
      values: { logs: '' },
      guild,
      current: {},
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'logs', reason: 'missing_required' }] });
  });

  it('devrait accepter 0 sur un champ numérique obligatoire', async () => {
    // `0` et `false` sont des valeurs légitimes : les traiter comme
    // manquantes rendrait ces deux champs impossibles à régler.
    const result = await validateConfigValues({
      schema: { quota: schema.quota },
      values: { quota: 0 },
      guild,
      current: {},
    });
    expect(result).toEqual({ ok: true, values: { quota: 0 } });
  });

  it('devrait accepter false sur un champ booléen obligatoire', async () => {
    const result = await validateConfigValues({
      schema: { actif: schema.actif },
      values: { actif: false },
      guild,
      current: {},
    });
    expect(result).toEqual({ ok: true, values: { actif: false } });
  });

  it("devrait ne signaler qu'une erreur pour un champ obligatoire de mauvais type", async () => {
    const result = await validateConfigValues({
      schema: { quota: schema.quota },
      values: { quota: 'douze' },
      guild,
      current: {},
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'quota', reason: 'wrong_type' }] });
  });

  it('devrait ignorer les champs non obligatoires laissés vides', async () => {
    const result = await validateConfigValues({
      schema: { note: { type: 'string', label: 'Note' } },
      values: {},
      guild,
      current: {},
    });
    expect(result).toEqual({ ok: true, values: {} });
  });

  it('devrait accepter un appel sans `current`', async () => {
    // `current` est optionnel : les appelants qui ne l'ont pas ne doivent pas
    // planter, ils voient simplement tout champ obligatoire comme manquant.
    const result = await validateConfigValues({
      schema: { note: { type: 'string', label: 'Note' } },
      values: { note: 'ok' },
      guild,
    });
    expect(result).toEqual({ ok: true, values: { note: 'ok' } });
  });
});
