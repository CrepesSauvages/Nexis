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
 * Identifiant court montré à l'utilisateur et repris dans les logs,
 * pour qu'un rapport de bug puisse être relié à sa trace.
 * @returns {string}
 */
export const newErrorId = () => randomBytes(4).toString('hex');
