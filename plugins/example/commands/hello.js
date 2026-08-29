import { SlashCommandBuilder } from 'discord.js';

/**
 * Un fichier de `commands/` exporte une fabrique prenant le contexte.
 * La commande elle-même reçoit aussi `ctx` en second argument, du
 * dispatcher — les deux chemins sont équivalents ici.
 *
 * @param {import('../../../src/core/context.js').PluginContext} ctx
 */
export default (ctx) => ({
  data: new SlashCommandBuilder().setName('hello').setDescription('Dit bonjour'),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    const { greeting } = await ctx.config(interaction.guildId ?? '');

    const key = `greeted:${interaction.user.id}`;
    const count = /** @type {number} */ ((await ctx.storage.get(key)) ?? 0) + 1;
    await ctx.storage.set(key, count);

    await interaction.reply({
      content: `${greeting} <@${interaction.user.id}> ! (${count} fois)`,
      flags: 64,
    });
  },
});
