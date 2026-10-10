import { Modal } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, CourseTag, CourseTagInput } from '../api';
import { useEdtContext } from '../hooks/useEdtContext';

const EMPTY: CourseTagInput = { label: '', abbreviation: '', isPrimary: false, allowRegister: true };
const isValid = (t: CourseTagInput) => t.label.trim() !== '' && t.abbreviation.trim() !== '';

/**
 * Étiquettes de cours de l'établissement, comme le sniplet AngularJS « Labels de cours »
 * (template/behaviours/sniplet-course-tags.html) : ajout, modification, et pour chaque étiquette
 * « Masquer / Afficher » si elle est déjà posée sur des cours, « Supprimer » sinon.
 * Ex. « Sortie scolaire », abréviation « SOR », prioritaire, sans appel.
 */
export function AdminLabels() {
  const { t } = useTranslation(['edt', 'common']);
  const ctx = useEdtContext();
  const qc = useQueryClient();
  const structureId = ctx.structure?.id ?? '';
  const tagsQuery = useQuery({ queryKey: ['edt', 'course-tags', structureId], queryFn: () => api.getCourseTags(structureId), enabled: !!structureId });
  const [form, setForm] = useState<CourseTagInput>(EMPTY);
  const [editing, setEditing] = useState<{ id: number; form: CourseTagInput } | null>(null);
  const [toDelete, setToDelete] = useState<CourseTag | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const dialogId = useId();

  const refresh = (text: string) => {
    qc.invalidateQueries({ queryKey: ['edt', 'course-tags', structureId] });
    setNotice({ ok: true, text });
  };
  const fail = (text: string) => setNotice({ ok: false, text });
  const trimmed = (x: CourseTagInput): CourseTagInput => ({ ...x, label: x.label.trim(), abbreviation: x.abbreviation.trim() });
  const create = useMutation({
    mutationFn: () => api.createCourseTag(structureId, trimmed(form)),
    onSuccess: () => { setForm(EMPTY); refresh(t('edt.admin.course.tags.form.create.success')); },
    onError: () => fail(t('edt.admin.course.tags.form.create.error')),
  });
  const update = useMutation({
    mutationFn: () => api.updateCourseTag(editing!.id, trimmed(editing!.form)),
    onSuccess: () => { setEditing(null); refresh(t('edt.admin.course.tags.form.edit.success')); },
    onError: () => fail(t('edt.admin.course.tags.form.edit.error')),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteCourseTag(structureId, id),
    onSuccess: () => { setToDelete(null); refresh(t('edt.admin.course.tags.form.delete.success')); },
    onError: () => fail(t('edt.admin.course.tags.form.delete.error')),
  });
  const visibility = useMutation({
    mutationFn: (tag: CourseTag) => api.setCourseTagHidden(structureId, tag.id, !tag.isHidden),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['edt', 'course-tags', structureId] }),
    onError: () => fail(t('edt.admin.course.tags.form.edit.error')),
  });

  const yesNo = (name: string, value: boolean, onChange: (v: boolean) => void, legend: string) => (
    <fieldset className="mb-12">
      <legend className="form-label" style={{ fontSize: 15, fontWeight: 700 }}>{legend}</legend>
      <div className="d-flex gap-16">
        <label className="d-flex align-items-center gap-4 m-0">
          <input type="radio" name={name} checked={value} onChange={() => onChange(true)} />
          {t('edt.utils.yes')}
        </label>
        <label className="d-flex align-items-center gap-4 m-0">
          <input type="radio" name={name} checked={!value} onChange={() => onChange(false)} />
          {t('edt.utils.no')}
        </label>
      </div>
    </fieldset>
  );

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (isValid(form) && !create.isPending) create.mutate();
  };

  return (
    <section aria-labelledby="edt-admin-labels-title">
      {/* Titres de section lisibles (15-17 px gras) plutôt que la police fine du thème. */}
      <div id="edt-admin-labels-title" role="heading" aria-level={2} className="mb-12" style={{ fontSize: 17, fontWeight: 700 }}>
        {t('edt.admin.course.tags.title')}
      </div>
      {notice && (
        <div className={`alert ${notice.ok ? 'alert-success' : 'alert-danger'}`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</div>
      )}

      <form className="card p-16 mb-16" onSubmit={onCreate} noValidate>
        <div className="mb-12">
          <label htmlFor="edt-tag-label" className="form-label" style={{ fontWeight: 700 }}>{t('edt.admin.course.tags.input.text')} *</label>
          <input id="edt-tag-label" className="form-control" style={{ maxWidth: 420 }} placeholder={t('edt.admin.course.tag.input.example')} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
        </div>
        <div className="mb-12">
          <label htmlFor="edt-tag-abbr" className="form-label" style={{ fontWeight: 700 }}>{t('edt.admin.course.tags.input.abbr')} *</label>
          <input id="edt-tag-abbr" className="form-control" style={{ maxWidth: 200 }} maxLength={10} placeholder={t('edt.admin.course.abbr.input.example')} value={form.abbreviation} onChange={(e) => setForm((f) => ({ ...f, abbreviation: e.target.value }))} />
        </div>
        {yesNo('edt-tag-primary', form.isPrimary, (v) => setForm((f) => ({ ...f, isPrimary: v })), t('edt.admin.course.tags.input.priority.choice'))}
        {yesNo('edt-tag-register', form.allowRegister, (v) => setForm((f) => ({ ...f, allowRegister: v })), t('edt.admin.course.tags.input.allow.register.choice'))}
        <div>
          <button type="submit" className="btn btn-primary" disabled={!isValid(form) || create.isPending}>{t('edt.utils.add')}</button>
        </div>
      </form>

      <div role="heading" aria-level={3} className="mb-8" style={{ fontSize: 15, fontWeight: 700 }}>{t('edt.admin.course.existing.tags')}</div>
      {(tagsQuery.data ?? []).length === 0 ? (
        <p className="text-muted">{t('edt.admin.labels.none')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('edt.admin.labels.col.label')}</th>
              <th>{t('edt.admin.labels.col.abbr')}</th>
              <th>{t('edt.admin.labels.col.primary')}</th>
              <th>{t('edt.admin.labels.col.register')}</th>
              <th>{t('edt.admin.labels.col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {(tagsQuery.data ?? []).map((tag) =>
              editing?.id === tag.id ? (
                <tr key={tag.id} data-tag-id={tag.id}>
                  <td><input aria-label={t('edt.admin.labels.col.label')} className="form-control form-control-sm" value={editing.form.label} onChange={(e) => setEditing((x) => x && { ...x, form: { ...x.form, label: e.target.value } })} /></td>
                  <td><input aria-label={t('edt.admin.labels.col.abbr')} className="form-control form-control-sm" maxLength={10} value={editing.form.abbreviation} onChange={(e) => setEditing((x) => x && { ...x, form: { ...x.form, abbreviation: e.target.value } })} /></td>
                  <td><input type="checkbox" aria-label={t('edt.admin.labels.col.primary')} checked={editing.form.isPrimary} onChange={(e) => setEditing((x) => x && { ...x, form: { ...x.form, isPrimary: e.target.checked } })} /></td>
                  <td><input type="checkbox" aria-label={t('edt.admin.labels.col.register')} checked={editing.form.allowRegister} onChange={(e) => setEditing((x) => x && { ...x, form: { ...x.form, allowRegister: e.target.checked } })} /></td>
                  <td className="d-flex gap-8">
                    <button type="button" className="btn btn-sm btn-primary" disabled={!isValid(editing.form) || update.isPending} onClick={() => update.mutate()}>{t('edt.utils.save')}</button>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditing(null)}>{t('edt.utils.cancel')}</button>
                  </td>
                </tr>
              ) : (
                <tr key={tag.id} data-tag-id={tag.id} style={{ opacity: tag.isHidden ? 0.55 : 1 }}>
                  <td>{tag.label}{tag.isHidden ? ` (${t('edt.admin.labels.hidden')})` : ''}</td>
                  <td>{tag.abbreviation}</td>
                  <td>{t(tag.isPrimary ? 'edt.utils.yes' : 'edt.utils.no')}</td>
                  <td>{t(tag.allowRegister ? 'edt.utils.yes' : 'edt.utils.no')}</td>
                  <td className="d-flex gap-8 flex-wrap">
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setEditing({ id: tag.id, form: { label: tag.label, abbreviation: tag.abbreviation ?? '', isPrimary: !!tag.isPrimary, allowRegister: tag.allowRegister !== false } })}
                    >
                      {t('edt.utils.modify')}
                    </button>
                    {tag.isUsed ? (
                      // Étiquette posée sur des cours : on la masque (plus proposée), on ne la supprime pas.
                      <button type="button" className="btn btn-sm btn-secondary" disabled={visibility.isPending} onClick={() => visibility.mutate(tag)}>
                        {t(tag.isHidden ? 'edt.admin.labels.show' : 'edt.admin.labels.hide')}
                      </button>
                    ) : (
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setToDelete(tag)}>{t('edt.utils.delete')}</button>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      {toDelete && (
        <Modal id={dialogId} isOpen onModalClose={() => setToDelete(null)} size="md">
          <Modal.Header onModalClose={() => setToDelete(null)}>{t('edt.admin.labels.delete.title')}</Modal.Header>
          <Modal.Body>
            <p className="m-0">{t('edt.admin.labels.delete.confirm', { 0: toDelete.label })}</p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-secondary" onClick={() => setToDelete(null)}>{t('edt.utils.cancel')}</button>
            <button type="button" className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate(toDelete.id)}>{t('edt.utils.delete')}</button>
          </Modal.Footer>
        </Modal>
      )}
    </section>
  );
}

export default AdminLabels;
