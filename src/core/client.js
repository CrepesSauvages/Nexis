import { Client } from 'discord.js';
import { computeIntents } from './intents.js';

/**
 * Crée le client discord.js avec les intents strictement nécessaires
 * aux events déclarés par les plugins chargés.
 *
 * @param {{ eventNames: string[], allowsDM?: boolean }} options
 * @returns {Client}
 */
export const createClient = ({ eventNames, allowsDM = false }) =>
  new Client({ intents: computeIntents(eventNames, { allowsDM }) });
