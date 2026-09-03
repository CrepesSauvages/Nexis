import type { Guild } from '../api/types';
import { t } from '../strings';

interface GuildPickerProps {
  guilds: Guild[];
  guildId: string;
  onChange: (guildId: string) => void;
}

export const GuildPicker = ({ guilds, guildId, onChange }: GuildPickerProps) => (
  <label className="picker">
    <span className="visually-hidden">{t('topbar.guild')}</span>
    <select
      aria-label={t('topbar.guild')}
      value={guildId}
      onChange={(event) => onChange(event.target.value)}
    >
      {guilds.map((guild) => (
        <option key={guild.id} value={guild.id}>
          {guild.name}
        </option>
      ))}
    </select>
  </label>
);
