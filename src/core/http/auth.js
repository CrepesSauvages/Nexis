import { PermissionFlagsBits } from 'discord.js';
import { HttpError } from '../errors.js';

/** Les seuls niveaux d'autorisation que cette fonction sait interpréter. */
const KNOWN_LEVELS = ['public', 'guild-member', 'guild-admin', 'owner'];

/**
 * Décide si une requête a le droit d'atteindre son handler. Ne renvoie
 * rien en cas de succès ; lève une HttpError portant le statut sinon.
 *
 * `session.guilds` n'est jamais consulté ici. Cette liste date du login :
 * s'y fier laisserait un administrateur rétrogradé garder ses droits
 * jusqu'à l'expiration de sa session. La source de vérité est le client
 * Discord, tenu à jour en permanence par la passerelle.
 *
 * @param {object} options
 * @param {string} options.level
 * @param {import('./session.js').StoredSession | undefined} options.session
 * @param {import('discord.js').Client} options.client
 * @param {string | undefined} options.guildId
 * @param {string | undefined} options.ownerId
 * @returns {Promise<void>}
 */
export const resolveAuth = async ({ level, session, client, guildId, ownerId }) => {
  if (!KNOWN_LEVELS.includes(level)) {
    // Inatteignable aujourd'hui : routes.js valide déjà `auth` contre
    // AUTH_LEVELS, et les routes du socle sont codées en dur avec `public`.
    // Mais un niveau non reconnu ici serait une erreur de programmation
    // (AUTH_LEVELS élargi sans toucher ce fichier), pas une faute de
    // l'appelant — d'où un 500 fermé par défaut, et non les droits du
    // niveau protégé le plus faible.
    throw new HttpError(500, `Niveau d'autorisation inconnu : "${level}"`);
  }
  if (level === 'public') return;
  if (!session) throw new HttpError(401, 'Authentification requise');

  if (level === 'owner') {
    if (!ownerId || session.userId !== ownerId) {
      throw new HttpError(403, 'Réservé au propriétaire du bot');
    }
    return;
  }

  if (!guildId) throw new HttpError(400, 'Paramètre `guild` manquant');

  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new HttpError(404, "Le bot n'est pas présent sur ce serveur");

  let member;
  try {
    member = await guild.members.fetch(session.userId);
  } catch {
    // Discord répond « Unknown Member » quand l'utilisateur a quitté le
    // serveur : une absence, pas une panne — d'où un 403 et non un 500.
    throw new HttpError(403, "Vous n'êtes pas membre de ce serveur");
  }

  if (level === 'guild-admin' && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    throw new HttpError(403, 'Permission « Gérer le serveur » requise');
  }
};
