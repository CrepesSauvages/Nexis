import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { api, ApiRequestError } from './api/client';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it("devrait rendre l'écran de connexion quand la session est absente", async () => {
    vi.spyOn(api, 'me').mockRejectedValue(
      new ApiRequestError(401, { error: 'Authentification requise' }),
    );
    render(<App />);
    expect(
      await screen.findByRole('link', { name: 'Se connecter avec Discord' }),
    ).toBeInTheDocument();
  });

  it('devrait dépasser le chargement quand la session existe', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      id: 'u1',
      username: 'thomas',
      avatar: null,
      guilds: [],
    });
    vi.spyOn(api, 'guilds').mockResolvedValue([]);
    render(<App />);
    expect(
      await screen.findByText('Aucun serveur à administrer', { exact: false }),
    ).toBeInTheDocument();
  });

  it("devrait rendre l'écran de connexion sur un 401 tardif", async () => {
    // La session dure sept jours et peut être détruite : n'importe quel appel
    // peut rendre 401, et l'application doit alors revenir à la connexion.
    vi.spyOn(api, 'me').mockResolvedValue({
      id: 'u1',
      username: 'thomas',
      avatar: null,
      guilds: [],
    });
    vi.spyOn(api, 'guilds').mockRejectedValue(
      new ApiRequestError(401, { error: 'Authentification requise' }),
    );
    render(<App />);
    expect(
      await screen.findByRole('link', { name: 'Se connecter avec Discord' }),
    ).toBeInTheDocument();
  });

  it("devrait afficher un message d'erreur quand le serveur est injoignable", async () => {
    // Un échec réseau brut (pas de statut HTTP) ne doit jamais être confondu
    // avec une session expirée : contrairement au 401, il ne doit pas montrer
    // le bouton de connexion, qui échouerait à nouveau de la même façon.
    window.history.replaceState({}, '', '/');
    vi.spyOn(api, 'me').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<App />);
    expect(await screen.findByText('Impossible de joindre le tableau de bord')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Se connecter avec Discord' }),
    ).not.toBeInTheDocument();
  });

  it('devrait sélectionner le serveur nommé dans la query', async () => {
    window.history.replaceState({}, '', '/?guild=g2');
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
    vi.spyOn(api, 'plugins').mockResolvedValue([]);
    vi.spyOn(api, 'resources').mockResolvedValue({ channels: [], roles: [] });

    render(<App />);
    expect(await screen.findByRole('combobox', { name: 'Serveur' })).toHaveValue('g2');
  });

  it('devrait retomber sur le premier serveur si la query en nomme un inconnu', async () => {
    window.history.replaceState({}, '', '/?guild=inconnu');
    vi.spyOn(api, 'me').mockResolvedValue({
      id: 'u1',
      username: 'thomas',
      avatar: null,
      guilds: [],
    });
    vi.spyOn(api, 'guilds').mockResolvedValue([{ id: 'g1', name: 'Serveur un', icon: null }]);
    vi.spyOn(api, 'locale').mockResolvedValue({ locale: null });
    vi.spyOn(api, 'plugins').mockResolvedValue([]);
    vi.spyOn(api, 'resources').mockResolvedValue({ channels: [], roles: [] });

    render(<App />);
    expect(await screen.findByRole('combobox', { name: 'Serveur' })).toHaveValue('g1');
  });

  it('devrait refléter le serveur choisi dans la query', async () => {
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
    vi.spyOn(api, 'plugins').mockResolvedValue([]);
    vi.spyOn(api, 'resources').mockResolvedValue({ channels: [], roles: [] });

    render(<App />);
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Serveur' }), 'g2');
    // Recharger la page doit conserver le serveur, et le chemin doit rester
    // « / » — c'est ce qui évite tout repli SPA côté serveur.
    expect(window.location.search).toBe('?guild=g2');
    expect(window.location.pathname).toBe('/');
  });
});
