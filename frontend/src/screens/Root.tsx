import {
  AppHeader,
  Breadcrumb,
  Layout,
  LoadingScreen,
  useEdificeClient,
} from '@open-ent/react';
import { Outlet } from 'react-router-dom';

import { UiSwitchBanner } from '../features/UiSwitchBanner';
import { TimetableStateProvider } from '../hooks/useTimetableState';

/** Gabarit commun : bandeau ENT (Layout + AppHeader + fil d'Ariane) + contenu. */
export function Root() {
  const { currentApp, init } = useEdificeClient();
  if (!init) return <LoadingScreen />;

  return (
    <div className="d-flex flex-column vh-100">
      <Layout>
        <div className="d-print-none">
          <AppHeader>{currentApp && <Breadcrumb app={currentApp} />}</AppHeader>
        </div>
        <div className="flex-grow-1 overflow-auto">
          <div className="container py-16">
            <TimetableStateProvider>
              <Outlet />
            </TimetableStateProvider>
          </div>
        </div>
      </Layout>
      <UiSwitchBanner />
    </div>
  );
}

export default Root;
