import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface PickerOption {
  id: string;
  label: string;
  /** Rubrique de regroupement, ex. « Classes » / « Groupes ». */
  section?: string;
}

interface Props {
  legend: string;
  options: PickerOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  required?: boolean;
}

/**
 * Bouton « × » de retrait, stylé explicitement : la classe btn-link est invisible avec le thème des
 * modules React (texte de la couleur du fond), la croix n'apparaissait pas.
 */
const REMOVE_BUTTON = { color: '#555', fontSize: 16, fontWeight: 700, lineHeight: 1, cursor: 'pointer' };

/**
 * Choix multiple filtrable (enseignants, classes et groupes du formulaire de cours) : les éléments
 * retenus en étiquettes retirables, un filtre de saisie, puis la liste à cocher.
 * Ex. filtre « 4 » → 401, 402, 4A grp1 ; cocher 401 → étiquette « 401 × ».
 */
export function MultiPicker({ legend, options, selected, onChange, required }: Props) {
  const { t } = useTranslation(['edt', 'common']);
  const id = useId();
  const [filter, setFilter] = useState('');
  const visible = options.filter((o) => o.label.toLowerCase().includes(filter.trim().toLowerCase()));
  const sections = [...new Set(visible.map((o) => o.section ?? ''))];
  const toggle = (optionId: string) =>
    onChange(selected.includes(optionId) ? selected.filter((x) => x !== optionId) : [...selected, optionId]);

  return (
    <fieldset className="mb-12" aria-required={required}>
      <legend className="form-label" style={{ fontSize: 15, fontWeight: 700 }}>
        {legend}
        {required && ' *'}
      </legend>
      {selected.length > 0 && (
        <div className="d-flex flex-wrap gap-4 mb-8" aria-live="polite">
          {selected.map((sid) => {
            const option = options.find((o) => o.id === sid);
            return (
              <span key={sid} className="badge rounded-pill bg-light text-dark border d-inline-flex align-items-center gap-4" style={{ fontSize: 13 }}>
                {option?.label ?? sid}
                <button
                  type="button"
                  className="border-0 bg-transparent p-0"
                  style={REMOVE_BUTTON}
                  aria-label={t('edt.timetable.filter.remove', { 0: option?.label ?? sid })}
                  onClick={() => toggle(sid)}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <input
        type="search"
        className="form-control mb-4"
        aria-label={t('edt.form.filter', { 0: legend })}
        placeholder={t('edt.form.filter', { 0: legend })}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 4, padding: '4px 8px' }}>
        {sections.map((section) => (
          <div key={section || 'none'}>
            {section && <div className="text-muted mt-4" style={{ fontSize: 12, fontWeight: 700 }}>{section}</div>}
            {visible
              .filter((o) => (o.section ?? '') === section)
              .map((o) => (
                <label key={o.id} className="d-flex align-items-center gap-8 m-0" htmlFor={`${id}-${o.id}`} style={{ fontSize: 14 }}>
                  <input id={`${id}-${o.id}`} type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
                  {o.label}
                </label>
              ))}
          </div>
        ))}
        {visible.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>{t('edt.form.no.match')}</div>}
      </div>
    </fieldset>
  );
}

export default MultiPicker;
