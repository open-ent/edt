import { Modal } from '@open-ent/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Course } from '../api';

interface Props {
  course: Course;
  /** Libellé du cours dans la question, ex. « Mathématiques — lundi 12/10 08:00 ». */
  label: string;
  onClose: () => void;
}

/**
 * Suppression d'un cours, mêmes choix que l'AngularJS : un cours isolé est supprimé après
 * confirmation ; pour un cours d'une série, « ce cours seulement » ou « toutes les occurrences »
 * (les cours déjà passés restent). Ex. cours hebdomadaire du lundi → supprimer la série à venir.
 */
export function DeleteCourseDialog({ course, label, onClose }: Props) {
  const { t } = useTranslation(['edt', 'common']);
  const qc = useQueryClient();
  const [scope, setScope] = useState<'one' | 'series'>('one');
  const isSeries = !!course.recurrence;
  const remove = useMutation({
    mutationFn: () => (isSeries && scope === 'series' ? api.deleteRecurrence(course.recurrence!) : api.deleteCourse(course._id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['edt', 'courses'] });
      onClose();
    },
  });

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="md">
      <Modal.Header onModalClose={onClose}>{t('edt.schedule.delete.unique')}</Modal.Header>
      <Modal.Body>
        <p className="fw-bold">{label}</p>
        {isSeries ? (
          <fieldset>
            <legend style={{ fontSize: 15 }}>{t('edt.choose.deletion.type.message')}</legend>
            <label className="d-flex align-items-center gap-8 mb-4">
              <input type="radio" name="edt-delete-scope" checked={scope === 'one'} onChange={() => setScope('one')} />
              {t('edt.choose.edition.type.choice1')}
            </label>
            <label className="d-flex align-items-center gap-8">
              <input type="radio" name="edt-delete-scope" checked={scope === 'series'} onChange={() => setScope('series')} />
              {t('edt.choose.edition.type.choice2')}
            </label>
          </fieldset>
        ) : (
          <p className="m-0">{t('edt.choose.delete.course')}</p>
        )}
        {remove.isError && <div className="alert alert-danger mt-12 mb-0" role="alert">{t('edt.notify.delete.err')}</div>}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('edt.utils.cancel')}</button>
        <button type="button" className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{t('edt.utils.delete')}</button>
      </Modal.Footer>
    </Modal>
  );
}

export default DeleteCourseDialog;
