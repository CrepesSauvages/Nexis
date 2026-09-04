import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { api } from './api/client';
import type { Plugin } from './api/types';

// Séparé de App.test.tsx : ces deux scénarios (tiroir réutilisé entre deux
// plugins, rechargement périmé après un changement de serveur) portent
// chacun leurs propres mocks détaillés, et App.test.tsx dépassait déjà
// confortablement les 300 lignes sans eux.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App — instances et courses', () => {
  it("ne devrait pas transmettre les modifications en attente d'un plugin à un autre", async () => {
    // La grille reste cliquable à côté du tiroir : passer d'un plugin à
    // l'autre sans fermer le tiroir réutiliserait la même instance et lui
    // ferait porter les modifications encore en attente du premier plugin.
    window.history.replaceState({}, '', '/');
    vi.spyOn(api, 'me').mockResolvedValue({
      id: 'u1',
      username: 'thomas',
      avatar: null,
      guilds: [],
    });
    vi.spyOn(api, 'guilds').mockResolvedValue([{ id: 'g1', name: 'Serveur un', icon: null }]);
    vi.spyOn(api, 'locale').mockResolvedValue({ locale: null });
    vi.spyOn(api, 'resources').mockResolvedValue({ channels: [], roles: [] });
    vi.spyOn(api, 'plugins').mockResolvedValue([
      {
        name: 'alpha',
        version: '1.0.0',
        description: null,
        dependsOn: [],
        alwaysEnabled: false,
        enabled: true,
        schema: { greeting: { type: 'string', label: 'Salutation' } },
        config: { greeting: 'Bonjour alpha' },
      },
      {
        name: 'beta',
        version: '1.0.0',
        description: null,
        dependsOn: [],
        alwaysEnabled: false,
        enabled: true,
        schema: { greeting: { type: 'string', label: 'Salutation' } },
        config: { greeting: 'Bonjour beta' },
      },
    ]);

    render(<App />);
    const [configureAlpha, configureBeta] = await screen.findAllByRole('button', {
      name: 'Configurer',
    });

    await userEvent.click(configureAlpha);
    const field = screen.getByLabelText('Salutation');
    expect(field).toHaveValue('Bonjour alpha');
    await userEvent.clear(field);
    await userEvent.type(field, 'Modifié');
    expect(field).toHaveValue('Modifié');

    await userEvent.click(configureBeta);
    expect(screen.getByLabelText('Salutation')).toHaveValue('Bonjour beta');
  });

  it("devrait ignorer le rechargement périmé du serveur quitté pendant qu'il était en vol", async () => {
    // reloadPlugins() n'a pas d'effet dont le nettoyage pourrait l'annuler :
    // sans garde, un rechargement du premier serveur qui revient après avoir
    // changé de serveur écraserait la liste du second avec celle du premier.
    window.history.replaceState({}, '', '/');
    vi.spyOn(api, 'me').mockResolvedValue({
      id: 'u1',
      username: 'thomas',
      avatar: null,
      guilds: [],
    });
    vi.spyOn(api, 'guilds').mockResolvedValue([
      { id: 'g1', name: 'Serveur un', icon: null },
      { id: 'g2', name: 'Serveur deux', icon: null },
    ]);
    vi.spyOn(api, 'locale').mockResolvedValue({ locale: null });
    vi.spyOn(api, 'resources').mockResolvedValue({ channels: [], roles: [] });

    const alpha: Plugin = {
      name: 'alpha',
      version: '1.0.0',
      description: null,
      dependsOn: [],
      alwaysEnabled: false,
      enabled: false,
      schema: {},
      config: {},
    };
    const beta: Plugin = {
      name: 'beta',
      version: '1.0.0',
      description: null,
      dependsOn: [],
      alwaysEnabled: false,
      enabled: false,
      schema: {},
      config: {},
    };

    let releaseStaleReload = () => {};
    const staleReload = new Promise<Plugin[]>((resolve) => {
      releaseStaleReload = () => resolve([alpha]);
    });
    let g1Calls = 0;
    vi.spyOn(api, 'plugins').mockImplementation((guildId) => {
      if (guildId === 'g1') {
        g1Calls += 1;
        // Premier appel : le chargement initial. Deuxième : le rechargement
        // déclenché par l'activation ci-dessous, délibérément tenu en vol.
        return g1Calls === 1 ? Promise.resolve([alpha]) : staleReload;
      }
      return Promise.resolve([beta]);
    });
    vi.spyOn(api, 'enable').mockResolvedValue(undefined);

    render(<App />);
    expect(await screen.findByText('alpha')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Activer alpha' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Serveur' }), 'g2');
    expect(await screen.findByText('beta')).toBeInTheDocument();

    await act(async () => {
      releaseStaleReload();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
  });
});
