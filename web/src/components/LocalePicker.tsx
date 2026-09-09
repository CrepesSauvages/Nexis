import { SUPPORTED_LOCALES, useT } from '../i18n';
import type { StringKey } from '../i18n';

interface LocalePickerProps {
  locale: string | null;
  onChange: (locale: string) => void;
}

export const LocalePicker = ({ locale, onChange }: LocalePickerProps) => {
  const t = useT();
  return (
    <label className="picker">
      <span className="visually-hidden">{t('topbar.locale')}</span>
      <select
        aria-label={t('topbar.locale')}
        // La chaîne vide représente « aucune langue enregistrée » : l'API
        // distingue ce cas de « français choisi » en rendant `null`.
        value={locale ?? ''}
        onChange={(event) => onChange(event.target.value)}
      >
        {/* L'API n'a pas d'opération pour effacer une langue enregistrée : ce
            choix ne fait qu'annoncer l'état courant, le sélectionner reviendrait
            silencieusement à la langue déjà en vigueur. */}
        <option value="" disabled>
          {t('locale.unset')}
        </option>
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {t(`locale.${code}` as StringKey)}
          </option>
        ))}
      </select>
    </label>
  );
};
