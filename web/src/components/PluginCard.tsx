import { useState } from 'react';
import { api, ApiRequestError } from '../api/client';
import type { Plugin } from '../api/types';
import { t } from '../strings';
import type { StringKey } from '../strings';

/** Les cinq motifs de refus que `plugin-admin` peut rendre. */
const REFUSALS = new Set([
  'not_found',
  'always_enabled',
  'already_enabled',
  'missing_deps',
  'has_dependents',
]);

/**
 * Traduit une erreur d'activation en un texte à nous. Le champ `error` de
 * l'API n'est affiché qu'en dernier recours : c'est `reason` qui est fait
 * pour être aiguillé.
 */
const refusalMessage = (error: unknown): string => {
  if (!(error instanceof ApiRequestError)) return t('error.generic');
  if (error.reason && REFUSALS.has(error.reason)) {
    return t(`refusal.${error.reason}` as StringKey, { deps: (error.deps ?? []).join(', ') });
  }
  if (error.errorId) return t('error.withId', { errorId: error.errorId });
  return t('error.generic');
};

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
      setMessage(refusalMessage(error));
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
      {message ? <p className="error small">{message}</p> : null}
      {Object.keys(plugin.schema).length > 0 ? (
        <button type="button" className="link" onClick={() => onConfigure(plugin.name)}>
          {t('plugin.configure')}
        </button>
      ) : null}
    </article>
  );
};
