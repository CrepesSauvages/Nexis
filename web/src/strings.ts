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
  'guild.loadFailed':
    "Les données de ce serveur n'ont pas pu être chargées. Rechargez la page pour réessayer.",
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
  'plugin.alwaysEnabled': 'Toujours actif',
  'plugin.configure': 'Configurer',
  'plugin.noDescription': 'Aucune description.',
  'plugin.enable': 'Activer {name}',
  'plugin.disable': 'Désactiver {name}',
  'refusal.not_found': 'Ce plugin a disparu.',
  'refusal.always_enabled': 'Ce plugin est interne et reste toujours actif.',
  'refusal.already_enabled': 'Ce plugin était déjà activé.',
  'refusal.missing_deps': "Activez d'abord : {deps}",
  'refusal.has_dependents': 'Ces plugins en dépendent : {deps}',
  'field.required': 'Requis',
  'field.unknownType': 'Type « {type} » inconnu de cette interface.',
  'field.none': '— aucun —',
  'field.userHint': "Identifiant du membre (clic droit sur le membre, « Copier l'identifiant »)",
  'fieldError.wrong_type': 'Valeur du mauvais type.',
  'fieldError.not_in_options': 'Valeur hors des choix proposés.',
  'fieldError.not_found_in_guild': 'Introuvable sur ce serveur.',
  'fieldError.missing_required': 'Ce champ est obligatoire.',
  'fieldError.unknown_key': 'Champ inconnu du plugin.',
  'drawer.save': 'Enregistrer',
  'drawer.close': 'Fermer',
  'drawer.saved': 'Configuration enregistrée.',
  'drawer.stale': 'Cet état était périmé, la liste a été rechargée.',
} as const;

export type StringKey = keyof typeof fr;

/**
 * Résout une clé et substitue ses paramètres. Une clé inconnue est impossible :
 * `StringKey` est fermé sur l'objet ci-dessus.
 */
export const t = (key: StringKey, params: Record<string, string> = {}): string =>
  fr[key].replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
