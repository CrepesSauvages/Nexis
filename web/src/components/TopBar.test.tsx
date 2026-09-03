import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopBar } from './TopBar';
import type { Guild, SessionUser } from '../api/types';

const user: SessionUser = { id: 'u1', username: 'thomas', avatar: null, guilds: [] };
const guilds: Guild[] = [
  { id: 'g1', name: 'Serveur un', icon: null },
  { id: 'g2', name: 'Serveur deux', icon: null },
];

const props = {
  user,
  guilds,
  guildId: 'g1',
  locale: 'fr',
  onGuildChange: vi.fn(),
  onLocaleChange: vi.fn(),
  onLogout: vi.fn(),
};

describe('TopBar', () => {
  it("devrait afficher le nom de l'utilisateur", () => {
    render(<TopBar {...props} />);
    expect(screen.getByText('thomas')).toBeInTheDocument();
  });

  it('devrait remonter le serveur choisi', async () => {
    const onGuildChange = vi.fn();
    render(<TopBar {...props} onGuildChange={onGuildChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Serveur' }), 'g2');
    expect(onGuildChange).toHaveBeenCalledWith('g2');
  });

  it('devrait remonter la déconnexion', async () => {
    const onLogout = vi.fn();
    render(<TopBar {...props} onLogout={onLogout} />);
    await userEvent.click(screen.getByRole('button', { name: 'Déconnexion' }));
    expect(onLogout).toHaveBeenCalled();
  });
});
