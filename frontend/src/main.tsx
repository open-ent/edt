import { EdificeClientProvider, EdificeThemeProvider } from '@open-ent/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { router } from './routes';

import './i18n';
import '@open-ent/bootstrap/dist/index.css';

// L'`@import url("/theme/brand.css")` du CSS ci-dessus est retiré au build (cf.
// vite.config.ts) pour éviter que Vite ne l'inline : on recharge la feuille de
// marque de l'hôte courant nous-mêmes, en `<link>`, comme prévu au runtime.
const brandCssLink = document.createElement('link');
brandCssLink.rel = 'stylesheet';
brandCssLink.href = '/theme/brand.css';
document.head.appendChild(brandCssLink);

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
