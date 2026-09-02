import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SESSION_COOKIE } from '../../../src/core/http/session.js';
import { HttpError } from '../../../src/core/errors.js';
import { RouterTestHarness, silentLogger } from './router-harness.js';

const harness = new RouterTestHarness();

beforeEach(async () => {
  await harness.setupTempDir();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('erreurs', () => {
  it('devrait rendre une HttpError avec son statut et son message', async () => {
    const { base } = await harness.start([
      {
        method: 'GET',
        path: '/api/x',
        auth: 'public',
        handler: () => {
          throw new HttpError(418, 'Théière');
        },
      },
    ]);
    const response = await fetch(`${base}/api/x`);
    expect(response.status).toBe(418);
    expect(await response.json()).toEqual({ error: 'Théière' });
  });

  it('devrait rendre 502 avec un errorId sur une HttpError 5xx, comme un incident', async () => {
    const logger = silentLogger();
    const { base } = await harness.start(
      [
        {
          method: 'GET',
          path: '/api/x',
          auth: 'public',
          plugin: 'demo',
          handler: () => {
            throw new HttpError(502, 'Discord indisponible');
          },
        },
      ],
      { logger },
    );
    const response = await fetch(`${base}/api/x`);
    expect(response.status).toBe(502);
    const payload = /** @type {{ error: string, errorId: string }} */ (await response.json());
    expect(payload.errorId).toMatch(/^[0-9a-f]{8}$/);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Discord indisponible'),
      expect.objectContaining({ errorId: payload.errorId, plugin: 'demo' }),
    );
  });

  it('ne devrait pas logger une HttpError 4xx', async () => {
    const logger = silentLogger();
    const { base } = await harness.start(
      [
        {
          method: 'GET',
          path: '/api/x',
          auth: 'public',
          handler: () => {
            throw new HttpError(418, 'Théière');
          },
        },
      ],
      { logger },
    );
    const response = await fetch(`${base}/api/x`);
    expect(response.status).toBe(418);
    expect(await response.json()).toEqual({ error: 'Théière' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('devrait rendre 500 avec un errorId sur une erreur inattendue', async () => {
    const { base } = await harness.start([
      {
        method: 'GET',
        path: '/api/x',
        auth: 'public',
        plugin: 'demo',
        handler: () => {
          throw new Error('cassé');
        },
      },
    ]);
    const response = await fetch(`${base}/api/x`);
    expect(response.status).toBe(500);
    const payload = /** @type {{ error: string, errorId: string }} */ (await response.json());
    expect(payload.errorId).toMatch(/^[0-9a-f]{8}$/);
  });

  it("devrait logger l'erreur avec le même errorId que celui rendu", async () => {
    const logger = silentLogger();
    const { base } = await harness.start(
      [
        {
          method: 'GET',
          path: '/api/x',
          auth: 'public',
          plugin: 'demo',
          handler: () => {
            throw new Error('cassé');
          },
        },
      ],
      { logger },
    );
    const payload = /** @type {{ errorId: string }} */ (
      await (await fetch(`${base}/api/x`)).json()
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('cassé'),
      expect.objectContaining({ errorId: payload.errorId, plugin: 'demo' }),
    );
  });

  it('devrait refuser en 401 une route protégée sans session', async () => {
    const { base } = await harness.start([
      { method: 'GET', path: '/api/x', auth: 'guild-admin', handler: () => ({ ok: true }) },
    ]);
    expect((await fetch(`${base}/api/x?guild=g1`)).status).toBe(401);
  });

  it('devrait reconnaître la session portée par le cookie', async () => {
    const { base, sessions } = await harness.start(
      [
        {
          method: 'GET',
          path: '/api/x',
          auth: 'owner',
          handler: (_params, { session }) => ({ user: session?.userId }),
        },
      ],
      { ownerId: 'u1' },
    );
    const id = await sessions.create({ userId: 'u1', username: 't', avatar: null, guilds: [] });
    const response = await fetch(`${base}/api/x`, {
      headers: { Cookie: `${SESSION_COOKIE}=${id}` },
    });
    expect(await response.json()).toEqual({ user: 'u1' });
  });
});
