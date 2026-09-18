import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Proxy de dev vers l'ENT local (traefik :8090)
const proxyTarget = { target: 'http://localhost:8090', changeOrigin: false };

// @open-ent/bootstrap importe `@import url("/theme/brand.css")` dans son CSS : ce
// chemin est résolu par le navigateur au runtime (servi par l'hôte courant), pas par
// le bundle — `vite build` tente pourtant de l'inliner comme un fichier du projet et
// échoue avec ENOENT (postcss-import ne sait ignorer que les URLs http(s)/protocole-
// relatif, pas un chemin serveur absolu). On retire l'`@import` avant que le pipeline
// CSS de Vite ne le voie ; `main.tsx` injecte l'équivalent en `<link>` au runtime.
const stripRuntimeThemeCssImport = (): Plugin => ({
  name: 'strip-runtime-theme-css-import',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replace(/\\/g, '/').endsWith('@open-ent/bootstrap/dist/index.css')) return;
    return code.replace(/@import\s*(?:url\(\s*)?["']\/theme\/brand\.css["']\s*\)?\s*;/, '');
  },
});

export default defineConfig(({ mode }) => ({
  // Servi sous /edt par entcore (cf. view vsco_react.html -> /edt/public/index.js)
  base: mode === 'production' ? '/edt' : '',
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'react-i18next',
      'i18next',
      'react-router-dom',
      '@open-ent/client',
      '@open-ent/react',
      '@open-ent/bootstrap',
    ],
  },
  build: {
    assetsDir: 'public',
    rollupOptions: {
      output: {
        // Noms stables → la vue backend référence des chemins fixes.
        // Le bundle Angular existant est `public/dist/vsco_personnels.js` : pas de collision.
        entryFileNames: 'public/index.js',
        chunkFileNames: 'public/[name].js',
        assetFileNames: (info) =>
          info.name && info.name.endsWith('.css')
            ? 'public/index.css'
            : 'public/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 4202,
    proxy: {
      '/edt': proxyTarget,
      '^/(?=assets|theme|locale|i18n|skin)': proxyTarget,
      '^/(?=auth|userbook|directory|portal|session|timeline|workspace|infra|conf|applications-list)':
        proxyTarget,
    },
  },
  plugins: [stripRuntimeThemeCssImport(), react()],
}));
