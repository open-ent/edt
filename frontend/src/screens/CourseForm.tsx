import { useEdificeClient } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { api, Group } from '../api';
import { sortGroups } from '../context';
import { CourseDraft, DraftError, effectiveTimes, emptyDraft, prefillTimes, toCoursePayload, validateDraft } from '../courseForm';
import { MultiPicker } from '../features/MultiPicker';
import { categoryLabel, localRequiredCategory, mismatchedResources, resourceLabel, sortForCategory } from '../rbs';
import { useEdtContext } from '../hooks/useEdtContext';
import { useTimetableState } from '../hooks/useTimetableState';
import { ymd } from '../utils';

/**
 * Création d'un cours ponctuel (route /create), mêmes champs et mêmes règles que l'IHM AngularJS
 * (template/manage-course.html) : enseignants, classes et groupes (présélectionnés d'après
 * l'emploi du temps affiché), matière — celles des enseignants d'abord —, ou matière personnalisée,
 * date, plage nommée ou horaire libre, étiquette.
 * Ouvert depuis un créneau vide de la grille : #/create?date=2026-10-12&minutes=600 (10:00).
 */
export function CourseForm() {
  const { t } = useTranslation(['edt', 'common']);
  const ctx = useEdtContext();
  const { user } = useEdificeClient();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
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

  // Pré-remplissage, une fois le référentiel chargé : enseignants et classes affichés dans l'emploi
  // du temps, créneau cliqué (ou le quart d'heure suivant sur le jour consulté).
  useEffect(() => {
    if (initialized || !structureId || !groupsQuery.data || !slotsQuery.data) return;
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
  }, [initialized, structureId, groupsQuery.data, slotsQuery.data, groups, selection, anchor, params]);

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
  const selectedRbs = rbsResources.filter((r) => draft.rbsResourceIds.includes(r.id));
  const mismatched = mismatchedResources(selectedRbs, requiredCategory);
  const times = effectiveTimes(draft, slots);
  const busyQuery = useQuery({
    queryKey: ['edt', 'rbs-busy', structureId, draft.rbsResourceIds, draft.date, times?.start, times?.end],
    queryFn: async () => {
      const busy = await Promise.all(
        selectedRbs.map(async (r) => ((await api.isResourceBusy(structureId, r, `${draft.date}T${times!.start}:00`, `${draft.date}T${times!.end}:00`)) ? r.name : null)),
      );
      return busy.filter((x): x is string => !!x);
    },
    enabled: selectedRbs.length > 0 && !!draft.date && !!times,
  });

  const errors = validateDraft(draft, slots, new Date());
  const create = useMutation({
    mutationFn: () => api.createCourses([toCoursePayload(draft, slots, user?.login ?? '', new Date())]),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['edt', 'courses'] });
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
    if (errors.length === 0 && !create.isPending) create.mutate();
  };

  const errorText: Record<DraftError, string> = {
    teachers: t('edt.form.error.teachers'),
    groups: t('edt.form.error.groups'),
    subject: t('edt.form.error.subject'),
    date: t('edt.form.error.date'),
    time: t('edt.form.error.time'),
    order: t('edt.form.error.order'),
    past: t('edt.form.error.past'),
  };
  const groupOption = (g: Group) => ({
    id: g.id,
    label: g.isInCurrentTeacher ? `${g.name} ${t('edt.timetable.group.mine')}` : g.name,
    section: g.type_groupe === 0 ? t('edt.timetable.groups.classes') : t('edt.timetable.groups.groups'),
  });

  if (ctx.ready && !ctx.canManage) {
    return <div className="alert alert-warning" role="alert">{t('edt.form.forbidden')}</div>;
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby="edt-course-form-title" style={{ maxWidth: 860 }}>
      <h1 id="edt-course-form-title" className="mb-16">{t('edt.course.new')}</h1>

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

        <div className="d-flex gap-12 flex-wrap align-items-end mb-12">
          <div>
            <label htmlFor="edt-date" className="form-label" style={{ fontWeight: 700 }}>{t('edt.date')} *</label>
            <input id="edt-date" type="date" className="form-control" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
          </div>
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
        </div>

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
            {(busyQuery.data ?? []).length > 0 && (
              <div className="alert alert-warning mt-8 mb-0" role="status">
                {`${busyQuery.data!.join(', ')} ${t('edt.rbs.room.conflict.detected')}`}
              </div>
            )}
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

      {submitted && errors.length > 0 && (
        <div className="alert alert-warning" role="alert">
          <ul className="m-0">{errors.map((e) => <li key={e}>{errorText[e]}</li>)}</ul>
        </div>
      )}
      {create.isError && <div className="alert alert-danger" role="alert">{t('edt.form.error.server')}</div>}

      <div className="d-flex gap-8 justify-content-end">
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>{t('edt.cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>{t('edt.course.create')}</button>
      </div>
    </form>
  );
}

export default CourseForm;
