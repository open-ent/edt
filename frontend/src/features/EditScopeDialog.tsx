import { Modal } from '@open-ent/react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  /** Libellé du cours, ex. « Mathématiques — lundi 12 octobre 08:00 ». */
  label: string;
  onChoose: (scope: 'one' | 'series') => void;
  onClose: () => void;
}

/**
 * Modifier un cours d'une série : ce cours seulement, ou toutes les occurrences à venir — mêmes
 * choix que la fenêtre AngularJS (template/main/occurrence-or-course-edit-popup.html).
 */
export function EditScopeDialog({ label, onChoose, onClose }: Props) {
  const { t } = useTranslation(['edt', 'common']);
  const [scope, setScope] = useState<'one' | 'series'>('one');
  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="md">
      <Modal.Header onModalClose={onClose}>{t('edt.schedule.update')}</Modal.Header>
      <Modal.Body>
        <p className="fw-bold">{label}</p>
        <fieldset>
          <legend style={{ fontSize: 15 }}>{t('edt.choose.edition.type.message')}</legend>
          <label className="d-flex align-items-center gap-8 mb-4">
            <input type="radio" name="edt-edit-scope" checked={scope === 'one'} onChange={() => setScope('one')} />
            {t('edt.choose.edition.type.choice1')}
          </label>
          <label className="d-flex align-items-center gap-8">
            <input type="radio" name="edt-edit-scope" checked={scope === 'series'} onChange={() => setScope('series')} />
            {t('edt.choose.edition.type.choice2')}
          </label>
        </fieldset>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('edt.utils.cancel')}</button>
        <button type="button" className="btn btn-primary" onClick={() => onChoose(scope)}>{t('edt.utils.modify')}</button>
      </Modal.Footer>
    </Modal>
  );
}

export default EditScopeDialog;
