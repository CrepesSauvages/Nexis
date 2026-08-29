/** @param {import('../../../../../src/core/context.js').PluginContext} _ctx */
export default (_ctx) => ({
  data: { name: 'ping', toJSON: () => ({ name: 'ping' }) },
  execute: async (/** @type {{ reply: (content: string) => Promise<unknown> }} */ interaction) =>
    interaction.reply('pong'),
});
