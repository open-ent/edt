import i18n from 'i18next';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

// Clés i18n ENT PLATES avec des points → keySeparator/nsSeparator désactivés.
i18n
  .use(Backend)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: (_lngs: string[], namespaces: string[]) =>
        namespaces.map((ns: string) => (ns === 'common' ? `/i18n` : `/${ns}/i18n`)),
      parse: (data: string) => JSON.parse(data),
    },
    defaultNS: 'common',
    ns: ['common', 'edt'],
    fallbackLng: 'fr',
    lng: 'fr',
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false, prefix: '[[', suffix: ']]' },
    debug: false,
  });

export default i18n;
