import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigDrawer } from './ConfigDrawer';
import { api, ApiRequestError } from '../api/client';
import type { Plugin } from '../api/types';

const plugin: Plugin = {
  name: 'moderation',
  version: '1.0.0',
  description: null,
  dependsOn: [],
  alwaysEnabled: false,
  enabled: true,
  schema: {
    greeting: { type: 'string', label: 'Salutation' },
    quota: { type: 'number', label: 'Quota' },
  },
  config: { greeting: 'Bonjour', quota: 5 },
};

const props = {
  plugin,
  guildId: 'g1',
  resources: { channels: [], roles: [] },
  onClose: vi.fn(),
  onSaved: vi.fn(),
  onStale: vi.fn(),
  onError: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConfigDrawer', () => {
  it('devrait afficher les valeurs en vigueur', () => {
    render(<ConfigDrawer {...props} />);
    expect(screen.getByLabelText('Salutation')).toHaveValue('Bonjour');
    expect(screen.getByLabelText('Quota')).toHaveValue(5);
  });

  it("devrait n'envoyer que les champs modifiés", async () => {
    // L'écriture est une fusion partielle : renvoyer les champs intouchés
    // ferait échouer la requête sur une valeur qu'on n'a pas voulu changer.
    const save = vi.spyOn(api, 'saveConfig').mockResolvedValue(undefined);
    render(<ConfigDrawer {...props} />);
    await userEvent.clear(screen.getByLabelText('Salutation'));
    await userEvent.type(screen.getByLabelText('Salutation'), 'Salut');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(save).toHaveBeenCalledWith('g1', 'moderation', { greeting: 'Salut' });
  });

  it("devrait n'envoyer aucune valeur si rien n'a changé", async () => {
    const save = vi.spyOn(api, 'saveConfig').mockResolvedValue(undefined);
    render(<ConfigDrawer {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(save).toHaveBeenCalledWith('g1', 'moderation', {});
  });

  it("devrait n'envoyer aucune valeur pour un champ modifié puis ramené à l'original", async () => {
    // Un champ ramené à sa valeur d'origine doit redevenir « non modifié » :
    // le renvoyer écraserait ce qu'un autre administrateur aurait changé
    // entretemps, exactement ce que la fusion partielle est censée éviter.
    const save = vi.spyOn(api, 'saveConfig').mockResolvedValue(undefined);
    render(<ConfigDrawer {...props} />);
    const field = screen.getByLabelText('Salutation');
    await userEvent.clear(field);
    await userEvent.type(field, 'Salut');
    await userEvent.clear(field);
    await userEvent.type(field, 'Bonjour');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(save).toHaveBeenCalledWith('g1', 'moderation', {});
  });

  it('devrait afficher un message de confirmation et laisser le tiroir ouvert après un enregistrement réussi', async () => {
    const onClose = vi.fn();
    vi.spyOn(api, 'saveConfig').mockResolvedValue(undefined);
    render(<ConfigDrawer {...props} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Configuration enregistrée.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('devrait marquer le champ fautif et lui seul', async () => {
    vi.spyOn(api, 'saveConfig').mockRejectedValue(
      new ApiRequestError(400, {
        error: 'Valeurs invalides',
        fields: [{ key: 'quota', reason: 'wrong_type' }],
      }),
    );
    render(<ConfigDrawer {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Valeur du mauvais type.')).toBeInTheDocument();
    expect(screen.queryByText('Ce champ est obligatoire.')).not.toBeInTheDocument();
  });

  it('devrait signaler un champ obligatoire vidé', async () => {
    vi.spyOn(api, 'saveConfig').mockRejectedValue(
      new ApiRequestError(400, {
        error: 'Valeurs invalides',
        fields: [{ key: 'greeting', reason: 'missing_required' }],
      }),
    );
    render(<ConfigDrawer {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Ce champ est obligatoire.')).toBeInTheDocument();
  });

  it('devrait se fermer et signaler un état périmé sur un 404', async () => {
    // Le plugin a été désactivé ou supprimé entre l'affichage et la
    // soumission : l'écran ment, on recharge.
    vi.spyOn(api, 'saveConfig').mockRejectedValue(
      new ApiRequestError(404, { error: 'Plugin introuvable' }),
    );
    const onStale = vi.fn();
    const onClose = vi.fn();
    render(<ConfigDrawer {...props} onStale={onStale} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onStale).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('devrait remonter la fermeture', async () => {
    const onClose = vi.fn();
    render(<ConfigDrawer {...props} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });
});
