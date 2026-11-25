import { Modal } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, HOLIDAYS_ZONES } from '../api';
import { useEdtContext } from '../hooks/useEdtContext';

/**
 * Initialisation des données de l'année, comme le sniplet AngularJS « Init data edt » : dates de
 * l'année scolaire (reprises du paramétrage), zone de vacances, puis confirmation — l'action
 * réinitialise les dates dans tous les modules de vie scolaire. Ex. du 01/09/2026 au 04/07/2027, zone B.
 */
export function AdminInit() {
  const { t } = useTranslation(['edt', 'common']);
  const ctx = useEdtContext();
  const structureId = ctx.structure?.id ?? '';
  const yearQuery = useQuery({ queryKey: ['edt', 'school-year', structureId], queryFn: () => api.getSchoolYear(structureId), enabled: !!structureId });
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [zone, setZone] = useState('');
  const [confirm, setConfirm] = useState(false);
  const dialogId = useId();
  const qc = useQueryClient();
  // Zone enregistrée pour l'établissement, déduite de son académie sauf choix contraire : elle
  // présélectionne la liste. Ex. Morlaix → académie de Rennes → zone B.
  const zoneQuery = useQuery({ queryKey: ['edt', 'holidays-zone', structureId], queryFn: () => api.getHolidaysZone(structureId), enabled: !!structureId });
  const zoneInfo = zoneQuery.data;
  useEffect(() => {
    if (zoneInfo?.zone && !zone) setZone(zoneInfo.zone);
  }, [zoneInfo, zone]);
  const resetZone = useMutation({
    mutationFn: () => api.setHolidaysZone(structureId, null),
    onSuccess: (data) => {
      qc.setQueryData(['edt', 'holidays-zone', structureId], data);
      if (data.zone) setZone(data.zone);
    },
  });
  const zoneLabel = (value: string | null | undefined) => {
    const found = HOLIDAYS_ZONES.find((z) => z.value === value);
    return found ? t(found.label) : value ?? '';
  };
  useEffect(() => {
    if (yearQuery.data && !start && !end) {
      setStart(yearQuery.data.start);
      setEnd(yearQuery.data.end);
    }
  }, [yearQuery.data, start, end]);
  const valid = !!start && !!end && start < end && !!zone;
  const init = useMutation({
    mutationFn: () => api.initStructureData(structureId, zone, start, end),
    onSettled: () => setConfirm(false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['edt', 'holidays-zone', structureId] }),
  });

  return (
    <section aria-labelledby="edt-admin-init-title">
      <div id="edt-admin-init-title" role="heading" aria-level={2} className="mb-12" style={{ fontSize: 17, fontWeight: 700 }}>{t('edt.data.init')}</div>
      <div className="card p-16 mb-16">
        <p className="mb-12" style={{ fontSize: 14 }}>{t('edt.admin.init.hint')}</p>
        <div className="d-flex gap-12 flex-wrap mb-12">
          <div>
            <label htmlFor="edt-init-start" className="form-label" style={{ fontWeight: 700 }}>{t('edt.year.start.date')} *</label>
            <input id="edt-init-start" type="date" className="form-control" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label htmlFor="edt-init-end" className="form-label" style={{ fontWeight: 700 }}>{t('edt.year.end.date')} *</label>
            <input id="edt-init-end" type="date" className="form-control" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {start && end && start >= end && <div className="alert alert-warning" role="alert">{t('edt.admin.init.order')}</div>}
        <div className="mb-12">
          <label htmlFor="edt-init-zone" className="form-label" style={{ fontWeight: 700 }}>{t('edt.zone.choose')} *</label>
          <select id="edt-init-zone" className="form-select" style={{ maxWidth: 320 }} value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">{t('edt.zone.select.option.default')}</option>
            {HOLIDAYS_ZONES.map((z) => <option key={z.value} value={z.value}>{t(z.label)}</option>)}
          </select>
          {zoneInfo && (
            <div className="mt-8 small" data-edt-holidays-zone={zoneInfo.source ?? 'unknown'}>
              {zoneInfo.source === 'ACADEMY' && zoneInfo.academy && <span>{t('edt.holidays.zone.academy', { 0: zoneInfo.academy })}</span>}
              {zoneInfo.source === 'MANUAL' && (
                <span className="d-inline-flex flex-wrap align-items-center gap-8">
                  {t('edt.holidays.zone.manual')}
                  {zoneInfo.detectedZone && (
                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={resetZone.isPending} onClick={() => resetZone.mutate()}>
                      {t('edt.holidays.zone.reset', { 0: zoneLabel(zoneInfo.detectedZone) })}
                    </button>
                  )}
                </span>
              )}
              {!zoneInfo.zone && <span>{t('edt.holidays.zone.unknown')}</span>}
              {resetZone.isSuccess && <div className="text-success mt-4" role="status">{t('edt.holidays.zone.reset.done')}</div>}
              <div className="text-gray-700 mt-4">{t('edt.holidays.auto')}</div>
            </div>
          )}
        </div>
        <div className="alert alert-warning" role="note">{t('edt.zone.choose.warning')}</div>
        <div>
          <button type="button" className="btn btn-primary" disabled={!valid || init.isPending} onClick={() => setConfirm(true)}>{t('edt.admin.init.submit')}</button>
        </div>
        {init.isSuccess && <div className="alert alert-success mt-12 mb-0" role="status">{t('edt.data.init.success')}</div>}
        {init.isError && <div className="alert alert-danger mt-12 mb-0" role="alert">{t('edt.data.init.error')}</div>}
      </div>

      {confirm && (
        <Modal id={dialogId} isOpen onModalClose={() => setConfirm(false)} size="md">
          <Modal.Header onModalClose={() => setConfirm(false)}>{t('edt.data.init')}</Modal.Header>
          <Modal.Body>
            <p>{t('edt.admin.init.confirm', { 0: HOLIDAYS_ZONES.find((z) => z.value === zone) ? t(HOLIDAYS_ZONES.find((z) => z.value === zone)!.label) : zone })}</p>
            <p className="m-0">{t('edt.zone.choose.warning')}</p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>{t('edt.cancel')}</button>
            <button type="button" className="btn btn-danger" disabled={init.isPending} onClick={() => init.mutate()}>{t('edt.validate')}</button>
          </Modal.Footer>
        </Modal>
      )}
    </section>
  );
}

export default AdminInit;
