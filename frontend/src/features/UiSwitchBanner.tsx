import { Button, FormControl, Input, Label } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, UiPreference } from '../api';

/** Au-delà, l'information a été transmise : continuer à occuper le bas de l'écran serait pénible. */
const MAX_DISPLAYS = 5;

/**
 * Réglage durable du choix d'interface, dans le dashboard (entrée `edtUi` de la page
 * « Paramètres du compte »), à dessein hors de cette application : ce bandeau fait découvrir le
 * changement puis s'efface, la page de réglages gouverne. Chemin figé : le module ne connaît pas
 * le `basePath` du dashboard, qui vaut `/dashboard` en local comme en production.
 */
const SETTINGS_URL = '/dashboard/account/settings';

/**
 * Bandeau de retour vers l'IHM AngularJS pendant la cohabitation des deux interfaces — symétrique
 * de l'invitation posée sur l'ancienne IHM (`public/ui-switch.js`), même mécanisme que l'Agenda.
 * Le retour passe par une question en une ligne : c'est le seul moment où l'on saura POURQUOI
 * quelqu'un repart. Ex. réponse stockée : `{ ui: 'angular', feedback: 'il manque la vue mensuelle' }`.
 *
 * Pour relire les réponses : {@code MATCH (u:User)-[:PREFERS]->(uac:UserAppConf)
 *  WHERE uac.edtUi CONTAINS 'feedback' RETURN u.id, uac.edtUi}
 */
export function UiSwitchBanner() {
  const { t } = useTranslation(['edt', 'common']);
  const [asking, setAsking] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [hidden, setHidden] = useState(false);

  const preferenceQuery = useQuery({
    queryKey: ['edt', 'ui-preference'],
    queryFn: api.getUiPreference,
    staleTime: Infinity,
  });

  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (preference: UiPreference) => api.saveUiPreference(preference),
    // La préférence est réécrite ENTIÈRE à chaque fois : sans remettre le résultat en cache, une
    // seconde écriture repartirait de la version d'avant et effacerait la première (ex. le compteur
    // d'affichages repasserait de 2 à 1).
    onSuccess: (_data, preference) => queryClient.setQueryData(['edt', 'ui-preference'], preference),
  });

  const preference = preferenceQuery.data;
  const visible =
    !!preference && !hidden && !preference.returnDismissed && (preference.returnShown ?? 0) < MAX_DISPLAYS;

  // Un affichage compté une seule fois par chargement de page, jamais pendant le rendu.
  const counted = useRef(false);
  useEffect(() => {
    if (!visible || counted.current || !preference) return;
    counted.current = true;
    save.mutate({ ...preference, returnShown: (preference.returnShown ?? 0) + 1 });
    // `save` est stable (useMutation) ; le ref garantit l'unicité, l'ajouter aux dépendances
    // risquerait une boucle d'écriture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, preference]);

  // Tant que la préférence n'est pas connue, rien : un bandeau qui apparaît puis disparaît une
  // seconde plus tard est plus déroutant qu'un bandeau qui arrive tard.
  if (!visible || !preference) return null;

  const goBack = (withFeedback: boolean) => {
    const answer = feedback.trim();
    void save
      .mutateAsync({
        ...preference,
        ui: 'angular',
        ...(withFeedback && answer ? { feedback: answer, feedbackAt: new Date().toISOString() } : {}),
      })
      .finally(() => {
        // `?ui=angular` double l'enregistrement : la préférence écrite à l'instant peut manquer au
        // cache de la session, la dérogation d'URL est honorée sans condition.
        window.location.href = '/edt?ui=angular';
      });
  };

  const dismiss = () => {
    setHidden(true);
    save.mutate({ ...preference, returnDismissed: true });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    goBack(true);
  };

  return (
    <div className="edt-ui-switch card shadow p-16" role="region" aria-label={t('edt.switch.return.title')}>
      {asking ? (
        <form className="d-flex flex-column gap-8" onSubmit={onSubmit}>
          <FormControl id="edt-ui-switch-feedback">
            <Label>{t('edt.switch.feedback.question')}</Label>
            <Input
              type="text"
              size="md"
              autoFocus
              placeholder={t('edt.switch.feedback.placeholder')}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
          </FormControl>
          <div className="d-flex justify-content-end gap-8">
            <Button type="button" color="tertiary" variant="ghost" onClick={() => goBack(false)}>
              {t('edt.switch.feedback.skip')}
            </Button>
            <Button type="submit" color="primary" variant="filled">
              {t('edt.switch.feedback.send')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="d-flex align-items-center gap-16 flex-wrap">
          <div className="flex-fill">
            <div>{t('edt.switch.return.title')}</div>
            <small className="text-muted">
              {t('edt.switch.return.where')} <a href={SETTINGS_URL}>{t('edt.switch.return.settings')}</a>.
            </small>
          </div>
          <div className="d-flex align-items-center gap-8">
            <Button type="button" color="tertiary" variant="ghost" onClick={dismiss}>
              {t('edt.switch.return.dismiss')}
            </Button>
            <Button type="button" color="primary" variant="outline" onClick={() => setAsking(true)}>
              {t('edt.switch.return.back')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default UiSwitchBanner;
