/**
 * Tous les textes de l'interface, en français. Le bot parle huit langues,
 * l'interface une seule : ajouter les sept autres sera un remplissage de ce
 * même objet, pas une refonte.
 */
const fr = {
  'app.title': 'Nexis',
  'app.loading': 'Chargement…',
  'login.title': 'Administration Nexis',
  'login.intro': 'Connectez-vous avec Discord pour administrer vos serveurs.',
  'login.action': 'Se connecter avec Discord',
  'error.generic': 'Une erreur est survenue.',
  'error.withId': "Une erreur est survenue. Identifiant d'incident : {errorId}",
  'guilds.none.title': 'Aucun serveur à administrer',
  'guilds.none.body':
    'Il vous faut la permission « Gérer le serveur » sur un serveur où Nexis est présent.',
  'app.error.title': 'Impossible de joindre le tableau de bord',
  'app.error.body': 'Vérifiez votre connexion, puis rechargez la page.',
  'topbar.guild': 'Serveur',
  'topbar.locale': 'Langue du serveur',
  'topbar.logout': 'Déconnexion',
  'locale.unset': 'Par défaut (français)',
  'locale.fr': 'Français',
  'locale.en': 'English',
  'locale.es': 'Español',
  'locale.de': 'Deutsch',
  'locale.pt': 'Português',
  'locale.it': 'Italiano',
  'locale.nl': 'Nederlands',
  'locale.pl': 'Polski',
} as const;

export type StringKey = keyof typeof fr;

/**
 * Résout une clé et substitue ses paramètres. Une clé inconnue est impossible :
 * `StringKey` est fermé sur l'objet ci-dessus.
 */
export const t = (key: StringKey, params: Record<string, string> = {}): string =>
  fr[key].replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
