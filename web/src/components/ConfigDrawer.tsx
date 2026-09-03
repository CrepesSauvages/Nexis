import { useState } from 'react';
import { api, ApiRequestError } from '../api/client';
import type { GuildResources, Plugin } from '../api/types';
import { Field } from './fields/Field';
import { t } from '../strings';

interface ConfigDrawerProps {
  plugin: Plugin;
  guildId: string;
  resources: GuildResources;
  onClose: () => void;
  onSaved: () => void;
  onStale: () => void;
  onError: (error: unknown) => void;
}

export const ConfigDrawer = ({
  plugin,
  guildId,
  resources,
  onClose,
  onSaved,
  onStale,
  onError,
}: ConfigDrawerProps) => {
  // Seules les modifications sont retenues : l'écriture est une fusion
  // partielle, un champ non mentionné garde sa valeur.
  const [changes, setChanges] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.saveConfig(guildId, plugin.name, changes);
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiRequestError && error.fields) {
        setErrors(Object.fromEntries(error.fields.map(({ key, reason }) => [key, reason])));
      } else if (error instanceof ApiRequestError && error.status === 404) {
        // Le plugin a disparu ou le bot a quitté le serveur : l'écran est
        // périmé, la liste est rechargée et le tiroir se ferme.
        onStale();
        onClose();
      } else {
        onError(error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="drawer" aria-label={plugin.name}>
      <div className="drawer-head">
        <strong>{plugin.name}</strong>
        <button type="button" className="ghost" onClick={onClose}>
          {t('drawer.close')}
        </button>
      </div>

      {Object.entries(plugin.schema).map(([name, entry]) => (
        <Field
          key={name}
          name={name}
          entry={entry}
          value={name in changes ? changes[name] : plugin.config[name]}
          resources={resources}
          error={errors[name]}
          onChange={(value) => setChanges((current) => ({ ...current, [name]: value }))}
        />
      ))}

      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
        {t('drawer.save')}
      </button>
    </aside>
  );
};
