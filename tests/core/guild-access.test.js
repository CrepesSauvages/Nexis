import { describe, it, expect, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { createGuildAccess } from '../../src/core/guild-access.js';

/**
 * Serveur réduit à ce que l'accès consulte.
 * @param {{ channels?: object[], roles?: object[], members?: string[] }} [contents]
 */
const guild = ({ channels = [], roles = [], members = [] } = {}) => ({
  channels: { cache: new Map(channels.map((c) => [/** @type {any} */ (c).id, c])) },
  roles: { cache: new Map(roles.map((r) => [/** @type {any} */ (r).id, r])) },
  members: {
    fetch: vi.fn(async (/** @type {string} */ id) => {
      if (!members.includes(id)) throw new Error('Unknown Member');
      return { permissions: { has: () => true } };
    }),
  },
});

/**
 * Client d'un seul process : pas de `shard`, tout se lit localement.
 * @param {Record<string, unknown>} [guilds]
 */
const soloClient = (guilds = {}) =>
  /** @type {import('discord.js').Client} */ (
    /** @type {unknown} */ ({ guilds: { cache: new Map(Object.entries(guilds)) } })
  );

/**
 * Client d'un bot réparti. `broadcastEval` exécute réellement la fonction
 * sérialisée, une fois par shard simulé : c'est la seule façon de vérifier
 * que ces fonctions ne capturent rien de leur portée d'origine.
 *
 * @param {Record<string, unknown>} local - serveurs de CE shard
 * @param {Array<Record<string, unknown>>} others - serveurs des autres shards
 */
const shardedClient = (local, others) => {
  const shards = [local, ...others].map((guilds) => ({
    guilds: { cache: new Map(Object.entries(guilds)) },
  }));
  return /** @type {import('discord.js').Client} */ (
    /** @type {unknown} */ ({
      guilds: { cache: new Map(Object.entries(local)) },
      shard: {
        broadcastEval: vi.fn(async (/** @type {Function} */ fn, /** @type {any} */ options) =>
          Promise.all(shards.map((remote) => fn(remote, options?.context))),
        ),
      },
    })
  );
};

const ID = '123456789012345678';

describe('sans sharding', () => {
  it('devrait lire les serveurs présents dans le cache local', async () => {
    const access = createGuildAccess(soloClient({ g1: guild(), g2: guild() }));
    expect(await access.present(['g1', 'g3'])).toEqual(new Set(['g1']));
  });

  it("devrait rendre null pour un serveur qu'il ne sert pas", async () => {
    const access = createGuildAccess(soloClient({}));
    expect(await access.resources('g1')).toBeNull();
  });

  it('devrait rendre salons et rôles avec leur position', async () => {
    const access = createGuildAccess(
      soloClient({
        g1: guild({
          channels: [{ id: 'c1', name: 'general', type: 0, rawPosition: 3 }],
          roles: [{ id: 'r1', name: 'Staff', hexColor: '#fff', position: 5 }],
        }),
      }),
    );

    expect(await access.resources('g1')).toEqual({
      channels: [{ id: 'c1', name: 'general', type: 0, position: 3 }],
      roles: [{ id: 'r1', name: 'Staff', color: '#fff', position: 5 }],
    });
  });

  it('devrait compter un fil sans rawPosition pour 0', async () => {
    const access = createGuildAccess(
      soloClient({ g1: guild({ channels: [{ id: 'c1', name: 'fil', type: 11 }] }) }),
    );
    const resources = await access.resources('g1');
    expect(resources?.channels[0].position).toBe(0);
  });

  it('devrait distinguer serveur inconnu, non-membre et membre', async () => {
    const access = createGuildAccess(soloClient({ g1: guild({ members: ['u1'] }) }));

    expect(await access.membership('inconnu', 'u1')).toEqual({ guild: false });
    expect(await access.membership('g1', 'u2')).toEqual({ guild: true, member: false });
    expect(await access.membership('g1', 'u1')).toMatchObject({ guild: true, member: true });
  });

  it('devrait rendre la permission « Gérer le serveur » du membre', async () => {
    const fetched = { permissions: { has: vi.fn().mockReturnValue(true) } };
    const access = createGuildAccess(
      soloClient({
        g1: { members: { fetch: vi.fn().mockResolvedValue(fetched) } },
      }),
    );

    expect(await access.membership('g1', 'u1')).toEqual({
      guild: true,
      member: true,
      manageGuild: true,
    });
    expect(fetched.permissions.has).toHaveBeenCalledWith(PermissionFlagsBits.ManageGuild);
  });

  it('devrait interroger Discord pour un membre, pas son cache', async () => {
    const target = guild({ members: [ID] });
    const access = createGuildAccess(soloClient({ g1: target }));

    // Le cache des membres ne prouve rien : seul le fetch tranche.
    expect(await access.exists('g1', 'user', ID)).toBe(true);
    expect(target.members.fetch).toHaveBeenCalledWith(ID);
  });

  it('devrait lire salons et rôles dans le cache', async () => {
    const access = createGuildAccess(
      soloClient({ g1: guild({ channels: [{ id: 'c1' }], roles: [{ id: 'r1' }] }) }),
    );

    expect(await access.exists('g1', 'channel', 'c1')).toBe(true);
    expect(await access.exists('g1', 'channel', 'c9')).toBe(false);
    expect(await access.exists('g1', 'role', 'r1')).toBe(true);
  });
});

describe('avec sharding', () => {
  it('devrait trouver un serveur servi par un autre shard', async () => {
    const client = shardedClient({ g1: guild() }, [{ g2: guild() }]);
    const access = createGuildAccess(client);

    expect(await access.present(['g1', 'g2', 'g3'])).toEqual(new Set(['g1', 'g2']));
  });

  it("devrait n'interroger les autres shards qu'une fois pour toute la liste", async () => {
    const client = shardedClient({}, [{ g2: guild() }]);
    const access = createGuildAccess(client);

    await access.present(['g1', 'g2', 'g3']);
    expect(client.shard?.broadcastEval).toHaveBeenCalledOnce();
  });

  it("devrait rendre les ressources d'un serveur d'un autre shard", async () => {
    const client = shardedClient({}, [
      {
        g2: guild({
          channels: [{ id: 'c1', name: 'general', type: 0, rawPosition: 2 }],
          roles: [{ id: 'r1', name: 'Staff', hexColor: '#fff', position: 1 }],
        }),
      },
    ]);

    expect(await createGuildAccess(client).resources('g2')).toEqual({
      channels: [{ id: 'c1', name: 'general', type: 0, position: 2 }],
      roles: [{ id: 'r1', name: 'Staff', color: '#fff', position: 1 }],
    });
  });

  it('ne devrait pas diffuser pour un serveur déjà servi localement', async () => {
    const client = shardedClient({ g1: guild() }, [{ g2: guild() }]);

    await createGuildAccess(client).resources('g1');
    expect(client.shard?.broadcastEval).not.toHaveBeenCalled();
  });

  it('devrait rendre null quand aucun shard ne sert le serveur', async () => {
    const client = shardedClient({}, [{ g2: guild() }]);
    expect(await createGuildAccess(client).resources('g9')).toBeNull();
  });

  it("devrait résoudre l'appartenance sur un autre shard", async () => {
    const client = shardedClient({}, [{ g2: guild({ members: ['u1'] }) }]);
    const access = createGuildAccess(client);

    expect(await access.membership('g2', 'u1')).toEqual({
      guild: true,
      member: true,
      manageGuild: true,
    });
    expect(await access.membership('g2', 'u2')).toEqual({ guild: true, member: false });
    expect(await access.membership('g9', 'u1')).toEqual({ guild: false });
  });

  it('devrait vérifier un référencé sur un autre shard', async () => {
    const client = shardedClient({}, [{ g2: guild({ channels: [{ id: 'c1' }], members: [ID] }) }]);
    const access = createGuildAccess(client);

    expect(await access.exists('g2', 'channel', 'c1')).toBe(true);
    expect(await access.exists('g2', 'channel', 'c9')).toBe(false);
    expect(await access.exists('g2', 'user', ID)).toBe(true);
    expect(await access.exists('g9', 'role', 'r1')).toBe(false);
  });
});
