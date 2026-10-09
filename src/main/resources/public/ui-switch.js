/*
 * Bandeau d'invitation à la nouvelle IHM React de l'Emploi du temps (CCTP 51C).
 *
 * Fichier SOURCE, servi tel quel (public/dist/, lui, reçoit la sortie du build Gulp/Webpack).
 * Volontairement en JavaScript natif, hors de l'application AngularJS : l'IHM historique n'a pas
 * à être modifiée pour accueillir sa relève, et ce fichier disparaîtra avec elle. Son balisage est
 * rendu par `view-src/edt.html` (les libellés passent ainsi par l'i18n du serveur) ; il ne reste
 * ici que la décision d'afficher et l'enregistrement du choix. Même mécanisme que l'Agenda.
 *
 * L'état vit dans la préférence usager `edtUi` (sans tiret : entcore retire les caractères non
 * alphanumériques des clés avant d'en faire un nom de propriété Cypher). Ex. :
 *   { "ui": "react", "invitationShown": 2, "returnShown": 1 }
 * `ui` est aussi lue par le serveur (EdtController#preferredUi) pour servir la bonne IHM.
 */
(function () {
  'use strict';

  var PREFERENCE_URL = '/userbook/preference/edtUi';
  /** Au-delà, l'usager a vu passer l'invitation : insister deviendrait pénible. */
  var MAX_INVITATIONS = 5;

  var banner = document.getElementById('edt-ui-switch');
  if (!banner) return;

  function xsrfHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    var match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    if (match) headers['X-XSRF-TOKEN'] = decodeURIComponent(match[1]);
    return headers;
  }

  function read() {
    return fetch(PREFERENCE_URL, { credentials: 'include' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) {
        // L'enveloppe est { preference: "<json>" } — une CHAÎNE, pas un objet.
        if (!body || !body.preference) return {};
        try { return JSON.parse(body.preference) || {}; } catch (e) { return {}; }
      })
      .catch(function () { return {}; });
  }

  function write(preference) {
    return fetch(PREFERENCE_URL, {
      credentials: 'include',
      method: 'PUT',
      headers: xsrfHeaders(),
      body: JSON.stringify(preference),
    }).catch(function () { /* un choix d'habillage ne justifie pas d'alerter l'usager */ });
  }

  read().then(function (preference) {
    // Un choix explicite, dans un sens comme dans l'autre, clôt le sujet : quelqu'un qui est
    // REVENU à l'ancienne IHM a déjà tranché, le réinviter à chaque visite serait insistant.
    if (preference.ui === 'react' || preference.ui === 'angular') return;
    if (preference.invitationDismissed) return;
    var shown = typeof preference.invitationShown === 'number' ? preference.invitationShown : 0;
    if (shown >= MAX_INVITATIONS) return;

    banner.hidden = false;
    preference.invitationShown = shown + 1;
    write(preference);

    banner.querySelector('[data-action="try"]').addEventListener('click', function () {
      preference.ui = 'react';
      // `?ui=react` double l'enregistrement : la préférence fraîchement écrite peut manquer au cache
      // de la session en cours, la dérogation d'URL est honorée sans condition.
      write(preference).then(function () { window.location.href = '/edt?ui=react'; });
    });

    banner.querySelector('[data-action="later"]').addEventListener('click', function () {
      preference.invitationDismissed = true;
      write(preference);
      banner.hidden = true;
    });
  });
})();
