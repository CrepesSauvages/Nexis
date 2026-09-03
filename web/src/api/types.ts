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

export interface ApiError {
  status: number;
  error: string;
  reason?: string;
  deps?: string[];
  fields?: FieldError[];
  errorId?: string;
}
