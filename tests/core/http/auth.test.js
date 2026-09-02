import { describe, it, expect, vi } from 'vitest';
import { resolveAuth } from '../../../src/core/http/auth.js';

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
        client: fakeClient(),
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
        client: fakeClient(),
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
        client: fakeClient(),
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
        client: fakeClient(),
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
        client: fakeClient(),
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
        client: fakeClient(),
        guildId: undefined,
        ownerId: undefined,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('niveaux liés à un serveur', () => {
  it('devrait refuser en 400 sans paramètre guild', async () => {
    await expect(
      resolveAuth({
        level: 'guild-member',
        session,
        client: fakeClient(),
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
        client: fakeClient(),
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
        client: fakeClient({ g1: guildWithoutMember() }),
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
        client: fakeClient({ g1: guildWithMember(false) }),
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
        client: fakeClient({ g1: guildWithMember(false) }),
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
        client: fakeClient({ g1: guildWithMember(true) }),
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
        client: fakeClient({ g1: guildWithMember(false) }),
        guildId: 'g1',
        ownerId: undefined,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
