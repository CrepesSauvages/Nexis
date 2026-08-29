import { describe, it, expect } from 'vitest';
import { createTranslator } from '../../../src/core/i18n/translator.js';

const locales = {
  fr: {
    greeting: 'Bonjour {name}',
    item_one: '{count} pomme',
    item_other: '{count} pommes',
    fallback_only_in_fr: 'Uniquement en français',
  },
  en: {
    greeting: 'Hello {name}',
    item_one: '{count} apple',
    item_other: '{count} apples',
  },
  pl: {
    plural_one: 'jeden',
    plural_few: 'kilka',
    plural_many: 'wiele',
  },
};

describe('createTranslator', () => {
  it('devrait interpoler un paramètre simple', () => {
    const { t } = createTranslator(locales);
    expect(t('en', 'greeting', { name: 'Alice' })).toBe('Hello Alice');
  });

  it('devrait sélectionner la forme plurielle correcte (anglais, 2 formes)', () => {
    const { t } = createTranslator(locales);
    expect(t('en', 'item', { count: 1 })).toBe('1 apple');
    expect(t('en', 'item', { count: 2 })).toBe('2 apples');
  });

  it('devrait sélectionner la bonne catégorie CLDR pour le polonais (3 formes)', () => {
    const { t } = createTranslator(locales);
    expect(t('pl', 'plural', { count: 1 })).toBe('jeden');
    expect(t('pl', 'plural', { count: 3 })).toBe('kilka');
    expect(t('pl', 'plural', { count: 5 })).toBe('wiele');
  });

  it('devrait retomber sur le français si la clé manque dans la locale résolue', () => {
    const { t } = createTranslator(locales);
    expect(t('en', 'fallback_only_in_fr')).toBe('Uniquement en français');
  });

  it('devrait retourner la clé brute entre crochets si absente partout', () => {
    const { t } = createTranslator(locales);
    expect(t('en', 'totally.unknown.key')).toBe('[totally.unknown.key]');
  });

  it('ne devrait pas planter avec une locale non chargée', () => {
    const { t } = createTranslator(locales);
    expect(t('de', 'greeting', { name: 'Bob' })).toBe('Bonjour Bob');
  });

  it('devrait laisser un placeholder non résolu intact si le paramètre manque', () => {
    const { t } = createTranslator(locales);
    expect(t('en', 'greeting')).toBe('Hello {name}');
  });
});
