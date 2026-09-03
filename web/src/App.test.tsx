import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
