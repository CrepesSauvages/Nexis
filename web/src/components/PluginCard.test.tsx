import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PluginCard } from './PluginCard';
import { api, ApiRequestError } from '../api/client';
import type { Plugin } from '../api/types';

const plugin: Plugin = {
  name: 'moderation',
  version: '1.0.0',
  description: 'Sanctions et journalisation',
  dependsOn: [],
  alwaysEnabled: false,
  enabled: false,
  schema: {},
  config: {},
};

const props = { guildId: 'g1', onChanged: vi.fn(), onConfigure: vi.fn(), onError: vi.fn() };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PluginCard', () => {
  it("devrait appeler l'activation quand le plugin est éteint", async () => {
    const enable = vi.spyOn(api, 'enable').mockResolvedValue(undefined);
    render(<PluginCard {...props} plugin={plugin} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Activer moderation' }));
    expect(enable).toHaveBeenCalledWith('g1', 'moderation');
  });

  it('devrait appeler la désactivation quand le plugin est allumé', async () => {
    const disable = vi.spyOn(api, 'disable').mockResolvedValue(undefined);
    render(<PluginCard {...props} plugin={{ ...plugin, enabled: true }} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Désactiver moderation' }));
    expect(disable).toHaveBeenCalledWith('g1', 'moderation');
  });

  it('devrait recharger la liste après une activation réussie', async () => {
    vi.spyOn(api, 'enable').mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<PluginCard {...props} onChanged={onChanged} plugin={plugin} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Activer moderation' }));
    expect(onChanged).toHaveBeenCalled();
  });

  it("devrait désactiver l'interrupteur pendant l'appel", async () => {
    let release = () => {};
    vi.spyOn(api, 'enable').mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    render(<PluginCard {...props} plugin={plugin} />);
    const toggle = screen.getByRole('switch', { name: 'Activer moderation' });
    await userEvent.click(toggle);
    expect(toggle).toBeDisabled();
    release();
    await waitFor(() => expect(toggle).toBeEnabled());
  });

  it('devrait afficher les dépendances manquantes', async () => {
    vi.spyOn(api, 'enable').mockRejectedValue(
      new ApiRequestError(409, {
        error: 'Dépendances',
        reason: 'missing_deps',
        deps: ['core', 'utils'],
      }),
    );
    render(<PluginCard {...props} plugin={plugin} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Activer moderation' }));
    expect(await screen.findByText("Activez d'abord : core, utils")).toBeInTheDocument();
  });

  it("devrait afficher l'identifiant d'incident sur une erreur serveur", async () => {
    vi.spyOn(api, 'enable').mockRejectedValue(
      new ApiRequestError(500, { error: 'Erreur interne', errorId: 'a1b2c3' }),
    );
    render(<PluginCard {...props} plugin={plugin} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Activer moderation' }));
    expect(await screen.findByText(/a1b2c3/)).toBeInTheDocument();
  });

  it("devrait ne pas offrir d'interrupteur sur un plugin toujours actif", () => {
    render(<PluginCard {...props} plugin={{ ...plugin, alwaysEnabled: true, enabled: true }} />);
    expect(screen.queryByRole('switch', { name: /moderation/ })).not.toBeInTheDocument();
    expect(screen.getByText('Toujours actif')).toBeInTheDocument();
  });

  it('devrait remonter la demande de configuration', async () => {
    const onConfigure = vi.fn();
    render(
      <PluginCard
        {...props}
        onConfigure={onConfigure}
        plugin={{ ...plugin, schema: { logs: { type: 'string', label: 'Journal' } } }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Configurer' }));
    expect(onConfigure).toHaveBeenCalledWith('moderation');
  });

  it('devrait ne pas offrir « Configurer » à un plugin sans schéma', () => {
    render(<PluginCard {...props} plugin={plugin} />);
    expect(screen.queryByRole('button', { name: 'Configurer' })).not.toBeInTheDocument();
  });
});
