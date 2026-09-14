import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditDrawer } from './AuditDrawer';
import { api } from '../api/client';
import type { AuditEntry } from '../api/types';

const entry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'a1',
  timestamp: '2026-01-01T00:00:00.000Z',
  actor: '123456789012345678',
  action: 'plugin.enable',
  target: 'moderation',
  ...overrides,
});

const props = {
  guildId: 'g1',
  onClose: vi.fn(),
  onError: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuditDrawer', () => {
  it("devrait charger le journal du serveur à l'ouverture", async () => {
    const load = vi.spyOn(api, 'audit').mockResolvedValue({ entries: [entry()] });
    render(<AuditDrawer {...props} />);

    expect(await screen.findByText('plugin.enable')).toBeInTheDocument();
    expect(screen.getByText('moderation')).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith('g1');
  });

  it("devrait montrer l'auteur du changement", async () => {
    vi.spyOn(api, 'audit').mockResolvedValue({ entries: [entry()] });
    render(<AuditDrawer {...props} />);

    expect(await screen.findByText('Par 123456789012345678')).toBeInTheDocument();
  });

  it('devrait détailler une entrée qui porte des détails', async () => {
    vi.spyOn(api, 'audit').mockResolvedValue({
      entries: [entry({ action: 'config.update', details: { keys: ['greeting'] } })],
    });
    render(<AuditDrawer {...props} />);

    expect(await screen.findByText('Détail')).toBeInTheDocument();
    expect(screen.getByText(/greeting/)).toBeInTheDocument();
  });

  it("ne devrait pas proposer de détail quand il n'y en a pas", async () => {
    vi.spyOn(api, 'audit').mockResolvedValue({ entries: [entry()] });
    render(<AuditDrawer {...props} />);
    await screen.findByText('plugin.enable');

    expect(screen.queryByText('Détail')).not.toBeInTheDocument();
  });

  it('devrait annoncer un journal vide', async () => {
    vi.spyOn(api, 'audit').mockResolvedValue({ entries: [] });
    render(<AuditDrawer {...props} />);

    expect(
      await screen.findByText('Aucun changement enregistré sur ce serveur.'),
    ).toBeInTheDocument();
  });

  it("n'offre aucune purge : un journal modifiable depuis l'interface qu'il surveille ne prouve rien", async () => {
    vi.spyOn(api, 'audit').mockResolvedValue({ entries: [entry()] });
    render(<AuditDrawer {...props} />);
    await screen.findByText('plugin.enable');

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
  });

  it("devrait signaler un échec de chargement sans masquer l'erreur", async () => {
    const onError = vi.fn();
    vi.spyOn(api, 'audit').mockRejectedValue(new Error('réseau'));
    render(<AuditDrawer {...props} onError={onError} />);

    expect(await screen.findByText('Une erreur est survenue.')).toBeInTheDocument();
    expect(onError).toHaveBeenCalled();
  });
});
