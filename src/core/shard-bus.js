/**
 * Event interne émis sur chaque client quand la configuration d'un serveur
 * a changé ailleurs. Ce n'est pas un event Discord : il ne passe donc pas
 * par `EVENT_INTENTS`, et aucun plugin n'a de raison de le déclarer.
 */
export const GUILD_CONFIG_CHANGED = 'nexisGuildConfigChanged';

/**
 * Prévient tous les shards qu'un serveur vient d'être reconfiguré.
 *
 * Chaque shard tient son propre cache de configuration : sans ce signal,
 * une écriture faite depuis le dashboard — qui ne vit que sur un shard —
 * laisserait le shard qui sert réellement ce serveur travailler sur des
 * valeurs périmées, jusqu'à son prochain redémarrage.
 *
 * Sans sharding, il n'y a personne à prévenir et la fonction ne coûte
 * rien. Le shard émetteur reçoit aussi le signal : invalider son propre
 * cache ne coûte qu'une relecture, et l'exclure demanderait de savoir qui
 * l'on est pour un gain nul.
 *
 * @param {import('discord.js').Client | null} client
 * @param {string} guildId
 * @returns {Promise<void>}
 */
export const announceGuildConfigChange = async (client, guildId) => {
  const shard = client?.shard;
  if (!shard) return;

  await shard.broadcastEval(
    (remote, { id, event }) => {
      remote.emit(event, id);
    },
    // La fonction ci-dessus est sérialisée puis évaluée dans l'autre
    // process : elle ne peut capturer ni `guildId`, ni la constante.
    { context: { id: guildId, event: GUILD_CONFIG_CHANGED } },
  );
};
