import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { apiErrorMessage } from '../api/errors';
import type { CommandPermission, Role } from '../api/types';
import { useT } from '../i18n';

interface PermissionsDrawerProps {
  guildId: string;
  roles: Role[];
  onClose: () => void;
  onError: (error: unknown) => void;
}

/** Libellé du niveau déclaré par le plugin, jamais modifiable d'ici. */
const DECLARED_KEYS = {
  'guild-admin': 'permsDrawer.declared.guild-admin',
  owner: 'permsDrawer.declared.owner',
} as const;

/**
 * Réglage des rôles autorisés, commande par commande.
 *
 * Charge ses données à l'ouverture, comme ErrorDrawer — mais reçoit les
 * rôles du serveur en props : la grille les a déjà chargés pour les champs
 * de configuration, les redemander ici ferait un appel pour rien.
 */
export const PermissionsDrawer = ({ guildId, roles, onClose, onError }: PermissionsDrawerProps) => {
  const t = useT();
  const [commands, setCommands] = useState<CommandPermission[]>([]);
  // Modifications en attente, par commande. Séparées de `commands` pour que
  // rien ne s'affiche comme enregistré avant de l'être réellement.
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { commands: list } = await api.permissions(guildId);
      setCommands(list);
      setDraft({});
    } catch (error) {
      onError(error);
      setMessage(apiErrorMessage(error, t));
    }
  }, [guildId, onError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Rôles à afficher cochés : la modification en attente, sinon l'état serveur. */
  const rolesOf = (command: CommandPermission): string[] =>
    draft[command.name] ?? command.roles ?? [];

  const toggle = (command: CommandPermission, roleId: string) => {
    const current = rolesOf(command);
    const next = current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId];
    setDraft((pending) => ({ ...pending, [command.name]: next }));
  };

  const write = async (command: CommandPermission, next: string[] | null) => {
    setBusy(command.name);
    setMessage(null);
    try {
      await api.setPermissions(guildId, command.name, next);
      // Recharge plutôt que de patcher localement : l'état affiché doit
      // être celui du serveur, pas une supposition.
      await load();
      setMessage(t('permsDrawer.saved'));
    } catch (error) {
      onError(error);
      setMessage(apiErrorMessage(error, t));
    } finally {
      setBusy(null);
    }
  };

  /** Ce que la commande donne aujourd'hui, en une ligne. */
  const stateOf = (command: CommandPermission): string => {
    if (command.roles === null) return t('permsDrawer.state.default');
    if (command.roles.length === 0) return t('permsDrawer.state.adminsOnly');
    return t('permsDrawer.state.roles', { count: String(command.roles.length) });
  };

  return (
    <aside className="drawer" aria-label={t('permsDrawer.title')}>
      <div className="drawer-head">
        <strong>{t('permsDrawer.title')}</strong>
        <button type="button" className="ghost" onClick={onClose}>
          {t('drawer.close')}
        </button>
      </div>

      <p className="small">{t('permsDrawer.intro')}</p>

      {commands.length === 0 ? <p className="small">{t('permsDrawer.empty')}</p> : null}

      {commands.map((command) => (
        <div key={command.name} className="perms-entry">
          <p>
            <strong>{command.name}</strong> <span className="small">{command.plugin}</span>
          </p>
          <p className="small">
            {t(command.declared ? DECLARED_KEYS[command.declared] : 'permsDrawer.declared.none')}
          </p>

          {/* Une commande de propriétaire engage l'installation entière et non
              ce serveur : l'API la refuse, l'interface n'offre donc rien à
              cocher plutôt que de laisser tenter un enregistrement perdu. */}
          {command.declared === 'owner' ? (
            <p className="small">{t('permsDrawer.ownerLocked')}</p>
          ) : (
            <details>
              <summary>{stateOf(command)}</summary>

              {roles.length === 0 ? <p className="small">{t('permsDrawer.noRoles')}</p> : null}
              {roles.map((role) => (
                <label key={role.id} className="perms-role">
                  <input
                    type="checkbox"
                    checked={rolesOf(command).includes(role.id)}
                    onChange={() => toggle(command, role.id)}
                  />
                  {role.name}
                </label>
              ))}

              <button
                type="button"
                className="primary"
                disabled={busy === command.name}
                onClick={() => void write(command, rolesOf(command))}
              >
                {t('permsDrawer.save')}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy === command.name || command.roles === null}
                onClick={() => void write(command, null)}
              >
                {t('permsDrawer.reset')}
              </button>
            </details>
          )}
        </div>
      ))}

      {message ? <p className="error">{message}</p> : null}
    </aside>
  );
};
