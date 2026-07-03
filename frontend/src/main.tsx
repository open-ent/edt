import { EdificeClientProvider, EdificeThemeProvider } from '@open-ent/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { router } from './routes';

import './i18n';
import '@open-ent/bootstrap/dist/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <EdificeClientProvider params={{ app: 'edt' }}>
      <EdificeThemeProvider>
        <RouterProvider router={router} />
      </EdificeThemeProvider>
    </EdificeClientProvider>
  </QueryClientProvider>,
);
