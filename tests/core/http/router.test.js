import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RouterTestHarness } from './router-harness.js';

const harness = new RouterTestHarness();

beforeEach(async () => {
  await harness.setupTempDir();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('dispatch', () => {
  it('devrait répondre 404 sur un chemin inconnu', async () => {
    const { base } = await harness.start([]);
    expect((await fetch(`${base}/inexistant`)).status).toBe(404);
  });

  it('devrait répondre 404 si la méthode ne correspond pas', async () => {
    const { base } = await harness.start([
      { method: 'GET', path: '/api/x', auth: 'public', handler: () => ({ ok: true }) },
    ]);
    expect((await fetch(`${base}/api/x`, { method: 'POST' })).status).toBe(404);
  });

  it('devrait sérialiser en 200 la valeur retournée par le handler', async () => {
    const { base } = await harness.start([
      { method: 'GET', path: '/api/x', auth: 'public', handler: () => ({ ok: true }) },
    ]);
    const response = await fetch(`${base}/api/x`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('devrait passer la query au handler', async () => {
    const { base } = await harness.start([
      { method: 'GET', path: '/api/x', auth: 'public', handler: ({ query }) => query },
    ]);
    expect(await (await fetch(`${base}/api/x?a=1&b=2`)).json()).toEqual({ a: '1', b: '2' });
  });

  it('devrait passer le paramètre guild comme guildId', async () => {
    const { base } = await harness.start([
      {
        method: 'GET',
        path: '/api/x',
        auth: 'public',
        handler: ({ guildId }) => ({ guildId: guildId ?? null }),
      },
    ]);
    expect(await (await fetch(`${base}/api/x?guild=g1`)).json()).toEqual({ guildId: 'g1' });
  });

  it('devrait lire le corps JSON des requêtes POST', async () => {
    const { base } = await harness.start([
      { method: 'POST', path: '/api/x', auth: 'public', handler: ({ body }) => body },
    ]);
    const response = await fetch(`${base}/api/x`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(await response.json()).toEqual({ a: 1 });
  });

  it("devrait laisser le handler écrire lui-même la réponse s'il ne retourne rien", async () => {
    const { base } = await harness.start([
      {
        method: 'GET',
        path: '/api/x',
        auth: 'public',
        handler: (_params, { res }) => {
          res.writeHead(204);
          res.end();
          return undefined;
        },
      },
    ]);
    expect((await fetch(`${base}/api/x`)).status).toBe(204);
  });

  it('devrait servir une requête HEAD avec le handler GET, sans corps', async () => {
    const { base } = await harness.start([
      { method: 'GET', path: '/api/x', auth: 'public', handler: () => ({ ok: true }) },
    ]);
    const response = await fetch(`${base}/api/x`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('devrait poser les en-têtes de durcissement sur les réponses', async () => {
    const { base } = await harness.start([
      { method: 'GET', path: '/api/x', auth: 'public', handler: () => ({ ok: true }) },
    ]);
    const response = await fetch(`${base}/api/x`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
