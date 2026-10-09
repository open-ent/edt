/** Fonctions pures du module Emploi du temps (edt), testables. */

const pad = (n: number) => String(n).padStart(2, '0');

/** Format « YYYY-MM-DD » d'une Date. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Ajoute `days` jours à une Date (nouvelle Date). */
export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** Lundi (00:00) de la semaine contenant `d` (semaine ISO, lundi = premier jour). */
export function mondayOf(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (r.getDay() + 6) % 7; // 0 = lundi … 6 = dimanche
  return addDays(r, -dow);
}

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Libellé du jour d'une date ISO (« Lundi »…). '' si illisible. */
export function dayLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return JOURS[(d.getDay() + 6) % 7];
}

/** Heure « HH:MM » d'une date ISO. '' si illisible. */
export function hhmm(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Clé de tri chronologique d'un cours (par date de début ISO). */
export function courseSortKey(iso?: string): number {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/** Intitulé « du jj/mm au jj/mm » d'une semaine à partir de son lundi. */
export function weekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const fr = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return `du ${fr(monday)} au ${fr(sunday)}`;
}
