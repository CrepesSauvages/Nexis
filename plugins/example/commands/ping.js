import { SlashCommandBuilder } from 'discord.js';
import { localizationsFor } from '../../../src/core/i18n/index.js';

/**
 * Un fichier de `commands/` exporte une fabrique prenant le contexte.
 * La commande elle-même reçoit aussi `ctx` en second argument, du
 * dispatcher — les deux chemins sont équivalents ici.
 *
 * Sert aussi de référence pour les auteurs de plugins tiers sur l'usage de
 * `ctx.t`/`ctx.resolveLocale` : la formule de salutation (`greeting`) reste
 * un texte libre configurable par serveur (hors périmètre de l'i18n — c'est
 * le contenu propre à chaque plugin), seul le suffixe fixe est traduit et
 * pluralisé via le mécanisme du core.
 *
 * @param {import('../../../src/core/context.js').PluginContext} ctx
 */
export default (ctx) => ({
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('pong')
    .setDescriptionLocalizations(localizationsFor('example.ping.command.description')),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const { greeting } = await ctx.config(interaction.guildId ?? '');
    const locale = await ctx.resolveLocale(interaction);

    const latency = Date.now() - interaction.createdTimestamp;
    const apiLatency = Math.round(ctx.client.ws.ping);

    const response = ctx.t(locale, 'example.ping.response', { latency, apiLatency });
    await interaction.reply({
      content: `<@${interaction.user.id}> ${response}`,
      flags: 64,
    });
  },
});
