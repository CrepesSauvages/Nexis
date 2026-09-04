import { useState } from 'react';
import { api, ApiRequestError } from '../api/client';
import { apiErrorMessage } from '../api/errors';
import type { Plugin } from '../api/types';
import { t } from '../strings';

/** Motifs de refus après lesquels l'état affiché était périmé : la liste
 * doit être rechargée, pas seulement le message affiché. `not_found` veut
 * dire que le plugin a disparu, `already_enabled` que l'interrupteur
 * mentait déjà avant le clic. */
const REFUSALS_NEEDING_RELOAD = new Set(['not_found', 'already_enabled']);

interface PluginCardProps {
  plugin: Plugin;
  guildId: string;
  onChanged: () => void;
  onConfigure: (name: string) => void;
  onError: (error: unknown) => void;
}

export const PluginCard = ({
  plugin,
  guildId,
  onChanged,
  onConfigure,
  onError,
}: PluginCardProps) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (plugin.enabled) await api.disable(guildId, plugin.name);
      else await api.enable(guildId, plugin.name);
      onChanged();
    } catch (error) {
      onError(error);
      setMessage(apiErrorMessage(error));
      if (error instanceof ApiRequestError && REFUSALS_NEEDING_RELOAD.has(error.reason ?? '')) {
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const label = plugin.enabled
    ? t('plugin.disable', { name: plugin.name })
    : t('plugin.enable', { name: plugin.name });

  return (
    <article className="card">
      <div className="card-head">
        <strong>{plugin.name}</strong>
        {plugin.alwaysEnabled ? (
          <span className="muted small">{t('plugin.alwaysEnabled')}</span>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={plugin.enabled}
            aria-label={label}
            className={plugin.enabled ? 'switch on' : 'switch'}
            disabled={busy}
            onClick={() => void toggle()}
          />
        )}
      </div>
      <p className="muted small">{plugin.description ?? t('plugin.noDescription')}</p>
      {message ? <p className="inline-error small">{message}</p> : null}
      {Object.keys(plugin.schema).length > 0 ? (
        <button type="button" className="link" onClick={() => onConfigure(plugin.name)}>
          {t('plugin.configure')}
        </button>
      ) : null}
    </article>
  );
};
