import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { apiErrorMessage } from '../api/errors';
import type { ErrorLogEntry } from '../api/types';
import { useT } from '../i18n';

interface ErrorDrawerProps {
  onClose: () => void;
  onError: (error: unknown) => void;
}

/**
 * Tiroir réservé au propriétaire du bot (voir `user.owner` dans TopBar).
 * Charge lui-même son contenu à l'ouverture, contrairement à ConfigDrawer
 * qui reçoit ses données en props : il n'y a ici aucun état de la grille
 * dont il faudrait dépendre.
 */
export const ErrorDrawer = ({ onClose, onError }: ErrorDrawerProps) => {
  const t = useT();
  const [entries, setEntries] = useState<ErrorLogEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { entries: list } = await api.errors();
      setEntries(list);
    } catch (error) {
      onError(error);
      setMessage(apiErrorMessage(error, t));
    }
  }, [onError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const purge = async () => {
    setBusy(true);
    try {
      await api.purgeErrors();
      // Recharge plutôt que de vider localement : c'est l'état réel du
      // serveur qui doit s'afficher, pas une supposition côté client.
      await load();
    } catch (error) {
      onError(error);
      setMessage(apiErrorMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="drawer" aria-label={t('errorDrawer.title')}>
      <div className="drawer-head">
        <strong>{t('errorDrawer.title')}</strong>
        <button type="button" className="ghost" onClick={onClose}>
          {t('drawer.close')}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="small">{t('errorDrawer.empty')}</p>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} className="error-entry">
            <p className="small">{entry.timestamp}</p>
            <p>{entry.message}</p>
            {typeof entry.context?.plugin === 'string' ? (
              <p className="small">{t('errorDrawer.plugin', { plugin: entry.context.plugin })}</p>
            ) : null}
            {typeof entry.context?.errorId === 'string' ? (
              <p className="small">
                {t('errorDrawer.errorId', { errorId: entry.context.errorId })}
              </p>
            ) : null}
            {typeof entry.context?.stack === 'string' ? (
              <details>
                <summary>{t('errorDrawer.stack')}</summary>
                <pre>{entry.context.stack}</pre>
              </details>
            ) : null}
          </div>
        ))
      )}

      {message ? <p className="error">{message}</p> : null}

      <button type="button" className="primary" disabled={busy} onClick={() => void purge()}>
        {t('errorDrawer.purge')}
      </button>
    </aside>
  );
};
