// Période affichée selon la vue (jour, semaine, quinzaine, mois) — mêmes bornes et même pas de
// navigation que le composant calendrier commun du socle AngularJS (libs/infra-front, calendar.ts,
// dont la vue « quinzaine » : 14 jours à partir du lundi). Fonctions pures, testées.

import { addDays, mondayOf } from './utils';

export type ViewMode = 'day' | 'week' | 'fortnight' | 'month';

export const VIEW_MODES: ViewMode[] = ['day', 'week', 'fortnight', 'month'];

export interface Period {
  /** Jours affichés, dans l'ordre (le mois est complété aux semaines entières). */
  days: Date[];
  /** Premier et dernier jour à lire côté serveur, inclus. */
  first: Date;
  last: Date;
}

/**
 * Jours affichés pour une vue autour d'une date de référence.
 * Ex. vue quinzaine autour du mercredi 14/10/2026 → du lundi 12/10 au dimanche 25/10 ;
 * vue mois d'octobre 2026 → du lundi 28/09 au dimanche 01/11 (semaines entières).
 */
export function periodOf(mode: ViewMode, anchor: Date): Period {
  const day = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  let first: Date;
  let count: number;
  switch (mode) {
    case 'day':
      first = day;
      count = 1;
      break;
    case 'week':
      first = mondayOf(day);
      count = 7;
      break;
    case 'fortnight':
      first = mondayOf(day);
      count = 14;
      break;
    case 'month': {
      first = mondayOf(new Date(day.getFullYear(), day.getMonth(), 1));
      const lastOfMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0);
      const lastShown = addDays(mondayOf(lastOfMonth), 6);
      count = Math.round((lastShown.getTime() - first.getTime()) / 86_400_000) + 1;
      break;
    }
  }
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  return { days, first: days[0], last: days[days.length - 1] };
}

/** Date de référence après un pas de navigation : 1 jour, 7 jours, 14 jours ou 1 mois. */
export function step(mode: ViewMode, anchor: Date, direction: 1 | -1): Date {
  switch (mode) {
    case 'day':
      return addDays(anchor, direction);
    case 'week':
      return addDays(anchor, 7 * direction);
    case 'fortnight':
      return addDays(anchor, 14 * direction);
    case 'month':
      return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  }
}

/** Date d'ouverture : le dimanche, l'IHM AngularJS ouvre directement la semaine suivante. */
export function initialAnchor(today: Date): Date {
  return today.getDay() === 0 ? addDays(today, 1) : today;
}
