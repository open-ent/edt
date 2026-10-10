import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { api, childClasses, Course } from '../api';
import { ALL_STRUCTURES, composesOwnFilter, sortGroups } from '../context';
import { DeleteCourseDialog } from '../features/DeleteCourseDialog';
import { EditScopeDialog } from '../features/EditScopeDialog';
import { FilterSidebar } from '../features/FilterSidebar';
import { MonthGrid } from '../features/MonthGrid';
import { SearchBox } from '../features/SearchBox';
import { CourseActions, WeekGrid } from '../features/WeekGrid';
import { courseSubject } from '../grid';
import { coursesFilter, effectiveGroupIds, EMPTY_SELECTION, Selection, toggleGroup } from '../filter';
import { useEdtContext } from '../hooks/useEdtContext';
import { useTimetableState } from '../hooks/useTimetableState';
import { initialAnchor, periodOf, step, VIEW_MODES } from '../period';
import { courseSortKey, dayLabel, hhmm, ymd } from '../utils';


/** Emploi du temps des classes, groupes et enseignants choisis : vue jour, semaine, quinzaine, mois ou liste. */
export function Timetable() {
  const { t, i18n } = useTranslation(['edt', 'common']);
  const ctx = useEdtContext();
  const navigate = useNavigate();
  // Retour du formulaire : ressource RBS non réservée (créneau déjà pris), cf. CourseForm.
  const rbsConflict = (useLocation().state as { rbsConflict?: string } | null)?.rbsConflict;
  const isTeacher = ctx.profile === 'teacher';
  const isStudent = ctx.profile === 'student';
  const isRelative = ctx.profile === 'relative';

  // Parent : l'enfant affiché (le premier par ordre alphabétique, comme l'AngularJS) et
  // l'établissement de cet enfant. Ex. Karim → Abd-Samad, 501, collège de Morlaix.
  const childrenQuery = useQuery({ queryKey: ['edt', 'children'], queryFn: api.getChildren, enabled: isRelative });
  const children = useMemo(
    () =>
      [...(childrenQuery.data ?? [])].sort(
        (a, b) => (a.lastName ?? '').localeCompare(b.lastName ?? '') || (a.firstName ?? '').localeCompare(b.firstName ?? ''),
      ),
    [childrenQuery.data],
  );
  const [childId, setChildId] = useState('');
  const child = children.find((c) => c.id === childId) ?? children[0];
  const structureId = isRelative ? child?.structures?.[0]?.id ?? '' : ctx.structure?.id ?? '';
  // « Tous mes établissements » : créneaux et noms d'enseignants pris dans le premier établissement.
  const referenceStructureId = ctx.allStructures ? ctx.structures[0]?.id ?? '' : structureId;

  // Lien profond depuis le dashboard (widget "prochain cours") : #/?date=YYYY-MM-DD&start=HH:MM
  // ouvre directement la bonne semaine et met en évidence le créneau visé.
  const [searchParams] = useSearchParams();
  const targetDate = searchParams.get('date');
  const targetStart = searchParams.get('start');

  const {
    selection,
    setSelection,
    selectionKey,
    setSelectionKey,
    anchor,
    setAnchor,
    mode,
    setMode,
    view,
    setView,
    showQuarterHours,
    setShowQuarterHours,
  } = useTimetableState();
  // Un lien profond (#/?date=…) place directement la période sur la bonne date.
  useEffect(() => {
    if (!targetDate) return;
    const d = new Date(`${targetDate}T00:00:00`);
    if (!Number.isNaN(d.getTime())) setAnchor(d);
  }, [targetDate, setAnchor]);
  const period = useMemo(() => periodOf(mode, anchor), [mode, anchor]);

  const groupsQuery = useQuery({
    queryKey: ['edt', 'groups', structureId, isTeacher],
    queryFn: () => api.getGroups(structureId, isTeacher),
    enabled: !!structureId && !isRelative,
  });
  const matieresQuery = useQuery({ queryKey: ['edt', 'matieres', structureId], queryFn: () => api.getMatieres(structureId), enabled: !!structureId });
  const slotsQuery = useQuery({
    queryKey: ['edt', 'timeslots', referenceStructureId],
    queryFn: () => api.getTimeSlots(referenceStructureId),
    enabled: !!referenceStructureId,
  });

  const teacherId = ctx.userId;
  const teachersQuery = useQuery({
    queryKey: ['edt', 'teachers', referenceStructureId],
    queryFn: () => api.getTeachers(referenceStructureId),
    enabled: !!referenceStructureId,
  });

  // Comme l'Angular : un enseignant voit d'emblée son propre emploi du temps, le personnel part
  // d'une sélection vide. Repris à chaque changement d'établissement (la sélection n'y a plus cours).
  // La sélection n'est réinitialisée que si le contexte a changé : un aller-retour dans le
  // formulaire de cours la conserve.
  useEffect(() => {
    if (!ctx.ready) return;
    const key = `${structureId}|${ctx.profile}|${teacherId}`;
    if (key === selectionKey) return;
    setSelectionKey(key);
    setSelection(isTeacher && teacherId ? { ...EMPTY_SELECTION, teacherIds: [teacherId] } : EMPTY_SELECTION);
  }, [ctx.ready, ctx.profile, structureId, isTeacher, teacherId, selectionKey, setSelectionKey, setSelection]);

  const classes = useMemo(
    () => (isRelative ? (child ? childClasses(child) : []) : sortGroups(groupsQuery.data ?? [])),
    [isRelative, child, groupsQuery.data],
  );
  // Élève et parent ne composent pas leur filtre : toutes les classes et tous les groupes de
  // l'élève concerné sont affichés d'office (AngularJS : params.group = groupes de l'élève).
  const activeSelection: Selection = composesOwnFilter(ctx.profile)
    ? selection
    : { ...EMPTY_SELECTION, chosen: classes.map((c) => c.id) };
  // Groupes des classes restreints à ceux de l'élève (paramètre student de group/from/class).
  const studentId = isStudent ? teacherId : isRelative ? child?.id : undefined;
  // Groupes des classes choisies (demi-groupes, options), ajoutés automatiquement au filtre.
  const chosenClassIds = useMemo(
    () => activeSelection.chosen.filter((id) => classes.find((c) => c.id === id)?.type_groupe === 0).sort(),
    [activeSelection.chosen, classes],
  );
  const subGroupsQuery = useQuery({
    queryKey: ['edt', 'subgroups', chosenClassIds, studentId],
    queryFn: () => api.getSubGroups(chosenClassIds, studentId),
    enabled: chosenClassIds.length > 0,
    placeholderData: (previous) => previous,
  });
  const subGroups = useMemo(() => subGroupsQuery.data ?? new Map(), [subGroupsQuery.data]);
  const shownGroupIds = useMemo(() => effectiveGroupIds(activeSelection, subGroups), [activeSelection, subGroups]);
  const subjectName = useMemo(() => new Map((matieresQuery.data ?? []).map((m) => [m.id, m.name])), [matieresQuery.data]);
  const slots = slotsQuery.data ?? [];
  const teacherName = (id: string) => teachersQuery.data?.find((x) => x.id === id)?.displayName;

  const short = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const periodLabel =
    mode === 'day'
      ? anchor.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
      : mode === 'month'
        ? anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        : t('edt.timetable.period.range', { 0: short(period.first), 1: short(period.last) });
  const startAt = ymd(period.first);
  const endAt = ymd(period.last);
  const hasSelection = shownGroupIds.length > 0 || activeSelection.teacherIds.length > 0;
  const showFilter = composesOwnFilter(ctx.profile) && !ctx.allStructures;
  const filter = useMemo(
    () => coursesFilter(shownGroupIds, activeSelection.teacherIds, classes, subGroups),
    [shownGroupIds, activeSelection.teacherIds, classes, subGroups],
  );
  // Attendre de connaître les groupes des classes choisies avant de lire les cours : sinon un
  // premier affichage montre la classe sans ses groupes (ex. 602 sans GARRESPAFFECTATION), puis
  // un second la complète — deux lectures et un emploi du temps qui « saute ».
  const subGroupsPending = chosenClassIds.length > 0 && (subGroupsQuery.isPending || subGroupsQuery.isPlaceholderData);
  const coursesQuery = useQuery({
    queryKey: ['edt', 'courses', structureId, filter, startAt, endAt],
    queryFn: () => api.getCourses(structureId, filter, startAt, endAt),
    enabled: !!structureId && hasSelection && !subGroupsPending,
    placeholderData: (previous) => previous,
  });
  // « Tous mes établissements » (AngularJS calendarItems.sync, isAllStructure) : les cours de
  // l'usager lus dans chacun de ses établissements, puis réunis.
  const allStructuresQueries = useQueries({
    queries: (ctx.allStructures && activeSelection.teacherIds.length > 0 ? ctx.structures : []).map((st) => ({
      queryKey: ['edt', 'courses', st.id, filter, startAt, endAt],
      queryFn: () => api.getCourses(st.id, filter, startAt, endAt),
    })),
  });
  const rawCourses = ctx.allStructures ? allStructuresQueries.flatMap((q) => q.data ?? []) : coursesQuery.data ?? [];
  const coursesLoading = ctx.allStructures ? allStructuresQueries.some((q) => q.isLoading) : coursesQuery.isLoading;

  const courses = [...rawCourses].sort((a, b) => courseSortKey(a.startDate) - courseSortKey(b.startDate));
  // Libellés des ressources RBS, chargés seulement si un cours affiché en porte (cf. AngularJS
  // calendarItems.resolveRbsResourceLabels) — inutile pour un établissement sans RBS.
  const hasRbs = courses.some((c) => (c.rbsResourceIds ?? []).length > 0);
  const rbsQuery = useQuery({
    queryKey: ['edt', 'rbs-resources', structureId],
    queryFn: () => api.getRbsResources(structureId),
    enabled: !!structureId && hasRbs,
    staleTime: 5 * 60_000,
  });

  // Cours ciblé par le lien profond (date + heure de début).
  const highlightCourse = targetDate && targetStart
    ? courses.find((c) => (c.startDate || '').slice(0, 10) === targetDate && (c.startDate || '').slice(11, 16) === targetStart)
    : undefined;
  const highlightRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (highlightCourse) highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightCourse]);

  // Modifier / supprimer depuis le détail d'un cours : gestionnaires, sur un établissement précis.
  const [toDelete, setToDelete] = useState<Course | null>(null);
  // Cours d'une série : on demande d'abord « ce cours seulement » ou « toute la série ».
  const [toEdit, setToEdit] = useState<Course | null>(null);
  const actions: CourseActions | undefined =
    ctx.canManage && !ctx.allStructures
      ? { onEdit: (c) => (c.recurrence ? setToEdit(c) : navigate(`/edit/${c._id}`)), onDelete: setToDelete }
      : undefined;
  const courseLabel = (c: Course) =>
    `${courseSubject(c, (id) => subjectName.get(id))} — ${new Date(c.startDate.replace(' ', 'T')).toLocaleDateString(i18n.language || 'fr', { weekday: 'long', day: 'numeric', month: 'long' })} ${hhmm(c.startDate)}`;

  if (ctx.ready && ctx.structures.length === 0) {
    return (
      <div>
        <h1>{t('edt.timetable.title')}</h1>
        <div className="alert alert-info" role="alert">
          {t('edt.no.structure')}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-16 flex-wrap gap-8">
        <h1 className="m-0">{t('edt.timetable.title')}</h1>
        {ctx.canManage && !ctx.allStructures && (
          <button type="button" className="btn btn-primary" onClick={() => navigate('/create')}>
            {t('edt.course.new', { defaultValue: 'Créer un cours' })}
          </button>
        )}
      </div>

      {rbsConflict && (
        <div className="alert alert-warning" role="alert">{`${t('edt.notify.rbs.conflict')}${rbsConflict}`}</div>
      )}

      <div className="d-flex gap-16 align-items-start">
        {showFilter && (
        <FilterSidebar
          groups={classes}
          subGroups={subGroups}
          teachers={teachersQuery.data ?? []}
          selection={selection}
          onChange={setSelection}
        />
        )}
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
      {/* Barre de contrôle : établissement, navigation semaine, affichage */}
      <div className="d-flex gap-16 flex-wrap align-items-end mb-16">
        {isRelative && children.length > 1 && (
          <div>
            <label htmlFor="edt-child" className="form-label">{t('child.select')}</label>
            <select id="edt-child" className="form-select" value={child?.id ?? ''} onChange={(e) => setChildId(e.target.value)}>
              {children.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
            </select>
          </div>
        )}
        {isRelative && child && children.length === 1 && (
          <p className="m-0 fw-bold" data-testid="edt-child-name">{child.displayName}</p>
        )}
        {composesOwnFilter(ctx.profile) && ctx.structures.length > 1 && (
          <div>
            <label htmlFor="edt-structure" className="form-label">{t('edt.timetable.structure')}</label>
            <select
              id="edt-structure"
              className="form-select"
              value={ctx.allStructures ? ALL_STRUCTURES : structureId}
              onChange={(e) => ctx.selectStructure(e.target.value)}
            >
              {ctx.structures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value={ALL_STRUCTURES}>{t('all.structures.label')}</option>
            </select>
          </div>
        )}
        {showFilter && ctx.canSearch && (
          <>
            <SearchBox
              label={t('edt.search.teacher')}
              queryKey={['edt', 'search-teachers', structureId]}
              search={async (text) =>
                (await api.searchTeachers(structureId, text)).map((x) => ({
                  id: x.id,
                  label: x.displayName,
                  hint: (x.classesNames ?? []).join(', '),
                }))
              }
              onSelect={(o) =>
                setSelection((sel) => (sel.teacherIds.includes(o.id) ? sel : { ...sel, teacherIds: [...sel.teacherIds, o.id] }))
              }
            />
            <SearchBox
              label={t('edt.search.group')}
              queryKey={['edt', 'search-groups', structureId]}
              search={async (text) => (await api.searchGroups(structureId, text)).map((x) => ({ id: x.id, label: x.displayName }))}
              onSelect={(o) => setSelection((sel) => toggleGroup(sel, o.id, subGroups))}
            />
          </>
        )}
        {isTeacher && teacherId && !selection.teacherIds.includes(teacherId) && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSelection((sel) => ({ ...sel, teacherIds: [...sel.teacherIds, teacherId] }))}
          >
            {t('edt.timetable.mine')}
          </button>
        )}
        <div className="d-flex gap-8 align-items-center flex-wrap">
          <button type="button" className="btn btn-secondary" onClick={() => setAnchor((d) => step(mode, d, -1))}>
            {t('edt.timetable.nav.prev')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setAnchor(initialAnchor(new Date()))}>
            {t('edt.timetable.nav.today')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setAnchor((d) => step(mode, d, 1))}>
            {t('edt.timetable.nav.next')}
          </button>
          <input
            type="date"
            className="form-control"
            style={{ width: 'auto' }}
            aria-label={t('edt.timetable.nav.goto')}
            value={ymd(anchor)}
            onChange={(e) => {
              const d = new Date(`${e.target.value}T00:00:00`);
              if (!Number.isNaN(d.getTime())) setAnchor(d);
            }}
          />
          <span className="text-muted" data-testid="edt-period" style={{ minWidth: 150 }}>{periodLabel}</span>
        </div>
        <div className="btn-group" role="group" aria-label={t('edt.view', { defaultValue: 'Affichage' })}>
          {VIEW_MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={view === 'grid' && mode === m}
              className={`btn btn-${view === 'grid' && mode === m ? 'primary' : 'secondary'}`}
              onClick={() => {
                setMode(m);
                setView('grid');
              }}
            >
              {t(`edt.timetable.view.${m}`)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={view === 'list'}
            className={`btn btn-${view === 'list' ? 'primary' : 'secondary'}`}
            onClick={() => setView('list')}
          >
            {t('edt.view.list', { defaultValue: 'Liste' })}
          </button>
        </div>
        {view === 'grid' && (mode === 'day' || mode === 'week') && (
          <label className="d-flex align-items-center gap-4 m-0">
            <input type="checkbox" checked={showQuarterHours} onChange={(e) => setShowQuarterHours(e.target.checked)} />
            {t('edt.timetable.quarters')}
          </label>
        )}
      </div>

      {!hasSelection && (
        <p className="text-muted">{t(ctx.allStructures ? 'edt.timetable.all.structures.hint' : 'edt.timetable.select.prompt')}</p>
      )}

      {hasSelection && coursesLoading && <p>{t('edt.loading', { defaultValue: 'Chargement…' })}</p>}

      {hasSelection && !coursesLoading && courses.length === 0 && view === 'list' && (
        <p className="text-muted">{t('edt.timetable.courses.empty')}</p>
      )}

      {/* Vue GRILLE : semaine sur un axe horaire réel, cours simultanés côte à côte */}
      {hasSelection && view === 'grid' && (mode === 'fortnight' || mode === 'month') && (
        <MonthGrid
          days={period.days}
          month={mode === 'month' ? anchor.getMonth() : undefined}
          courses={courses}
          teacherName={teacherName}
          rbsName={(id) => rbsQuery.data?.get(id)}
          subjectName={(id) => subjectName.get(id)}
          actions={actions}
        />
      )}

      {hasSelection && view === 'grid' && (mode === 'day' || mode === 'week') && (
        <>
          <WeekGrid
            days={period.days}
            showQuarterHours={showQuarterHours}
            actions={actions}
            courses={courses}
            slots={slots}
            teacherName={teacherName}
            rbsName={(id) => rbsQuery.data?.get(id)}
            subjectName={(id) => subjectName.get(id)}
            highlighted={highlightCourse}
            highlightRef={(el) => { highlightRef.current = el; }}
            onCreateAt={ctx.canManage && !ctx.allStructures ? (date, minutes) => navigate(`/create?date=${date}&minutes=${minutes}`) : undefined}
          />
          {!coursesLoading && courses.length === 0 && (
            <p className="text-muted mt-8">{t('edt.courses.empty.grid')}</p>
          )}
        </>
      )}

      {/* Vue LISTE */}
      {hasSelection && view === 'list' && courses.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>{t('edt.day', { defaultValue: 'Jour' })}</th>
              <th>{t('edt.hours', { defaultValue: 'Horaire' })}</th>
              <th>{t('edt.subject', { defaultValue: 'Matière' })}</th>
              <th>{t('edt.timetable.filter.title')}</th>
              <th>{t('edt.timetable.filter.teachers')}</th>
              <th>{t('edt.room', { defaultValue: 'Salle' })}</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => {
              const isHighlighted = c === highlightCourse;
              return (
                <tr
                  key={`${c._id}|${c.startDate}`}
                  ref={isHighlighted ? (el) => { highlightRef.current = el; } : undefined}
                  style={isHighlighted ? { background: '#fff3cd', boxShadow: 'inset 0 0 0 2px #e0a800' } : undefined}
                >
                  <td>{dayLabel(c.startDate)}</td>
                  <td>{hhmm(c.startDate)} – {hhmm(c.endDate)}</td>
                  <td>{courseSubject(c, (id) => subjectName.get(id))}</td>
                  <td>{[...(c.classes ?? []), ...(c.groups ?? [])].join(', ')}</td>
                  <td>{(c.teacherIds ?? []).map(teacherName).filter(Boolean).join(', ')}</td>
                  <td>{(c.roomLabels ?? []).join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
        </div>
      </div>
      {toDelete && (
        <DeleteCourseDialog
          course={toDelete}
          label={courseLabel(toDelete)}
          onClose={() => setToDelete(null)}
        />
      )}
      {toEdit && (
        <EditScopeDialog
          label={courseLabel(toEdit)}
          onChoose={(scope) => navigate(scope === 'series' ? `/edit/${toEdit._id}?serie=1` : `/edit/${toEdit._id}`)}
          onClose={() => setToEdit(null)}
        />
      )}
    </div>
  );
}

export default Timetable;
