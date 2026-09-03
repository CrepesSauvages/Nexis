import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from './api/client';
import type { Guild, SessionUser } from './api/types';
import { LoginScreen } from './components/LoginScreen';
import { t } from './strings';

type Phase = 'loading' | 'anonymous' | 'ready';

export const App = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [guilds, setGuilds] = useState<Guild[]>([]);

  /**
   * Toute erreur d'appel passe par ici. Un 401 signifie que la session a
   * expiré ou a été détruite : l'application repart de l'écran de connexion
   * plutôt que d'afficher une grille qu'aucun appel ne pourra plus alimenter.
   */
  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiRequestError && error.status === 401) {
      setUser(null);
      setPhase('anonymous');
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const session = await api.me();
        const list = await api.guilds();
        if (cancelled) return;
        setUser(session);
        setGuilds(list);
        setPhase('ready');
      } catch (error) {
        if (cancelled) return;
        if (!handleError(error)) setPhase('ready');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [handleError]);

  if (phase === 'loading') return <div className="centered">{t('app.loading')}</div>;
  if (phase === 'anonymous' || !user) return <LoginScreen />;

  if (guilds.length === 0) {
    return (
      <div className="centered">
        <h1>{t('guilds.none.title')}</h1>
        <p className="muted">{t('guilds.none.body')}</p>
      </div>
    );
  }

  return <div className="centered">{t('app.title')}</div>;
};
