// Placement des cours dans la grille hebdomadaire : axe horaire réel (à la minute), cours
// simultanés côte à côte. Fonctions pures, testées dans grid.test.ts.

import type { Course, TimeSlot } from './api';
import { parseServerDate } from './utils';

/** Minutes depuis minuit d'une date serveur, ex. "2026-10-12 08:30:00" ou "2026-10-12T08:30:00" → 510. */
export function minutesOf(date: string | undefined): number {
  const m = /[ T](\d{2}):(\d{2})/.exec(date ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

/** Jour calendaire « YYYY-MM-DD » d'une date serveur. */
export const dayOf = (date: string | undefined): string => (date ?? '').slice(0, 10);

/** Minutes depuis minuit d'une heure « HH:mm », ex. "13:45" → 825. */
export function minutesOfHour(hour: string | undefined): number {
  const m = /(\d{1,2}):(\d{2})/.exec(hour ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

/**
 * Bornes de l'axe horaire : du premier créneau de l'établissement au dernier, élargies aux cours
 * qui en débordent (cours en horaire libre). Ex. créneaux 08:00-17:00, cours 17:00-18:30 → 08:00-18:30.
 * Repli 08:00-18:00 sans créneau ni cours.
 */
export function axisBounds(slots: TimeSlot[], courses: Course[]): { start: number; end: number } {
  const starts = [...slots.map((s) => minutesOfHour(s.startHour)), ...courses.map((c) => minutesOf(c.startDate))].filter((m) => m >= 0);
  const ends = [...slots.map((s) => minutesOfHour(s.endHour)), ...courses.map((c) => minutesOf(c.endDate))].filter((m) => m >= 0);
  if (starts.length === 0 || ends.length === 0) return { start: 8 * 60, end: 18 * 60 };
  return { start: Math.min(...starts), end: Math.max(...ends) };
}

export interface PlacedCourse {
  course: Course;
  start: number;
  end: number;
  /** Colonne occupée parmi les cours qui se chevauchent (0 = la plus à gauche). */
  lane: number;
  /** Nombre de colonnes du groupe de cours qui se chevauchent. */
  lanes: number;
}

/**
 * Place les cours d'une même journée : chaque cours prend la première colonne libre ; un groupe
 * de cours qui se chevauchent se partage la largeur. Ex. 08:00-10:00 et 09:00-10:00 → deux
 * colonnes ; un cours 10:00-11:00 qui suit reprend toute la largeur.
 */
export function placeDay(courses: Course[]): PlacedCourse[] {
  const items = courses
    .map((course) => ({ course, start: minutesOf(course.startDate), end: minutesOf(course.endDate) }))
    .filter((i) => i.start >= 0 && i.end > i.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: PlacedCourse[] = [];
  let cluster: PlacedCourse[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const closeCluster = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const p of cluster) p.lanes = lanes;
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const item of items) {
    if (cluster.length > 0 && item.start >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ ...item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length > 0) closeCluster();
  return placed;
}

/** Libellé de la matière : matière personnalisée, sinon matière du cours. */
export function courseSubject(course: Course, fallback?: (subjectId: string) => string | undefined): string {
  return (
    course.exceptionnal ||
    course.subject?.name ||
    course.subjectLabel ||
    (course.subjectId ? fallback?.(course.subjectId) : undefined) ||
    ''
  );
}

/** Un cours est passé une fois terminé. */
export const isPast = (course: Course, now: Date): boolean => {
  const end = parseServerDate(course.endDate ?? '');
  return !Number.isNaN(end.getTime()) && end.getTime() < now.getTime();
};
