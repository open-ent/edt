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
    crossDateFilter: false, // true ne renvoie que les cours COUVRANT toute la période (récurrences), pas les occurrences ponctuelles
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

/** Cours d'un enseignant sur la période (POST de lecture, filtre par teacherIds). « Mon emploi du temps ». */
export const getCoursesForTeacher = async (
  structureId: string,
  teacherId: string,
  startAt: string,
  endAt: string,
): Promise<Course[]> => {
  const filter: CoursesFilter = {
    teacherIds: [teacherId],
    groupIds: [],
    groupExternalIds: [],
    groupNames: [],
    union: true,
    crossDateFilter: false, // true ne renvoie que les cours COUVRANT toute la période (récurrences), pas les occurrences ponctuelles
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

/** Crée un cours ponctuel (POST /edt/course — le backend attend un TABLEAU de cours). */
export const createCourse = async (data: {
  structureId: string;
  subjectId: string;
  teacherId: string;
  className: string;
  room?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}): Promise<void> => {
  const dow = new Date(`${data.date}T12:00:00`).getDay(); // 0=dim … 6=sam (convention Mongo courses)
  const course = {
    structureId: data.structureId,
    subjectId: data.subjectId,
    teacherIds: [data.teacherId],
    classes: [data.className],
    groups: [],
    roomLabels: data.room ? [data.room] : [],
    startDate: `${data.date}T${data.startTime}:00`,
    endDate: `${data.date}T${data.endTime}:00`,
    dayOfWeek: dow,
    manual: true,
    theoretical: false,
    everyTwoWeek: false,
  };
  const res = await fetch('/edt/course', { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify([course]) });
  if (!res.ok) throw new Error(String(res.status));
};

// ── Choix d'IHM (bascule AngularJS → React) ──────────────────────────────────
/**
 * Préférence `edtUi` : choix d'interface + état des bandeaux qui le proposent.
 * Le serveur lit `ui` pour servir la bonne vue (EdtController#preferredUi). Pas de tiret dans la
 * clé : entcore retire les caractères non alphanumériques avant d'en faire une propriété du graphe.
 * Ex. `{ ui: 'react', invitationShown: 2, returnShown: 1 }`.
 */
export interface UiPreference {
  /** Choix explicite de l'usager. Absent = la plateforme tranche. */
  ui?: 'react' | 'angular';
  /** « Plus tard » sur l'invitation affichée par l'IHM AngularJS (public/ui-switch.js). */
  invitationDismissed?: boolean;
  invitationShown?: number;
  /** « Ne plus afficher » sur le bandeau de retour de l'IHM React. */
  returnDismissed?: boolean;
  returnShown?: number;
  /** Réponse libre à « Qu'est-ce qui vous manque ? », au moment du retour en arrière. */
  feedback?: string;
  feedbackAt?: string;
}

export const getUiPreference = async (): Promise<UiPreference> => {
  const res = await fetch('/userbook/preference/edtUi', base);
  if (!res.ok) return {};
  // L'enveloppe est `{ preference: "<json>" }` — une chaîne, pas un objet.
  const body = (await res.json()) as { preference?: string } | null;
  if (!body?.preference) return {};
  try {
    return (JSON.parse(body.preference) as UiPreference) ?? {};
  } catch {
    return {};
  }
};

export const saveUiPreference = async (preference: UiPreference): Promise<void> => {
  await fetch('/userbook/preference/edtUi', {
    ...base,
    method: 'PUT',
    headers: mutHeaders(),
    body: JSON.stringify(preference),
  });
};

export const api = {
  getClasses,
  getMatieres,
  getTimeSlots,
  getCoursesForClass,
  getCoursesForTeacher,
  createCourse,
  getUiPreference,
  saveUiPreference,
};
