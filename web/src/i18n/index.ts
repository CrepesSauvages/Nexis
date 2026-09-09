import { createContext, createElement, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { fr } from './fr';
import type { StringKey } from './fr';
import { en } from './en';
import { es } from './es';
import { de } from './de';
import { pt } from './pt';
import { it } from './it';
import { nl } from './nl';
import { pl } from './pl';

export type { StringKey };

/** Les huit langues du bot (`SUPPORTED_LOCALES` dans src/core/i18n/index.js). */
export const SUPPORTED_LOCALES = ['fr', 'en', 'es', 'de', 'pt', 'it', 'nl', 'pl'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const DICTIONARIES: Record<Locale, Record<StringKey, string>> = { fr, en, es, de, pt, it, nl, pl };

/**
 * Clé de `localStorage` pour la langue de lecture de l'administrateur. Sans
 * rapport avec la langue du serveur (`PUT /api/core/locale`), qui vit côté
 * bot et concerne les membres, pas qui consulte ce tableau de bord.
 */
const STORAGE_KEY = 'nexis.interfaceLocale';

const isSupportedLocale = (value: string): value is Locale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(value);

/** Langue valide enregistrée par l'utilisateur, si `localStorage` en contient une. */
const storedLocale = (): Locale | null => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value !== null && isSupportedLocale(value) ? value : null;
  } catch {
    // Navigation privée sur certains navigateurs (Safari notamment) : lire
    // `localStorage` peut lever plutôt que rendre `null`. Aucune préférence
    // enregistrée n'est alors récupérable, l'interface continue sans elle.
    return null;
  }
};

/** Langue déduite des deux premières lettres de `navigator.language`. */
const browserLocale = (): Locale | null => {
  const candidate = navigator.language.slice(0, 2).toLowerCase();
  return isSupportedLocale(candidate) ? candidate : null;
};

/**
 * Langue de lecture au chargement : une préférence enregistrée valide,
 * sinon la langue du navigateur si elle est supportée, sinon le français.
 */
export const detectLocale = (): Locale => storedLocale() ?? browserLocale() ?? 'fr';

const persistLocale = (locale: Locale): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Idem : en navigation privée, la préférence ne survivra pas au
    // rechargement, mais ce n'est pas une raison de faire planter l'interface.
  }
};

/** Résout une clé dans une langue donnée et substitue ses paramètres. */
const translate = (locale: Locale, key: StringKey, params: Record<string, string> = {}): string =>
  DICTIONARIES[locale][key].replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'fr',
  // Valeur par défaut utilisée seulement quand un composant est rendu sans
  // `LocaleProvider` (tests unitaires ciblés sur un seul composant) : dans
  // l'application réelle, `main.tsx` enveloppe toujours `App` avec le vrai
  // provider, ce setter n'est donc jamais appelé sur cette valeur par défaut.
  setLocale: () => {},
});

interface LocaleProviderProps {
  children: ReactNode;
}

/**
 * Fournit la langue de lecture de l'administrateur à tout l'arbre. N'écrit
 * jamais vers l'API : c'est une préférence purement locale, à l'opposé de la
 * langue du serveur que `LocalePicker` change via `PUT /api/core/locale`.
 */
export const LocaleProvider = ({ children }: LocaleProviderProps) => {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  return createElement(LocaleContext.Provider, { value: { locale, setLocale } }, children);
};

/** La langue de lecture courante et le setter qui la persiste. */
export const useLocale = (): LocaleContextValue => useContext(LocaleContext);

/** Le `t` de la langue courante, lié au contexte : re-rend au changement de langue. */
export const useT = () => {
  const { locale } = useContext(LocaleContext);
  return useCallback(
    (key: StringKey, params?: Record<string, string>) => translate(locale, key, params),
    [locale],
  );
};

/** Type de `t`, pour les fonctions qui ne sont pas des composants (ex. api/errors.ts). */
export type TFunction = (key: StringKey, params?: Record<string, string>) => string;
