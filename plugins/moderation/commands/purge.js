import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

/**
 * @param {import('../../../src/core/context.js').PluginContext} ctx
 */
export default (ctx) => ({
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Supprime un nombre de messages récents dans ce salon')
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('Nombre de messages à supprimer (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    ),
  permissions: 'guild-admin',

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    const count = interaction.options.getInteger('count', true);

    const confirm = new ButtonBuilder()
      .setCustomId(`${ctx.componentId('purge-confirm')}:${count}`)
      .setLabel('Confirmer')
      .setStyle(ButtonStyle.Danger);
    const cancel = new ButtonBuilder()
      .setCustomId(ctx.componentId('cancel'))
      .setLabel('Annuler')
      .setStyle(ButtonStyle.Secondary);

    await interaction.reply({
      content: `Supprimer les ${count} derniers messages de ce salon ?`,
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
