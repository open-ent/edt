import { MediaLibrary, useEdificeClient, useMediaLibrary } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { api, Group } from '../api';
import { sortGroups } from '../context';
import { CourseDraft, draftFromCourse, DraftError, effectiveTimes, emptyDraft, isEditable, lineTimes, prefillTimes, SeriesError, SeriesLine, seriesDates, seriesPayloads, toCoursePayload, validateDraft, validateSeries } from '../courseForm';
import { MediacentrePicker } from '../features/MediacentrePicker';
import { MultiPicker } from '../features/MultiPicker';
import { addResources, PickedFile, workspaceResource } from '../resources';
import { categoryLabel, freeAlternatives, localRequiredCategory, mismatchedResources, resourceLabel, resourcesFromRoomLabels, sortForCategory } from '../rbs';
import { useEdtContext } from '../hooks/useEdtContext';
import { useTimetableState } from '../hooks/useTimetableState';
import { ymd } from '../utils';

/**
 * Création d'un cours ponctuel (route /create), mêmes champs et mêmes règles que l'IHM AngularJS
 * (template/manage-course.html) : enseignants, classes et groupes (présélectionnés d'après
 * l'emploi du temps affiché), matière — celles des enseignants d'abord —, ou matière personnalisée,
 * date, plage nommée ou horaire libre, étiquette.
 * Ouvert depuis un créneau vide de la grille : #/create?date=2026-10-12&minutes=600 (10:00).
 * Modification d'un cours existant (route /edit/:id) : même formulaire, pré-rempli avec le cours ;
 * pour un cours d'une série, seule cette occurrence est modifiée (la série entière : à venir).
 */
export function CourseForm() {
  const { t } = useTranslation(['edt', 'common']);
  const ctx = useEdtContext();
  const { user, appCode } = useEdificeClient();
  // Documents attachés : médiathèque du socle (espace documentaire) et recherche médiacentre.
  const { ref: mediaLibraryRef, ...mediaLibraryHandlers } = useMediaLibrary();
  const [mediacentreOpen, setMediacentreOpen] = useState(false);
  const [resourceNotice, setResourceNotice] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { id: editId } = useParams();
  const courseQuery = useQuery({ queryKey: ['edt', 'course', editId], queryFn: () => api.getCourse(editId!), enabled: !!editId });
  const stored = courseQuery.data;
  const { selection, anchor } = useTimetableState();
  const structureId = ctx.structure?.id ?? ctx.structures[0]?.id ?? '';
  const isTeacher = ctx.profile === 'teacher';

  const groupsQuery = useQuery({ queryKey: ['edt', 'groups', structureId, isTeacher], queryFn: () => api.getGroups(structureId, isTeacher), enabled: !!structureId });
  const teachersQuery = useQuery({ queryKey: ['edt', 'teachers', structureId], queryFn: () => api.getTeachers(structureId), enabled: !!structureId });
  const slotsQuery = useQuery({ queryKey: ['edt', 'timeslots', structureId], queryFn: () => api.getTimeSlots(structureId), enabled: !!structureId });
  const allSubjectsQuery = useQuery({ queryKey: ['edt', 'subjects', structureId], queryFn: () => api.getSubjects(structureId), enabled: !!structureId });
  const tagsQuery = useQuery({ queryKey: ['edt', 'course-tags', structureId], queryFn: () => api.getCourseTags(structureId), enabled: !!structureId });

  const groups = useMemo(() => sortGroups(groupsQuery.data ?? []), [groupsQuery.data]);
  const slots = slotsQuery.data ?? [];
  const [draft, setDraft] = useState<CourseDraft>(() => emptyDraft(structureId));
  const [submitted, setSubmitted] = useState(false);
  const [initialized, setInitialized] = useState(false);
  // Série (création seulement) : même formulaire, la date devient « Du », un « Au » s'ajoute, et
  // l'horaire saisi s'ajoute comme créneau (jour + horaire) à la liste des créneaux de la série.
  const [recurrent, setRecurrent] = useState(false);
  const [series, setSeries] = useState<{ endDate: string; everyTwoWeek: boolean; lines: SeriesLine[] }>({ endDate: '', everyTwoWeek: false, lines: [] });
  const [lineDay, setLineDay] = useState('');
  // Modification de toute la série (#/edit/:id?serie=1) : occurrences à venir seulement.
  const serieMode = !!editId && params.get('serie') === '1';
  const recurrenceId = stored?.recurrence ?? undefined;
  const recurrenceDatesQuery = useQuery({
    queryKey: ['edt', 'recurrence-dates', recurrenceId],
    queryFn: () => api.getRecurrenceDates(recurrenceId!),
    enabled: serieMode && !!recurrenceId,
  });
  const [serieReady, setSerieReady] = useState(false);
  useEffect(() => {
    // Période et créneau repris de la série ; début au plus tôt aujourd'hui (les cours passés ne
    // changent pas), comme getFirstRecurrenceDate de l'AngularJS.
    if (!serieMode || serieReady || !initialized || !stored || !recurrenceDatesQuery.data) return;
    const today = ymd(new Date());
    const from = recurrenceDatesQuery.data.startDate.slice(0, 10);
    setDraft((d) => ({ ...d, date: from > today ? from : today }));
    setSeries((x) => ({ ...x, endDate: recurrenceDatesQuery.data!.endDate.slice(0, 10), everyTwoWeek: !!stored.everyTwoWeek }));
    setLineDay(String(new Date(stored.startDate.replace(' ', 'T')).getDay()));
    setSerieReady(true);
  }, [serieMode, serieReady, initialized, stored, recurrenceDatesQuery.data]);
  const seriesUi = recurrent || serieMode;
  const schoolYearQuery = useQuery({ queryKey: ['edt', 'school-year', structureId], queryFn: () => api.getSchoolYear(structureId), enabled: !!structureId && recurrent });
  useEffect(() => {
    // Fin de série proposée : fin de l'année scolaire, comme l'AngularJS (makeRecurrentCourse).
    if (recurrent && !series.endDate && schoolYearQuery.data) setSeries((x) => ({ ...x, endDate: schoolYearQuery.data!.end }));
  }, [recurrent, series.endDate, schoolYearQuery.data]);

  // Pré-remplissage, une fois le référentiel chargé : enseignants et classes affichés dans l'emploi
  // du temps, créneau cliqué (ou le quart d'heure suivant sur le jour consulté).
  useEffect(() => {
    if (initialized || !structureId || !groupsQuery.data || !slotsQuery.data) return;
    if (editId) {
      // Modification : le cours lui-même, pas la sélection de l'emploi du temps.
      if (!stored) return;
      setDraft(draftFromCourse({ ...stored, structureId: stored.structureId ?? structureId }, groups, slotsQuery.data));
      setInitialized(true);
      return;
    }
    const date = params.get('date') ?? ymd(anchor < new Date() ? new Date() : anchor);
    const now = new Date();
    const minutes = params.get('minutes') !== null ? Number(params.get('minutes')) : Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 15) * 15;
    const chosenGroups = groups.filter((g) => selection.chosen.includes(g.id));
    setDraft(
      prefillTimes(
        { ...emptyDraft(structureId), teacherIds: selection.teacherIds, groups: chosenGroups },
        slotsQuery.data,
        date,
        minutes,
      ),
    );
    setInitialized(true);
  }, [initialized, structureId, groupsQuery.data, slotsQuery.data, groups, selection, anchor, params, editId, stored]);

  // Matières des enseignants choisis, en tête de liste ; la première est présélectionnée.
  const teacherSubjectsQuery = useQuery({
    queryKey: ['edt', 'subjects', structureId, [...draft.teacherIds].sort()],
    queryFn: () => api.getSubjects(structureId, draft.teacherIds),
    enabled: !!structureId && draft.teacherIds.length > 0,
  });
  const teacherSubjects = useMemo(
    () => [...(draft.teacherIds.length ? teacherSubjectsQuery.data ?? [] : [])].sort((a, b) => a.subjectLabel.localeCompare(b.subjectLabel)),
    [draft.teacherIds.length, teacherSubjectsQuery.data],
  );
  const otherSubjects = useMemo(
    () => [...(allSubjectsQuery.data ?? [])].filter((s) => !teacherSubjects.some((x) => x.subjectId === s.subjectId)).sort((a, b) => a.subjectLabel.localeCompare(b.subjectLabel)),
    [allSubjectsQuery.data, teacherSubjects],
  );
  useEffect(() => {
    if (!draft.subjectId && teacherSubjects.length > 0) setDraft((d) => ({ ...d, subjectId: teacherSubjects[0].subjectId }));
  }, [teacherSubjects, draft.subjectId]);

  // ── Ressources RBS : catégorie attendue pour la matière, avertissements non bloquants ──
  const rbsQuery = useQuery({ queryKey: ['edt', 'rbs-list', structureId], queryFn: () => api.getRbsResourceList(structureId), enabled: !!structureId });
  const rbsResources = rbsQuery.data ?? [];
  const subject = [...teacherSubjects, ...otherSubjects].find((x) => x.subjectId === draft.subjectId);
  const categoryQuery = useQuery({
    queryKey: ['edt', 'room-category', structureId, subject?.subjectId],
    queryFn: () => api.getRoomCategory(structureId, subject!.subjectLabel, subject!.subjectCode),
    enabled: !!subject && !draft.isExceptional,
    staleTime: Infinity,
  });
  // Repli sur l'heuristique locale si school-planner ne répond pas ou ne connaît pas la matière.
  const requiredCategory = !subject || draft.isExceptional ? null : categoryQuery.data ?? localRequiredCategory(subject.subjectLabel);
  const sortedRbs = useMemo(() => sortForCategory(rbsResources, requiredCategory), [rbsResources, requiredCategory]);
  // Cours jamais lié à une ressource mais portant une salle « texte » (ex. « Amphithéâtre4 », cours
  // importé) : la ressource du même nom est présélectionnée à l'ouverture, comme dans l'AngularJS.
  // Une seule fois, à l'initialisation : retirer ensuite la ressource reste possible.
  const [labelsMatched, setLabelsMatched] = useState(false);
  useEffect(() => {
    if (!editId || !initialized || labelsMatched || !stored || !rbsQuery.data) return;
    setLabelsMatched(true);
    if ((stored.rbsResourceIds ?? []).length > 0) return;
    const ids = resourcesFromRoomLabels(stored.roomLabels ?? [], rbsQuery.data);
    if (ids.length) setDraft((d) => (d.rbsResourceIds.length ? d : { ...d, rbsResourceIds: ids }));
  }, [editId, initialized, labelsMatched, stored, rbsQuery.data]);
  const selectedRbs = rbsResources.filter((r) => draft.rbsResourceIds.includes(r.id));
  const mismatched = mismatchedResources(selectedRbs, requiredCategory);
  const times = effectiveTimes(draft, slots);
  // Ressources déjà prises sur le créneau : l'enregistrement est bloqué tant qu'il en reste une,
  // avec des ressources libres proposées en remplacement (cf. freeAlternatives).
  const currentLine: SeriesLine = { dayOfWeek: Number(lineDay), freeSchedule: draft.freeSchedule, startSlotId: draft.startSlotId, endSlotId: draft.endSlotId, startTime: draft.startTime, endTime: draft.endTime };
  const seriesLines = serieMode ? (lineDay !== '' ? [currentLine] : []) : series.lines;
  const seriesOptions = { startDate: draft.date, endDate: series.endDate, everyTwoWeek: series.everyTwoWeek, lines: seriesLines };
  // Créneaux réels de la série (une entrée par cours), ex. lundis 08:00-10:00 du 12/10 au 26/10.
  const seriesSlots = useMemo(
    () =>
      seriesUi
        ? seriesLines
            .flatMap((l) => {
              const t = lineTimes(l, slots);
              return t ? seriesDates(draft.date, series.endDate, l.dayOfWeek, series.everyTwoWeek).map((d) => ({ startAt: `${d}T${t.start}:00`, endAt: `${d}T${t.end}:00` })) : [];
            })
            // Modification de série : seules les occurrences à venir sont touchées.
            .filter((x) => !serieMode || new Date(x.startAt).getTime() > Date.now())
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seriesUi, serieMode, JSON.stringify(seriesLines), series.endDate, series.everyTwoWeek, slots, draft.date],
  );
  const busyQuery = useQuery({
    queryKey: seriesUi ? ['edt', 'rbs-busy-series', structureId, seriesSlots, recurrenceId] : ['edt', 'rbs-busy', structureId, draft.date, times?.start, times?.end, editId],
    queryFn: async () =>
      seriesUi
        ? api.getBusyResourcesForSlots(structureId, seriesSlots, undefined, serieMode ? recurrenceId : undefined)
        : { busy: await api.getBusyResourceIds(structureId, `${draft.date}T${times!.start}:00`, `${draft.date}T${times!.end}:00`, editId), dates: {} as Record<string, string[]> },
    enabled: !!structureId && draft.rbsResourceIds.length > 0 && (seriesUi ? seriesSlots.length > 0 : !!draft.date && !!times),
  });
  const busyIds = busyQuery.data?.busy ?? [];
  const busyDates = busyQuery.data?.dates ?? {};
  const takenRbs = selectedRbs.filter((r) => busyIds.includes(r.id));
  // Disponibilité pas encore connue pour le créneau choisi : on attend avant d'enregistrer. En cas
  // d'échec de la vérification, on n'empêche pas d'enregistrer : le serveur signale lui-même une
  // ressource qu'il n'a pas pu réserver (rbsConflicts).
  const availabilityPending =
    selectedRbs.length > 0 && (seriesUi ? seriesSlots.length > 0 : !!draft.date && !!times) && !busyQuery.isError && (busyQuery.isFetching || !busyQuery.data);

  const onPickFiles = (result: unknown) => {
    const picked = (Array.isArray(result) ? result : [result]) as PickedFile[];
    const incoming = picked.map(workspaceResource).filter((r): r is NonNullable<typeof r> => r !== null);
    const merged = addResources(draft.resources, incoming);
    setDraft((d) => ({ ...d, resources: merged.resources }));
    setResourceNotice(merged.duplicates > 0 ? t('edt.form.resource.duplicates') : '');
    mediaLibraryRef.current?.hide();
  };

  // Série : les règles d'horaire et de date portent sur les créneaux (validateSeries), pas sur le brouillon.
  const draftErrors = validateDraft(draft, slots, new Date()).filter((e) => !seriesUi || ['teachers', 'groups', 'subject'].includes(e));
  const errors: Array<DraftError | SeriesError | 'roomBusy'> = [
    ...draftErrors,
    // Modification de série : les occurrences déjà passées sont ignorées, pas une erreur.
    ...(seriesUi ? validateSeries(seriesOptions, slots, new Date()).filter((e) => !draftErrors.includes(e as DraftError) && !(serieMode && e === 'past')) : []),
    ...(takenRbs.length ? (['roomBusy'] as const) : []),
  ];
  const create = useMutation({
    mutationFn: () => {
      if (recurrent) return api.createCourses(seriesPayloads(draft, seriesOptions, slots, user?.login ?? '', new Date(), () => crypto.randomUUID()));
      if (serieMode && recurrenceId) {
        // Comme l'AngularJS (isUpdateRecurrence) : nouvelle période + horaire dans startDate/endDate,
        // jour dans dayOfWeek, nouvel identifiant de série dans newRecurrence.
        const t = lineTimes(currentLine, slots)!;
        return api.updateRecurrence(recurrenceId, {
          ...toCoursePayload({ ...draft, ...currentLine }, slots, user?.login ?? '', new Date()),
          _id: editId,
          recurrence: recurrenceId,
          newRecurrence: crypto.randomUUID(),
          dayOfWeek: currentLine.dayOfWeek,
          everyTwoWeek: series.everyTwoWeek,
          startDate: `${draft.date}T${t.start}:00`,
          endDate: `${series.endDate}T${t.end}:00`,
        });
      }
      const payload = toCoursePayload(draft, slots, user?.login ?? '', new Date());
      return editId ? api.updateCourse(editId, payload) : api.createCourses([payload]);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['edt', 'courses'] });
      if (editId) qc.removeQueries({ queryKey: ['edt', 'course', editId] });
      // Cours enregistré, mais une ressource RBS n'a pas pu être réservée (créneau déjà pris) :
      // on le dit sur l'emploi du temps au lieu de l'ignorer.
      const ids = [...new Set((result?.rbsConflicts ?? []).flatMap((c) => c.conflictResourceIds ?? []))];
      const names = ids.map((id) => rbsResources.find((r) => r.id === id)?.name ?? String(id));
      navigate('/', { state: names.length ? { rbsConflict: names.join(', ') } : undefined });
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (errors.length === 0 && !availabilityPending && !create.isPending) create.mutate();
  };

  const errorText: Record<DraftError | SeriesError | 'roomBusy', string> = {
    roomBusy: t('edt.form.error.roomBusy'),
    lines: t('edt.form.error.series.lines'),
    period: t('edt.error.date.is.not.a.week.after'),
    lineTimes: t('edt.form.error.series.lineTimes'),
    empty: t('edt.form.error.series.empty'),
    teachers: t('edt.form.error.teachers'),
    groups: t('edt.form.error.groups'),
    subject: t('edt.form.error.subject'),
    date: t('edt.form.error.date'),
    time: t('edt.form.error.time'),
    order: t('edt.form.error.order'),
    past: t('edt.form.error.past'),
  };
  const dayName = (day: number) => new Date(2026, 9, 4 + day).toLocaleDateString('fr', { weekday: 'long' });
  const addLine = () => {
    const line: SeriesLine = { dayOfWeek: Number(lineDay), freeSchedule: draft.freeSchedule, startSlotId: draft.startSlotId, endSlotId: draft.endSlotId, startTime: draft.startTime, endTime: draft.endTime };
    setSeries((x) => ({ ...x, lines: [...x.lines, line] }));
  };
  const lineLabel = (l: SeriesLine) => {
    const t = lineTimes(l, slots);
    return `${dayName(l.dayOfWeek)} ${t ? `${t.start} – ${t.end}` : ''}`;
  };
  const canAddLine = lineDay !== '' && !!lineTimes({ ...series.lines[0], dayOfWeek: 0, freeSchedule: draft.freeSchedule, startSlotId: draft.startSlotId, endSlotId: draft.endSlotId, startTime: draft.startTime, endTime: draft.endTime }, slots);
  const groupOption = (g: Group) => ({
    id: g.id,
    label: g.isInCurrentTeacher ? `${g.name} ${t('edt.timetable.group.mine')}` : g.name,
    section: g.type_groupe === 0 ? t('edt.timetable.groups.classes') : t('edt.timetable.groups.groups'),
  });

  if (ctx.ready && !ctx.canManage) {
    return <div className="alert alert-warning" role="alert">{t('edt.form.forbidden')}</div>;
  }
  if (editId && courseQuery.isError) {
    return <div className="alert alert-danger" role="alert">{t('edt.form.edit.notfound')}</div>;
  }
  if (editId && !serieMode && stored && !isEditable(stored.startDate, new Date())) {
    return (
      <div className="alert alert-warning" role="alert">
        {t('edt.cantDelete.courses.before')}{' '}
        <button type="button" className="btn btn-sm btn-secondary ms-8" onClick={() => navigate('/')}>{t('edt.cancel')}</button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby="edt-course-form-title" style={{ maxWidth: 860 }}>
      <h1 id="edt-course-form-title" className="mb-16">{t(serieMode ? 'edt.form.edit.series' : editId ? 'edt.schedule.update' : 'edt.course.new')}</h1>
      {editId && !initialized && <p role="status">{t('edt.form.edit.loading')}</p>}
      {stored?.recurrence && <div className="alert alert-info" role="status">{t(serieMode ? 'edt.form.edit.series.info' : 'edt.form.edit.occurrence')}</div>}

      <div className="card p-16 mb-16">
        <MultiPicker
          legend={t('edt.form.teachers')}
          required
          options={(teachersQuery.data ?? []).map((x) => ({ id: x.id, label: x.displayName }))}
          selected={draft.teacherIds}
          onChange={(teacherIds) => setDraft((d) => ({ ...d, teacherIds, subjectId: teacherIds.length ? d.subjectId : '' }))}
        />
        <MultiPicker
          legend={t('edt.form.groups')}
          required
          options={groups.map(groupOption)}
          selected={draft.groups.map((g) => g.id)}
          onChange={(ids) => setDraft((d) => ({ ...d, groups: groups.filter((g) => ids.includes(g.id)) }))}
        />

        <div className="mb-12">
          <label htmlFor="edt-subject" className="form-label" style={{ fontWeight: 700 }}>{t('edt.subject')} *</label>
          <div className="d-flex gap-12 align-items-center flex-wrap">
            {!draft.isExceptional ? (
              <select
                id="edt-subject"
                className="form-select"
                style={{ maxWidth: 420 }}
                value={draft.subjectId}
                onChange={(e) => setDraft((d) => ({ ...d, subjectId: e.target.value }))}
              >
                <option value="">{t('edt.class.choose')}</option>
                {teacherSubjects.length > 0 && (
                  <optgroup label={t('edt.subjects.teachers')}>
                    {teacherSubjects.map((s) => <option key={`t-${s.subjectId}`} value={s.subjectId}>{s.subjectLabel}</option>)}
                  </optgroup>
                )}
                <optgroup label={t('edt.subjects.others')}>
                  {otherSubjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.subjectLabel}</option>)}
                </optgroup>
              </select>
            ) : (
              <input
                id="edt-subject"
                type="text"
                className="form-control"
                style={{ maxWidth: 420 }}
                placeholder={t('exceptionnal.subject')}
                value={draft.exceptional}
                onChange={(e) => setDraft((d) => ({ ...d, exceptional: e.target.value }))}
              />
            )}
            <label className="d-flex align-items-center gap-4 m-0">
              <input type="checkbox" checked={draft.isExceptional} onChange={(e) => setDraft((d) => ({ ...d, isExceptional: e.target.checked }))} />
              {t('edt.form.exceptional')}
            </label>
          </div>
        </div>

        {!editId && (
          <fieldset className="mb-12">
            <legend className="form-label" style={{ fontWeight: 700, fontSize: 15 }}>{t('edt.type')}</legend>
            <div className="d-flex gap-16 flex-wrap align-items-center">
              <label className="d-flex align-items-center gap-4 m-0">
                <input type="radio" name="edt-course-type" checked={!recurrent} onChange={() => setRecurrent(false)} />
                {t('edt.type.punctual')}
              </label>
              <label className="d-flex align-items-center gap-4 m-0">
                <input type="radio" name="edt-course-type" checked={recurrent} onChange={() => setRecurrent(true)} />
                {t('edt.type.recurrent')}
              </label>
              {recurrent && (
                <label className="d-flex align-items-center gap-4 m-0">
                  <input type="checkbox" checked={series.everyTwoWeek} onChange={(e) => setSeries((x) => ({ ...x, everyTwoWeek: e.target.checked }))} />
                  {t('edt.every.two.weeks')}
                </label>
              )}
            </div>
          </fieldset>
        )}

        <div className="d-flex gap-12 flex-wrap align-items-end mb-12">
          <div>
            <label htmlFor="edt-date" className="form-label" style={{ fontWeight: 700 }}>{t(seriesUi ? 'from' : 'edt.date')} *</label>
            <input id="edt-date" type="date" className="form-control" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
          </div>
          {seriesUi && (
            <div>
              <label htmlFor="edt-end-date" className="form-label" style={{ fontWeight: 700 }}>{t('edt.form.series.to')} *</label>
              <input id="edt-end-date" type="date" className="form-control" value={series.endDate} onChange={(e) => setSeries((x) => ({ ...x, endDate: e.target.value }))} />
            </div>
          )}
        </div>

        <div className="d-flex gap-12 flex-wrap align-items-end mb-12">
          {seriesUi && (
            <div>
              <label htmlFor="edt-line-day" className="form-label" style={{ fontWeight: 700 }}>{t('edt.utils.day')}</label>
              <select id="edt-line-day" className="form-select" value={lineDay} onChange={(e) => setLineDay(e.target.value)}>
                <option value="">{t('edt.utils.day.choose')}</option>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{dayName(d)}</option>)}
              </select>
            </div>
          )}
          {!draft.freeSchedule ? (
            <>
              <div>
                <label htmlFor="edt-start-slot" className="form-label" style={{ fontWeight: 700 }}>{t('edt.start')}</label>
                <select id="edt-start-slot" className="form-select" value={draft.startSlotId} onChange={(e) => setDraft((d) => ({ ...d, startSlotId: e.target.value }))}>
                  <option value="">{t('edt.class.choose')}</option>
                  {slots.map((s) => <option key={s.id} value={s.id}>{`${s.name} : ${s.startHour.slice(0, 5)}`}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="edt-end-slot" className="form-label" style={{ fontWeight: 700 }}>{t('edt.end')}</label>
                <select id="edt-end-slot" className="form-select" value={draft.endSlotId} onChange={(e) => setDraft((d) => ({ ...d, endSlotId: e.target.value }))}>
                  <option value="">{t('edt.class.choose')}</option>
                  {slots.map((s) => <option key={s.id} value={s.id}>{`${s.name} : ${s.endHour.slice(0, 5)}`}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="edt-start-time" className="form-label" style={{ fontWeight: 700 }}>{t('edt.start')}</label>
                <input id="edt-start-time" type="time" step={900} className="form-control" value={draft.startTime} onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="edt-end-time" className="form-label" style={{ fontWeight: 700 }}>{t('edt.end')}</label>
                <input id="edt-end-time" type="time" step={900} className="form-control" value={draft.endTime} onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))} />
              </div>
            </>
          )}
          <label className="d-flex align-items-center gap-4 m-0 pb-8">
            <input type="checkbox" checked={draft.freeSchedule} onChange={(e) => setDraft((d) => ({ ...d, freeSchedule: e.target.checked }))} />
            {t('edt.free.schedule.time.choice')}
          </label>
          {recurrent && (
            <button type="button" className="btn btn-secondary" disabled={!canAddLine} onClick={addLine}>{t('edt.form.series.add')}</button>
          )}
        </div>

        {serieMode && seriesSlots.length > 0 && (
          <p className="mb-12" role="status" style={{ fontSize: 14 }}>
            {t('edt.form.series.updated.count', { 0: seriesSlots.length })}{' '}
            <span className="text-muted">
              {seriesSlots.slice(0, 4).map((x) => new Date(x.startAt).toLocaleDateString('fr', { day: '2-digit', month: '2-digit' })).join(', ')}
              {seriesSlots.length > 4 ? '…' : ''}
            </span>
          </p>
        )}

        {recurrent && (
          <section className="mb-12" aria-labelledby="edt-series-title">
            <div id="edt-series-title" role="heading" aria-level={2} style={{ fontSize: 15, fontWeight: 700 }}>{t('edt.form.series.lines')}</div>
            {series.lines.length === 0 ? (
              <p className="text-muted m-0" style={{ fontSize: 14 }}>{t('edt.form.series.none')}</p>
            ) : (
              <ul className="list-unstyled m-0 d-flex flex-column gap-4" data-series-lines>
                {series.lines.map((l, i) => (
                  <li key={i} className="d-flex align-items-center gap-8" style={{ textTransform: 'capitalize' }}>
                    {lineLabel(l)}
                    <button
                      type="button"
                      className="border-0 bg-transparent p-0"
                      style={{ color: '#555', fontSize: 16, fontWeight: 700, lineHeight: 1 }}
                      aria-label={t('edt.timetable.filter.remove', { 0: lineLabel(l) })}
                      onClick={() => setSeries((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {seriesSlots.length > 0 && (
              <p className="mt-8 mb-0" role="status" style={{ fontSize: 14 }}>
                {t('edt.form.series.count', { 0: seriesSlots.length })}{' '}
                <span className="text-muted">
                  {seriesSlots.slice(0, 4).map((x) => new Date(x.startAt).toLocaleDateString('fr', { day: '2-digit', month: '2-digit' })).join(', ')}
                  {seriesSlots.length > 4 ? '…' : ''}
                </span>
              </p>
            )}
          </section>
        )}

        {rbsResources.length > 0 && (
          <div className="mb-12">
            <label htmlFor="edt-rbs" className="form-label" style={{ fontWeight: 700 }}>{t('edt.form.resources')}</label>
            <select
              id="edt-rbs"
              className="form-select"
              style={{ maxWidth: 420 }}
              value=""
              onChange={(e) => {
                const rid = Number(e.target.value);
                if (rid) setDraft((d) => (d.rbsResourceIds.includes(rid) ? d : { ...d, rbsResourceIds: [...d.rbsResourceIds, rid] }));
              }}
            >
              <option value="">{t('edt.utils.rbs.resource.choose')}</option>
              {sortedRbs.map((r) => <option key={r.id} value={r.id}>{resourceLabel(r)}</option>)}
            </select>
            {selectedRbs.length > 0 && (
              <div className="d-flex flex-wrap gap-4 mt-8">
                {selectedRbs.map((r) => (
                  <span key={r.id} className="badge rounded-pill bg-light text-dark border d-inline-flex align-items-center gap-4" style={{ fontSize: 13 }}>
                    {resourceLabel(r)}
                    <button
                      type="button"
                      className="border-0 bg-transparent p-0"
                      style={{ color: '#555', fontSize: 16, fontWeight: 700, lineHeight: 1 }}
                      aria-label={t('edt.timetable.filter.remove', { 0: r.name })}
                      onClick={() => setDraft((d) => ({ ...d, rbsResourceIds: d.rbsResourceIds.filter((x) => x !== r.id) }))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {mismatched.length > 0 && subject && (
              <div className="alert alert-warning mt-8 mb-0" role="status">
                {t('edt.form.category.mismatch', { 0: mismatched.map((r) => r.name).join(', '), 1: categoryLabel(requiredCategory!), 2: subject.subjectLabel })}
              </div>
            )}
            {takenRbs.map((taken) => {
              const alternatives = freeAlternatives(taken, sortedRbs, busyIds, draft.rbsResourceIds);
              return (
                // display: block : le thème met le contenu d'une .alert en ligne (texte et boutons côte à côte).
                <div key={taken.id} className="alert alert-danger mt-8 mb-0" role="alert" data-busy-resource={taken.id} style={{ display: 'block' }}>
                  <p className="mb-8">{t('edt.form.room.busy', { 0: resourceLabel(taken) })}</p>
                  {(busyDates[String(taken.id)] ?? []).length > 0 && seriesUi && (
                    <p className="mb-8">
                      {t('edt.form.room.busy.dates', {
                        0: busyDates[String(taken.id)].map((d) => new Date(`${d}T12:00:00`).toLocaleDateString('fr', { day: '2-digit', month: '2-digit' })).join(', '),
                      })}
                    </p>
                  )}
                  <p className="mb-4" style={{ fontWeight: 700 }}>
                    {alternatives.length ? t('edt.form.room.busy.free') : t('edt.form.room.busy.none')}
                  </p>
                  <div className="d-flex flex-wrap gap-8">
                    {alternatives.map((alt) => (
                      <button
                        key={alt.id}
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => setDraft((d) => ({ ...d, rbsResourceIds: d.rbsResourceIds.map((x) => (x === taken.id ? alt.id : x)) }))}
                      >
                        {t('edt.form.room.replace', { 0: resourceLabel(alt) })}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setDraft((d) => ({ ...d, rbsResourceIds: d.rbsResourceIds.filter((x) => x !== taken.id) }))}
                    >
                      {t('edt.timetable.filter.remove', { 0: taken.name })}
                    </button>
                    {editId && (
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigate('/')}>
                        {t('edt.form.edit.cancel')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="edt-tag" className="form-label" style={{ fontWeight: 700 }}>{t('edt.utils.course.label')}</label>
          <select
            id="edt-tag"
            className="form-select"
            style={{ maxWidth: 420 }}
            value={draft.tagId ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, tagId: e.target.value ? Number(e.target.value) : undefined }))}
          >
            <option value="">{t('edt.form.no.tag')}</option>
            {(tagsQuery.data ?? []).filter((tag) => !tag.isHidden).map((tag) => <option key={tag.id} value={tag.id}>{tag.label}</option>)}
          </select>
        </div>
      </div>

      <section className="card p-16 mb-16" aria-labelledby="edt-resources-title">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-8 mb-8">
          <div id="edt-resources-title" role="heading" aria-level={2} style={{ fontSize: 15, fontWeight: 700 }}>{t('edt.resources.label')}</div>
          <div className="d-flex gap-8 flex-wrap">
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => mediaLibraryRef.current?.show('attachment')}>
              {t('edt.resources.add.workspace')}
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setMediacentreOpen(true)}>
              {t('edt.resources.add.mediacentre')}
            </button>
          </div>
        </div>
        {draft.resources.length === 0 ? (
          <p className="text-muted m-0" style={{ fontSize: 14 }}>{t('edt.form.resource.none')}</p>
        ) : (
          <ul className="list-unstyled m-0 d-flex flex-column gap-4">
            {draft.resources.map((r) => (
              <li key={`${r.type}|${r.id}`} className="d-flex align-items-center justify-content-between gap-8">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-truncate">
                  {r.type === 'mediacentre' ? `${t('edt.form.resource.mediacentre')} : ` : ''}
                  {r.name}
                </a>
                <button
                  type="button"
                  className="border-0 bg-transparent p-0"
                  style={{ color: '#555', fontSize: 16, fontWeight: 700, lineHeight: 1 }}
                  aria-label={t('edt.timetable.filter.remove', { 0: r.name })}
                  onClick={() => setDraft((d) => ({ ...d, resources: d.resources.filter((x) => !(x.type === r.type && x.id === r.id)) }))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {resourceNotice && <p className="text-muted mt-8 mb-0" role="status">{resourceNotice}</p>}
      </section>

      {mediacentreOpen && (
        <MediacentrePicker
          attached={draft.resources}
          onAdd={(resource) => setDraft((d) => ({ ...d, resources: addResources(d.resources, [resource]).resources }))}
          onClose={() => setMediacentreOpen(false)}
        />
      )}
      <MediaLibrary appCode={appCode} ref={mediaLibraryRef} multiple visibility="protected" {...mediaLibraryHandlers} onSuccess={onPickFiles} />

      {submitted && errors.length > 0 && (
        <div className="alert alert-warning" role="alert">
          <ul className="m-0">{errors.map((e) => <li key={e}>{errorText[e]}</li>)}</ul>
        </div>
      )}
      {create.isError && <div className="alert alert-danger" role="alert">{t(editId ? 'edt.form.error.server.update' : 'edt.form.error.server')}</div>}

      <div className="d-flex gap-8 justify-content-end">
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>{t('edt.cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={create.isPending || availabilityPending || (!!editId && !initialized) || (serieMode && !serieReady)}>
          {t(editId ? 'edt.utils.save' : 'edt.course.create')}
        </button>
      </div>
    </form>
  );
}

export default CourseForm;
