import {
  AppHeader,
  Breadcrumb,
  Layout,
  LoadingScreen,
  useEdificeClient,
} from '@open-ent/react';
import { Outlet } from 'react-router-dom';

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
            <Outlet />
          </div>
        </div>
      </Layout>
    </div>
  );
}

export default Root;
