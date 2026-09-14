/**
 * Repousse les commandes du serveur quand le bot y arrive.
 *
 * Discord supprime les commandes d'un serveur dès que l'application le
 * quitte. À la ré-invitation, la configuration de ce serveur est toujours
 * en storage — les plugins y sont encore marqués activés — mais plus une
 * seule commande n'est déclarée côté Discord, et rien ne les repousse :
 * `syncGuild` n'est appelé que par une activation ou une désactivation.
 * L'administrateur voit donc des plugins « activés » sans commande, et son
 * seul recours est un `/nexis disable` suivi d'un `/nexis enable` sur
 * chacun — à supposer qu'il devine le remède.
 *
 * La liste vide est écartée avant l'appel : un serveur réellement neuf
 * n'a aucun plugin activé, donc rien à synchroniser, et le faire quand
 * même dépenserait une requête REST à chaque arrivée sur un serveur.
 *
 * @param {import('../../../src/core/context.js').PluginContext} ctx
 */
export default (ctx) => {
  const core =
    /** @type {{ guildConfig: ReturnType<typeof import('../../../src/core/guild-config.js').createGuildConfig>, commandSync: { syncGuild: (guildId: string) => Promise<void> } }} */ (
      ctx.core
    );

  /** @param {import('discord.js').Guild} guild */
  return async (guild) => {
    const enabled = await core.guildConfig.enabledPlugins(guild.id);
    if (enabled.length === 0) return;

    ctx.logger.info('Serveur rejoint, resynchronisation des commandes', {
      guildId: guild.id,
      plugins: enabled.length,
    });
    await core.commandSync.syncGuild(guild.id);
  };
};
