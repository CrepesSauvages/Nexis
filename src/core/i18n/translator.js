/**
 * Résout une clé dans une locale donnée, avec repli sur le français si absente.
 * @param {Record<string, Record<string, string>>} locales
 * @param {string} locale
 * @param {string} key
 * @returns {string | undefined}
 */
const resolve = (locales, locale, key) => locales[locale]?.[key] ?? locales.fr?.[key];

/**
 * Fabrique un traducteur pur, sans dépendance à Discord ni au storage.
 * Le pluriel utilise `Intl.PluralRules` (natif Node) : chaque locale peut
 * avoir 2 formes (`_one`/`_other`, la plupart des langues) ou plus
 * (`_one`/`_few`/`_many`/`_other` pour le polonais) — la sélection est
 * automatique, aucune règle de pluriel écrite à la main.
 *
 * @param {Record<string, Record<string, string>>} locales - { fr: {...}, en: {...}, ... }
 * @returns {{ t: (locale: string, key: string, params?: Record<string, string | number>) => string }}
 */
export const createTranslator = (locales) => ({
  t(locale, key, params) {
    const count = typeof params?.count === 'number' ? params.count : undefined;
    const suffixedKey =
      count !== undefined ? `${key}_${new Intl.PluralRules(locale).select(count)}` : undefined;

    const template =
      (suffixedKey && resolve(locales, locale, suffixedKey)) ?? resolve(locales, locale, key);
    if (template === undefined) return `[${key}]`;

    return template.replace(/\{(\w+)\}/g, (match, name) =>
      params && name in params ? String(params[name]) : match,
    );
  },
});
