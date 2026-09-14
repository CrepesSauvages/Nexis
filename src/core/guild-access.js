import { PermissionFlagsBits } from 'discord.js';

/**
 * @typedef {{ id: string, name: string, type: number, position: number }} AccessChannel
 * @typedef {{ id: string, name: string, color: string, position: number }} AccessRole
 * @typedef {{ channels: AccessChannel[], roles: AccessRole[] }} AccessResources
 */

/**
 * Ce qu'on sait d'un utilisateur sur un serveur donné. Trois réponses
 * distinctes, parce que le dashboard les traduit en trois statuts HTTP
 * différents : serveur inconnu du bot, membre parti, membre sans droits.
 *
 * @typedef {{ guild: false } | { guild: true, member: false } | { guild: true, member: true, manageGuild: boolean }} Membership
 */

/** Sérialisable tel quel vers un autre shard, contrairement à un BigInt. */
const MANAGE_GUILD = PermissionFlagsBits.ManageGuild.toString();

/**
 * @param {import('discord.js').GuildBasedChannel} channel
 * @returns {AccessChannel}
 */
const toChannel = (channel) => ({
  id: channel.id,
  name: channel.name,
  type: channel.type,
  // Un fil n'a pas de `rawPosition` : il compte pour 0.
  position: 'rawPosition' in channel ? channel.rawPosition : 0,
});

/**
 * @param {import('discord.js').Role} role
 * @returns {AccessRole}
 */
const toRole = (role) => ({
  id: role.id,
  name: role.name,
  color: role.hexColor,
  position: role.position,
});

/**
 * Accès aux serveurs, que le bot tourne en un seul morceau ou réparti sur
 * plusieurs shards.
 *
 * Sans shard, tout se lit dans le cache local. Avec, un shard ne connaît
 * qu'une tranche des serveurs : le dashboard, qui n'existe que sur un
 * shard, verrait sinon les autres comme des serveurs où le bot n'est pas —
 * un mensonge qui se traduirait en 404 pour l'administrateur.
 *
 * Les fonctions passées à `broadcastEval` sont sérialisées puis évaluées
 * dans l'autre process : elles ne peuvent capturer aucune variable, d'où
 * le passage par `context` et la duplication apparente avec les fonctions
 * ci-dessus. C'est le prix du mécanisme, pas un oubli.
 *
 * @param {import('discord.js').Client} client
 */
export const createGuildAccess = (client) => {
  /** @returns {import('discord.js').ShardClientUtil | null} */
  const shard = () => client.shard ?? null;

  return {
    /**
     * Parmi ces serveurs, ceux que le bot sert réellement — tous shards
     * confondus. Une seule diffusion pour toute la liste : la poser serveur
     * par serveur coûterait un aller-retour par ligne du sélecteur.
     *
     * @param {string[]} guildIds
     * @returns {Promise<Set<string>>}
     */
    async present(guildIds) {
      const spread = shard();
      if (!spread) return new Set(guildIds.filter((id) => client.guilds.cache.has(id)));

      const results = await spread.broadcastEval(
        (remote, { ids }) => ids.filter((id) => remote.guilds.cache.has(id)),
        { context: { ids: guildIds } },
      );
      return new Set(results.flat());
    },

    /**
     * Salons et rôles du serveur, ou `null` si le bot n'y est pas.
     * @param {string} guildId
     * @returns {Promise<AccessResources | null>}
     */
    async resources(guildId) {
      const local = client.guilds.cache.get(guildId);
      if (local) {
        return {
          channels: [...local.channels.cache.values()].map(toChannel),
          roles: [...local.roles.cache.values()].map(toRole),
        };
      }

      const spread = shard();
      if (!spread) return null;

      const results = await spread.broadcastEval(
        (remote, { id }) => {
          const guild = remote.guilds.cache.get(id);
          if (!guild) return null;
          return {
            channels: [...guild.channels.cache.values()].map((channel) => ({
              id: channel.id,
              name: channel.name,
              type: channel.type,
              position: 'rawPosition' in channel ? channel.rawPosition : 0,
            })),
            roles: [...guild.roles.cache.values()].map((role) => ({
              id: role.id,
              name: role.name,
              color: role.hexColor,
              position: role.position,
            })),
          };
        },
        { context: { id: guildId } },
      );
      return results.find((entry) => entry !== null) ?? null;
    },

    /**
     * L'appartenance d'un utilisateur à un serveur, et ses droits dessus.
     * @param {string} guildId
     * @param {string} userId
     * @returns {Promise<Membership>}
     */
    async membership(guildId, userId) {
      const local = client.guilds.cache.get(guildId);
      if (local) {
        try {
          const member = await local.members.fetch(userId);
          return {
            guild: true,
            member: true,
            manageGuild: member.permissions.has(PermissionFlagsBits.ManageGuild),
          };
        } catch {
          // Discord répond « Unknown Member » quand l'utilisateur a quitté
          // le serveur : une absence, pas une panne.
          return { guild: true, member: false };
        }
      }

      const spread = shard();
      if (!spread) return { guild: false };

      const results = await spread.broadcastEval(
        async (remote, { id, user, manageGuild }) => {
          const guild = remote.guilds.cache.get(id);
          if (!guild) return null;
          try {
            const member = await guild.members.fetch(user);
            return { member: true, manageGuild: member.permissions.has(BigInt(manageGuild)) };
          } catch {
            return { member: false, manageGuild: false };
          }
        },
        { context: { id: guildId, user: userId, manageGuild: MANAGE_GUILD } },
      );

      const found = results.find((entry) => entry !== null);
      if (!found) return { guild: false };
      return found.member
        ? { guild: true, member: true, manageGuild: found.manageGuild }
        : { guild: true, member: false };
    },

    /**
     * Un salon, un rôle ou un membre existe-t-il dans ce serveur ?
     *
     * Le cache des membres n'est peuplé que par ce que la passerelle a fait
     * passer : son silence ne prouve rien, il faut demander à Discord.
     *
     * @param {string} guildId
     * @param {'channel' | 'role' | 'user'} type
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    async exists(guildId, type, id) {
      const local = client.guilds.cache.get(guildId);
      if (local) {
        if (type === 'channel') return local.channels.cache.has(id);
        if (type === 'role') return local.roles.cache.has(id);
        try {
          await local.members.fetch(id);
          return true;
        } catch {
          return false;
        }
      }

      const spread = shard();
      if (!spread) return false;

      const results = await spread.broadcastEval(
        async (remote, { guild: guildKey, kind, target }) => {
          const guild = remote.guilds.cache.get(guildKey);
          if (!guild) return null;
          if (kind === 'channel') return guild.channels.cache.has(target);
          if (kind === 'role') return guild.roles.cache.has(target);
          try {
            await guild.members.fetch(target);
            return true;
          } catch {
            return false;
          }
        },
        { context: { guild: guildId, kind: type, target: id } },
      );
      return results.find((entry) => entry !== null) === true;
    },
  };
};
