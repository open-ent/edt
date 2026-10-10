import type { StoredCourse } from './courseForm';
import type { RbsResource } from './rbs';

// Client REST du module Emploi du temps (edt) — session ENT, même origine, mêmes routes que l'IHM
// AngularJS (consultation, recherche, formulaire de cours, ressources RBS par le relais edt).
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

// ── Enfants d'un parent ─────────────────────────────────────────────────────────
/**
 * Enfant d'un parent, tel que renvoyé par /edt/user/children.
 * Ex. { id, displayName: "CORBETT001 Abd-Samad", idClasses: ["eb3e…"], classes: ["707249$501"],
 *       structures: [{ id: "9083…", name: "CLG-PIERRE MENDES FRANCE-MORLAIX" }] }.
 */
export interface Child {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  /** Identifiants des classes de l'enfant. */
  idClasses: string[];
  /** Identifiants externes des classes, « <code>$<nom> » (ex. "707249$501"). */
  classes: string[];
  structures: Array<{ id: string; name: string }>;
}

export const getChildren = async (): Promise<Child[]> =>
  (await json<Child[]>(await fetch('/edt/user/children', base))) ?? [];

/** Classes d'un enfant au format du référentiel, ex. "707249$501" → { name: "501", externalId: "707249$501" }. */
export const childClasses = (child: Child): Group[] =>
  child.idClasses.map((id, i) => {
    const externalId = child.classes[i];
    const name = externalId?.includes('$') ? externalId.split('$').pop()! : externalId ?? id;
    return { id, name, externalId, type_groupe: 0, isInCurrentTeacher: false };
  });

// ── Recherche (barre de recherche de l'IHM AngularJS, autocompleteUtils.ts) ─────
/** Enseignants dont le prénom ou le nom contient le texte, ex. « hafs » → HAFSA001 Marie-Line (classes 501, 502…). */
export const searchTeachers = async (
  structureId: string,
  text: string,
): Promise<Array<{ id: string; displayName: string; classesNames?: string[] }>> =>
  (await json<Array<{ id: string; displayName: string; classesNames?: string[] }>>(
    await fetch(
      `/edt/search/users?structureId=${structureId}&profile=Teacher&q=${encodeURIComponent(text.replace(/\s/g, '').toLowerCase())}&field=firstName&field=lastName`,
      base,
    ),
  )) ?? [];

/** Classes et groupes dont le nom contient le texte, ex. « 40 » → 401, 402. */
export const searchGroups = async (structureId: string, text: string): Promise<Array<{ id: string; displayName: string }>> =>
  (await json<Array<{ id: string; displayName: string }>>(
    await fetch(`/edt/search?structureId=${structureId}&q=${encodeURIComponent(text)}`, base),
  )) ?? [];

// ── Formulaire de cours ─────────────────────────────────────────────────────────
/** Matière de l'annuaire ; `teacherId` présent = matière enseignée par un enseignant demandé. */
export interface Subject {
  subjectId: string;
  subjectLabel: string;
  subjectCode?: string;
  teacherId?: string;
}

/**
 * Matières de l'établissement (/directory/timetable/subjects), ou celles des enseignants donnés.
 * Ex. enseignante HAFSA001 → [{ subjectLabel: "MATHEMATIQUES", teacherId: "c547…" }].
 */
export const getSubjects = async (structureId: string, teacherIds: string[] = []): Promise<Subject[]> => {
  const query = teacherIds.map((id) => `teacherId=${encodeURIComponent(id)}`).join('&');
  return (await json<Subject[]>(await fetch(`/directory/timetable/subjects/${structureId}${query ? `?${query}` : ''}`, base))) ?? [];
};

/** Étiquette de cours de l'établissement, ex. { id: 4, label: "Travaux dirigés", abbreviation: "TD" }. */
export interface CourseTag {
  id: number;
  label: string;
  abbreviation?: string;
  isHidden?: boolean;
  /** Prioritaire à l'affichage quand deux cours se superposent. */
  isPrimary?: boolean;
  /** Un appel (présences) est associé aux cours portant cette étiquette. */
  allowRegister?: boolean;
  /** Déjà posée sur des cours : se masque, ne se supprime pas. */
  isUsed?: boolean;
}

/** Étiquette saisie dans l'administration, ex. { label: "Sortie", abbreviation: "SOR", isPrimary: false, allowRegister: true }. */
export interface CourseTagInput {
  label: string;
  abbreviation: string;
  isPrimary: boolean;
  allowRegister: boolean;
}

const tagRequest = async (url: string, method: string, body?: unknown): Promise<void> => {
  const res = await fetch(url, { ...base, method, headers: mutHeaders(), body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
};

/** Rapport d'un import STS précédent : date et texte du rapport (gabarit sts-report.txt du serveur). */
export interface StsReport {
  created?: string | { $date?: string | number };
  report: string;
}

/** Rapports des imports STS de l'établissement, du plus récent au plus ancien. */
export const getStsReports = async (structureId: string): Promise<StsReport[]> =>
  (await json<StsReport[]>(await fetch(`/edt/structures/${structureId}/sts/reports`, base))) ?? [];

/**
 * Import STS (deux fichiers XML, STS-EMP et EMP-STS), comme le sniplet AngularJS : envoi multipart
 * (sans Content-Type JSON). Réponse : { report } ; en cas d'échec, l'erreur porte une clé de libellé,
 * ex. « edt.sts.import.error.unauthorized ».
 */
export const importSts = async (structureId: string, stsEmp: File, empSts: File): Promise<{ ok: boolean; report?: string; error?: string }> => {
  const form = new FormData();
  form.append('file1', stsEmp);
  form.append('file2', empSts);
  const res = await fetch(`/edt/structures/${structureId}/sts`, { ...base, method: 'POST', headers: xsrfHeader(), body: form });
  const body = (await res.json().catch(() => null)) as { report?: string; error?: string } | null;
  return res.ok ? { ok: true, report: body?.report } : { ok: false, error: body?.error };
};

/** Administration des étiquettes de cours, mêmes routes que l'AngularJS (services/courseTag.service.ts). */
export const createCourseTag = (structureId: string, tag: CourseTagInput) => tagRequest(`/edt/structures/${structureId}/course/tag`, 'POST', tag);
export const updateCourseTag = (id: number, tag: CourseTagInput) => tagRequest('/edt/course/tag', 'PUT', { ...tag, id });
export const deleteCourseTag = (structureId: string, id: number) => tagRequest(`/edt/structures/${structureId}/course/tag/${id}`, 'DELETE');
export const setCourseTagHidden = (structureId: string, id: number, isHidden: boolean) =>
  tagRequest(`/edt/structures/${structureId}/course/tag/${id}/hidden`, 'PUT', { isHidden });

export const getCourseTags = async (structureId: string): Promise<CourseTag[]> =>
  (await json<CourseTag[]>(await fetch(`/edt/structures/${structureId}/course/tags`, base))) ?? [];

/**
 * Crée des cours (POST /edt/course, toujours un tableau). La réponse peut signaler des ressources
 * RBS déjà réservées sur le créneau : `rbsConflicts: [{ conflictResourceIds: [12] }]`.
 */
export const createCourses = async (
  courses: Array<Record<string, unknown>>,
): Promise<{ rbsConflicts?: Array<{ conflictResourceIds?: number[] }> } | null> =>
  json(await fetch('/edt/course', { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify(courses) }));

// ── Ressources RBS du formulaire de cours ──────────────────────────────────────
/**
 * Ressources RBS de l'établissement avec leur type et sa catégorie, par le relais serveur (visible
 * de tout enseignant, sans droit RBS individuel). Ex. [{ id: 12, name: "Salle 201",
 * typeName: "Salles du collège", typeCategory: "SALLE_COURS" }].
 */
export const getRbsResourceList = async (structureId: string): Promise<RbsResource[]> => {
  const body = await json<{ types?: Array<{ id: number; name: string; category?: string }>; resources?: Array<{ id: number; name: string; type_id: number }> }>(
    await fetch(`/edt/structures/${structureId}/rbs/resources`, base),
  );
  const types = new Map((body?.types ?? []).map((t) => [t.id, t]));
  return (body?.resources ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    typeName: types.get(r.type_id)?.name ?? '',
    typeCategory: (types.get(r.type_id)?.category ?? '').toUpperCase().trim(),
  }));
};

/** Catégorie de salle attendue pour une matière, selon school-planner (relais edt) ; null si inconnue. */
export const getRoomCategory = async (structureId: string, subjectName: string, subjectCode?: string): Promise<string | null> => {
  const query = `subjectName=${encodeURIComponent(subjectName)}&subjectCode=${encodeURIComponent(subjectCode ?? '')}`;
  const res = await fetch(`/edt/structures/${structureId}/room-category?${query}`, base);
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { category?: string } | null;
  return body?.category || null;
};

/**
 * Ressources occupées sur un créneau, en un appel : réservées (hors réservations du cours modifié)
 * ou salle d'un autre cours de l'emploi du temps. Mêmes règles que la réservation réelle (réservation
 * refusée ou « mère » d'une série périodique ignorée). Dates « YYYY-MM-DDTHH:mm:ss », heure de Paris.
 * Ex. lundi 16/11 10:00-11:00 → [12] si « Salle 201 » (id 12) est prise.
 */
export const getBusyResourceIds = async (structureId: string, start: string, end: string, courseId?: string): Promise<number[]> => {
  const query = courseId ? `?course=${encodeURIComponent(courseId)}` : '';
  const body = await json<{ busy?: number[] }>(await fetch(`/edt/structures/${structureId}/rbs/availability/${start}/${end}${query}`, base));
  return body?.busy ?? [];
};

/**
 * Ressources occupées sur plusieurs créneaux d'un coup (série de cours), avec les jours concernés
 * par ressource. Ex. lundis 12/10 et 19/10, « Salle 201 » (id 12) prise le 19 →
 * { busy: [12], dates: { "12": ["2026-10-19"] } }.
 */
export const getBusyResourcesForSlots = async (
  structureId: string,
  slots: Array<{ startAt: string; endAt: string }>,
  courseId?: string,
  /** Série modifiée : ses occurrences à venir et leurs réservations ne comptent pas. */
  recurrence?: string,
): Promise<{ busy: number[]; dates: Record<string, string[]> }> => {
  const body = await json<{ busy?: number[]; dates?: Record<string, string[]> }>(
    await fetch(`/edt/structures/${structureId}/rbs/availability`, {
      ...base,
      method: 'POST',
      headers: mutHeaders(),
      body: JSON.stringify({ slots, course: courseId, recurrence }),
    }),
  );
  return { busy: body?.busy ?? [], dates: body?.dates ?? {} };
};

/** Année scolaire de l'établissement (vie scolaire), ex. { start: "2026-09-01", end: "2027-07-04" } ; null si non paramétrée. */
export const getSchoolYear = async (structureId: string): Promise<{ start: string; end: string } | null> => {
  const res = await fetch(`/viescolaire/settings/periode/schoolyear?structureId=${structureId}`, base);
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { id?: number; start_date?: string; end_date?: string } | null;
  return body?.id !== undefined && body.start_date && body.end_date ? { start: body.start_date.slice(0, 10), end: body.end_date.slice(0, 10) } : null;
};

// ── Médiacentre (documents attachés au cours) ──────────────────────────────────
/** Sources interrogées, comme l'IHM AngularJS : GAR, Signet, Moodle, PMB. */
const MEDIACENTRE_SOURCES = [
  'fr.openent.mediacentre.source.GAR',
  'fr.openent.mediacentre.source.Signet',
  'fr.openent.mediacentre.source.Moodle',
  'fr.openent.mediacentre.source.PMB',
];

/** Recherche plein texte dans le médiacentre ; une trame par source (cf. parseMediacentreFrames). */
export const searchMediacentre = async (query: string): Promise<unknown[]> => {
  const jsondata = JSON.stringify({ state: 'PLAIN_TEXT', event: 'search', sources: MEDIACENTRE_SOURCES, data: { query } });
  const res = await fetch(`/mediacentre/search?jsondata=${encodeURIComponent(jsondata)}`, base);
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as unknown[] | null;
  return Array.isArray(body) ? body : [];
};

// ── Cours existant : lecture, modification, suppression ─────────────────────────
/** Cours complet (avec ressources, réservations liées…), absent de la grille. */
export const getCourse = async (id: string): Promise<StoredCourse> => json<StoredCourse>(await fetch(`/edt/courses/${id}`, base));

/**
 * Modifie UNE occurrence (« ce cours seulement » de l'AngularJS) ; les autres occurrences de la
 * série ne bougent pas. Passe par PUT /edt/course (tableau) et non PUT /edt/courses/:id : seule
 * cette route déplace aussi les réservations RBS (anciennes supprimées, nouvelles créées) et
 * notifie la modification. Ex. passer le cours du 12/10 de la salle 201 à la salle 105.
 */
export const updateCourse = async (id: string, course: Record<string, unknown>): Promise<{ rbsConflicts?: Array<{ conflictResourceIds?: number[] }> } | null> =>
  json(await fetch('/edt/course', { ...base, method: 'PUT', headers: mutHeaders(), body: JSON.stringify([{ ...course, _id: id }]) }));

/** Bornes d'une série, ex. { startDate: "2026-09-07…", endDate: "2027-07-02…" }. */
export const getRecurrenceDates = async (recurrence: string): Promise<{ startDate: string; endDate: string }> =>
  json(await fetch(`/edt/courses/recurrences/dates/${recurrence}`, base));

/**
 * Modifie toutes les occurrences À VENIR d'une série (PUT /edt/courses/recurrences/:id, comme
 * l'AngularJS) : `startDate`/`endDate` portent la nouvelle période et l'horaire, `dayOfWeek` le jour,
 * `newRecurrence` le nouvel identifiant de la série. Les réservations RBS suivent (rbsConflicts).
 */
export const updateRecurrence = async (recurrence: string, course: Record<string, unknown>): Promise<{ rbsConflicts?: Array<{ conflictResourceIds?: number[] }> } | null> =>
  json(await fetch(`/edt/courses/recurrences/${recurrence}`, { ...base, method: 'PUT', headers: mutHeaders(), body: JSON.stringify(course) }));

/** Pose une étiquette sur plusieurs cours d'un coup (PUT /edt/courses/tag, comme l'AngularJS). */
export const updateCoursesTag = async (courseIds: string[], tagId: number): Promise<void> => {
  const res = await fetch('/edt/courses/tag', { ...base, method: 'PUT', headers: mutHeaders(), body: JSON.stringify({ courseIds, tagId }) });
  if (!res.ok) throw new Error(String(res.status));
};

/** Supprime une occurrence. */
export const deleteCourse = async (id: string): Promise<void> => {
  const res = await fetch(`/edt/courses/${id}`, { ...base, method: 'DELETE', headers: mutHeaders() });
  if (!res.ok) throw new Error(String(res.status));
};

/** Supprime toutes les occurrences À VENIR d'une série (les passées restent). */
export const deleteRecurrence = async (recurrence: string): Promise<void> => {
  const res = await fetch(`/edt/courses/recurrences/${recurrence}`, { ...base, method: 'DELETE', headers: mutHeaders() });
  if (!res.ok) throw new Error(String(res.status));
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
  getChildren,
  searchTeachers,
  searchGroups,
  getSubjects,
  getCourseTags,
  getStsReports,
  importSts,
  createCourseTag,
  updateCourseTag,
  deleteCourseTag,
  setCourseTagHidden,
  createCourses,
  getRbsResourceList,
  getRoomCategory,
  getBusyResourceIds,
  getBusyResourcesForSlots,
  getSchoolYear,
  searchMediacentre,
  getCourse,
  updateCourse,
  deleteCourse,
  deleteRecurrence,
  updateCoursesTag,
  getRecurrenceDates,
  updateRecurrence,
  getStructurePreference,
  saveStructurePreference,
  getMatieres,
  getTimeSlots,
  getUiPreference,
  saveUiPreference,
};
