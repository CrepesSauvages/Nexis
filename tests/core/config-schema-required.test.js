import { describe, it, expect } from 'vitest';
import { validateConfigValues } from '../../src/core/config-schema.js';

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

/** Faux serveur générique, réutilisé par les tests qui ne portent pas sur les références au serveur. */
const exists = fakeExists();

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
      exists,
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
      exists,
      current: { logs: 'déjà là' },
    });
    expect(result).toEqual({ ok: true, values: {} });
  });

  it('devrait refuser une chaîne vide sur un champ obligatoire', async () => {
    const result = await validateConfigValues({
      schema: { logs: schema.logs },
      values: { logs: '' },
      exists,
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
      exists,
      current: {},
    });
    expect(result).toEqual({ ok: true, values: { quota: 0 } });
  });

  it('devrait accepter false sur un champ booléen obligatoire', async () => {
    const result = await validateConfigValues({
      schema: { actif: schema.actif },
      values: { actif: false },
      exists,
      current: {},
    });
    expect(result).toEqual({ ok: true, values: { actif: false } });
  });

  it("devrait ne signaler qu'une erreur pour un champ obligatoire de mauvais type", async () => {
    const result = await validateConfigValues({
      schema: { quota: schema.quota },
      values: { quota: 'douze' },
      exists,
      current: {},
    });
    expect(result).toEqual({ ok: false, fields: [{ key: 'quota', reason: 'wrong_type' }] });
  });

  it('devrait ignorer les champs non obligatoires laissés vides', async () => {
    const result = await validateConfigValues({
      schema: { note: { type: 'string', label: 'Note' } },
      values: {},
      exists,
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
      exists,
    });
    expect(result).toEqual({ ok: true, values: { note: 'ok' } });
  });
});
