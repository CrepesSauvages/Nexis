import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalePicker } from './LocalePicker';

describe('LocalePicker', () => {
  it('devrait afficher la langue enregistrée', () => {
    render(<LocalePicker locale="en" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Langue du serveur' })).toHaveValue('en');
  });

  it("devrait afficher l'option par défaut quand aucune langue n'est enregistrée", () => {
    render(<LocalePicker locale={null} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Langue du serveur' })).toHaveValue('');
  });

  it('devrait remonter la langue choisie', async () => {
    const onChange = vi.fn();
    render(<LocalePicker locale="fr" onChange={onChange} />);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Langue du serveur' }),
      'pl',
    );
    expect(onChange).toHaveBeenCalledWith('pl');
  });
});
