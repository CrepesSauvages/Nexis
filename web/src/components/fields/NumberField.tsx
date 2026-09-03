interface NumberFieldProps {
  id: string;
  value: number | '';
  onChange: (value: number) => void;
}

export const NumberField = ({ id, value, onChange }: NumberFieldProps) => (
  <input
    id={id}
    type="number"
    className="field-input"
    value={value}
    onChange={(event) => {
      // `valueAsNumber` plutôt que `value` : la validation du bot refuse une
      // chaîne sur un champ `number`. Un champ vidé rend `NaN`, qui se
      // sérialiserait en `null` et se ferait refuser en `wrong_type` : on
      // n'émet alors rien, le champ garde sa valeur en vigueur.
      const next = event.target.valueAsNumber;
      if (!Number.isNaN(next)) onChange(next);
    }}
  />
);
