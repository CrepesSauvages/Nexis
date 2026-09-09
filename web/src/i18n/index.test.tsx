import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { detectLocale, LocaleProvider, useLocale, useT, SUPPORTED_LOCALES } from './index';
import { fr } from './fr';
import { en } from './en';
import { es } from './es';
import { de } from './de';
import { pt } from './pt';
import { it as itLocale } from './it';
import { nl } from './nl';
import { pl } from './pl';

const STORAGE_KEY = 'nexis.interfaceLocale';

/** Impose une langue de navigateur pour la durée d'un test. */
const setBrowserLanguage = (language: string) => {
  Object.defineProperty(window.navigator, 'language', {
    value: language,
    configurable: true,
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  setBrowserLanguage('fr-FR');
});

describe('detectLocale', () => {
  it('devrait détecter le polonais depuis un navigateur en pl-PL', () => {
    setBrowserLanguage('pl-PL');
    expect(detectLocale()).toBe('pl');
  });

  it('devrait retomber sur le français si le navigateur parle une langue non supportée', () => {
    setBrowserLanguage('ja-JP');
    expect(detectLocale()).toBe('fr');
  });

  it('devrait préférer une langue valide enregistrée dans localStorage au navigateur', () => {
    setBrowserLanguage('pl-PL');
    window.localStorage.setItem(STORAGE_KEY, 'de');
    expect(detectLocale()).toBe('de');
  });

  it('ne devrait pas planter si localStorage lève, et retomber sur le navigateur', () => {
    // Navigation privée sur certains navigateurs (Safari notamment) : lire
    // `localStorage` peut lever une exception plutôt que rendre `null`.
    setBrowserLanguage('pl-PL');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('accès refusé');
    });
    expect(() => detectLocale()).not.toThrow();
    expect(detectLocale()).toBe('pl');
  });
});

describe('parité des clés entre langues', () => {
  it('devrait porter exactement le même ensemble de clés dans les huit langues', () => {
    // Un test d'exécution documente l'intention même si `tsc` la garantit déjà
    // au niveau des types : il survit à quelqu'un qui affaiblirait ces types.
    const referenceKeys = Object.keys(fr).sort();
    const dictionaries = { en, es, de, pt, it: itLocale, nl, pl };
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      expect(Object.keys(dictionary).sort(), `clés de ${locale}`).toEqual(referenceKeys);
    }
  });

  it('devrait couvrir les huit codes de langue du bot', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(
      ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt'].sort(),
    );
  });
});

/** Composant de test exposant `useT`/`useLocale` pour vérifier le contexte. */
const Probe = () => {
  const t = useT();
  const { locale, setLocale } = useLocale();
  return (
    <div>
      <p>{t('app.loading')}</p>
      <button type="button" onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}>
        changer
      </button>
    </div>
  );
};

describe('useT / useLocale', () => {
  it('devrait rendre le texte français par défaut', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText('Chargement…')).toBeInTheDocument();
  });

  it('devrait re-rendre avec le nouveau texte quand la langue change', async () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'changer' }));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
  });

  it('devrait persister la langue choisie dans localStorage', async () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'changer' }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('en');
  });
});
