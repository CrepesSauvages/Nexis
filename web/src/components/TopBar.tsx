import type { Guild, SessionUser } from '../api/types';
import { GuildPicker } from './GuildPicker';
import { LocalePicker } from './LocalePicker';
import { InterfaceLocalePicker } from './InterfaceLocalePicker';
import { useT } from '../i18n';

interface TopBarProps {
  user: SessionUser;
  guilds: Guild[];
  guildId: string;
  locale: string | null;
  onGuildChange: (guildId: string) => void;
  onLocaleChange: (locale: string) => void;
  onLogout: () => void;
  onOpenErrors: () => void;
  onOpenPermissions: () => void;
  onOpenAudit: () => void;
}

export const TopBar = ({
  user,
  guilds,
  guildId,
  locale,
  onGuildChange,
  onLocaleChange,
  onLogout,
  onOpenErrors,
  onOpenPermissions,
  onOpenAudit,
}: TopBarProps) => {
  const t = useT();
  return (
    <header className="topbar">
      <strong>{t('app.title')}</strong>
      <GuildPicker guilds={guilds} guildId={guildId} onChange={onGuildChange} />
      <LocalePicker locale={locale} onChange={onLocaleChange} />
      {/* Groupe de droite : la langue de lecture de l'administrateur, puis
          son identité — à l'opposé des contrôles côté serveur ci-dessus, pour
          qu'aucune des deux langues ne se confonde avec l'autre. */}
      <div className="topbar-right">
        <InterfaceLocalePicker />
        <span className="topbar-user">
          {user.avatar ? (
            <img
              className="avatar"
              src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`}
              alt=""
              // Un bot auto-hébergé sans accès sortant n'atteint pas le CDN de
              // Discord : l'image disparaît et les initiales prennent le relais.
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : null}
          {user.username}
        </span>
        {/* Ces deux-là ne sont pas réservés au propriétaire : leurs endpoints
            demandent « Gérer le serveur » sur le serveur affiché, et quiconque
            voit ce tableau de bord l'a déjà par construction. */}
        <button type="button" className="ghost" onClick={onOpenPermissions}>
          {t('topbar.permissions')}
        </button>
        <button type="button" className="ghost" onClick={onOpenAudit}>
          {t('topbar.audit')}
        </button>
        {/* Réservé au propriétaire du bot : `user.owner` reflète OWNER_ID,
            revérifié côté serveur par `resolveAuth` (auth.js) sur chaque
            appel aux endpoints `owner` — ce bouton n'est qu'un raccourci
            visuel, jamais la seule protection. */}
        {user.owner ? (
          <button type="button" className="ghost" onClick={onOpenErrors}>
            {t('topbar.errors')}
          </button>
        ) : null}
        <button type="button" className="ghost" onClick={onLogout}>
          {t('topbar.logout')}
        </button>
      </div>
    </header>
  );
};
