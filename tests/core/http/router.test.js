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

describe('service statique en repli', () => {
  it('devrait servir le repli quand aucune route exacte ne correspond', async () => {
    const { base } = await harness.start([], {
      fallback: async (res, pathname) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`servi ${pathname}`);
        return true;
      },
    });
    const response = await fetch(`${base}/quelque-chose`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('servi /quelque-chose');
  });

  it('devrait rendre le 404 JSON quand le repli décline', async () => {
    const { base } = await harness.start([], { fallback: async () => false });
    const response = await fetch(`${base}/absent`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Route inconnue' });
  });

  it('devrait laisser une route exacte gagner sur le repli', async () => {
    const { base } = await harness.start(
      [{ method: 'GET', path: '/api/x', auth: 'public', handler: () => ({ ok: true }) }],
      {
        fallback: async (res) => {
          res.writeHead(200);
          res.end('repli');
          return true;
        },
      },
    );
    expect(await (await fetch(`${base}/api/x`)).json()).toEqual({ ok: true });
  });

  it('devrait ne jamais consulter le repli sur une méthode mutative', async () => {
    // Un POST sur un chemin inconnu reste un 404 : le service de fichiers ne
    // sert qu'en lecture.
    let consulted = false;
    const { base } = await harness.start([], {
      fallback: async () => {
        consulted = true;
        return true;
      },
    });
    const response = await fetch(`${base}/absent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(404);
    expect(consulted).toBe(false);
  });

  it('devrait consulter le repli sur une requête HEAD', async () => {
    const { base } = await harness.start([], {
      fallback: async (res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': 5 });
        res.end('salut');
        return true;
      },
    });
    const response = await fetch(`${base}/page`, { method: 'HEAD' });
    expect(response.status).toBe(200);
  });

  it('devrait rendre 500 avec un errorId si le repli échoue', async () => {
    const { base, logger } = await harness.start([], {
      fallback: async () => {
        throw new Error('disque illisible');
      },
    });
    const response = await fetch(`${base}/page`);
    expect(response.status).toBe(500);
    const body = /** @type {{ errorId: string }} */ (await response.json());
    expect(body.errorId).toMatch(/\w/);
    expect(logger.error).toHaveBeenCalled();
  });
});
