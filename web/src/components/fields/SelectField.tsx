import { t } from '../../strings';

interface SelectFieldProps {
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

/**
 * Les options sont rendues telles quelles : ce sont les valeurs que la
 * validation du bot accepte, pas des libellés. On ne les traduit pas non plus,
 * pour la même raison.
 */
export const SelectField = ({ id, value, options, onChange }: SelectFieldProps) => (
  <select
    id={id}
    className="field-input"
    value={value}
    onChange={(event) => onChange(event.target.value)}
  >
    <option value="">{t('field.none')}</option>
    {options.map((option) => (
      <option key={option} value={option}>
        {option}
      </option>
    ))}
  </select>
);
