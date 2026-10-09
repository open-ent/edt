import { useTranslation } from 'react-i18next';

import type { Group, Teacher } from '../api';
import { groupColor } from '../colors';
import { deselectAll, effectiveGroupIds, selectAll, Selection, SubGroups, toggleGroup, toggleTeacher } from '../filter';

interface Props {
  groups: Group[];
  subGroups: SubGroups;
  teachers: Teacher[];
  selection: Selection;
  onChange: (selection: Selection) => void;
}

/** Teinte des groupes ajoutés par leur classe sans couleur propre au référentiel. */
const SUBGROUP_COLOR = 'rgba(22, 46, 174, 0.7)';

const pill = (active: boolean, color: string) => ({
  display: 'block',
  width: '100%',
  textAlign: 'left' as const,
  border: 0,
  borderRadius: 12,
  padding: '2px 10px',
  marginBottom: 4,
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: active ? color : 'rgba(160, 167, 179, 1)',
  cursor: 'pointer',
});

/**
 * Barre latérale du personnel et des enseignants : enseignants retenus, classes et groupes à
 * afficher (même présentation que l'IHM AngularJS : pastille colorée = affiché, grise = masqué).
 * Ex. clic sur « 401 » → 401 et ses groupes s'affichent ; clic sur « 401 grp B » → ce seul groupe
 * est retiré.
 */
export function FilterSidebar({ groups, subGroups, teachers, selection, onChange }: Props) {
  const { t } = useTranslation(['edt', 'common']);
  const shown = new Set(effectiveGroupIds(selection, subGroups));
  const teacherName = (id: string) => teachers.find((x) => x.id === id)?.displayName ?? id;

  const knownIds = new Set(groups.map((g) => g.id));
  // Groupes ajoutés par leur classe mais absents du référentiel de l'établissement : listés à part
  // pour pouvoir les retirer.
  const extraGroups = [...subGroups.values()].flat().filter((g, i, all) =>
    !knownIds.has(g.id) && all.findIndex((x) => x.id === g.id) === i && selection.chosen.some((c) => (subGroups.get(c) ?? []).some((x) => x.id === g.id)));

  return (
    <aside className="card p-12" aria-label={t('edt.timetable.filter.title')} style={{ minWidth: 220 }}>
      {selection.teacherIds.length > 0 && (
        <section className="mb-16">
          <h2 style={{ fontSize: 14, textTransform: 'uppercase' }} className="mb-8">{t('edt.timetable.filter.teachers')}</h2>
          <ul className="list-unstyled m-0">
            {selection.teacherIds.map((id) => (
              <li key={id} className="d-flex align-items-center justify-content-between mb-4">
                <span style={{ fontSize: 13 }}>{teacherName(id)}</span>
                <button
                  type="button"
                  className="btn btn-link p-0"
                  aria-label={t('edt.timetable.filter.remove', { 0: teacherName(id) })}
                  onClick={() => onChange(toggleTeacher(selection, id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 14, textTransform: 'uppercase' }} className="mb-8">{t('edt.timetable.filter.title')}</h2>
        <div className="d-flex gap-8 mb-8 flex-wrap">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={groups.every((g) => shown.has(g.id))}
            onClick={() => onChange(selectAll(selection, groups))}
          >
            {t('edt.utils.select.all')}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={shown.size === 0}
            onClick={() => onChange(deselectAll(selection))}
          >
            {t('edt.utils.deselect.all')}
          </button>
        </div>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={shown.has(g.id)}
            style={pill(shown.has(g.id), groupColor(g.color))}
            onClick={() => onChange(toggleGroup(selection, g.id, subGroups))}
          >
            {g.isInCurrentTeacher ? `${g.name} ${t('edt.timetable.group.mine')}` : g.name}
          </button>
        ))}
      </section>

      {extraGroups.length > 0 && (
        <section className="mt-16">
          <h2 style={{ fontSize: 14, textTransform: 'uppercase' }} className="mb-8">{t('edt.timetable.filter.subgroups')}</h2>
          {extraGroups.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={shown.has(g.id)}
              style={pill(shown.has(g.id), SUBGROUP_COLOR)}
              onClick={() => onChange(toggleGroup(selection, g.id, subGroups))}
            >
              {g.name}
            </button>
          ))}
        </section>
      )}
    </aside>
  );
}

export default FilterSidebar;
