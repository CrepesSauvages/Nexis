// src/core/i18n/index.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTranslator } from './translator.js';

const LOCALE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'locales');

/** Les 8 langues supportées par Nexis. */
export const SUPPORTED_LOCALES = ['fr', 'en', 'es', 'de', 'pt', 'it', 'nl', 'pl'];

/**
 * Code de locale Discord (utilisé par setNameLocalizations/setDescriptionLocalizations)
 * pour chacune des 8 langues supportées — le français n'y figure pas : il
 * est toujours le texte de base du builder, jamais une entrée de la map de
 * localisations (voir localizationsFor ci-dessous).
 * @type {Record<string, string>}
 */
const DISCORD_LOCALE_CODES = {
  en: 'en-US',
  es: 'es-ES',
  de: 'de',
  pt: 'pt-BR',
  it: 'it',
  nl: 'nl',
  pl: 'pl',
};

/** @type {Record<string, Record<string, string>>} */
const locales = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    /** @type {Record<string, string>} */ (
      JSON.parse(readFileSync(join(LOCALE_DIR, `${locale}.json`), 'utf8'))
    ),
  ]),
);

export const translator = createTranslator(locales);

/**
 * Construit la map attendue par `setNameLocalizations`/`setDescriptionLocalizations`
 * de discord.js : code de locale Discord → texte traduit, pour les 7 langues
 * hors français (le français reste le texte de base passé à `.setName()`/
 * `.setDescription()`, jamais dans cette map).
 * @param {string} key
 * @returns {Record<string, string>}
 */
export const localizationsFor = (key) =>
  Object.fromEntries(
    Object.entries(DISCORD_LOCALE_CODES)
      .map(([locale, discordCode]) => [discordCode, locales[locale]?.[key]])
      .filter(([, value]) => value !== undefined),
  );

/**
 * Enregistre les traductions d'un plugin dans le traducteur partagé, en
 * préfixant chaque clé par le nom du plugin (`greeting` → `mon-plugin.greeting`)
 * — aucune collision possible avec les clés du core ou d'un autre plugin,
 * sans que l'auteur du plugin n'ait à y penser. Appelé une fois par plugin
 * au boot (voir `bootstrap()`, `src/index.js`), avant que son `setup()` ne
 * s'exécute.
 * @param {string} pluginName
 * @param {Record<string, Record<string, string>>} pluginLocales - { fr: {...}, en: {...}, ... }
 * @returns {void}
 */
export const registerPluginLocales = (pluginName, pluginLocales) => {
  const prefixed = Object.fromEntries(
    Object.entries(pluginLocales).map(([locale, table]) => [
      locale,
      Object.fromEntries(
        Object.entries(table).map(([key, text]) => [`${pluginName}.${key}`, text]),
      ),
    ]),
  );
  translator.extend(prefixed);
};
