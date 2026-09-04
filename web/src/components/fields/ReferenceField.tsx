import type { GuildResources } from '../../api/types';
import { t } from '../../strings';

interface ReferenceFieldProps {
  id: string;
  type: 'channel' | 'role' | 'user';
  value: string;
  resources: GuildResources;
  onChange: (value: string) => void;
}

/**
 * `channel` et `role` sont des listes : l'API les rend en entier. `user` est
 * une saisie d'identifiant — un serveur peut compter des centaines de milliers
 * de membres, l'API ne les expose pas, et le bot valide l'identifiant à
 * l'enregistrement.
 */
export const ReferenceField = ({ id, type, value, resources, onChange }: ReferenceFieldProps) => {
  if (type === 'user') {
    return (
      <>
        <input
          id={id}
          type="text"
          className="field-input"
          value={value}
          inputMode="numeric"
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="muted small">{t('field.userHint')}</span>
      </>
    );
  }

  const entries =
    type === 'channel'
      ? resources.channels.map(({ id: value, name }) => ({ value, name, color: null }))
      : resources.roles.map(({ id: value, name, color }) => ({ value, name, color }));

  // Une pastille dans le contenu d'une <option> ne s'affiche de façon
  // fiable dans aucun navigateur : elle est rendue à côté du select plutôt
  // que dedans, pour le rôle actuellement choisi.
  const selectedColor =
    type === 'role' ? entries.find((entry) => entry.value === value)?.color : null;

  return (
    <span className="reference-field">
      <select
        id={id}
        className="field-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>
          {t('field.none')}
        </option>
        {entries.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.name}
          </option>
        ))}
      </select>
      {selectedColor ? (
        <span
          className="role-swatch"
          style={{ backgroundColor: selectedColor }}
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
};
