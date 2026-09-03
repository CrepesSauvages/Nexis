import type { Plugin } from '../api/types';
import { PluginCard } from './PluginCard';

interface PluginGridProps {
  plugins: Plugin[];
  guildId: string;
  onChanged: () => void;
  onConfigure: (name: string) => void;
  onError: (error: unknown) => void;
}

export const PluginGrid = ({
  plugins,
  guildId,
  onChanged,
  onConfigure,
  onError,
}: PluginGridProps) => (
  <div className="grid">
    {plugins.map((plugin) => (
      <PluginCard
        key={plugin.name}
        plugin={plugin}
        guildId={guildId}
        onChanged={onChanged}
        onConfigure={onConfigure}
        onError={onError}
      />
    ))}
  </div>
);
