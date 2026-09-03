import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

// `web/src/**/*.{ts,tsx}` n'est volontairement pas couvert : `typescript-eslint`
// refuse de démarrer sur TypeScript 7 (« Error: typescript-eslint does not
// support TS 7.0 »), et la racine dépend délibérément de `typescript@^7.0.2`
// — impossible de faire cohabiter les deux sans dégrader le compilateur
// utilisé par `npm run check-types`, notre principal filet de sécurité de
// typage. La sûreté des types du front reste garantie par `tsc --noEmit`
// dans `web`'s `build` (donc par `npm run build:web`) ; seul `prettier
// --write` s'applique à ces fichiers via lint-staged. À revoir quand
// `typescript-eslint` supportera TS 7.
export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'plugins/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  prettier,
];
