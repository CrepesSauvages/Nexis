import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, ApiRequestError } from './client';

/**
 * Remplace `fetch` par une réponse fabriquée.
 */
const mockFetch = (status: number, body: string, ok = status < 400) => {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('client API', () => {
  it('devrait rendre la donnée parsée sur un 200', async () => {
    mockFetch(200, JSON.stringify({ id: 'u1', username: 'thomas' }));
    await expect(api.me()).resolves.toMatchObject({ username: 'thomas' });
  });

  it('devrait poser Content-Type application/json sur une requête mutative', async () => {
    // Sans cet en-tête le routeur refuse en 415 : c'est la deuxième ligne de
    // défense CSRF du socle.
    const spy = mockFetch(200, JSON.stringify({ ok: true }));
    await api.enable('g1', 'moderation');
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ name: 'moderation' }));
  });

  it('devrait envoyer le cookie de session', async () => {
    const spy = mockFetch(200, JSON.stringify([]));
    await api.guilds();
    expect((spy.mock.calls[0][1] as RequestInit).credentials).toBe('same-origin');
  });

  it('devrait ne pas poser de Content-Type sur une requête sans corps', async () => {
    // POST /auth/logout n'a pas de corps ; en annoncer un déclencherait un
    // preflight inutile.
    const spy = mockFetch(204, '');
    await api.logout();
    expect((spy.mock.calls[0][1] as RequestInit).headers).toEqual({});
  });

  it('devrait rendre les champs fautifs sur un 400 de configuration', async () => {
    mockFetch(
      400,
      JSON.stringify({
        error: 'Valeurs invalides',
        fields: [{ key: 'logs', reason: 'missing_required' }],
      }),
    );
    await expect(api.saveConfig('g1', 'moderation', {})).rejects.toMatchObject({
      status: 400,
      fields: [{ key: 'logs', reason: 'missing_required' }],
    });
  });

  it('devrait rendre le motif et les dépendances sur un 409', async () => {
    mockFetch(
      409,
      JSON.stringify({ error: 'Dépendances manquantes', reason: 'missing_deps', deps: ['core'] }),
    );
    await expect(api.enable('g1', 'beta')).rejects.toMatchObject({
      status: 409,
      reason: 'missing_deps',
      deps: ['core'],
    });
  });

  it("devrait rendre l'identifiant d'incident sur un 500", async () => {
    mockFetch(500, JSON.stringify({ error: 'Erreur interne', errorId: 'a1b2c3' }));
    await expect(api.plugins('g1')).rejects.toMatchObject({ status: 500, errorId: 'a1b2c3' });
  });

  it('devrait rendre une erreur exploitable sur un corps non-JSON', async () => {
    // Un proxy ou un portail captif peut rendre du HTML : jamais de
    // SyntaxError nue jusqu'aux composants.
    mockFetch(502, '<html>Bad Gateway</html>');
    await expect(api.guilds()).rejects.toBeInstanceOf(ApiRequestError);
    await expect(api.guilds()).rejects.toMatchObject({ status: 502 });
  });

  it('devrait rendre undefined sur une réponse vide', async () => {
    mockFetch(204, '');
    await expect(api.logout()).resolves.toBeUndefined();
  });

  it('devrait encoder le serveur dans la query', async () => {
    const spy = mockFetch(200, JSON.stringify([]));
    await api.plugins('g 1');
    expect(spy.mock.calls[0][0]).toBe('/api/core/plugins?guild=g%201');
  });
});
