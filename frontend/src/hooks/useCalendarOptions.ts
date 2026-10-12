import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api';
import { CalendarOptions } from '../period';

/**
 * Options d'affichage du calendrier (quarts d'heure, samedi, dimanche), lues et enregistrées dans
 * la préférence `calendarOptions` partagée avec l'AngularJS. Samedi et dimanche masqués par défaut,
 * comme le socle AngularJS ; quarts d'heure affichés par défaut, comme l'emploi du temps AngularJS.
 * Ex. cocher « Afficher le samedi » ici l'affiche aussi dans l'ancienne interface.
 */
export function useCalendarOptions() {
  const qc = useQueryClient();
  const key = ['edt', 'calendarOptions'];
  const query = useQuery({ queryKey: key, queryFn: api.getCalendarOptions, staleTime: Infinity });
  const stored = query.data ?? {};
  const options: Required<CalendarOptions> = {
    displayQuarterHours: stored.displayQuarterHours ?? true,
    displaySaturday: !!stored.displaySaturday,
    displaySunday: !!stored.displaySunday,
  };
  const save = useMutation({
    mutationFn: api.saveCalendarOptions,
    // Affichage immédiat, sans attendre le serveur.
    onMutate: (next: CalendarOptions) => {
      qc.setQueryData<CalendarOptions>(key, next);
    },
  });
  const set = (patch: CalendarOptions) => save.mutate({ ...options, ...patch });
  return { options, set };
}
