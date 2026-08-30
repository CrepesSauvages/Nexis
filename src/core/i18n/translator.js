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
 * Le pluriel utilise `Intl.PluralRules` (natif Node) : la sélection est
 * automatique, aucune règle de pluriel écrite à la main. Le jeu de
 * catégories dépend de la locale ET de `count` — ce n'est pas juste
 * `_one`/`_other` partout. Par exemple le français a `one`/`many`/`other`
 * (`many` couvre entre autres les grands nombres : `Intl.PluralRules('fr')
 * .select(1_000_000)` renvoie `'many'`, pas `'other'`), et le polonais a
 * `one`/`few`/`many`/`other`. Le principe à retenir : chaque fichier de
 * locale doit définir une entrée `_<catégorie>` pour chaque catégorie que
 * `Intl.PluralRules` peut renvoyer pour cette locale sur les valeurs de
 * `count` réellement utilisées dans le code — sinon la cascade de repli de
 * `t()` finit par exposer une clé brute `[key]` à un utilisateur réel.
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
