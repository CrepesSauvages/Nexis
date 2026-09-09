import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterfaceLocalePicker } from './InterfaceLocalePicker';
import { LocaleProvider } from '../i18n';

describe('InterfaceLocalePicker', () => {
  it('devrait afficher le français par défaut', () => {
    render(
      <LocaleProvider>
        <InterfaceLocalePicker />
      </LocaleProvider>,
    );
    expect(screen.getByRole('combobox', { name: "Langue de l'interface" })).toHaveValue('fr');
  });

  it('devrait porter un intitulé distinct de celui du sélecteur de langue du serveur', () => {
    // Le risque central de cette fonctionnalité : les deux sélecteurs ne
    // doivent jamais être confondus, y compris par leur libellé accessible.
    render(
      <LocaleProvider>
        <InterfaceLocalePicker />
      </LocaleProvider>,
    );
    expect(screen.queryByRole('combobox', { name: 'Langue du serveur' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: "Langue de l'interface" })).toBeInTheDocument();
  });

  it('devrait changer la langue affichée quand on choisit une autre option', async () => {
    render(
      <LocaleProvider>
        <InterfaceLocalePicker />
      </LocaleProvider>,
    );
    const select = screen.getByRole('combobox', { name: "Langue de l'interface" });
    await userEvent.selectOptions(select, 'en');
    expect(select).toHaveValue('en');
  });

  it('devrait proposer les huit langues du bot', () => {
    render(
      <LocaleProvider>
        <InterfaceLocalePicker />
      </LocaleProvider>,
    );
    const select = screen.getByRole('combobox', { name: "Langue de l'interface" });
    expect(select.querySelectorAll('option')).toHaveLength(8);
  });
});
