import { GatewayIntentBits as Bits } from 'discord.js';
import { PluginError } from './errors.js';

/**
 * Correspondance event → intents requis. Un event absent de cette table
 * est refusé au boot : c'est exactement le cas où un développeur perdrait
 * une heure à chercher pourquoi son handler ne reçoit rien.
 *
 * @type {Record<string, number[]>}
 */
export const EVENT_INTENTS = {
  ready: [],
  error: [],
  warn: [],
  interactionCreate: [],
  guildCreate: [],
  guildDelete: [],
  guildUpdate: [],
  channelCreate: [],
  channelDelete: [],
  channelUpdate: [],
  roleCreate: [],
  roleDelete: [],
  roleUpdate: [],
  threadCreate: [],
  threadDelete: [],
  guildMemberAdd: [Bits.GuildMembers],
  guildMemberRemove: [Bits.GuildMembers],
  guildMemberUpdate: [Bits.GuildMembers],
  guildBanAdd: [Bits.GuildModeration],
  guildBanRemove: [Bits.GuildModeration],
  messageCreate: [Bits.GuildMessages, Bits.MessageContent],
  messageUpdate: [Bits.GuildMessages, Bits.MessageContent],
  messageDelete: [Bits.GuildMessages],
  messageReactionAdd: [Bits.GuildMessageReactions],
  messageReactionRemove: [Bits.GuildMessageReactions],
  voiceStateUpdate: [Bits.GuildVoiceStates],
  presenceUpdate: [Bits.GuildPresences],
  typingStart: [Bits.GuildMessageTyping],
};

/**
 * Union des intents nécessaires aux events déclarés. `Guilds` est
 * toujours présent : sans lui le bot ne connaît aucun serveur.
 * @param {string[]} eventNames
 * @returns {number[]}
 */
export const computeIntents = (eventNames) => {
  const intents = new Set([Bits.Guilds]);

  for (const name of eventNames) {
    const required = EVENT_INTENTS[name];
    if (required === undefined) {
      throw new PluginError(
        `Event Discord inconnu : "${name}". Ajoutez-le à EVENT_INTENTS s'il est légitime.`,
        { event: name },
      );
    }
    for (const intent of required) intents.add(intent);
  }

  return [...intents];
};

/**
 * Extrait l'identifiant de guild des arguments d'un event, quel que soit
 * l'objet transmis par discord.js. Retourne undefined hors guild (DM).
 * @param {string} _eventName
 * @param {unknown[]} args
 * @returns {string | undefined}
 */
export const guildIdOf = (_eventName, args) => {
  for (const rawArg of args) {
    if (!rawArg || typeof rawArg !== 'object') continue;
    /** @type {{ guildId?: unknown, guild?: { id?: unknown }, id?: unknown }} */
    const arg = rawArg;

    if ('guildId' in arg) {
      return typeof arg.guildId === 'string' ? arg.guildId : undefined;
    }
    if (typeof arg.guild?.id === 'string') return arg.guild.id;
    if (typeof arg.id === 'string') return arg.id;
  }
  return undefined;
};
