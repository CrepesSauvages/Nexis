interface BooleanFieldProps {
  id: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export const BooleanField = ({ id, value, onChange }: BooleanFieldProps) => (
  <input
    id={id}
    type="checkbox"
    checked={value}
    onChange={(event) => onChange(event.target.checked)}
  />
);
