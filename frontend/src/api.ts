// Client REST du module Emploi du temps (edt) — session ENT, même origine.
// Incrément 1 : lecture seule des cours d'une classe sur une semaine.
// Le référentiel classes/matières est fourni par le module viescolaire (même établissement).

export interface Klass {
  id: string;
  name: string;
  externalId?: string;
}

export interface Matiere {
  id: string;
  name: string;
}

/** Créneau horaire du référentiel de la structure. */
export interface TimeSlot {
  id: string;
  name: string;
  startHour: string;
  endHour: string;
}

/** Un cours de l'emploi du temps (sous-ensemble utile en lecture). Dates ISO datetime. */
export interface Course {
  _id: string;
  structureId?: string;
  subjectId?: string;
  subjectLabel?: string;
  teacherIds?: string[];
  roomLabels?: string[];
  classes?: string[];
  groups?: string[];
  dayOfWeek?: number;
  idStartSlot?: string;
  idEndSlot?: string;
  startDate: string;
  endDate: string;
}

/** Corps du POST courses (cf. calendarItems.ts : filtre par groupes et/ou enseignants). */
export interface CoursesFilter {
  teacherIds: string[];
  groupIds: string[];
  groupExternalIds: string[];
  groupNames: string[];
  union: boolean;
  crossDateFilter: boolean;
}

function xsrfHeader(): Record<string, string> {
  const m = typeof document !== 'undefined' ? document.cookie.match(/XSRF-TOKEN=([^;]+)/) : null;
  return m ? { 'X-XSRF-TOKEN': decodeURIComponent(m[1]) } : {};
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(String(res.status));
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const base = { credentials: 'include' as const };
const mutHeaders = () => ({ 'Content-Type': 'application/json', ...xsrfHeader() });

// ── Référentiel (module viescolaire, même établissement) ───────────────────────
/** Créneaux horaires (référentiel) de la structure, triés par heure de début. */
export const getTimeSlots = async (structureId: string): Promise<TimeSlot[]> =>
  json<TimeSlot[]>(await fetch(`/edt/time-slots?structureId=${structureId}`, base)).then((arr) =>
    [...arr].sort((a, b) => (a.startHour || '').localeCompare(b.startHour || '')),
  );

export const getClasses = async (structureId: string): Promise<Klass[]> =>
  json<Array<{ id: string; name: string; externalId?: string }>>(
    await fetch(`/viescolaire/classes?idEtablissement=${structureId}`, base),
  ).then((arr) => arr.map((c) => ({ id: c.id, name: c.name, externalId: c.externalId })));

export const getMatieres = async (structureId: string): Promise<Matiere[]> =>
  json<Array<{ id: string; name: string }>>(
    await fetch(`/viescolaire/matieres?idEtablissement=${structureId}`, base),
  ).then((arr) => arr.map((m) => ({ id: m.id, name: m.name })));

// ── Cours (emploi du temps) ─────────────────────────────────────────────────────
/**
 * Cours d'une classe entre deux dates (« YYYY-MM-DD »). POST de LECTURE (aucun effet de bord).
 * Le filtre reprend la classe (id/externalId/name) ; `union:true` = cours de l'un OU l'autre critère.
 */
export const getCoursesForClass = async (
  structureId: string,
  klass: Klass,
  startAt: string,
  endAt: string,
): Promise<Course[]> => {
  const filter: CoursesFilter = {
    teacherIds: [],
    groupIds: [klass.id],
    groupExternalIds: klass.externalId ? [klass.externalId] : [],
    groupNames: [klass.name],
    union: true,
    crossDateFilter: true,
  };
  return json<Course[]>(
    await fetch(`/edt/structures/${structureId}/common/courses/${startAt}/${endAt}`, {
      ...base,
      method: 'POST',
      headers: mutHeaders(),
      body: JSON.stringify(filter),
    }),
  );
};

export const api = { getClasses, getMatieres, getTimeSlots, getCoursesForClass };
