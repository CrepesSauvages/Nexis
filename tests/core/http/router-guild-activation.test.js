import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SESSION_COOKIE } from '../../../src/core/http/session.js';
import { createGuildConfig } from '../../../src/core/guild-config.js';
import { RouterTestHarness } from './router-harness.js';

const harness = new RouterTestHarness();

beforeEach(async () => {
  await harness.setupTempDir();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('activation par serveur', () => {
  /** Un client dont la guild `g1` existe et où l'appelant en est membre. */
  const clientWithMember = () =>
    /** @type {import('discord.js').Client} */ (
      /** @type {unknown} */ ({
        guilds: {
          cache: new Map([
            ['g1', { members: { fetch: async () => ({ permissions: { has: () => true } }) } }],
          ]),
        },
      })
    );

  it("devrait rendre 404 la route d'un plugin désactivé sur ce serveur", async () => {
    const guildConfig = createGuildConfig({
      storage: /** @type {import('../../../src/core/storage/driver.js').StorageDriver} */ (
        harness.storage
      ),
    });
    const { base, sessions } = await harness.start(
      [
        {
          method: 'GET',
          path: '/api/x',
          auth: 'guild-member',
          plugin: 'demo',
          handler: () => ({ ok: true }),
        },
      ],
      { client: clientWithMember(), guildConfig },
    );
    const id = await sessions.create({ userId: 'u1', username: 't', avatar: null, guilds: [] });
    const response = await fetch(`${base}/api/x?guild=g1`, {
      headers: { Cookie: `${SESSION_COOKIE}=${id}` },
    });
    expect(response.status).toBe(404);
  });

  it("devrait servir la route d'un plugin activé sur ce serveur", async () => {
    const guildConfig = createGuildConfig({
      storage: /** @type {import('../../../src/core/storage/driver.js').StorageDriver} */ (
        harness.storage
      ),
    });
    await guildConfig.enable('g1', 'demo');
    const { base, sessions } = await harness.start(
      [
        {
          method: 'GET',
          path: '/api/x',
          auth: 'guild-member',
          plugin: 'demo',
          handler: () => ({ ok: true }),
        },
      ],
      { client: clientWithMember(), guildConfig },
    );
    const id = await sessions.create({ userId: 'u1', username: 't', avatar: null, guilds: [] });
    const response = await fetch(`${base}/api/x?guild=g1`, {
      headers: { Cookie: `${SESSION_COOKIE}=${id}` },
    });
    expect(response.status).toBe(200);
  });

  it('devrait toujours servir un plugin de la liste alwaysEnabled, même désactivé', async () => {
    const guildConfig = createGuildConfig({
      storage: /** @type {import('../../../src/core/storage/driver.js').StorageDriver} */ (
        harness.storage
      ),
    });
    const { base, sessions } = await harness.start(
      [
        {
          method: 'GET',
          path: '/api/x',
          auth: 'guild-member',
          plugin: 'core',
          handler: () => ({ ok: true }),
        },
      ],
      { client: clientWithMember(), guildConfig, alwaysEnabled: ['core'] },
    );
    const id = await sessions.create({ userId: 'u1', username: 't', avatar: null, guilds: [] });
    const response = await fetch(`${base}/api/x?guild=g1`, {
      headers: { Cookie: `${SESSION_COOKIE}=${id}` },
    });
    expect(response.status).toBe(200);
  });

  it('ne devrait pas vérifier le plugin sur un niveau public, même avec ?guild=', async () => {
    const guildConfig = createGuildConfig({
      storage: /** @type {import('../../../src/core/storage/driver.js').StorageDriver} */ (
        harness.storage
      ),
    });
    const { base } = await harness.start(
      [
        {
          method: 'GET',
          path: '/api/x',
          auth: 'public',
          plugin: 'demo',
          handler: () => ({ ok: true }),
        },
      ],
      { client: clientWithMember(), guildConfig },
    );
    const response = await fetch(`${base}/api/x?guild=g1`);
    expect(response.status).toBe(200);
  });
});
