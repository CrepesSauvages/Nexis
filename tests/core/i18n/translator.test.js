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

describe('extend', () => {
  it('devrait ajouter de nouvelles clés sans toucher aux existantes', () => {
    const { t, extend } = createTranslator({ fr: { existing: 'déjà là' }, en: {} });
    extend({ fr: { added: 'ajouté' } });
    expect(t('fr', 'existing')).toBe('déjà là');
    expect(t('fr', 'added')).toBe('ajouté');
  });

  it('devrait fusionner une nouvelle locale absente au départ', () => {
    const { t, extend } = createTranslator({ fr: { key: 'valeur' } });
    extend({ pl: { key: 'wartość' } });
    expect(t('pl', 'key')).toBe('wartość');
  });

  it('devrait retomber sur le français même pour une clé ajoutée après coup', () => {
    const { t, extend } = createTranslator({ fr: {} });
    extend({ fr: { plugin_key: 'texte plugin' } });
    expect(t('en', 'plugin_key')).toBe('texte plugin');
  });

  it('une clé ajoutée devrait écraser une clé existante de même nom', () => {
    const { t, extend } = createTranslator({ fr: { key: 'ancien' } });
    extend({ fr: { key: 'nouveau' } });
    expect(t('fr', 'key')).toBe('nouveau');
  });
});

describe('has', () => {
  it('devrait reconnaître une clé présente dans la locale demandée', () => {
    const translator = createTranslator({ fr: { hello: 'Bonjour' }, en: { hello: 'Hello' } });
    expect(translator.has('en', 'hello')).toBe(true);
  });

  it('devrait reconnaître une clé absente de la locale mais présente en français', () => {
    // Même repli que `t()` : une clé traduite seulement en français existe
    // pour toutes les langues, puisque `t()` la rendra.
    const translator = createTranslator({ fr: { hello: 'Bonjour' }, en: {} });
    expect(translator.has('en', 'hello')).toBe(true);
  });

  it("devrait rejeter une clé qui n'existe nulle part", () => {
    const translator = createTranslator({ fr: { hello: 'Bonjour' } });
    expect(translator.has('fr', 'absente')).toBe(false);
  });

  it('devrait rejeter une clé sur une locale inconnue et absente du français', () => {
    const translator = createTranslator({ fr: { hello: 'Bonjour' } });
    expect(translator.has('pl', 'absente')).toBe(false);
  });

  it('devrait reconnaître une clé ajoutée par extend', () => {
    const translator = createTranslator({ fr: {} });
    expect(translator.has('fr', 'plugin.label')).toBe(false);
    translator.extend({ fr: { 'plugin.label': 'Libellé' } });
    expect(translator.has('fr', 'plugin.label')).toBe(true);
  });
});
