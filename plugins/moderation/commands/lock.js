import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

/**
 * @param {import('../../../src/core/context.js').PluginContext} ctx
 */
export default (ctx) => ({
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Verrouille ce salon (bloque les messages pour @everyone)'),
  permissions: 'guild-admin',

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    const confirm = new ButtonBuilder()
      .setCustomId(ctx.componentId('lock-confirm'))
      .setLabel('Confirmer')
      .setStyle(ButtonStyle.Danger);
    const cancel = new ButtonBuilder()
      .setCustomId(ctx.componentId('cancel'))
      .setLabel('Annuler')
      .setStyle(ButtonStyle.Secondary);

    await interaction.reply({
      content: 'Verrouiller ce salon ?',
      components: [
        /** @type {ActionRowBuilder<ButtonBuilder>} */ (new ActionRowBuilder()).addComponents(
          confirm,
          cancel,
        ),
      ],
      flags: 64,
    });
  },
});
