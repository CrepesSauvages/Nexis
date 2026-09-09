import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { api } from './api/client';
import { LocaleProvider } from './i18n';

// Séparé de App.test.tsx : ce fichier porte le risque de confusion central
// de cette fonctionnalité — que changer la langue de lecture de
// l'administrateur (locale, sans API) soit confondu avec changer la langue
// parlée par le bot sur le serveur (PUT /api/core/locale).

afterEach(() => {
  vi.restoreAllMocks();
});

const setUpReadyApp = () => {
  window.history.replaceState({}, '', '/');
  vi.spyOn(api, 'me').mockResolvedValue({ id: 'u1', username: 'thomas', avatar: null, guilds: [] });
  vi.spyOn(api, 'guilds').mockResolvedValue([{ id: 'g1', name: 'Serveur un', icon: null }]);
  vi.spyOn(api, 'locale').mockResolvedValue({ locale: null });
  vi.spyOn(api, 'plugins').mockResolvedValue([]);
  vi.spyOn(api, 'resources').mockResolvedValue({ channels: [], roles: [] });
};

describe('App — distinction entre langue de l’interface et langue du serveur', () => {
  it("ne devrait appeler aucune API en changeant la langue de l'interface", async () => {
    setUpReadyApp();
    const setLocale = vi.spyOn(api, 'setLocale');

    render(
      <LocaleProvider>
        <App />
      </LocaleProvider>,
    );

    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: "Langue de l'interface" }),
      'en',
    );

    // La langue de lecture a bien changé (preuve que le sélecteur agit
    // réellement), mais sans passer par l'API du bot.
    expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(setLocale).not.toHaveBeenCalled();
  });

  it('devrait appeler l’API en changeant la langue du serveur', async () => {
    setUpReadyApp();
    const setLocale = vi.spyOn(api, 'setLocale').mockResolvedValue(undefined);

    render(
      <LocaleProvider>
        <App />
      </LocaleProvider>,
    );

    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Langue du serveur' }),
      'en',
    );

    expect(setLocale).toHaveBeenCalledWith('g1', 'en');
  });
});
