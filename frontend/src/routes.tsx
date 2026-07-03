import { RouteObject, createHashRouter } from 'react-router-dom';

import { Root } from './screens/Root';
import { Timetable } from './screens/Timetable';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    children: [{ index: true, element: <Timetable /> }],
  },
];

// Hash router : app servie sous `/edt` (route serveur unique), routage dans le fragment. CCTP 51C.
export const router = createHashRouter(routes);
