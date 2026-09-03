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
 * @returns {{ t: (locale: string, key: string, params?: Record<string, string | number>) => string, has: (locale: string, key: string) => boolean, extend: (newLocales: Record<string, Record<string, string>>) => void }}
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

  /**
   * Teste l'existence d'une clé, repli français compris — donc exactement
   * les cas où `t()` rendra un vrai texte et non la sentinelle `[clé]`.
   *
   * Existe pour que l'appelant puisse choisir entre une traduction et un
   * texte brut sans avoir à comparer le retour de `t()` à cette sentinelle.
   *
   * @param {string} locale
   * @param {string} key
   * @returns {boolean}
   */
  has(locale, key) {
    return resolve(locales, locale, key) !== undefined;
  },

  /**
   * Fusionne de nouvelles clés dans les données existantes — utilisé par
   * `registerPluginLocales` (i18n/index.js) pour enrichir le traducteur
   * partagé au chargement d'un plugin, après sa construction initiale.
   * Une clé déjà présente est écrasée par la nouvelle valeur.
   * @param {Record<string, Record<string, string>>} newLocales
   * @returns {void}
   */
  extend(newLocales) {
    for (const [locale, table] of Object.entries(newLocales)) {
      locales[locale] = { ...locales[locale], ...table };
    }
  },
});
