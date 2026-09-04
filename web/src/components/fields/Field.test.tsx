import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field } from './Field';
import type { ConfigEntry, GuildResources } from '../../api/types';

const resources: GuildResources = {
  channels: [{ id: 'c1', name: 'general', type: 0 }],
  roles: [{ id: 'r1', name: 'Staff', color: '#5865f2' }],
};

const renderField = (entry: ConfigEntry, value: unknown, onChange = vi.fn()) => {
  render(
    <Field
      name="champ"
      entry={entry}
      value={value}
      resources={resources}
      error={undefined}
      onChange={onChange}
    />,
  );
  return onChange;
};

describe('Field', () => {
  it('devrait rendre une chaîne et émettre une chaîne', async () => {
    const onChange = renderField({ type: 'string', label: 'Salutation' }, 'Bonjour');
    const input = screen.getByLabelText('Salutation');
    expect(input).toHaveValue('Bonjour');
    await userEvent.type(input, '!');
    expect(onChange).toHaveBeenLastCalledWith('Bonjour!');
  });

  it('devrait émettre un nombre et non une chaîne', async () => {
    // Envoyer "12" ferait échouer la validation du bot en `wrong_type`.
    const onChange = renderField({ type: 'number', label: 'Quota' }, 1);
    await userEvent.type(screen.getByLabelText('Quota'), '2');
    expect(onChange).toHaveBeenLastCalledWith(12);
    expect(typeof onChange.mock.calls[0][0]).toBe('number');
  });

  it('devrait émettre un booléen', async () => {
    const onChange = renderField({ type: 'boolean', label: 'Actif' }, false);
    await userEvent.click(screen.getByLabelText('Actif'));
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it("devrait émettre la valeur brute d'une option et non son libellé", async () => {
    const onChange = renderField(
      { type: 'select', label: 'Mode', options: ['strict', 'doux'] },
      'strict',
    );
    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'doux');
    expect(onChange).toHaveBeenLastCalledWith('doux');
  });

  it('devrait proposer les salons du serveur', async () => {
    const onChange = renderField({ type: 'channel', label: 'Salon des logs' }, '');
    await userEvent.selectOptions(screen.getByLabelText('Salon des logs'), 'c1');
    expect(onChange).toHaveBeenLastCalledWith('c1');
    expect(screen.getByRole('option', { name: 'general' })).toBeInTheDocument();
  });

  it('devrait proposer les rôles du serveur', async () => {
    const onChange = renderField({ type: 'role', label: 'Rôle modérateur' }, '');
    await userEvent.selectOptions(screen.getByLabelText('Rôle modérateur'), 'r1');
    expect(onChange).toHaveBeenLastCalledWith('r1');
  });

  it('devrait afficher une pastille de la couleur du rôle choisi', () => {
    renderField({ type: 'role', label: 'Rôle modérateur' }, 'r1');
    const swatch = document.querySelector('.role-swatch');
    expect(swatch).toHaveStyle({ backgroundColor: '#5865f2' });
  });

  it("ne devrait afficher aucune pastille tant qu'aucun rôle n'est choisi", () => {
    renderField({ type: 'role', label: 'Rôle modérateur' }, '');
    expect(document.querySelector('.role-swatch')).not.toBeInTheDocument();
  });

  it('devrait laisser saisir un identifiant de membre', () => {
    // Un serveur peut compter des centaines de milliers de membres : l'API ne
    // les expose pas, la saisie est validée côté serveur.
    renderField({ type: 'user', label: 'Responsable' }, '');
    expect(screen.getByLabelText('Responsable')).toHaveAttribute('type', 'text');
  });

  it('devrait marquer un champ obligatoire', () => {
    renderField({ type: 'string', label: 'Journal', required: true }, '');
    expect(screen.getByText('Requis')).toBeInTheDocument();
  });

  it("devrait rendre un champ inconnu en lecture seule plutôt qu'un écran blanc", () => {
    // Un plugin plus récent que le dashboard peut déclarer un type qu'il ne
    // connaît pas : l'afficher sans le casser vaut mieux que planter.
    renderField({ type: 'couleur', label: 'Teinte' }, '#fff');
    expect(screen.getByLabelText('Teinte')).toHaveAttribute('readonly');
    expect(screen.getByText('Type « couleur » inconnu de cette interface.')).toBeInTheDocument();
  });

  it("devrait afficher le motif d'un champ refusé", () => {
    render(
      <Field
        name="logs"
        entry={{ type: 'string', label: 'Journal' }}
        value=""
        resources={resources}
        error="missing_required"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Ce champ est obligatoire.')).toBeInTheDocument();
  });
});
