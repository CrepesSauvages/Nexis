import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { apiErrorMessage } from '../api/errors';
import type { AuditEntry } from '../api/types';
import { useT } from '../i18n';

interface AuditDrawerProps {
  guildId: string;
  onClose: () => void;
  onError: (error: unknown) => void;
}

/**
 * Journal des changements d'administration du serveur. En lecture seule :
 * un journal qu'on peut modifier depuis l'interface qu'il surveille ne
 * prouve plus grand-chose — même raison pour laquelle il n'offre pas de
 * purge, contrairement au journal d'erreurs.
 */
export const AuditDrawer = ({ guildId, onClose, onError }: AuditDrawerProps) => {
  const t = useT();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { entries: list } = await api.audit(guildId);
      setEntries(list);
    } catch (error) {
      onError(error);
      setMessage(apiErrorMessage(error, t));
    }
  }, [guildId, onError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <aside className="drawer" aria-label={t('auditDrawer.title')}>
      <div className="drawer-head">
        <strong>{t('auditDrawer.title')}</strong>
        <button type="button" className="ghost" onClick={onClose}>
          {t('drawer.close')}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="small">{t('auditDrawer.empty')}</p>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} className="error-entry">
            <p className="small">{entry.timestamp}</p>
            <p>
              <code>{entry.action}</code> {entry.target}
            </p>
            {/* L'identifiant Discord brut : le dashboard ne connaît que
                l'auteur de la session en cours, pas les autres. */}
            <p className="small">{t('auditDrawer.actor', { actor: entry.actor })}</p>
            {entry.details ? (
              <details>
                <summary>{t('auditDrawer.details')}</summary>
                <pre>{JSON.stringify(entry.details, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ))
      )}

      {message ? <p className="error">{message}</p> : null}
    </aside>
  );
};
