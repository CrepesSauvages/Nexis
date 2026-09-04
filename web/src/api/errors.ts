import { ApiRequestError } from './client';
import { t } from '../strings';
import type { StringKey } from '../strings';

/** Les cinq motifs de refus que `plugin-admin` peut rendre. */
const REFUSALS = new Set([
  'not_found',
  'always_enabled',
  'already_enabled',
  'missing_deps',
  'has_dependents',
]);

/**
 * Traduit une erreur d'API en un texte à nous, partagé par tous les
 * endroits qui affichent un échec au dernier moment. Le champ `error` de
 * l'API n'est affiché qu'en dernier recours : c'est `reason` qui est fait
 * pour être aiguillé, sinon un identifiant d'incident permet de retrouver
 * la trace côté serveur.
 */
export const apiErrorMessage = (error: unknown): string => {
  if (!(error instanceof ApiRequestError)) return t('error.generic');
  if (error.reason && REFUSALS.has(error.reason)) {
    return t(`refusal.${error.reason}` as StringKey, { deps: (error.deps ?? []).join(', ') });
  }
  if (error.errorId) return t('error.withId', { errorId: error.errorId });
  return t('error.generic');
};
