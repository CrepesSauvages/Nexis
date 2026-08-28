/**
 * Contrat que tout driver de storage doit honorer.
 * Volontairement clé/valeur : c'est le plus grand dénominateur commun
 * que JSON, SQLite, Postgres et Mongo peuvent tous tenir honnêtement.
 * Un plugin ayant besoin de vraies requêtes passe par raw().
 *
 * @typedef {object} StorageDriver
 * @property {() => Promise<void>} init
 * @property {(key: string) => Promise<unknown>} get
 * @property {(key: string, value: unknown) => Promise<void>} set
 * @property {(key: string) => Promise<void>} delete
 * @property {(prefix: string) => Promise<string[]>} keys
 * @property {() => Promise<void>} close
 * @property {() => unknown} raw - handle natif du driver, au prix de la portabilité
 */

export {};
