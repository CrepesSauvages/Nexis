import type { ConfigEntry, GuildResources } from '../../api/types';
import { t } from '../../strings';
import type { StringKey } from '../../strings';
import { BooleanField } from './BooleanField';
import { NumberField } from './NumberField';
import { ReferenceField } from './ReferenceField';
import { SelectField } from './SelectField';
import { StringField } from './StringField';

/** Les motifs de refus que `validateConfigValues` peut rendre par champ. */
const FIELD_ERRORS = new Set([
  'wrong_type',
  'not_in_options',
  'not_found_in_guild',
  'missing_required',
  'unknown_key',
]);

interface FieldProps {
  name: string;
  entry: ConfigEntry;
  value: unknown;
  resources: GuildResources;
  error: string | undefined;
  onChange: (value: unknown) => void;
}

/**
 * Un champ, choisi sur `entry.type`. Le `label` arrive déjà traduit dans la
 * langue du serveur : rien n'est retraduit ici.
 */
export const Field = ({ name, entry, value, resources, error, onChange }: FieldProps) => {
  const id = `field-${name}`;
  const unknown = !['string', 'number', 'boolean', 'select', 'channel', 'role', 'user'].includes(
    entry.type,
  );

  return (
    <div className="field">
      <label htmlFor={id}>
        {entry.label}
        {entry.required ? <span className="required">{t('field.required')}</span> : null}
      </label>

      {entry.type === 'number' ? (
        <NumberField id={id} value={typeof value === 'number' ? value : ''} onChange={onChange} />
      ) : entry.type === 'boolean' ? (
        <BooleanField id={id} value={value === true} onChange={onChange} />
      ) : entry.type === 'select' ? (
        <SelectField
          id={id}
          value={typeof value === 'string' ? value : ''}
          options={entry.options ?? []}
          onChange={onChange}
        />
      ) : entry.type === 'channel' || entry.type === 'role' || entry.type === 'user' ? (
        <ReferenceField
          id={id}
          type={entry.type}
          value={typeof value === 'string' ? value : ''}
          resources={resources}
          onChange={onChange}
        />
      ) : (
        // Type inconnu : un plugin plus récent que le dashboard. On montre la
        // valeur sans laisser l'écraser, plutôt que de rendre un écran blanc.
        <StringField
          id={id}
          value={typeof value === 'string' ? value : String(value ?? '')}
          readOnly={unknown}
          onChange={onChange}
        />
      )}

      {unknown ? (
        <span className="muted small">{t('field.unknownType', { type: entry.type })}</span>
      ) : null}
      {error && FIELD_ERRORS.has(error) ? (
        <span className="inline-error small">{t(`fieldError.${error}` as StringKey)}</span>
      ) : null}
    </div>
  );
};
