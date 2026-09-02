import { randomBytes } from 'node:crypto';

/** Erreur de base de Nexis. Porte un contexte structuré pour le log. */
export class NexisError extends Error {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [context]
   */
  constructor(message, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = 'NEXIS_ERROR';
    this.context = context;
  }
}

/** Environnement ou configuration invalide. Fatale au boot. */
export class ConfigError extends NexisError {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [context]
   */
  constructor(message, context) {
    super(message, context);
    this.code = 'CONFIG_ERROR';
  }
}

/** Plugin invalide ou dont le setup a échoué. Désactive le plugin. */
export class PluginError extends NexisError {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [context]
   */
  constructor(message, context) {
    super(message, context);
    this.code = 'PLUGIN_ERROR';
  }
}

/** Dépendance manquante, non déclarée, ou cycle entre plugins. */
export class DependencyError extends NexisError {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [context]
   */
  constructor(message, context) {
    super(message, context);
    this.code = 'DEPENDENCY_ERROR';
  }
}

/**
 * Erreur destinée au client HTTP. Elle porte le statut à renvoyer, ce qui
 * permet au routeur de distinguer une faute de l'appelant — à rendre telle
 * quelle — d'un incident du serveur, qui mérite un errorId et un log.
 */
export class HttpError extends NexisError {
  /**
   * @param {number} status
   * @param {string} message
   * @param {Record<string, unknown>} [context]
   */
  constructor(status, message, context) {
    super(message, context);
    this.code = 'HTTP_ERROR';
    this.status = status;
  }
}

/**
 * Identifiant court montré à l'utilisateur et repris dans les logs,
 * pour qu'un rapport de bug puisse être relié à sa trace.
 * @returns {string}
 */
export const newErrorId = () => randomBytes(4).toString('hex');

/**
 * Normalise une erreur `unknown` (catch) en message affichable/loggable.
 * Partagé entre dispatcher.js et scheduler.js pour éviter la duplication.
 * @param {unknown} error
 * @returns {string}
 */
export const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Extrait la stack d'une erreur `unknown`, si elle en a une.
 * @param {unknown} error
 * @returns {string | undefined}
 */
export const errorStack = (error) => (error instanceof Error ? error.stack : undefined);
