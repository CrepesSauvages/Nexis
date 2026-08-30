// tests/core/i18n/index.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  translator,
  localizationsFor,
  registerPluginLocales,
} from '../../../src/core/i18n/index.js';

const LOCALES = ['fr', 'en', 'es', 'de', 'pt', 'it', 'nl', 'pl'];
const LOCALE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../src/core/i18n/locales');

/** @param {string} locale */
const readLocale = (locale) =>
  /** @type {Record<string, string>} */ (
    JSON.parse(readFileSync(join(LOCALE_DIR, `${locale}.json`), 'utf8'))
  );

describe('chargement des locales', () => {
  it('devrait charger les 8 langues et traduire une clé simple', () => {
    expect(translator.t('en', 'nexis.owner_only')).toBe(
      'This command is reserved for the bot owner.',
    );
    expect(translator.t('pl', 'nexis.owner_only')).toBe(
      'To polecenie jest zarezerwowane dla właściciela bota.',
    );
  });

  it('devrait interpoler correctement à travers le vrai chargeur', () => {
    expect(translator.t('de', 'nexis.plugin_not_found', { name: 'welcome' })).toBe(
      'Plugin nicht gefunden: `welcome`',
    );
  });

  it('le français devrait contenir toutes les clés utilisées par les autres langues', () => {
    // Chaque fichier de langue est lu directement (pas via translator.js) —
    // ce test vérifie les données brutes, indépendamment de la logique de repli.
    const frKeys = new Set(Object.keys(readLocale('fr')));

    for (const locale of LOCALES.filter((l) => l !== 'fr')) {
      for (const key of Object.keys(readLocale(locale))) {
        expect(frKeys.has(key), `clé "${key}" présente en ${locale} mais absente en fr`).toBe(true);
      }
    }
  });

  it('devrait retourner le texte _many correct pour les pluriels en espagnol, portugais et italien', () => {
    // Test ES avec un grand nombre pour déclencher la catégorie 'many'
    expect(
      translator.t('es', 'nexis.enable.missing_deps', { name: 'x', deps: 'y', count: 1000000 }),
    ).toBe('`x` depende de y. Activa esos plugins primero.');

    // Test PT avec un grand nombre
    expect(
      translator.t('pt', 'nexis.enable.missing_deps', { name: 'x', deps: 'y', count: 1000000 }),
    ).toBe('`x` depende de y. Ative esses plugins primeiro.');

    // Test IT avec un grand nombre
    expect(
      translator.t('it', 'nexis.enable.missing_deps', { name: 'x', deps: 'y', count: 1000000 }),
    ).toBe('`x` dipende da y. Attiva prima questi plugin.');
  });
});

describe('localizationsFor', () => {
  it('devrait retourner les 7 langues hors français, avec les codes Discord', () => {
    const map = localizationsFor('nexis.command.description');
    expect(map).toEqual({
      'en-US': 'Manage Nexis plugins',
      'es-ES': 'Administrar los plugins de Nexis',
      de: 'Nexis-Plugins verwalten',
      'pt-BR': 'Administrar os plugins do Nexis',
      it: 'Gestisci i plugin di Nexis',
      nl: 'Nexis-plugins beheren',
      pl: 'Zarządzaj wtyczkami Nexis',
    });
  });

  it('ne devrait jamais inclure le français dans la map de localisations', () => {
    const map = localizationsFor('nexis.command.description');
    expect(map.fr).toBeUndefined();
    expect(Object.keys(map)).not.toContain('fr');
  });
});

describe('registerPluginLocales', () => {
  it('devrait préfixer les clés du plugin avec son nom et les rendre traduisibles', () => {
    registerPluginLocales('demo-plugin-test-a', { fr: { greeting: 'Salut' } });
    expect(translator.t('fr', 'demo-plugin-test-a.greeting')).toBe('Salut');
  });

  it("ne devrait pas affecter les clés d'un autre plugin ni du core", () => {
    registerPluginLocales('demo-plugin-test-b', { fr: { greeting: 'Coucou' } });
    expect(translator.t('fr', 'demo-plugin-test-b.greeting')).toBe('Coucou');
    expect(translator.t('fr', 'demo-plugin-test-a.greeting')).toBe('Salut');
    expect(translator.t('fr', 'nexis.owner_only')).toBe(
      'Cette commande est réservée au propriétaire du bot.',
    );
  });

  it("devrait retomber sur le français du plugin pour une langue qu'il ne fournit pas", () => {
    registerPluginLocales('demo-plugin-test-c', { fr: { only_fr: 'Uniquement en français' } });
    expect(translator.t('en', 'demo-plugin-test-c.only_fr')).toBe('Uniquement en français');
  });
});
