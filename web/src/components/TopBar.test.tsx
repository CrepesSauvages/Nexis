import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopBar } from './TopBar';
import type { Guild, SessionUser } from '../api/types';

const user: SessionUser = { id: 'u1', username: 'thomas', avatar: null, owner: false, guilds: [] };
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
  onOpenErrors: vi.fn(),
  onOpenPermissions: vi.fn(),
  onOpenAudit: vi.fn(),
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

  it("devrait n'afficher aucun bouton de journal d'erreurs pour un non-propriétaire", () => {
    render(<TopBar {...props} user={{ ...user, owner: false }} />);
    expect(screen.queryByRole('button', { name: "Journal d'erreurs" })).not.toBeInTheDocument();
  });

  it("devrait afficher le bouton du journal d'erreurs pour le propriétaire", async () => {
    const onOpenErrors = vi.fn();
    render(<TopBar {...props} user={{ ...user, owner: true }} onOpenErrors={onOpenErrors} />);
    await userEvent.click(screen.getByRole('button', { name: "Journal d'erreurs" }));
    expect(onOpenErrors).toHaveBeenCalled();
  });

  it('devrait ouvrir les permissions', async () => {
    const onOpenPermissions = vi.fn();
    render(<TopBar {...props} onOpenPermissions={onOpenPermissions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Permissions' }));
    expect(onOpenPermissions).toHaveBeenCalled();
  });

  it('devrait ouvrir le journal des changements', async () => {
    const onOpenAudit = vi.fn();
    render(<TopBar {...props} onOpenAudit={onOpenAudit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Journal' }));
    expect(onOpenAudit).toHaveBeenCalled();
  });

  it('devrait offrir permissions et journal à un non-propriétaire', () => {
    // Leurs endpoints demandent « Gérer le serveur » sur le serveur affiché,
    // pas d'être propriétaire du bot : les réserver serait une restriction
    // que le serveur ne fait pas.
    render(<TopBar {...props} user={{ ...user, owner: false }} />);
    expect(screen.getByRole('button', { name: 'Permissions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Journal' })).toBeInTheDocument();
  });
});
