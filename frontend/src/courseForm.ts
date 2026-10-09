// Formulaire de cours : horaires, validations et cours envoyé au serveur, identiques à l'IHM
// AngularJS (controllers/manageCourse.ts : isValidForm, setDatesFromTimeslots ; model/course.ts :
// toJSON). Fonctions pures, testées dans courseForm.test.ts.

import type { Group, TimeSlot } from './api';
import { minutesOfHour } from './grid';
import type { CourseResource } from './resources';

export interface CourseDraft {
  structureId: string;
  teacherIds: string[];
  groups: Group[];
  subjectId: string;
  /** Matière personnalisée (texte libre), utilisée à la place de subjectId quand cochée. */
  isExceptional: boolean;
  exceptional: string;
  /** Jour du cours, « YYYY-MM-DD ». */
  date: string;
  /** Plage nommée de la grille de l'établissement, ou horaire libre. */
  freeSchedule: boolean;
  startSlotId: string;
  endSlotId: string;
  /** Horaire libre, « HH:mm ». */
  startTime: string;
  endTime: string;
  tagId?: number;
  rbsResourceIds: number[];
  roomLabels: string[];
  /** Documents attachés (espace documentaire, médiacentre). */
  resources: CourseResource[];
}

export const emptyDraft = (structureId: string): CourseDraft => ({
  structureId,
  teacherIds: [],
  groups: [],
  subjectId: '',
  isExceptional: false,
  exceptional: '',
  date: '',
  freeSchedule: false,
  startSlotId: '',
  endSlotId: '',
  startTime: '',
  endTime: '',
  rbsResourceIds: [],
  roomLabels: [],
  resources: [],
});

/**
 * Heures effectives du cours : début de la plage de départ et fin de la plage d'arrivée, ou
 * l'horaire libre. Ex. plages M1 (08:00-09:00) → M2 (09:00-10:00) → 08:00-10:00.
 */
export function effectiveTimes(draft: CourseDraft, slots: TimeSlot[]): { start: string; end: string } | null {
  if (draft.freeSchedule) return draft.startTime && draft.endTime ? { start: draft.startTime, end: draft.endTime } : null;
  const start = slots.find((s) => s.id === draft.startSlotId)?.startHour;
  const end = slots.find((s) => s.id === draft.endSlotId)?.endHour;
  return start && end ? { start: start.slice(0, 5), end: end.slice(0, 5) } : null;
}

export type DraftError = 'teachers' | 'groups' | 'subject' | 'date' | 'time' | 'order' | 'past';

/**
 * Erreurs bloquantes, mêmes règles que l'AngularJS : au moins un enseignant et une classe ou un
 * groupe, une matière (ou une matière personnalisée non vide), une fin postérieure au début — d'au
 * moins 15 minutes en horaire libre —, et pas de cours déjà commencé.
 * Ex. horaire libre 10:00-10:10 → ['order'].
 */
export function validateDraft(draft: CourseDraft, slots: TimeSlot[], now: Date): DraftError[] {
  const errors: DraftError[] = [];
  if (draft.teacherIds.length === 0) errors.push('teachers');
  if (draft.groups.length === 0) errors.push('groups');
  if (draft.isExceptional ? draft.exceptional.trim() === '' : !draft.subjectId) errors.push('subject');
  if (!draft.date) errors.push('date');
  const times = effectiveTimes(draft, slots);
  if (!times) {
    errors.push('time');
    return errors;
  }
  const minimum = draft.freeSchedule ? 15 : 1;
  if (minutesOfHour(times.end) - minutesOfHour(times.start) < minimum) errors.push('order');
  if (draft.date && new Date(`${draft.date}T${times.start}:00`).getTime() <= now.getTime()) errors.push('past');
  return errors;
}

/**
 * Cours envoyé à POST /edt/course (dans un tableau), champ pour champ comme `Course.toJSON()` de
 * l'AngularJS : classes et groupes séparés (noms, identifiants, identifiants externes), jour de la
 * semaine 0 = dimanche, cours manuel. Ex. 4A + « 4A grp1 » → classes ["4A"], groups ["4A grp1"].
 */
export function toCoursePayload(draft: CourseDraft, slots: TimeSlot[], login: string, now: Date): Record<string, unknown> {
  const times = effectiveTimes(draft, slots)!;
  const classes = draft.groups.filter((g) => g.type_groupe === 0);
  const groups = draft.groups.filter((g) => g.type_groupe === 1 || g.type_groupe === 2);
  return {
    structureId: draft.structureId,
    subjectId: draft.isExceptional ? null : draft.subjectId,
    exceptionnal: draft.isExceptional ? draft.exceptional.trim() : undefined,
    teacherIds: draft.teacherIds,
    tagIds: draft.tagId !== undefined ? [draft.tagId] : [],
    classes: classes.map((g) => g.name),
    classesExternalIds: classes.map((g) => g.externalId),
    classesIds: classes.map((g) => g.id),
    groups: groups.map((g) => g.name),
    groupsExternalIds: groups.map((g) => g.externalId),
    groupsIds: groups.map((g) => g.id),
    roomLabels: draft.roomLabels,
    dayOfWeek: new Date(`${draft.date}T12:00:00`).getDay(),
    manual: true,
    theoretical: false,
    everyTwoWeek: false,
    updated: now.toISOString(),
    lastUser: login,
    resources: draft.resources,
    rbsResourceIds: draft.rbsResourceIds,
    startDate: `${draft.date}T${times.start}:00`,
    endDate: `${draft.date}T${times.end}:00`,
    idStartSlot: draft.freeSchedule ? undefined : draft.startSlotId,
    idEndSlot: draft.freeSchedule ? undefined : draft.endSlotId,
  };
}

/**
 * Pré-remplissage depuis un clic sur un créneau vide : la plage nommée qui contient l'heure, sinon
 * l'horaire libre arrondi au quart d'heure (une heure de durée). Ex. clic à 10:07 sur une grille
 * M3 = 10:00-11:00 → plage M3.
 */
export function prefillTimes(draft: CourseDraft, slots: TimeSlot[], date: string, minutes: number): CourseDraft {
  const slot = slots.find((s) => minutesOfHour(s.startHour) <= minutes && minutes < minutesOfHour(s.endHour));
  if (slot) return { ...draft, date, freeSchedule: false, startSlotId: slot.id, endSlotId: slot.id };
  const start = Math.floor(minutes / 15) * 15;
  const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { ...draft, date, freeSchedule: true, startTime: hh(start), endTime: hh(Math.min(start + 60, 23 * 60 + 45)) };
}

/** Cours existant tel que renvoyé par GET /edt/courses/:id (champs utiles au formulaire). */
export interface StoredCourse {
  _id: string;
  structureId?: string;
  teacherIds?: string[];
  classesIds?: string[];
  groupsIds?: string[];
  classes?: string[];
  groups?: string[];
  subjectId?: string | null;
  exceptionnal?: string | null;
  startDate: string;
  endDate: string;
  idStartSlot?: string | null;
  idEndSlot?: string | null;
  tagIds?: number[] | null;
  rbsResourceIds?: number[] | null;
  rbsBookingIds?: number[] | null;
  resources?: CourseResource[] | null;
  roomLabels?: string[] | null;
  recurrence?: string | null;
}

/**
 * Reprend un cours existant dans le formulaire : classes et groupes retrouvés par identifiant (à
 * défaut par nom), plage nommée si le cours en a une, sinon horaire libre.
 * Ex. cours 401, 2026-10-12 08:00-12:00 sans plage → horaire libre 08:00-12:00.
 */
export function draftFromCourse(course: StoredCourse, groups: Group[], slots: TimeSlot[]): CourseDraft {
  const ids = [...(course.classesIds ?? []), ...(course.groupsIds ?? [])];
  const names = [...(course.classes ?? []), ...(course.groups ?? [])];
  const matched = groups.filter((g) => ids.includes(g.id) || (!ids.length && names.includes(g.name)));
  const hasSlots = !!course.idStartSlot && slots.some((s) => s.id === course.idStartSlot) && slots.some((s) => s.id === course.idEndSlot);
  const hhmm = (date: string) => date.replace(' ', 'T').slice(11, 16);
  return {
    ...emptyDraft(course.structureId ?? ''),
    teacherIds: course.teacherIds ?? [],
    groups: matched,
    subjectId: course.subjectId ?? '',
    isExceptional: !!course.exceptionnal,
    exceptional: course.exceptionnal ?? '',
    date: course.startDate.slice(0, 10),
    freeSchedule: !hasSlots,
    startSlotId: hasSlots ? course.idStartSlot! : '',
    endSlotId: hasSlots ? course.idEndSlot! : '',
    startTime: hasSlots ? '' : hhmm(course.startDate),
    endTime: hasSlots ? '' : hhmm(course.endDate),
    tagId: course.tagIds?.[0] ?? undefined,
    rbsResourceIds: course.rbsResourceIds ?? [],
    roomLabels: course.roomLabels ?? [],
    resources: course.resources ?? [],
  };
}

/**
 * Un cours peut-il encore être modifié ? Comme l'AngularJS (isNotPast) : jusqu'à 15 minutes avant
 * son début. Ex. cours de 10:00 → modifiable jusqu'à 09:45.
 */
export function isEditable(startDate: string, now: Date): boolean {
  const start = new Date(startDate.replace(' ', 'T')).getTime();
  return !Number.isNaN(start) && start - 15 * 60_000 > now.getTime();
}
