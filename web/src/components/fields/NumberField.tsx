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
      // chaîne sur un champ `number`. Un champ vidé rend `NaN`, et une
      // saisie comme `1e400` rend `Infinity` : les deux se sérialiseraient
      // en `null` et se feraient refuser en `wrong_type`. On n'émet alors
      // rien, le champ garde sa valeur en vigueur.
      const next = event.target.valueAsNumber;
      if (Number.isFinite(next)) onChange(next);
    }}
  />
);
