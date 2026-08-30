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
    .setName('hello')
    .setDescription('Dit bonjour')
    .setDescriptionLocalizations(localizationsFor('example.hello.command.description')),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    const { greeting } = await ctx.config(interaction.guildId ?? '');
    const locale = await ctx.resolveLocale(interaction);

    const key = `greeted:${interaction.user.id}`;
    const count = /** @type {number} */ ((await ctx.storage.get(key)) ?? 0) + 1;
    await ctx.storage.set(key, count);

    const suffix = ctx.t(locale, 'example.hello.suffix', { count });
    await interaction.reply({
      content: `${greeting} <@${interaction.user.id}>${suffix}`,
      flags: 64,
    });
  },
});
