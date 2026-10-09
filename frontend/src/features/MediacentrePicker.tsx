import { Modal } from '@open-ent/react';
import { useMutation } from '@tanstack/react-query';
import { FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { CourseResource, mediacentreResource, MediacentreItem, parseMediacentreFrames } from '../resources';

interface Props {
  attached: CourseResource[];
  onAdd: (resource: CourseResource) => void;
  onClose: () => void;
}

/**
 * Recherche et ajout de ressources du médiacentre au cours. La fenêtre reste ouverte après un
 * ajout pour en enchaîner plusieurs, comme la fenêtre AngularJS et celle de l'agenda React.
 * Ex. « robert » → « Le Robert junior » → Ajouter → la ressource apparaît dans le formulaire.
 */
export function MediacentrePicker({ attached, onAdd, onClose }: Props) {
  const { t } = useTranslation(['edt', 'common']);
  const [query, setQuery] = useState('');
  const search = useMutation({ mutationFn: async (q: string) => parseMediacentreFrames(await api.searchMediacentre(q)) });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) search.mutate(query.trim());
  };
  const isAttached = (item: MediacentreItem) => {
    const r = mediacentreResource(item);
    return !!r && attached.some((a) => a.type === 'mediacentre' && a.id === r.id);
  };

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="lg" scrollable>
      <Modal.Header onModalClose={onClose}>{t('edt.resources.add.mediacentre')}</Modal.Header>
      <Modal.Body>
        <form className="d-flex gap-8 mb-12" onSubmit={onSubmit} role="search">
          <input
            type="search"
            className="form-control"
            aria-label={t('edt.resources.mediacentre.search.placeholder')}
            placeholder={t('edt.resources.mediacentre.search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={!query.trim() || search.isPending}>
            {t('edt.resources.mediacentre.search')}
          </button>
        </form>
        {search.isPending && <p role="status">{t('edt.resources.mediacentre.loading')}</p>}
        {search.isIdle && <p className="text-muted">{t('edt.resources.mediacentre.empty')}</p>}
        {search.isError && <p className="text-danger" role="alert">{t('edt.form.mediacentre.error')}</p>}
        {search.isSuccess && search.data.length === 0 && <p className="text-muted">{t('edt.resources.mediacentre.noresult')}</p>}
        {search.isSuccess && search.data.length > 0 && (
          <ul className="list-unstyled m-0 d-flex flex-column gap-8">
            {search.data.map((item, i) => {
              const done = isAttached(item);
              return (
                <li key={`${item.id ?? item.link ?? i}`} className="d-flex align-items-center gap-12 border rounded p-8">
                  {item.image && <img src={item.image} alt="" width={48} height={48} style={{ objectFit: 'contain' }} />}
                  <span className="flex-fill">{item.title || item.link}</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    disabled={done}
                    onClick={() => {
                      const r = mediacentreResource(item);
                      if (r) onAdd(r);
                    }}
                  >
                    {done ? t('edt.form.resource.added') : t('edt.form.resource.add')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('edt.form.close')}</button>
      </Modal.Footer>
    </Modal>
  );
}

export default MediacentrePicker;
