import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionsDrawer } from './PermissionsDrawer';
import { api } from '../api/client';
import type { CommandPermission, Role } from '../api/types';

const roles: Role[] = [
  { id: 'r1', name: 'Modération', color: '#5865f2' },
  { id: 'r2', name: 'Membre', color: '#000000' },
];

const command = (overrides: Partial<CommandPermission> = {}): CommandPermission => ({
  name: 'purge',
  plugin: 'moderation',
  declared: 'guild-admin',
  roles: null,
  ...overrides,
});

const props = {
  guildId: 'g1',
  roles,
  onClose: vi.fn(),
  onError: vi.fn(),
};

/** Monte le tiroir avec la liste de commandes rendue par l'API. */
const mount = async (commands: CommandPermission[]) => {
  vi.spyOn(api, 'permissions').mockResolvedValue({ commands });
  render(<PermissionsDrawer {...props} />);
  if (commands.length) await screen.findByText(commands[0].name);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PermissionsDrawer', () => {
  it("devrait charger les commandes à l'ouverture", async () => {
    await mount([command()]);
    expect(screen.getByText('purge')).toBeInTheDocument();
    expect(screen.getByText('moderation')).toBeInTheDocument();
  });

  it('devrait annoncer le niveau déclaré par le plugin', async () => {
    await mount([command()]);
    expect(screen.getByText('Par défaut : gestion du serveur')).toBeInTheDocument();
  });

  it("devrait annoncer qu'une commande sans niveau est ouverte à tous", async () => {
    await mount([command({ declared: null })]);
    expect(screen.getByText('Par défaut : tout le monde')).toBeInTheDocument();
  });

  it('devrait afficher « niveau déclaré » quand aucune liste n’existe', async () => {
    await mount([command()]);
    expect(screen.getByText('Niveau déclaré')).toBeInTheDocument();
  });

  it('devrait annoncer une liste vide comme réservée aux administrateurs', async () => {
    await mount([command({ roles: [] })]);
    expect(screen.getByText('Administrateurs uniquement')).toBeInTheDocument();
  });

  it('devrait compter les rôles autorisés', async () => {
    await mount([command({ roles: ['r1'] })]);
    expect(screen.getByText('1 rôle(s) autorisé(s)')).toBeInTheDocument();
  });

  it('devrait cocher les rôles déjà autorisés', async () => {
    await mount([command({ roles: ['r1'] })]);
    expect(screen.getByLabelText('Modération')).toBeChecked();
    expect(screen.getByLabelText('Membre')).not.toBeChecked();
  });

  it('devrait enregistrer la liste cochée', async () => {
    const save = vi.spyOn(api, 'setPermissions').mockResolvedValue(undefined);
    await mount([command()]);

    await userEvent.click(screen.getByLabelText('Modération'));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(save).toHaveBeenCalledWith('g1', 'purge', ['r1']);
  });

  it('devrait décocher un rôle déjà autorisé', async () => {
    const save = vi.spyOn(api, 'setPermissions').mockResolvedValue(undefined);
    await mount([command({ roles: ['r1', 'r2'] })]);

    await userEvent.click(screen.getByLabelText('Membre'));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(save).toHaveBeenCalledWith('g1', 'purge', ['r1']);
  });

  it('devrait rendre la commande à son niveau déclaré', async () => {
    const save = vi.spyOn(api, 'setPermissions').mockResolvedValue(undefined);
    await mount([command({ roles: ['r1'] })]);

    await userEvent.click(screen.getByRole('button', { name: 'Rendre au niveau déclaré' }));

    expect(save).toHaveBeenCalledWith('g1', 'purge', null);
  });

  it("ne devrait pas proposer de retour au défaut quand il n'y a pas de liste", async () => {
    await mount([command()]);
    expect(screen.getByRole('button', { name: 'Rendre au niveau déclaré' })).toBeDisabled();
  });

  it("devrait relire l'état du serveur après enregistrement", async () => {
    const load = vi.spyOn(api, 'permissions').mockResolvedValue({ commands: [command()] });
    vi.spyOn(api, 'setPermissions').mockResolvedValue(undefined);
    render(<PermissionsDrawer {...props} />);
    await screen.findByText('purge');

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    // Un rechargement, jamais une supposition locale : c'est l'état réel
    // qui doit s'afficher.
    expect(load).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Permissions enregistrées.')).toBeInTheDocument();
  });

  it('ne devrait rien offrir à cocher sur une commande de propriétaire', async () => {
    await mount([command({ declared: 'owner' })]);

    expect(
      screen.getByText('Ces permissions ne se délèguent pas à un serveur.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Modération')).not.toBeInTheDocument();
  });

  it('devrait signaler un serveur sans aucun rôle', async () => {
    vi.spyOn(api, 'permissions').mockResolvedValue({ commands: [command()] });
    render(<PermissionsDrawer {...props} roles={[]} />);
    await screen.findByText('purge');

    expect(screen.getByText('Ce serveur n’a aucun rôle à autoriser.')).toBeInTheDocument();
  });

  it("devrait annoncer l'absence de commande", async () => {
    await mount([]);
    expect(await screen.findByText('Aucune commande déclarée sur ce serveur.')).toBeInTheDocument();
  });

  it("devrait signaler un échec d'enregistrement sans masquer l'erreur", async () => {
    const onError = vi.fn();
    vi.spyOn(api, 'permissions').mockResolvedValue({ commands: [command()] });
    vi.spyOn(api, 'setPermissions').mockRejectedValue(new Error('réseau'));
    render(<PermissionsDrawer {...props} onError={onError} />);
    await screen.findByText('purge');

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(onError).toHaveBeenCalled();
    expect(await screen.findByText('Une erreur est survenue.')).toBeInTheDocument();
  });
});
