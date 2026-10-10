import { Modal } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, StsReport } from '../api';
import { useEdtContext } from '../hooks/useEdtContext';

/** Date d'un rapport (MongoDb.now() renvoie { $date }), ex. « samedi 10 octobre 2026 à 09:14 ». */
const reportDate = (r: StsReport, lang: string): string => {
  const raw = typeof r.created === 'object' ? r.created?.$date : r.created;
  const d = raw !== undefined ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString(lang || 'fr', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
};

/**
 * Import de l'emploi du temps par fichiers STS (STS-EMP et EMP-STS), comme le sniplet AngularJS
 * (template/behaviours/sniplet-import_sts.html) : envoi des deux fichiers XML, rapport de l'import,
 * rapports des imports précédents, et accès à l'import EDT/UDT de la console d'administration.
 */
export function AdminImport() {
  const { t, i18n } = useTranslation(['edt', 'common']);
  const ctx = useEdtContext();
  const qc = useQueryClient();
  const structureId = ctx.structure?.id ?? '';
  const [stsEmp, setStsEmp] = useState<File | null>(null);
  const [empSts, setEmpSts] = useState<File | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const dialogId = useId();
  const reportsQuery = useQuery({ queryKey: ['edt', 'sts-reports', structureId], queryFn: () => api.getStsReports(structureId), enabled: !!structureId });
  const upload = useMutation({
    mutationFn: () => api.importSts(structureId, stsEmp!, empSts!),
    onSettled: () => qc.invalidateQueries({ queryKey: ['edt', 'sts-reports', structureId] }),
  });
  const result = upload.data;

  return (
    <section aria-labelledby="edt-admin-import-title">
      <div id="edt-admin-import-title" role="heading" aria-level={2} className="mb-12" style={{ fontSize: 17, fontWeight: 700 }}>
        {t('edt.admin.importsts.title')}
      </div>
      <div className="card p-16 mb-16">
        <div className="mb-12">
          <label htmlFor="edt-sts-emp" className="form-label" style={{ fontWeight: 700 }}>{t('edt.admin.importsts.file.sts-emp')} *</label>
          <input id="edt-sts-emp" type="file" accept=".xml,text/xml,application/xml" className="form-control" style={{ maxWidth: 480 }} onChange={(e) => setStsEmp(e.target.files?.[0] ?? null)} />
        </div>
        <div className="mb-12">
          <label htmlFor="edt-emp-sts" className="form-label" style={{ fontWeight: 700 }}>{t('edt.admin.importsts.file.emp-sts')} *</label>
          <input id="edt-emp-sts" type="file" accept=".xml,text/xml,application/xml" className="form-control" style={{ maxWidth: 480 }} onChange={(e) => setEmpSts(e.target.files?.[0] ?? null)} />
        </div>
        <p className="text-muted" style={{ fontSize: 14 }}>{t('edt.admin.importsts.hint')}</p>
        <div>
          <button type="button" className="btn btn-primary" disabled={!stsEmp || !empSts || upload.isPending} onClick={() => upload.mutate()}>
            {upload.isPending ? t('edt.admin.importsts.pending') : t('edt.admin.importsts.submit')}
          </button>
        </div>
        {result?.ok && (
          <div className="alert alert-success mt-12 mb-0 d-flex align-items-center gap-12 flex-wrap" role="status" style={{ display: 'block' }}>
            {t('edt.sts.import.success')}{' '}
            {result.report && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShown(result.report!)}>{t('edt.sts.import.success.link')}</button>
            )}
          </div>
        )}
        {(upload.isError || (result && !result.ok)) && (
          <div className="alert alert-danger mt-12 mb-0" role="alert">
            {t('edt.sts.import.error')} {result?.error ? t(result.error) : t('edt.sts.import.server.error')}
          </div>
        )}
      </div>

      <div role="heading" aria-level={3} className="mb-8" style={{ fontSize: 15, fontWeight: 700 }}>{t('edt.admin.import.edt.udt')}</div>
      <p>
        {/* Import EDT/UDT : écran de la console d'administration, comme redirectToAdminConsole de l'AngularJS. */}
        <a className="btn btn-secondary" href={`/admin/${structureId}/management/import-edt`}>{t('edt.admin.access.import')}</a>
      </p>

      <div role="heading" aria-level={3} className="mb-8" style={{ fontSize: 15, fontWeight: 700 }}>{t('edt.sts.previous.reports')}</div>
      {reportsQuery.isError && <p className="text-danger" role="alert">{t('edt.sts.load.reports.failed')}</p>}
      {(reportsQuery.data ?? []).length === 0 ? (
        <p className="text-muted">{t('edt.admin.importsts.no.reports')}</p>
      ) : (
        <ul className="list-unstyled d-flex flex-column gap-4" data-sts-reports>
          {(reportsQuery.data ?? []).map((r, i) => (
            <li key={i}>
              <button type="button" className="btn btn-link p-0" style={{ color: '#1a5fb4', textDecoration: 'underline' }} onClick={() => setShown(r.report)}>
                {t('edt.sts.report.from')} {reportDate(r, i18n.language)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {shown !== null && (
        <Modal id={dialogId} isOpen onModalClose={() => setShown(null)} size="lg" scrollable>
          <Modal.Header onModalClose={() => setShown(null)}>{t('edt.admin.importsts.report')}</Modal.Header>
          <Modal.Body>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{shown}</pre>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-secondary" onClick={() => setShown(null)}>{t('edt.form.close')}</button>
          </Modal.Footer>
        </Modal>
      )}
    </section>
  );
}

export default AdminImport;
