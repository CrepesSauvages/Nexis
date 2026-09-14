import { describe, it, expect, vi } from 'vitest';
import { resolveAuth } from '../../../src/core/http/auth.js';
import { createGuildAccess } from '../../../src/core/guild-access.js';

/** @type {import('../../../src/core/http/session.js').StoredSession} */
const session = {
  userId: 'u1',
  username: 'thomas',
  avatar: null,
  guilds: [],
  expiresAt: Number.MAX_SAFE_INTEGER,
};

/**
 * Un faux client réduit à ce que resolveAuth consulte : le cache de
 * guilds et le fetch de membre.
 * @param {Record<string, unknown>} guilds
 * @returns {import('discord.js').Client}
 */
const fakeClient = (guilds = {}) =>
  /** @type {import('discord.js').Client} */ (
    /** @type {unknown} */ ({ guilds: { cache: new Map(Object.entries(guilds)) } })
  );

/**
 * Le client et l'accès qui en dérive, d'un seul geste : `resolveAuth` lit
 * la disponibilité sur le premier et le serveur par le second. Le vrai
 * `createGuildAccess` est utilisé — sans shard, il retombe sur le cache
 * local, exactement ce que ces tests exercent.
 *
 * @param {Record<string, unknown>} [guilds]
 */
const withClient = (guilds = {}) => {
  const client = fakeClient(guilds);
  return { client, access: createGuildAccess(client) };
};

/** @param {boolean} manageGuild */
const guildWithMember = (manageGuild) => ({
  members: { fetch: vi.fn().mockResolvedValue({ permissions: { has: () => manageGuild } }) },
});

const guildWithoutMember = () => ({
  members: { fetch: vi.fn().mockRejectedValue(new Error('Unknown Member')) },
});

describe('niveau inconnu', () => {
  it('devrait refuser en 500 un niveau non reconnu', async () => {
    await expect(
      resolveAuth({
        level: 'invente',
        session,
        ...withClient(),
        guildId: undefined,
        ownerId: undefined,
      }),
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe('niveau public', () => {
  it('devrait passer sans session', async () => {
    await expect(
      resolveAuth({
        level: 'public',
        session: undefined,
        ...withClient(),
        guildId: undefined,
        ownerId: undefined,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('session requise', () => {
  it('devrait refuser en 401 sans session sur un niveau non public', async () => {
    await expect(
      resolveAuth({
        level: 'guild-admin',
        session: undefined,
        ...withClient(),
        guildId: 'g1',
        ownerId: undefined,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('niveau owner', () => {
  it('devrait passer pour le propriétaire', async () => {
    await expect(
      resolveAuth({
        level: 'owner',
        session,
        ...withClient(),
        guildId: undefined,
        ownerId: 'u1',
      }),
    ).resolves.toBeUndefined();
  });

  it('devrait refuser en 403 un autre utilisateur', async () => {
    await expect(
      resolveAuth({
        level: 'owner',
        session,
        ...withClient(),
        guildId: undefined,
        ownerId: 'autre',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("devrait refuser en 403 quand aucun propriétaire n'est configuré", async () => {
    await expect(
      resolveAuth({
        level: 'owner',
        session,
        ...withClient(),
        guildId: undefined,
        ownerId: undefined,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('client Discord pas encore connecté', () => {
  it('devrait répondre 503 tant que le client n est pas prêt', async () => {
    const client = /** @type {import('discord.js').Client} */ (
      /** @type {unknown} */ ({ isReady: () => false, guilds: { cache: new Map() } })
    );
    await expect(
      resolveAuth({
        level: 'guild-member',
        session,
        client,
        access: createGuildAccess(client),
        guildId: 'g1',
        ownerId: undefined,
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe('niveaux liés à un serveur', () => {
  it('devrait refuser en 400 sans paramètre guild', async () => {
    await expect(
      resolveAuth({
        level: 'guild-member',
        session,
        ...withClient(),
        guildId: undefined,
        ownerId: undefined,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("devrait refuser en 404 si le bot n'est pas sur le serveur", async () => {
    await expect(
      resolveAuth({
        level: 'guild-member',
        session,
        ...withClient(),
        guildId: 'g1',
        ownerId: undefined,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('devrait refuser en 403 un non-membre', async () => {
    await expect(
      resolveAuth({
        level: 'guild-member',
        session,
        ...withClient({ g1: guildWithoutMember() }),
        guildId: 'g1',
        ownerId: undefined,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('devrait passer pour un membre du serveur', async () => {
    await expect(
      resolveAuth({
        level: 'guild-member',
        session,
        ...withClient({ g1: guildWithMember(false) }),
        guildId: 'g1',
        ownerId: undefined,
      }),
    ).resolves.toBeUndefined();
  });

  it('devrait refuser en 403 un membre sans « Gérer le serveur »', async () => {
    await expect(
      resolveAuth({
        level: 'guild-admin',
        session,
        ...withClient({ g1: guildWithMember(false) }),
        guildId: 'g1',
        ownerId: undefined,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('devrait passer pour un membre avec « Gérer le serveur »', async () => {
    await expect(
      resolveAuth({
        level: 'guild-admin',
        session,
        ...withClient({ g1: guildWithMember(true) }),
        guildId: 'g1',
        ownerId: undefined,
      }),
    ).resolves.toBeUndefined();
  });

  it('ne devrait jamais autoriser depuis les guilds de la session', async () => {
    const stale = { ...session, guilds: [{ id: 'g1', name: 'Un', icon: null, permissions: '8' }] };
    await expect(
      resolveAuth({
        level: 'guild-admin',
        session: stale,
        ...withClient({ g1: guildWithMember(false) }),
        guildId: 'g1',
        ownerId: undefined,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
