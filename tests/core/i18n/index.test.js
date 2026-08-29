// tests/core/i18n/index.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translator, localizationsFor } from '../../../src/core/i18n/index.js';

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
