// Client REST du module Emploi du temps (edt) — session ENT, même origine.
// Incrément 1 : lecture seule des cours d'une classe sur une semaine.
// Le référentiel classes/matières est fourni par le module viescolaire (même établissement).

/**
 * Classe ou groupe de l'établissement, tel que renvoyé par `/viescolaire/classes?isEdt=true`.
 * Ex. `{ id: "a1…", name: "4A", type_groupe: 0, color: "#4bafd5", isInCurrentTeacher: true }`.
 */
export interface Group {
  id: string;
  name: string;
  externalId?: string;
  /** 0 classe, 1 groupe d'enseignement, 2 groupe manuel. */
  type_groupe: number;
  /** Couleur attribuée à la classe dans l'emploi du temps (absente sans `isEdt=true`). */
  color?: string;
  /** Classe ou groupe de l'enseignant connecté (« ma classe »). */
  isInCurrentTeacher: boolean;
}

/** Ancien nom, conservé pour les appels existants qui n'utilisent que id/name/externalId. */
export type Klass = Pick<Group, 'id' | 'name' | 'externalId'>;

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
  /** Matière du référentiel, ex. { id, name: "MATHEMATIQUES" }. */
  subject?: { id?: string; name?: string };
  /** Matière personnalisée saisie en texte libre (prioritaire sur `subject`). */
  exceptionnal?: string;
  /** Couleur nommée de la classe, ex. "keppel-blue-lighter" (cf. colors.ts). */
  color?: string;
  /** Étiquettes du cours, déjà résolues par le serveur, ex. [{ label: "Travaux dirigés", abbreviation: "TD" }]. */
  tags?: Array<{ id: number; label: string; abbreviation?: string }>;
  /** Ressources RBS liées (identifiants numériques, libellés via getRbsResources). */
  rbsResourceIds?: number[];
  recurrence?: string;
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

type RawGroup = { id: string; name: string; externalId?: string; type_groupe?: number; color?: string };

const toGroup = (g: RawGroup, isInCurrentTeacher: boolean): Group => ({
  id: g.id,
  name: g.name,
  externalId: g.externalId,
  type_groupe: g.type_groupe ?? 0,
  color: g.color,
  isInCurrentTeacher,
});

/**
 * Classes et groupes de l'établissement, comme l'IHM AngularJS (`model/group.ts`).
 * `isEdt=true` ajoute la couleur et évite l'enrichissement « services » inutile ici.
 * Un enseignant ne reçoit sans `isTeacherEdt=true` que SES classes (côté vie-scolaire,
 * `forAdmin = Personnel || isTeacherEdt`) : on demande donc ses classes, marquées « ma classe »,
 * puis toutes celles de l'établissement. Ex. enseignant de 4A : 4A (ma classe), puis 3A, 3B, 4B…
 */
export const getGroups = async (structureId: string, isTeacher: boolean): Promise<Group[]> => {
  const url = `/viescolaire/classes?idEtablissement=${structureId}&isEdt=true`;
  if (!isTeacher) {
    return json<RawGroup[]>(await fetch(url, base)).then((arr) => (arr ?? []).map((g) => toGroup(g, false)));
  }
  const mine = (await json<RawGroup[]>(await fetch(url, base))) ?? [];
  const all = (await json<RawGroup[]>(await fetch(`${url}&isTeacherEdt=true`, base))) ?? [];
  const mineIds = new Set(mine.map((g) => g.id));
  return [...mine.map((g) => toGroup(g, true)), ...all.filter((g) => !mineIds.has(g.id)).map((g) => toGroup(g, false))];
};

// ── Groupes d'une classe, enseignants ───────────────────────────────────────────
/**
 * Groupes rattachés à des classes (demi-groupes, options), comme l'IHM AngularJS
 * (`calendarItems.getGroups`). Ex. classes [401] → Map { "401" → [{ id, name: "401 grp A" }] }.
 * `studentId` restreint aux groupes d'un élève (vue élève ou parent).
 */
export const getSubGroups = async (
  classIds: string[],
  studentId?: string,
): Promise<Map<string, Array<{ id: string; name: string }>>> => {
  const result = new Map<string, Array<{ id: string; name: string }>>();
  if (classIds.length === 0) return result;
  const query = classIds.map((id) => `classes=${encodeURIComponent(id)}`).join('&');
  const url = `/viescolaire/group/from/class?${query}${studentId ? `&student=${encodeURIComponent(studentId)}` : ''}`;
  const rows = (await json<Array<{ id_classe: string; id_groups: string[]; name_groups: string[] }>>(await fetch(url, base))) ?? [];
  for (const row of rows) {
    result.set(
      row.id_classe,
      (row.id_groups ?? []).map((id, i) => ({ id, name: row.name_groups?.[i] ?? id })),
    );
  }
  return result;
};

export interface Teacher {
  id: string;
  displayName: string;
}

/** Enseignants de l'établissement (noms affichés dans le filtre et l'infobulle des cours). */
export const getTeachers = async (structureId: string): Promise<Teacher[]> =>
  json<Array<{ id: string; displayName?: string; lastName?: string; firstName?: string }>>(
    await fetch(`/viescolaire/user/list?profile=Teacher&structureId=${structureId}`, base),
  ).then((arr) =>
    (arr ?? []).map((t) => ({ id: t.id, displayName: t.displayName ?? `${t.lastName ?? ''} ${t.firstName ?? ''}`.trim() })),
  );

/** Cours correspondant à un filtre (classes, groupes, enseignants) entre deux dates « YYYY-MM-DD ». */
export const getCourses = async (
  structureId: string,
  filter: CoursesFilter,
  startAt: string,
  endAt: string,
): Promise<Course[]> =>
  json<Course[]>(
    await fetch(`/edt/structures/${structureId}/common/courses/${startAt}/${endAt}`, {
      ...base,
      method: 'POST',
      headers: mutHeaders(),
      body: JSON.stringify(filter),
    }),
  );

/** Ressources RBS de l'établissement, par identifiant, ex. { 12: "Salle 201" }. */
export const getRbsResources = async (structureId: string): Promise<Map<number, string>> => {
  const body = await json<{ resources?: Array<{ id: number; name: string }> }>(
    await fetch(`/edt/structures/${structureId}/rbs/resources`, base),
  );
  return new Map((body?.resources ?? []).map((r) => [r.id, r.name]));
};

// ── Établissement mémorisé (préférence partagée avec l'IHM AngularJS) ───────────
/** Préférence `edt.structure` : dernier établissement consulté, ex. `{ id: "…", name: "Collège A" }`. */
export const getStructurePreference = async (): Promise<{ id?: string; name?: string }> => {
  const res = await fetch('/userbook/preference/edt.structure', base);
  if (!res.ok) return {};
  const body = (await res.json()) as { preference?: string } | null;
  if (!body?.preference) return {};
  try {
    return (JSON.parse(body.preference) as { id?: string; name?: string }) ?? {};
  } catch {
    return {};
  }
};

export const saveStructurePreference = async (structure: { id: string; name: string }): Promise<void> => {
  await fetch('/userbook/preference/edt.structure', {
    ...base,
    method: 'PUT',
    headers: mutHeaders(),
    body: JSON.stringify(structure),
  });
};

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
  getGroups,
  getSubGroups,
  getTeachers,
  getCourses,
  getRbsResources,
  getStructurePreference,
  saveStructurePreference,
  getMatieres,
  getTimeSlots,
  getCoursesForClass,
  getCoursesForTeacher,
  createCourse,
  getUiPreference,
  saveUiPreference,
};
