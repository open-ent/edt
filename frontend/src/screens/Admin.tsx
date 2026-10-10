import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useEdtContext } from '../hooks/useEdtContext';

/** Onglets de l'administration, ex. #/admin (étiquettes), #/admin/import (import STS). */
const TABS = [{ to: '/admin', end: true, label: 'edt.admin.course.tags.title' }];

/**
 * Administration de l'emploi du temps (gestionnaires), réunie dans la nouvelle interface : ce que
 * l'AngularJS répartissait entre ses routes (#/courseLabels, #/importSts) et le paramétrage de la vie
 * scolaire (exclusions, initialisation).
 */
export function Admin() {
  const { t } = useTranslation(['edt', 'common']);
  const ctx = useEdtContext();
  const navigate = useNavigate();
  if (ctx.ready && (!ctx.canManage || ctx.allStructures)) {
    return <div className="alert alert-warning" role="alert">{t('edt.admin.forbidden')}</div>;
  }
  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-8 mb-16">
        <h1 className="m-0">{t('edt.admin.title')}</h1>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>{t('edt.admin.back')}</button>
      </div>
      <nav aria-label={t('edt.admin.title')} className="d-flex gap-8 flex-wrap mb-16">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `btn btn-${isActive ? 'primary' : 'secondary'}`}>
            {t(tab.label)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

export default Admin;
