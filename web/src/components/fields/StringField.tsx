interface StringFieldProps {
  id: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}

export const StringField = ({ id, value, readOnly, onChange }: StringFieldProps) => (
  <input
    id={id}
    type="text"
    className="field-input"
    value={value}
    readOnly={readOnly}
    onChange={(event) => onChange(event.target.value)}
  />
);
