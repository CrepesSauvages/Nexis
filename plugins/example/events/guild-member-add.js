/**
 * Un fichier de `events/` exporte une fabrique prenant le contexte et
 * retournant le handler. C'est ce qui lui donne accès au logger, au
 * storage et à la configuration du serveur.
 *
 * Le core a déjà vérifié que ce plugin est activé sur ce serveur —
 * inutile de le refaire ici.
 *
 * @param {import('../../../src/core/context.js').PluginContext} ctx
 */
export default (ctx) =>
  /** @param {import('discord.js').GuildMember} member */
  async (member) => {
    const { greeting, announce } = await ctx.config(member.guild.id);
    if (!announce) return;

    ctx.logger.info('Nouveau membre', { guildId: member.guild.id, userId: member.id });
    await member.send(`${greeting} sur ${member.guild.name} !`).catch(() => {
      // Les MP fermés sont un cas normal, pas une erreur du bot.
      ctx.logger.debug('MP refusé', { userId: member.id });
    });
  };
