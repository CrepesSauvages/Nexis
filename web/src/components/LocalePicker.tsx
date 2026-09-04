import { t } from '../strings';
import type { StringKey } from '../strings';

/** Les huit langues de `SUPPORTED_LOCALES` (src/core/i18n/index.js). */
const LOCALES = ['fr', 'en', 'es', 'de', 'pt', 'it', 'nl', 'pl'] as const;

interface LocalePickerProps {
  locale: string | null;
  onChange: (locale: string) => void;
}

export const LocalePicker = ({ locale, onChange }: LocalePickerProps) => (
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
      {LOCALES.map((code) => (
        <option key={code} value={code}>
          {t(`locale.${code}` as StringKey)}
        </option>
      ))}
    </select>
  </label>
);
