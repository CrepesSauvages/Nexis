import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorDrawer } from './ErrorDrawer';
import { api } from '../api/client';
import type { ErrorLogEntry } from '../api/types';

const entryWithStack: ErrorLogEntry = {
  id: 'e1',
  timestamp: '2026-01-01T00:00:00.000Z',
  message: 'boum',
  context: { plugin: 'moderation', errorId: 'e1', stack: 'Error: boum\n at x' },
};

const props = {
  onClose: vi.fn(),
  onError: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorDrawer', () => {
  it("devrait charger et afficher les entrées à l'ouverture", async () => {
    vi.spyOn(api, 'errors').mockResolvedValue({ entries: [entryWithStack] });
    render(<ErrorDrawer {...props} />);
    expect(await screen.findByText('boum')).toBeInTheDocument();
    expect(screen.getByText('Plugin : moderation')).toBeInTheDocument();
    expect(screen.getByText('Identifiant : e1')).toBeInTheDocument();
  });

  it('devrait afficher un message quand le journal est vide', async () => {
    vi.spyOn(api, 'errors').mockResolvedValue({ entries: [] });
    render(<ErrorDrawer {...props} />);
    expect(await screen.findByText('Aucune erreur enregistrée.')).toBeInTheDocument();
  });

  it("devrait garder la trace repliée jusqu'à ce qu'on l'ouvre", async () => {
    vi.spyOn(api, 'errors').mockResolvedValue({ entries: [entryWithStack] });
    const { container } = render(<ErrorDrawer {...props} />);
    await screen.findByText('boum');
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    await userEvent.click(screen.getByText('Trace complète'));
    expect(details?.open).toBe(true);
  });

  it('devrait remonter la fermeture', async () => {
    const onClose = vi.fn();
    vi.spyOn(api, 'errors').mockResolvedValue({ entries: [] });
    render(<ErrorDrawer {...props} onClose={onClose} />);
    await screen.findByText('Aucune erreur enregistrée.');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('devrait vider la liste affichée après une purge', async () => {
    const errors = vi
      .spyOn(api, 'errors')
      .mockResolvedValueOnce({ entries: [entryWithStack] })
      .mockResolvedValueOnce({ entries: [] });
    const purge = vi.spyOn(api, 'purgeErrors').mockResolvedValue(undefined);

    render(<ErrorDrawer {...props} />);
    await screen.findByText('boum');

    await userEvent.click(screen.getByRole('button', { name: 'Purger le journal' }));

    expect(purge).toHaveBeenCalled();
    expect(await screen.findByText('Aucune erreur enregistrée.')).toBeInTheDocument();
    expect(errors).toHaveBeenCalledTimes(2);
  });
});
