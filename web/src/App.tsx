import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiRequestError } from './api/client';
import type { Guild, GuildResources, Plugin, SessionUser } from './api/types';
import { ConfigDrawer } from './components/ConfigDrawer';
import { LoginScreen } from './components/LoginScreen';
import { PluginGrid } from './components/PluginGrid';
import { TopBar } from './components/TopBar';
import { t } from './strings';

type Phase = 'loading' | 'anonymous' | 'ready' | 'error';

/** Le serveur nommé par `?guild=`, s'il figure dans la liste. */
const guildFromQuery = (guilds: Guild[]): string | null => {
  const wanted = new URLSearchParams(window.location.search).get('guild');
  return wanted && guilds.some((guild) => guild.id === wanted) ? wanted : null;
};

export const App = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildId, setGuildId] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [resources, setResources] = useState<GuildResources>({ channels: [], roles: [] });
  const [locale, setLocale] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Message affiché quand un tiroir de configuration se ferme sur un état
  // périmé (le plugin a disparu entre l'affichage et la soumission).
  const [notice, setNotice] = useState<string | null>(null);

  // Dernier serveur choisi, lu après un `await` : `reloadPlugins` et
  // `changeLocale` n'ont pas d'effet dont le nettoyage pourrait les annuler
  // (contrairement aux deux `useEffect` ci-dessous), donc si le serveur a
  // changé pendant leur appel réseau, leurs résultats ne doivent pas
  // s'appliquer à l'état affiché.
  const guildIdRef = useRef(guildId);
  guildIdRef.current = guildId;

  /**
   * Toute erreur d'appel passe par ici. Un 401 signifie que la session a
   * expiré ou a été détruite : l'application repart de l'écran de connexion
   * plutôt que d'afficher une grille qu'aucun appel ne pourra plus alimenter.
   * Toute autre erreur (réseau, 5xx…) n'indique rien sur la session : c'est
   * à l'appelant de décider quoi en faire.
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
        setGuildId(guildFromQuery(list) ?? list[0]?.id ?? null);
        setPhase('ready');
      } catch (error) {
        if (cancelled) return;
        // Un échec réseau brut (pas de statut HTTP) n'est pas une session
        // expirée : afficher l'écran de connexion inviterait à cliquer sur
        // un lien qui échouerait de la même façon. On distingue donc les
        // deux avec une phase dédiée.
        if (!handleError(error)) setPhase('error');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [handleError]);

  useEffect(() => {
    if (!guildId) return undefined;
    let cancelled = false;
    // Le chemin reste « / » : seule la query change, donc aucun repli SPA
    // n'est nécessaire côté serveur, et recharger conserve le serveur.
    window.history.replaceState({}, '', `/?guild=${encodeURIComponent(guildId)}`);

    // Les données d'un serveur ne doivent jamais rester affichées sous le nom
    // d'un autre : on efface tout avant de charger, pendant que la requête
    // est en vol et si elle échoue.
    setPlugins([]);
    setLocale(null);
    setResources({ channels: [], roles: [] });
    setLoadFailed(false);
    setNotice(null);

    const load = async () => {
      try {
        const [list, saved, guildResources] = await Promise.all([
          api.plugins(guildId),
          api.locale(guildId),
          api.resources(guildId),
        ]);
        if (cancelled) return;
        setPlugins(list);
        setLocale(saved.locale);
        setResources(guildResources);
      } catch (error) {
        if (cancelled) return;
        // Un 401 route déjà vers l'écran de connexion : pas besoin d'en plus
        // signaler l'échec de ce chargement, qui ne se reproduira jamais tel
        // quel une fois reconnecté.
        if (!handleError(error)) setLoadFailed(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [guildId, handleError]);

  const changeLocale = async (next: string) => {
    if (!guildId || next === '') return;
    const requestedGuildId = guildId;
    try {
      await api.setLocale(guildId, next);
      if (guildIdRef.current !== requestedGuildId) return;
      setLocale(next);
      // Les libellés du schéma sont traduits par l'API dans la langue du
      // serveur : changer de langue périme la liste des plugins.
      const list = await api.plugins(guildId);
      if (guildIdRef.current !== requestedGuildId) return;
      setPlugins(list);
    } catch (error) {
      if (guildIdRef.current !== requestedGuildId) return;
      handleError(error);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      // Une déconnexion qui échoue ne doit pas retenir l'utilisateur sur une
      // interface qu'il quitte : on repart de l'écran de connexion.
      handleError(error);
    }
    setUser(null);
    setPhase('anonymous');
  };

  const reloadPlugins = async () => {
    if (!guildId) return;
    const requestedGuildId = guildId;
    try {
      const list = await api.plugins(guildId);
      if (guildIdRef.current !== requestedGuildId) return;
      setPlugins(list);
    } catch (error) {
      if (guildIdRef.current !== requestedGuildId) return;
      handleError(error);
    }
  };

  if (phase === 'loading') return <div className="centered">{t('app.loading')}</div>;

  if (phase === 'error') {
    return (
      <div className="centered">
        <h1>{t('app.error.title')}</h1>
        <p className="muted">{t('app.error.body')}</p>
      </div>
    );
  }

  if (phase === 'anonymous' || !user) return <LoginScreen />;

  if (guilds.length === 0 || !guildId) {
    return (
      <div className="centered">
        <h1>{t('guilds.none.title')}</h1>
        <p className="muted">{t('guilds.none.body')}</p>
      </div>
    );
  }

  return (
    <>
      <TopBar
        user={user}
        guilds={guilds}
        guildId={guildId}
        locale={locale}
        onGuildChange={setGuildId}
        onLocaleChange={(next) => void changeLocale(next)}
        onLogout={() => void logout()}
      />
      {loadFailed ? <p className="error">{t('guild.loadFailed')}</p> : null}
      {notice ? <p className="error">{notice}</p> : null}
      <main className="content">
        <PluginGrid
          plugins={plugins}
          guildId={guildId}
          onChanged={() => void reloadPlugins()}
          onConfigure={(name) => {
            // Un tiroir qui s'ouvre laisse derrière lui l'état périmé d'un
            // précédent tiroir : la bannière n'a plus rien à signaler.
            setNotice(null);
            setConfiguring(name);
          }}
          onError={handleError}
        />
      </main>
      {configuring
        ? (() => {
            const plugin = plugins.find((entry) => entry.name === configuring);
            return plugin ? (
              <ConfigDrawer
                // Une instance par plugin : sans cela, ouvrir un second
                // plugin réutiliserait l'instance du premier et lui
                // transmettrait ses modifications en attente.
                key={plugin.name}
                plugin={plugin}
                guildId={guildId}
                resources={resources}
                onClose={() => setConfiguring(null)}
                onSaved={() => void reloadPlugins()}
                onStale={() => {
                  setNotice(t('drawer.stale'));
                  void reloadPlugins();
                }}
                onError={handleError}
              />
            ) : null;
          })()
        : null}
    </>
  );
};
