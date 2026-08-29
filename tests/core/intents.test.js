import { describe, it, expect } from 'vitest';
import { GatewayIntentBits } from 'discord.js';
import { computeIntents, guildIdOf, EVENT_INTENTS } from '../../src/core/intents.js';
import { PluginError } from '../../src/core/errors.js';

describe('computeIntents', () => {
  it('devrait toujours inclure Guilds', () => {
    expect(computeIntents([])).toContain(GatewayIntentBits.Guilds);
  });

  it('devrait ajouter les intents requis par un event', () => {
    expect(computeIntents(['guildMemberAdd'])).toContain(GatewayIntentBits.GuildMembers);
  });

  it('devrait ajouter MessageContent pour messageCreate', () => {
    const intents = computeIntents(['messageCreate']);
    expect(intents).toContain(GatewayIntentBits.GuildMessages);
    expect(intents).toContain(GatewayIntentBits.MessageContent);
  });

  it('ne devrait pas dupliquer un intent partagé', () => {
    const intents = computeIntents(['messageCreate', 'messageDelete']);
    expect(new Set(intents).size).toBe(intents.length);
  });

  it('devrait accepter les events sans intent supplémentaire', () => {
    expect(computeIntents(['ready'])).toEqual([GatewayIntentBits.Guilds]);
  });

  it('devrait lever une PluginError pour un event inconnu', () => {
    expect(() => computeIntents(['onMessage'])).toThrow(PluginError);
  });

  it("devrait nommer l'event inconnu", () => {
    expect(() => computeIntents(['onMessage'])).toThrow(/onMessage/);
  });

  it('devrait couvrir les events Discord courants', () => {
    for (const name of ['ready', 'messageCreate', 'guildMemberAdd', 'interactionCreate']) {
      expect(EVENT_INTENTS).toHaveProperty(name);
    }
  });

  it('devrait ajouter DirectMessages si un plugin chargé demande allowDM', () => {
    expect(computeIntents(['messageCreate'], { allowsDM: true })).toContain(
      GatewayIntentBits.DirectMessages,
    );
  });

  it('ne devrait pas ajouter DirectMessages sans demande explicite', () => {
    expect(computeIntents(['messageCreate'])).not.toContain(GatewayIntentBits.DirectMessages);
    expect(computeIntents(['messageCreate'], { allowsDM: false })).not.toContain(
      GatewayIntentBits.DirectMessages,
    );
  });
});

describe('guildIdOf', () => {
  it('devrait lire guild.id sur un membre', () => {
    expect(guildIdOf('guildMemberAdd', [{ guild: { id: '42' } }])).toBe('42');
  });

  it('devrait lire guildId sur un message', () => {
    expect(guildIdOf('messageCreate', [{ guildId: '42' }])).toBe('42');
  });

  it('devrait retourner undefined en message privé', () => {
    expect(guildIdOf('messageCreate', [{ guildId: null }])).toBeUndefined();
  });

  it('devrait lire id sur un event de guild', () => {
    expect(guildIdOf('guildCreate', [{ id: '42' }])).toBe('42');
  });

  it('devrait retourner undefined sans argument', () => {
    expect(guildIdOf('ready', [])).toBeUndefined();
  });

  it('devrait retourner undefined en DM même avec un id de message présent', () => {
    expect(
      guildIdOf('messageCreate', [{ guildId: null, guild: null, id: '999888777000111222' }]),
    ).toBeUndefined();
  });

  it('devrait lire message.guildId sur une réaction (messageReactionAdd/Remove)', () => {
    // `MessageReaction` n'a ni guildId ni guild ni id directement : la
    // guild se lit via `reaction.message.guildId`. Sans ce cas, la boucle
    // retombait sur le second argument (`user`) et retournait son id de
    // snowflake comme s'il s'agissait d'une guild.
    expect(guildIdOf('messageReactionAdd', [{ message: { guildId: '42' } }, { id: '999' }])).toBe(
      '42',
    );
  });
});
