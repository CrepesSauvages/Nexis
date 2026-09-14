export interface SessionGuild {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
}

export interface SessionUser {
  id: string;
  username: string;
  avatar: string | null;
  guilds: SessionGuild[];
  // Vrai seulement pour le propriétaire du bot (OWNER_ID) : conditionne
  // l'affichage du bouton vers le journal d'erreurs dans TopBar.
  owner: boolean;
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface ConfigEntry {
  type: string;
  label: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
}

export interface Plugin {
  name: string;
  version: string;
  description: string | null;
  dependsOn: string[];
  alwaysEnabled: boolean;
  enabled: boolean;
  schema: Record<string, ConfigEntry>;
  config: Record<string, unknown>;
}

export interface Channel {
  id: string;
  name: string;
  type: number;
}

export interface Role {
  id: string;
  name: string;
  color: string;
}

export interface GuildResources {
  channels: Channel[];
  roles: Role[];
}

export interface FieldError {
  key: string;
  reason: string;
}

/**
 * Une commande déclarée, vue du dashboard. `declared` est le niveau du
 * plugin ; `roles` la liste qu'un administrateur a définie sur ce serveur,
 * ou `null` quand il n'en a défini aucune — une liste vide, elle, réserve
 * la commande aux administrateurs.
 */
export interface CommandPermission {
  name: string;
  plugin: string;
  declared: 'guild-admin' | 'owner' | null;
  roles: string[] | null;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  details?: Record<string, unknown>;
}

export interface ErrorLogEntry {
  id: string;
  timestamp: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface ApiError {
  status: number;
  error: string;
  reason?: string;
  deps?: string[];
  fields?: FieldError[];
  errorId?: string;
}
