import { useEdificeClient } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Course, Klass } from '../api';
import { addDays, courseSortKey, dayLabel, hhmm, mondayOf, weekLabel, ymd } from '../utils';

const JOURS: Array<{ dow: number; label: string }> = [
  { dow: 1, label: 'Lundi' },
  { dow: 2, label: 'Mardi' },
  { dow: 3, label: 'Mercredi' },
  { dow: 4, label: 'Jeudi' },
  { dow: 5, label: 'Vendredi' },
];

/** Emploi du temps d'une classe sur une semaine (liste ou grille horaire). */
export function Timetable() {
  const { t } = useTranslation(['edt', 'common']);
  const { user, init } = useEdificeClient();
  const structureId = user?.structures?.[0] ?? '';

  const [classId, setClassId] = useState('');
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const classesQuery = useQuery({ queryKey: ['edt', 'classes', structureId], queryFn: () => api.getClasses(structureId), enabled: !!structureId });
  const matieresQuery = useQuery({ queryKey: ['edt', 'matieres', structureId], queryFn: () => api.getMatieres(structureId), enabled: !!structureId });
  const slotsQuery = useQuery({ queryKey: ['edt', 'timeslots', structureId], queryFn: () => api.getTimeSlots(structureId), enabled: !!structureId });

  const classes = classesQuery.data ?? [];
  const selectedClass: Klass | undefined = classes.find((c) => c.id === classId);
  const subjectName = useMemo(() => new Map((matieresQuery.data ?? []).map((m) => [m.id, m.name])), [matieresQuery.data]);
  const slots = slotsQuery.data ?? [];
  const courseTitle = (c: Course) => c.subjectLabel ?? (c.subjectId ? subjectName.get(c.subjectId) ?? c.subjectId : '');

  const startAt = ymd(monday);
  const endAt = ymd(addDays(monday, 6));
  const coursesQuery = useQuery({
    queryKey: ['edt', 'courses', structureId, classId, startAt, endAt],
    queryFn: () => api.getCoursesForClass(structureId, selectedClass!, startAt, endAt),
    enabled: !!structureId && !!selectedClass,
  });

  const courses = [...(coursesQuery.data ?? [])].sort((a, b) => courseSortKey(a.startDate) - courseSortKey(b.startDate));

  // Indexation des cours par (créneau de début, jour de la semaine) pour la grille.
  const byCell = useMemo(() => {
    const m = new Map<string, Course>();
    for (const c of courses) {
      const dow = c.dayOfWeek ?? ((new Date(c.startDate).getDay() + 6) % 7) + 1;
      if (c.idStartSlot) m.set(`${c.idStartSlot}|${dow}`, c);
    }
    return m;
  }, [courses]);

  if (init && !structureId) {
    return (
      <div>
        <h1>{t('edt.title', { defaultValue: 'Emploi du temps' })}</h1>
        <div className="alert alert-info" role="alert">
          {t('edt.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-16">{t('edt.title', { defaultValue: 'Emploi du temps' })}</h1>

      {/* Barre de contrôle : classe + navigation semaine */}
      <div className="d-flex gap-16 flex-wrap align-items-end mb-16">
        <div>
          <label htmlFor="edt-class" className="form-label">{t('edt.class', { defaultValue: 'Classe' })}</label>
          <select id="edt-class" className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t('edt.class.choose', { defaultValue: 'Choisir une classe…' })}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="d-flex gap-8 align-items-center">
          <button type="button" className="btn btn-secondary" onClick={() => setMonday((m) => addDays(m, -7))}>
            {t('edt.week.prev', { defaultValue: '← Semaine précédente' })}
          </button>
          <span className="text-muted" style={{ minWidth: 150, textAlign: 'center' }}>{weekLabel(monday)}</span>
          <button type="button" className="btn btn-secondary" onClick={() => setMonday((m) => addDays(m, 7))}>
            {t('edt.week.next', { defaultValue: 'Semaine suivante →' })}
          </button>
        </div>
        <div className="btn-group" role="group" aria-label={t('edt.view', { defaultValue: 'Affichage' })}>
          <button type="button" className={`btn btn-${view === 'grid' ? 'primary' : 'secondary'}`} onClick={() => setView('grid')}>
            {t('edt.view.grid', { defaultValue: 'Grille' })}
          </button>
          <button type="button" className={`btn btn-${view === 'list' ? 'primary' : 'secondary'}`} onClick={() => setView('list')}>
            {t('edt.view.list', { defaultValue: 'Liste' })}
          </button>
        </div>
      </div>

      {!selectedClass && (
        <p className="text-muted">{t('edt.select.class', { defaultValue: 'Sélectionnez une classe pour afficher son emploi du temps.' })}</p>
      )}

      {selectedClass && coursesQuery.isLoading && <p>{t('edt.loading', { defaultValue: 'Chargement…' })}</p>}

      {selectedClass && !coursesQuery.isLoading && courses.length === 0 && view === 'list' && (
        <p className="text-muted">{t('edt.courses.empty', { defaultValue: 'Aucun cours sur cette semaine.' })}</p>
      )}

      {/* Vue GRILLE : créneaux horaires × jours */}
      {selectedClass && view === 'grid' && slots.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ tableLayout: 'fixed', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ width: 110 }}>{t('edt.hours', { defaultValue: 'Horaire' })}</th>
                {JOURS.map((j) => <th key={j.dow}>{j.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="text-muted" style={{ fontWeight: 400, whiteSpace: 'nowrap' }}>
                    {s.name} <span style={{ fontSize: 12 }}>{s.startHour}–{s.endHour}</span>
                  </th>
                  {JOURS.map((j) => {
                    const c = byCell.get(`${s.id}|${j.dow}`);
                    return (
                      <td key={j.dow} style={{ verticalAlign: 'top' }}>
                        {c && (
                          <div style={{ background: '#e8f4fa', borderLeft: '3px solid #4bafd5', borderRadius: 3, padding: '4px 6px' }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{courseTitle(c)}</div>
                            {(c.roomLabels ?? []).length > 0 && <div className="text-muted" style={{ fontSize: 12 }}>{(c.roomLabels ?? []).join(', ')}</div>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {courses.length === 0 && (
            <p className="text-muted">{t('edt.courses.empty.grid', { defaultValue: 'Aucun cours positionné sur cette semaine (grille horaire de l\'établissement affichée).' })}</p>
          )}
        </div>
      )}

      {/* Vue LISTE */}
      {selectedClass && view === 'list' && courses.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>{t('edt.day', { defaultValue: 'Jour' })}</th>
              <th>{t('edt.hours', { defaultValue: 'Horaire' })}</th>
              <th>{t('edt.subject', { defaultValue: 'Matière' })}</th>
              <th>{t('edt.room', { defaultValue: 'Salle' })}</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c._id}>
                <td>{dayLabel(c.startDate)}</td>
                <td>{hhmm(c.startDate)} – {hhmm(c.endDate)}</td>
                <td>{courseTitle(c)}</td>
                <td>{(c.roomLabels ?? []).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Timetable;
