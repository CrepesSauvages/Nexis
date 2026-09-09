import { SUPPORTED_LOCALES, useLocale, useT } from '../i18n';
import type { Locale, StringKey } from '../i18n';

/**
 * Choisit la langue dans laquelle l'administrateur *lit* ce tableau de bord.
 * Sans rapport avec `LocalePicker`, qui choisit la langue parlée par le bot
 * à un serveur : celui-ci ne dépend d'aucun serveur choisi et n'appelle
 * jamais l'API, il ne fait que lire/écrire une préférence locale.
 */
export const InterfaceLocalePicker = () => {
  const t = useT();
  const { locale, setLocale } = useLocale();

  return (
    <label className="picker">
      <span className="visually-hidden">{t('topbar.interfaceLocale')}</span>
      <select
        aria-label={t('topbar.interfaceLocale')}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {t(`locale.${code}` as StringKey)}
          </option>
        ))}
      </select>
    </label>
  );
};
