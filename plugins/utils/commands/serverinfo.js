import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  GuildPremiumTier,
  MessageFlags,
} from 'discord.js';
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
    .setName('serverinfo')
    .setDescription('Affiche les informations du serveur')
    .setDescriptionLocalizations(localizationsFor('utils.serverinfo.command.description')),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    const locale = await ctx.resolveLocale(interaction);
    const guild = interaction.guild;
    const owner = await guild.fetchOwner().catch(() => null);

    const onlineMembers = guild.members.cache.filter(
      (member) => member.presence && member.presence.status !== 'offline',
    ).size;

    const textChannels = guild.channels.cache.filter(
      (channel) => channel.type === ChannelType.GuildText,
    ).size;
    const voiceChannels = guild.channels.cache.filter(
      (channel) => channel.type === ChannelType.GuildVoice,
    ).size;
    const forumChannels = guild.channels.cache.filter(
      (channel) => channel.type === ChannelType.GuildForum,
    ).size;
    const announcements = guild.channels.cache.filter(
      (channel) => channel.type === ChannelType.GuildAnnouncement,
    ).size;

    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setColor(0x2f3136)
      .setThumbnail(guild.iconURL({ extension: 'png', size: 512, forceStatic: false }) ?? null)
      .setDescription(
        `• ${guild.memberCount} membres • ${onlineMembers} en ligne • ${guild.premiumSubscriptionCount ?? 0} boosts`,
      )
      .addFields(
        {
          name: ctx.t(locale, 'utils.serverinfo.command.fields.owner'),
          value: owner ? `${owner.user.tag} (${owner.id})` : 'Inconnu',
          inline: true,
        },
        {
          name: ctx.t(locale, 'utils.serverinfo.command.fields.level'),
          value: `${guild.premiumTier === GuildPremiumTier.None ? 0 : guild.premiumTier} • ${guild.premiumSubscriptionCount ?? 0} ${ctx.t(locale, 'utils.serverinfo.command.fields.boosts')}`,
          inline: true,
        },
        {
          name: ctx.t(locale, 'utils.serverinfo.command.fields.id'),
          value: guild.id,
          inline: true,
        },
        {
          name: ctx.t(locale, 'utils.serverinfo.command.fields.createdAt'),
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
          inline: true,
        },
        {
          name: ctx.t(locale, 'utils.serverinfo.command.fields.roles'),
          value: `${guild.roles.cache.size - 1}`,
          inline: true,
        },
        {
          name: ctx.t(locale, 'utils.serverinfo.command.fields.channels'),
          value: `${textChannels} ${ctx.t(locale, 'utils.serverinfo.command.fields.text')} • ${voiceChannels} ${ctx.t(locale, 'utils.serverinfo.command.fields.voice')} • ${forumChannels + announcements} ${ctx.t(locale, 'utils.serverinfo.command.fields.forums')}`,
          inline: false,
        },
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
});
