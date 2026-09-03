import type { Guild, SessionUser } from '../api/types';
import { GuildPicker } from './GuildPicker';
import { LocalePicker } from './LocalePicker';
import { t } from '../strings';

interface TopBarProps {
  user: SessionUser;
  guilds: Guild[];
  guildId: string;
  locale: string | null;
  onGuildChange: (guildId: string) => void;
  onLocaleChange: (locale: string) => void;
  onLogout: () => void;
}

export const TopBar = ({
  user,
  guilds,
  guildId,
  locale,
  onGuildChange,
  onLocaleChange,
  onLogout,
}: TopBarProps) => (
  <header className="topbar">
    <strong>{t('app.title')}</strong>
    <GuildPicker guilds={guilds} guildId={guildId} onChange={onGuildChange} />
    <LocalePicker locale={locale} onChange={onLocaleChange} />
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
    <button type="button" className="ghost" onClick={onLogout}>
      {t('topbar.logout')}
    </button>
  </header>
);
