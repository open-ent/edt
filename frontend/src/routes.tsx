import { RouteObject, createHashRouter } from 'react-router-dom';

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
    ],
  },
];

// Hash router : app servie sous `/edt` (route serveur unique), routage dans le fragment. CCTP 51C.
export const router = createHashRouter(routes);
