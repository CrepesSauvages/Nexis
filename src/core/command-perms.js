/**
 * Règles d'autorisation d'une commande sur un serveur donné.
 *
 * Deux sources se superposent : le niveau que le plugin déclare
 * (`permissions`), et la liste de rôles qu'un administrateur de serveur a
 * éventuellement définie pour cette commande. Ce module ne connaît ni
 * discord.js ni le storage — il reçoit des faits et rend un booléen, ce qui
 * le rend vérifiable sans Discord et identique pour ses trois appelants :
 * le dispatcher, `/nexis perms` et l'API du dashboard.
 *
 * @typedef {{ isOwner: boolean, hasManageGuild: boolean, roleIds: string[] }} MemberFacts
 */

/**
 * @param {object} options
 * @param {'guild-admin' | 'owner' | undefined} options.declared - niveau déclaré par le plugin
 * @param {string[] | undefined} options.roles - rôles autorisés sur ce serveur, ou undefined si l'administrateur n'a rien défini
 * @param {MemberFacts} options.member
 * @returns {boolean}
 */
export const isAllowed = ({ declared, roles, member }) => {
  // Un niveau `owner` ne se délègue pas. Laisser un administrateur de
  // serveur s'ouvrir une commande de propriétaire lui donnerait, depuis son
  // propre serveur, la main sur un bot qui en sert d'autres : ce n'est pas
  // une permission de serveur, c'est une permission d'installation.
  if (declared === 'owner') return member.isOwner;

  if (roles !== undefined) {
    // La liste remplace le niveau déclaré : c'est ce qui permet aussi bien
    // d'ouvrir une commande d'administration à un rôle de modération que de
    // réserver une commande publique à un rôle donné (liste vide = personne
    // d'autre que les administrateurs).
    //
    // Ceux qui peuvent « Gérer le serveur » gardent l'accès dans tous les
    // cas : ce sont eux qui écrivent la règle, et les en exclure ne ferait
    // que les enfermer dehors avec la clé à l'intérieur.
    return member.hasManageGuild || roles.some((roleId) => member.roleIds.includes(roleId));
  }

  if (declared === 'guild-admin') return member.hasManageGuild;
  return true;
};

/**
 * Valide une liste de rôles avant écriture. Rend le motif du refus, ou
 * `undefined` si la liste convient.
 *
 * @param {unknown} roles
 * @param {(roleId: string) => boolean} existsInGuild
 * @returns {'not_an_array' | 'not_a_snowflake' | 'unknown_role' | undefined}
 */
export const checkRoles = (roles, existsInGuild) => {
  if (!Array.isArray(roles)) return 'not_an_array';
  for (const roleId of roles) {
    if (typeof roleId !== 'string' || !/^\d{17,20}$/.test(roleId)) return 'not_a_snowflake';
    if (!existsInGuild(roleId)) return 'unknown_role';
  }
  return undefined;
};

/**
 * @typedef {'unknown_command' | 'owner_command' | 'no_override' | 'already_listed' | 'not_listed'} PermsRefusalReason
 */

/**
 * @typedef {{ ok: true, roles: string[] | undefined } | { ok: false, reason: PermsRefusalReason }} PermsResult
 */

/**
 * Règles d'administration des permissions par rôle, partagées par
 * `/nexis perms` et par l'API du dashboard — même raison d'être que
 * `plugin-admin.js` : deux implémentations des mêmes règles finiraient par
 * diverger, et le jour où la commande refuse pendant que l'API accepte,
 * personne ne le remarque.
 *
 * La surcharge d'une commande **est** sa liste de rôles autorisés :
 * `allow` la crée ou l'étend, `deny` la réduit, `reset` la supprime pour
 * revenir au niveau déclaré par le plugin. Une liste vide n'est donc pas
 * une absence de liste : elle réserve la commande aux administrateurs.
 *
 * @param {object} options
 * @param {Array<{ name: string, plugin: string, permissions?: 'guild-admin' | 'owner' }>} options.commands
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} options.guildConfig
 */
export const createCommandPerms = ({ commands, guildConfig }) => {
  /** @param {string} name */
  const find = (name) => commands.find((command) => command.name === name);

  /**
   * @param {string} name
   * @returns {PermsRefusalReason | undefined}
   */
  const refuseTarget = (name) => {
    const command = find(name);
    if (!command) return 'unknown_command';
    // Stocker des rôles pour une commande de propriétaire écrirait une règle
    // que `isAllowed` ignore : mieux vaut refuser que laisser croire.
    if (command.permissions === 'owner') return 'owner_command';
    return undefined;
  };

  return {
    /**
     * Les commandes déclarées, avec leur surcharge éventuelle.
     * @param {string} guildId
     * @returns {Promise<Array<{ name: string, plugin: string, declared: string | null, roles: string[] | null }>>}
     */
    async list(guildId) {
      const table = await guildConfig.allCommandRoles(guildId);
      return commands.map(({ name, plugin, permissions }) => ({
        name,
        plugin,
        declared: permissions ?? null,
        // `null`, pas `undefined` : la sérialisation JSON supprimerait la
        // clé, et l'appelant ne distinguerait plus « aucune surcharge »
        // d'un champ manquant.
        roles: table[name] ?? null,
      }));
    },

    /**
     * @param {string} guildId
     * @param {string} command
     * @param {string} roleId
     * @returns {Promise<PermsResult>}
     */
    async allow(guildId, command, roleId) {
      const refusal = refuseTarget(command);
      if (refusal) return { ok: false, reason: refusal };

      const current = await guildConfig.getCommandRoles(guildId, command);
      if (current?.includes(roleId)) return { ok: false, reason: 'already_listed' };

      const roles = [...(current ?? []), roleId];
      await guildConfig.setCommandRoles(guildId, command, roles);
      return { ok: true, roles };
    },

    /**
     * @param {string} guildId
     * @param {string} command
     * @param {string} roleId
     * @returns {Promise<PermsResult>}
     */
    async deny(guildId, command, roleId) {
      const refusal = refuseTarget(command);
      if (refusal) return { ok: false, reason: refusal };

      const current = await guildConfig.getCommandRoles(guildId, command);
      // Retirer un rôle d'une commande qui n'a pas de liste créerait une
      // liste vide, donc restreindrait la commande aux administrateurs —
      // l'inverse exact de ce que « retirer » laisse attendre.
      if (current === undefined) return { ok: false, reason: 'no_override' };
      if (!current.includes(roleId)) return { ok: false, reason: 'not_listed' };

      const roles = current.filter((id) => id !== roleId);
      await guildConfig.setCommandRoles(guildId, command, roles);
      return { ok: true, roles };
    },

    /**
     * @param {string} guildId
     * @param {string} command
     * @returns {Promise<PermsResult>}
     */
    async reset(guildId, command) {
      const refusal = refuseTarget(command);
      if (refusal) return { ok: false, reason: refusal };

      await guildConfig.setCommandRoles(guildId, command, undefined);
      return { ok: true, roles: undefined };
    },

    /**
     * Remplace la liste entière. `undefined` revient au niveau déclaré.
     * Les rôles sont supposés déjà validés par l'appelant (`checkRoles`).
     * @param {string} guildId
     * @param {string} command
     * @param {string[] | undefined} roles
     * @returns {Promise<PermsResult>}
     */
    async set(guildId, command, roles) {
      const refusal = refuseTarget(command);
      if (refusal) return { ok: false, reason: refusal };

      await guildConfig.setCommandRoles(guildId, command, roles);
      return { ok: true, roles };
    },
  };
};
