import { RouteObject, createHashRouter } from 'react-router-dom';

import { Admin } from './screens/Admin';
import { AdminExclusions } from './screens/AdminExclusions';
import { AdminImport } from './screens/AdminImport';
import { AdminInit } from './screens/AdminInit';
import { AdminLabels } from './screens/AdminLabels';
import { CourseForm } from './screens/CourseForm';
import { Root } from './screens/Root';
import { Timetable } from './screens/Timetable';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <Timetable /> },
      { path: 'create', element: <CourseForm /> },
      { path: 'edit/:id', element: <CourseForm key="edit" /> },
      { path: 'admin', element: <Admin />, children: [{ index: true, element: <AdminLabels /> }, { path: 'import', element: <AdminImport /> }, { path: 'exclusions', element: <AdminExclusions /> }, { path: 'initialisation', element: <AdminInit /> }] },
    ],
  },
];

// Hash router : app servie sous `/edt` (route serveur unique), routage dans le fragment. CCTP 51C.
export const router = createHashRouter(routes);
