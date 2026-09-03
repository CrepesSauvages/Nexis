import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
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
    .setName('userinfo')
    .setDescription("Affiche les informations de l'utilisateur")
    .setDescriptionLocalizations(localizationsFor('utils.userinfo.command.description'))
    .addUserOption((option) =>
      option
        .setName('user')
        .setNameLocalizations(localizationsFor('utils.userinfo.command.userOption.name'))
        .setDescription("L'utilisateur dont vous voulez voir les informations")
        .setDescriptionLocalizations(
          localizationsFor('utils.userinfo.command.userOption.description'),
        )
        .setRequired(false),
    ),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const locale = await ctx.resolveLocale(interaction);
    const user = interaction.options.getUser('user') ?? interaction.user;

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const embed = new EmbedBuilder()
      .setTitle(`Informations sur ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ extension: 'png', size: 512, forceStatic: false }))
      .setColor('Blue')
      .addFields(
        { name: ctx.t(locale, 'utils.userinfo.command.fields.id'), value: user.id, inline: true },
        {
          name: ctx.t(locale, 'utils.userinfo.command.fields.username'),
          value: user.username,
          inline: true,
        },
        {
          name: ctx.t(locale, 'utils.userinfo.command.fields.discriminator'),
          value: `#${user.discriminator}`,
          inline: true,
        },
        {
          name: ctx.t(locale, 'utils.userinfo.command.fields.bot'),
          value: user.bot ? 'Oui' : 'Non',
          inline: true,
        },
        {
          name: ctx.t(locale, 'utils.userinfo.command.fields.createdAt'),
          value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
          inline: true,
        },
      );

    if (member) {
      embed.addFields(
        {
          name: ctx.t(locale, 'utils.userinfo.command.fields.nickname'),
          value: member.nickname ?? 'Aucun',
          inline: true,
        },
        {
          name: ctx.t(locale, 'utils.userinfo.command.fields.joinedAt'),
          value:
            member.joinedTimestamp === null
              ? 'Inconnu'
              : `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`,
          inline: true,
        },
        {
          name: ctx.t(locale, 'utils.userinfo.command.fields.roles'),
          value: member.roles.cache.map((role) => role.name).join(', ') || 'Aucun',
          inline: false,
        },
      );
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
});
