import { describe, it, expect } from 'vitest';
import { mapDiscordLocale, resolveLocale } from '../../../src/core/i18n/locale-resolver.js';

describe('mapDiscordLocale', () => {
  it('devrait mapper les codes exacts des 8 langues supportées', () => {
    expect(mapDiscordLocale('fr')).toBe('fr');
    expect(mapDiscordLocale('de')).toBe('de');
    expect(mapDiscordLocale('it')).toBe('it');
    expect(mapDiscordLocale('nl')).toBe('nl');
    expect(mapDiscordLocale('pl')).toBe('pl');
  });

  it('devrait mapper les variantes régionales vers leur langue de base', () => {
    expect(mapDiscordLocale('en-US')).toBe('en');
    expect(mapDiscordLocale('en-GB')).toBe('en');
    expect(mapDiscordLocale('es-ES')).toBe('es');
    expect(mapDiscordLocale('es-419')).toBe('es');
    expect(mapDiscordLocale('pt-BR')).toBe('pt');
  });

  it('devrait retourner undefined pour une langue Discord non supportée', () => {
    expect(mapDiscordLocale('ja')).toBeUndefined();
    expect(mapDiscordLocale('ko')).toBeUndefined();
  });

  it('devrait retourner undefined si aucune locale fournie', () => {
    expect(mapDiscordLocale(undefined)).toBeUndefined();
  });
});

describe('resolveLocale', () => {
  it("devrait prioriser l'override serveur sur tout le reste", () => {
    expect(resolveLocale({ locale: 'en-US' }, 'de')).toBe('de');
  });

  it("devrait utiliser interaction.locale mappée si pas d'override", () => {
    expect(resolveLocale({ locale: 'es-ES' }, undefined)).toBe('es');
  });

  it('devrait retomber sur le français si ni override ni locale Discord supportée', () => {
    expect(resolveLocale({ locale: 'ja' }, undefined)).toBe('fr');
    expect(resolveLocale({ locale: undefined }, undefined)).toBe('fr');
  });

  it('devrait ignorer un override vide (chaîne vide) et continuer la cascade', () => {
    expect(resolveLocale({ locale: 'en-US' }, '')).toBe('en');
  });

  it('devrait ignorer un override malformé (BCP-47 invalide) et continuer la cascade', () => {
    // `guildConfig.getLocale` renvoie le storage tel quel, sans validation.
    // Un override du type `fr_FR` (underscore au lieu du tiret) ferait
    // planter `new Intl.PluralRules(locale)` avec un RangeError non
    // rattrapé côté dispatcher — on doit donc le traiter comme absent.
    expect(resolveLocale({ locale: 'en-US' }, 'fr_FR')).toBe('en');
  });

  it('devrait ignorer un override qui ne fait pas partie des 8 langues supportées', () => {
    expect(resolveLocale({ locale: 'de' }, 'xx')).toBe('de');
    expect(resolveLocale({ locale: undefined }, 'xx')).toBe('fr');
  });
});
