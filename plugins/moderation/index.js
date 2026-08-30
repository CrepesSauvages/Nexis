export const manifest = {
  name: 'moderation',
  version: '1.0.0',
  description: 'Purge de messages et verrouillage de salon, avec confirmation par boutons',
  allowDM: false,
};

/**
 * Les trois components (deux confirmations + un annuler partagé) n'ont pas
 * de convention de dossier : ils passent par setup(), comme les routes et
 * services. Les commandes purge/lock vivent dans commands/, chargées par
 * la convention de dossier.
 *
 * @param {import('../../src/core/context.js').PluginContext} ctx
 */
export const setup = (ctx) => {
  ctx.registerComponent({
    customId: 'purge-confirm',
    type: 'button',
    permissions: 'guild-admin',
    /** @param {import('discord.js').ButtonInteraction} interaction */
    handler: async (interaction) => {
      if (!interaction.inCachedGuild() || !interaction.channel) return;
      const count = Number(interaction.customId.split(':').pop());
      const deleted = await interaction.channel.bulkDelete(count, true);
      await interaction.update({
        content: `${deleted.size} message(s) supprimé(s).`,
        components: [],
      });
    },
  });

  ctx.registerComponent({
    customId: 'lock-confirm',
    type: 'button',
    permissions: 'guild-admin',
    /** @param {import('discord.js').ButtonInteraction} interaction */
    handler: async (interaction) => {
      if (!interaction.inCachedGuild()) return;
      const { channel } = interaction;
      if (!channel || !('permissionOverwrites' in channel)) return;
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
      });
      await interaction.update({ content: 'Salon verrouillé.', components: [] });
    },
  });

  ctx.registerComponent({
    customId: 'cancel',
    type: 'button',
    permissions: 'guild-admin',
    /** @param {import('discord.js').ButtonInteraction} interaction */
    handler: async (interaction) => {
      await interaction.update({ content: 'Annulé.', components: [] });
    },
  });
};
