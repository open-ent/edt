import { Modal } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Exclusion } from '../api';
import { useEdtContext } from '../hooks/useEdtContext';

type SortKey = 'description' | 'start_date' | 'end_date';
interface Draft { id?: number; description: string; start: string; end: string }

const day = (sqlDate: string) => (sqlDate || '').slice(0, 10);
const frDate = (sqlDate: string) => {
  const [y, m, d] = day(sqlDate).split('-');
  return y ? `${d}/${m}/${y}` : '';
};
/** Description non vide, fin le même jour ou après le début (règle AngularJS currentExclusionValidation). */
const isValid = (d: Draft) => d.description.trim() !== '' && !!d.start && !!d.end && d.end >= d.start;

/**
 * Exclusions de périodes (périodes fermées : vacances, examens…), comme le sniplet AngularJS
 * « Exclusion de périodes » : liste triable, ajout, modification, suppression ; avertissement si
 * des cours sont déjà programmés sur la période (ils ne s'affichent plus tant qu'elle est fermée).
 * Ex. « Vacances de printemps », du 17/04/2027 au 02/05/2027.
 */
export function AdminExclusions() {
  const { t } = useTranslation(['edt', 'common']);
  const ctx = useEdtContext();
  const qc = useQueryClient();
  const structureId = ctx.structure?.id ?? '';
  const [sort, setSort] = useState<{ key: SortKey; reverse: boolean }>({ key: 'start_date', reverse: false });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<Exclusion | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const dialogId = useId();
  const key = ['edt', 'exclusions', structureId];
  const listQuery = useQuery({ queryKey: key, queryFn: () => api.getExclusions(structureId), enabled: !!structureId });
  const coursesQuery = useQuery({
    queryKey: ['edt', 'exclusion-courses', structureId, draft?.start, draft?.end],
    queryFn: () => api.countCoursesBetween(structureId, draft!.start, draft!.end),
    enabled: !!draft && !!draft.start && !!draft.end && draft.end >= draft.start,
  });
  const sorted = useMemo(() => {
    const list = [...(listQuery.data ?? [])].sort((a, b) => String(a[sort.key]).localeCompare(String(b[sort.key])));
    return sort.reverse ? list.reverse() : list;
  }, [listQuery.data, sort]);

  const save = useMutation({
    mutationFn: () => api.saveExclusion(structureId, { ...draft!, description: draft!.description.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['edt', 'courses'] });
      setNotice({ ok: true, text: t(draft?.id ? 'edt.admin.exclusions.updated' : 'edt.admin.exclusions.created') });
      setDraft(null);
    },
    onError: () => setNotice({ ok: false, text: t(draft?.id ? 'edt.notify.exclusion.update.err' : 'edt.notify.exclusion.create.err') }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteExclusion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['edt', 'courses'] });
      setToDelete(null);
      setNotice({ ok: true, text: t('edt.admin.exclusions.deleted') });
    },
    onError: () => setNotice({ ok: false, text: t('edt.notify.exclusion.delete.err') }),
  });

  const header = (k: SortKey, label: string) => (
    <th aria-sort={sort.key === k ? (sort.reverse ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="border-0 bg-transparent p-0 fw-bold" onClick={() => setSort((s) => ({ key: k, reverse: s.key === k ? !s.reverse : false }))}>
        {label} {sort.key === k ? (sort.reverse ? '▼' : '▲') : ''}
      </button>
    </th>
  );

  return (
    <section aria-labelledby="edt-admin-exclusions-title">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-8 mb-12">
        <div id="edt-admin-exclusions-title" role="heading" aria-level={2} style={{ fontSize: 17, fontWeight: 700 }}>{t('edt.settings.exclusion.title')}</div>
        {!draft && (
          <button type="button" className="btn btn-primary" onClick={() => setDraft({ description: '', start: '', end: '' })}>{t('edt.settings.exclusion.add')}</button>
        )}
      </div>
      <p className="text-muted" style={{ fontSize: 14 }}>{t('edt.admin.exclusions.hint')}</p>
      {notice && <div className={`alert ${notice.ok ? 'alert-success' : 'alert-danger'}`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</div>}

      {draft && (
        <div className="card p-16 mb-16" data-exclusion-form>
          <div role="heading" aria-level={3} className="mb-12" style={{ fontSize: 15, fontWeight: 700 }}>
            {t(draft.id ? 'edt.admin.exclusions.edit' : 'edt.settings.exclusion.add')}
          </div>
          <div className="mb-12">
            <label htmlFor="edt-exclusion-description" className="form-label" style={{ fontWeight: 700 }}>{t('edt.settings.exclusion.description')} *</label>
            <input id="edt-exclusion-description" className="form-control" style={{ maxWidth: 420 }} placeholder={t('edt.admin.exclusions.example')} value={draft.description} onChange={(e) => setDraft((d) => d && { ...d, description: e.target.value })} />
          </div>
          <div className="d-flex gap-12 flex-wrap mb-12">
            <div>
              <label htmlFor="edt-exclusion-start" className="form-label" style={{ fontWeight: 700 }}>{t('edt.settings.exclusion.start_date')} *</label>
              <input id="edt-exclusion-start" type="date" className="form-control" value={draft.start} onChange={(e) => setDraft((d) => d && { ...d, start: e.target.value })} />
            </div>
            <div>
              <label htmlFor="edt-exclusion-end" className="form-label" style={{ fontWeight: 700 }}>{t('edt.settings.exclusion.end_date')} *</label>
              <input id="edt-exclusion-end" type="date" className="form-control" value={draft.end} onChange={(e) => setDraft((d) => d && { ...d, end: e.target.value })} />
            </div>
          </div>
          {draft.start && draft.end && draft.end < draft.start && <div className="alert alert-warning" role="alert">{t('edt.admin.exclusions.order')}</div>}
          {(coursesQuery.data ?? 0) > 0 && (
            <div className="alert alert-info" role="status">
              {t('edt.admin.exclusions.courses', { 0: coursesQuery.data })} {t('edt.info.message.there.is.courses.to.delete')}
            </div>
          )}
          <div className="d-flex gap-8">
            <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>{t('edt.utils.cancel')}</button>
            <button type="button" className="btn btn-primary" disabled={!isValid(draft) || save.isPending} onClick={() => save.mutate()}>{t('edt.utils.save')}</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-muted">{t('edt.admin.exclusions.none')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              {header('description', t('edt.settings.exclusion.description'))}
              {header('start_date', t('edt.settings.exclusion.start_date'))}
              {header('end_date', t('edt.settings.exclusion.end_date'))}
              <th>{t('edt.admin.labels.col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ex) => (
              <tr key={ex.id} data-exclusion-id={ex.id}>
                <td>{ex.description}</td>
                <td>{frDate(ex.start_date)}</td>
                <td>{frDate(ex.end_date)}</td>
                <td className="d-flex gap-8 flex-wrap">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setDraft({ id: ex.id, description: ex.description, start: day(ex.start_date), end: day(ex.end_date) })}>
                    {t('edt.utils.modify')}
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setToDelete(ex)}>{t('edt.utils.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {toDelete && (
        <Modal id={dialogId} isOpen onModalClose={() => setToDelete(null)} size="md">
          <Modal.Header onModalClose={() => setToDelete(null)}>{t('edt.admin.exclusions.delete.title')}</Modal.Header>
          <Modal.Body>
            <p className="m-0">{t('edt.settings.exclusion.deletion')} « {toDelete.description} » ({frDate(toDelete.start_date)} – {frDate(toDelete.end_date)}) ?</p>
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

export default AdminExclusions;
