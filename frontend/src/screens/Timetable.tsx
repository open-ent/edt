import { useEdificeClient } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

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
  const qc = useQueryClient();
  const structureId = user?.structures?.[0] ?? '';

  // Lien profond depuis le dashboard (widget "prochain cours") : #/?date=YYYY-MM-DD&start=HH:MM
  // ouvre directement la bonne semaine et met en évidence le créneau visé.
  const [searchParams] = useSearchParams();
  const targetDate = searchParams.get('date');
  const targetStart = searchParams.get('start');

  const [classId, setClassId] = useState('');
  const [monday, setMonday] = useState(() => {
    if (targetDate) {
      const d = new Date(`${targetDate}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return mondayOf(d);
    }
    return mondayOf(new Date());
  });
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const classesQuery = useQuery({ queryKey: ['edt', 'classes', structureId], queryFn: () => api.getClasses(structureId), enabled: !!structureId });
  const matieresQuery = useQuery({ queryKey: ['edt', 'matieres', structureId], queryFn: () => api.getMatieres(structureId), enabled: !!structureId });
  const slotsQuery = useQuery({ queryKey: ['edt', 'timeslots', structureId], queryFn: () => api.getTimeSlots(structureId), enabled: !!structureId });

  const teacherId = (user as { userId?: string; id?: string } | undefined)?.userId ?? (user as { id?: string } | undefined)?.id ?? '';
  const isMine = classId === '__me__';

  // Parité Angular : afficher d'emblée l'emploi du temps de l'utilisateur connecté
  // (au lieu d'un état vide tant qu'aucune classe n'est choisie).
  useEffect(() => {
    if (teacherId) setClassId((prev) => (prev === '' ? '__me__' : prev));
  }, [teacherId]);

  // Création d'un cours ponctuel (parité Angular « Créer un cours », POST /edt/course).
  const [creating, setCreating] = useState(false);
  const [newSubjectId, setNewSubjectId] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('10:00');
  const createMut = useMutation({
    mutationFn: () =>
      api.createCourse({
        structureId,
        subjectId: newSubjectId,
        teacherId,
        className: newClassName,
        room: newRoom.trim() || undefined,
        date: newDate,
        startTime: newStart,
        endTime: newEnd,
      }),
    onSuccess: () => {
      setCreating(false);
      qc.invalidateQueries({ queryKey: ['edt', 'courses'] });
    },
  });
  const newCourseValid = !!(newSubjectId && newClassName && newDate && newStart && newEnd && teacherId);
  const classes = classesQuery.data ?? [];
  const selectedClass: Klass | undefined = classes.find((c) => c.id === classId);
  const subjectName = useMemo(() => new Map((matieresQuery.data ?? []).map((m) => [m.id, m.name])), [matieresQuery.data]);
  const slots = slotsQuery.data ?? [];
  const courseTitle = (c: Course) => c.subjectLabel ?? (c.subjectId ? subjectName.get(c.subjectId) ?? c.subjectId : '');

  const startAt = ymd(monday);
  const endAt = ymd(addDays(monday, 6));
  const hasSelection = isMine ? !!teacherId : !!selectedClass;
  const coursesQuery = useQuery({
    queryKey: ['edt', 'courses', structureId, classId, startAt, endAt],
    queryFn: () =>
      isMine
        ? api.getCoursesForTeacher(structureId, teacherId, startAt, endAt)
        : api.getCoursesForClass(structureId, selectedClass!, startAt, endAt),
    enabled: !!structureId && hasSelection,
  });

  const courses = [...(coursesQuery.data ?? [])].sort((a, b) => courseSortKey(a.startDate) - courseSortKey(b.startDate));

  // Cours ciblé par le lien profond (date + heure de début).
  const highlightCourse = targetDate && targetStart
    ? courses.find((c) => (c.startDate || '').slice(0, 10) === targetDate && (c.startDate || '').slice(11, 16) === targetStart)
    : undefined;
  const highlightRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (highlightCourse) highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightCourse]);

  // Indexation des cours par (créneau de début, jour de la semaine) pour la grille.
  // Les cours créés manuellement n'ont pas d'idStartSlot : le créneau est alors résolu
  // par l'heure de début (slot dont l'intervalle contient l'heure du cours).
  const byCell = useMemo(() => {
    const toMin = (s?: string) => {
      const m2 = /(\d{1,2}):(\d{2})/.exec(s ?? '');
      return m2 ? Number(m2[1]) * 60 + Number(m2[2]) : -1;
    };
    const slotFor = (c: Course) => {
      if (c.idStartSlot) return c.idStartSlot;
      const startMin = toMin((c.startDate || '').slice(11, 16));
      return slots.find((sl) => toMin(sl.startHour) <= startMin && startMin < toMin(sl.endHour))?.id;
    };
    const m = new Map<string, Course>();
    for (const c of courses) {
      const dow = c.dayOfWeek ?? ((new Date(c.startDate).getDay() + 6) % 7) + 1;
      const slotId = slotFor(c);
      if (slotId) m.set(`${slotId}|${dow}`, c);
    }
    return m;
  }, [courses, slots]);

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
      <div className="d-flex align-items-center justify-content-between mb-16 flex-wrap gap-8">
        <h1 className="m-0">{t('edt.title', { defaultValue: 'Emploi du temps' })}</h1>
        {!creating && teacherId && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            {t('edt.course.new', { defaultValue: 'Créer un cours' })}
          </button>
        )}
      </div>

      {creating && (
        <form
          className="card p-16 mb-16"
          onSubmit={(e) => {
            e.preventDefault();
            if (newCourseValid) createMut.mutate();
          }}
        >
          <h2 style={{ fontSize: 18 }} className="mb-12">{t('edt.course.new', { defaultValue: 'Créer un cours' })}</h2>
          <div className="d-flex gap-12 flex-wrap mb-12">
            <div>
              <label htmlFor="nc-subject" className="form-label">{t('edt.subject', { defaultValue: 'Matière' })}</label>
              <select id="nc-subject" className="form-select" value={newSubjectId} onChange={(e) => setNewSubjectId(e.target.value)} required>
                <option value="">—</option>
                {(matieresQuery.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="nc-class" className="form-label">{t('edt.class', { defaultValue: 'Classe' })}</label>
              <select id="nc-class" className="form-select" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} required>
                <option value="">—</option>
                {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="nc-date" className="form-label">{t('edt.date', { defaultValue: 'Date' })}</label>
              <input id="nc-date" type="date" className="form-control" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="nc-start" className="form-label">{t('edt.start', { defaultValue: 'Début' })}</label>
              <input id="nc-start" type="time" className="form-control" value={newStart} onChange={(e) => setNewStart(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="nc-end" className="form-label">{t('edt.end', { defaultValue: 'Fin' })}</label>
              <input id="nc-end" type="time" className="form-control" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="nc-room" className="form-label">{t('edt.room', { defaultValue: 'Salle' })}</label>
              <input id="nc-room" type="text" className="form-control" value={newRoom} onChange={(e) => setNewRoom(e.target.value)} />
            </div>
          </div>
          {createMut.isError && (
            <div className="alert alert-warning" role="alert">{t('edt.course.error', { defaultValue: 'La création du cours a échoué (droit requis).' })}</div>
          )}
          <div className="d-flex gap-8">
            <button type="submit" className="btn btn-primary" disabled={!newCourseValid || createMut.isPending}>
              {t('edt.course.create', { defaultValue: 'Créer' })}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>{t('edt.cancel', { defaultValue: 'Annuler' })}</button>
          </div>
        </form>
      )}

      {/* Barre de contrôle : classe + navigation semaine */}
      <div className="d-flex gap-16 flex-wrap align-items-end mb-16">
        <div>
          <label htmlFor="edt-class" className="form-label">{t('edt.class', { defaultValue: 'Classe' })}</label>
          <select id="edt-class" className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t('edt.class.choose', { defaultValue: 'Choisir…' })}</option>
            {teacherId && <option value="__me__">{t('edt.mine', { defaultValue: 'Mon emploi du temps' })}</option>}
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

      {!hasSelection && (
        <p className="text-muted">{t('edt.select.class', { defaultValue: 'Sélectionnez une classe pour afficher son emploi du temps.' })}</p>
      )}

      {hasSelection && coursesQuery.isLoading && <p>{t('edt.loading', { defaultValue: 'Chargement…' })}</p>}

      {hasSelection && !coursesQuery.isLoading && courses.length === 0 && view === 'list' && (
        <p className="text-muted">{t('edt.courses.empty', { defaultValue: 'Aucun cours sur cette semaine.' })}</p>
      )}

      {/* Vue GRILLE : créneaux horaires × jours */}
      {hasSelection && view === 'grid' && slots.length > 0 && (
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
                    const isHighlighted = !!c && c === highlightCourse;
                    return (
                      <td key={j.dow} style={{ verticalAlign: 'top' }}>
                        {c && (
                          <div
                            ref={isHighlighted ? (el) => { highlightRef.current = el; } : undefined}
                            style={{
                              background: isHighlighted ? '#fff3cd' : '#e8f4fa',
                              borderLeft: `3px solid ${isHighlighted ? '#e0a800' : '#4bafd5'}`,
                              borderRadius: 3,
                              padding: '4px 6px',
                              ...(isHighlighted && { boxShadow: '0 0 0 2px #e0a800' }),
                            }}
                          >
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
      {hasSelection && view === 'list' && courses.length > 0 && (
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
            {courses.map((c) => {
              const isHighlighted = c === highlightCourse;
              return (
                <tr
                  key={c._id}
                  ref={isHighlighted ? (el) => { highlightRef.current = el; } : undefined}
                  style={isHighlighted ? { background: '#fff3cd', boxShadow: 'inset 0 0 0 2px #e0a800' } : undefined}
                >
                  <td>{dayLabel(c.startDate)}</td>
                  <td>{hhmm(c.startDate)} – {hhmm(c.endDate)}</td>
                  <td>{courseTitle(c)}</td>
                  <td>{(c.roomLabels ?? []).join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Timetable;
