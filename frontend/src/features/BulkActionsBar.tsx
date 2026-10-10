import { Modal } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Course } from '../api';
import { selectableIds } from '../selection';

interface Props {
  structureId: string;
  /** Cours affichés (période et sélection courantes) : « Tout sélectionner » porte sur eux. */
  courses: Course[];
  active: boolean;
  selected: ReadonlySet<string>;
  onActivate: (active: boolean) => void;
  onSelect: (ids: Set<string>) => void;
}

/**
 * Actions de masse sur les cours, comme « Modifier les cours sélectionnés » de l'AngularJS
 * (template/main/update-courses-popup.html) : supprimer les cours sélectionnés, ou leur poser une
 * étiquette. Ex. « Sélectionner des cours » → clic sur 3 cours → « Supprimer (3) » → confirmation.
 */
export function BulkActionsBar({ structureId, courses, active, selected, onActivate, onSelect }: Props) {
  const { t } = useTranslation(['edt', 'common']);
  const qc = useQueryClient();
  const [tagId, setTagId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tagsQuery = useQuery({ queryKey: ['edt', 'course-tags', structureId], queryFn: () => api.getCourseTags(structureId), enabled: active && !!structureId });
  const done = () => {
    qc.invalidateQueries({ queryKey: ['edt', 'courses'] });
    onSelect(new Set());
    setConfirmDelete(false);
  };
  // Une suppression par cours (DELETE /edt/courses/:id, réservations de salle libérées), comme
  // deleteCourses de l'AngularJS.
  const remove = useMutation({ mutationFn: () => Promise.all([...selected].map((id) => api.deleteCourse(id))), onSuccess: done });
  const tag = useMutation({ mutationFn: () => api.updateCoursesTag([...selected], Number(tagId)), onSuccess: done });
  const dialogId = useId();

  if (!active) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => onActivate(true)}>
        {t('edt.bulk.start')}
      </button>
    );
  }
  const count = selected.size;
  return (
    <div className="card p-12 mb-12 d-flex flex-row flex-wrap align-items-center gap-8" role="region" aria-label={t('edt.utils.modify.selected')}>
      <strong role="status" style={{ fontSize: 15 }}>{t('edt.bulk.count', { 0: count })}</strong>
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => onSelect(selectableIds(courses, new Date()))}>
        {t('edt.schedule.delete.all.courses')}
      </button>
      <button type="button" className="btn btn-sm btn-danger" disabled={count === 0 || remove.isPending} onClick={() => setConfirmDelete(true)}>
        {t('edt.bulk.delete', { 0: count })}
      </button>
      <label htmlFor="edt-bulk-tag" className="m-0">{t('edt.utils.course.label')}</label>
      <select id="edt-bulk-tag" className="form-select form-select-sm" style={{ width: 'auto' }} value={tagId} onChange={(e) => setTagId(e.target.value)}>
        <option value="">{t('edt.creation.tag.add')}</option>
        {(tagsQuery.data ?? []).filter((x) => !x.isHidden).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
      <button type="button" className="btn btn-sm btn-primary" disabled={count === 0 || !tagId || tag.isPending} onClick={() => tag.mutate()}>
        {t('edt.bulk.tag')}
      </button>
      <button type="button" className="btn btn-sm btn-secondary ms-auto" onClick={() => { onSelect(new Set()); onActivate(false); }}>
        {t('edt.bulk.stop')}
      </button>
      {(remove.isError || tag.isError) && <span className="text-danger" role="alert">{t('edt.bulk.error')}</span>}

      {confirmDelete && (
        <Modal id={dialogId} isOpen onModalClose={() => setConfirmDelete(false)} size="md">
          <Modal.Header onModalClose={() => setConfirmDelete(false)}>{t('edt.utils.delete.selected')}</Modal.Header>
          <Modal.Body>
            <p className="m-0">{t('edt.bulk.delete.confirm', { 0: count })}</p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>{t('edt.utils.cancel')}</button>
            <button type="button" className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{t('edt.utils.delete')}</button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}

export default BulkActionsBar;
