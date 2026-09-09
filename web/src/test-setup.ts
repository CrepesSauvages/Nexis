import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// jsdom rend `navigator.language` à "en-US" par défaut : sans ce réglage,
// tout test utilisant `LocaleProvider` détecterait silencieusement l'anglais
// plutôt que le français attendu, selon la machine qui l'exécute.
Object.defineProperty(window.navigator, 'language', {
  value: 'fr-FR',
  configurable: true,
});

// `LocaleProvider` persiste la langue choisie dans `localStorage` : sans ce
// nettoyage, un test qui change de langue ferait fuiter cette préférence
// vers le prochain test rendu, indépendamment de l'ordre d'exécution.
afterEach(() => {
  window.localStorage.clear();
});
