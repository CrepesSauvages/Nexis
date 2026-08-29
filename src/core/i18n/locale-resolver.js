/**
 * Locales Discord réellement envoyées par le client → l'une des 8 langues
 * supportées par Nexis. Les variantes régionales (es-ES, es-419, pt-BR,
 * en-US, en-GB...) retombent sur leur langue de base — Nexis ne distingue
 * pas les variantes régionales, seulement les 8 langues du core.
 * @type {Record<string, string>}
 */
const DISCORD_LOCALE_MAP = {
  fr: 'fr',
  en: 'en',
  'en-US': 'en',
  'en-GB': 'en',
  es: 'es',
  'es-ES': 'es',
  'es-419': 'es',
  de: 'de',
  pt: 'pt',
  'pt-BR': 'pt',
  it: 'it',
  nl: 'nl',
  pl: 'pl',
};

/**
 * @param {string | undefined} discordLocale
 * @returns {string | undefined}
 */
export const mapDiscordLocale = (discordLocale) =>
  discordLocale ? DISCORD_LOCALE_MAP[discordLocale] : undefined;

/**
 * Résolution à 3 niveaux : override serveur > langue client Discord de
 * l'utilisateur (mappée vers l'une des 8 langues) > français par défaut.
 * Fonction pure — ne touche ni au storage ni à Discord, testable en isolation.
 *
 * @param {{ locale?: string }} interaction
 * @param {string | undefined} guildOverride
 * @returns {string}
 */
export const resolveLocale = (interaction, guildOverride) =>
  (guildOverride || undefined) ?? mapDiscordLocale(interaction.locale) ?? 'fr';
