// Ressources RBS (salles, matériel) dans le formulaire de cours — mêmes règles que l'IHM AngularJS
// (controllers/manageCourse.ts) : catégorie de salle attendue pour la matière, ressources de cette
// catégorie proposées en tête, avertissement NON bloquant si la salle choisie ne convient pas.
// Fonctions pures, testées dans rbs.test.ts.

/** Ressource RBS telle que proposée dans le formulaire, ex. { name: "Labo 1", typeCategory: "LABO_SVT" }. */
export interface RbsResource {
  id: number;
  name: string;
  typeName: string;
  /** Catégorie du type de ressource (texte libre côté RBS, normalisé en majuscules). */
  typeCategory: string;
}

/**
 * Repli local quand le relais serveur (school-planner) ne répond pas : même heuristique minimale que
 * l'AngularJS (et que school-planner/CurriculumService.ALIASES). Ex. « SCIENCES DE LA VIE ET DE LA
 * TERRE » → LABO_SVT ; « EDUCATION PHYSIQUE ET SPORTIVE » → GYMNASE.
 */
const SUBJECT_ROOM_CATEGORY_ALIASES: Array<{ category: string; aliases: string[] }> = [
  { category: 'GYMNASE', aliases: ['sportive', 'e.p.s', 'eps', 'education physique'] },
  { category: 'LABO_PHYSIQUE_CHIMIE', aliases: ['physique', 'chimie'] },
  { category: 'LABO_SVT', aliases: ['vie de la terre', 'svt', 's.v.t', 'sciences de la vie'] },
  { category: 'TECHNO', aliases: ['techno'] },
  { category: 'MUSIQUE', aliases: ['musi'] },
  { category: 'ARTS', aliases: ['arts plas', 'plastique'] },
];

const fold = (s: string): string =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function localRequiredCategory(subjectLabel: string): string | null {
  const folded = fold(subjectLabel);
  return SUBJECT_ROOM_CATEGORY_ALIASES.find((e) => e.aliases.some((a) => folded.includes(a)))?.category ?? null;
}

/**
 * Compatibilité tolérante au préfixe : une catégorie générique convient à une catégorie plus fine
 * (l'établissement n'a pas forcément ce niveau de détail). Ex. « LABO » convient à « LABO_SVT ».
 */
export function categoryMatches(typeCategory: string, required: string): boolean {
  if (!typeCategory) return false;
  return typeCategory === required || required.startsWith(`${typeCategory}_`) || typeCategory.startsWith(`${required}_`);
}

/** Ressources de la catégorie attendue d'abord, sans jamais masquer les autres (ordre stable). */
export function sortForCategory(resources: RbsResource[], required: string | null): RbsResource[] {
  if (!required) return resources;
  return [...resources].sort(
    (a, b) => Number(!categoryMatches(a.typeCategory, required)) - Number(!categoryMatches(b.typeCategory, required)),
  );
}

/**
 * Ressources choisies qui ne conviennent pas à la matière (avertissement non bloquant). Une
 * ressource sans catégorie ou de catégorie GENERAL n'est jamais signalée.
 * Ex. EPS (GYMNASE) + « Salle 201 » (SALLE_COURS) → [Salle 201].
 */
export function mismatchedResources(selected: RbsResource[], required: string | null): RbsResource[] {
  if (!required) return [];
  return selected.filter((r) => r.typeCategory && r.typeCategory !== 'GENERAL' && !categoryMatches(r.typeCategory, required));
}

/** Libellé d'une ressource avec son type, ex. « Salle 201 (Salles du collège) ». */
export const resourceLabel = (r: RbsResource): string => (r.typeName ? `${r.name} (${r.typeName})` : r.name);

/** Libellés en clair des catégories de salle (jamais le code technique devant un usager). */
const CATEGORY_LABELS: Record<string, string> = {
  GYMNASE: 'gymnase',
  LABO: 'laboratoire',
  LABO_PHYSIQUE_CHIMIE: 'laboratoire de physique-chimie',
  LABO_SVT: 'laboratoire de sciences de la vie et de la Terre',
  TECHNO: 'salle de technologie',
  MUSIQUE: 'salle de musique',
  ARTS: "salle d'arts plastiques",
  INFORMATIQUE: "salle d'informatique",
  AMPHITHEATRE: 'amphithéâtre',
  SALLE_COURS: 'salle de cours',
};

/** Ex. « LABO_SVT » → « laboratoire de sciences de la vie et de la Terre » ; code inconnu « SALLE_POLYVALENTE » → « salle polyvalente ». */
export const categoryLabel = (code: string): string => CATEGORY_LABELS[code] ?? code.toLowerCase().replace(/_/g, ' ');

/**
 * Remplaçants proposés pour une ressource déjà prise : ressources libres sur le créneau et pas
 * encore choisies, du même type d'abord, puis de la même catégorie, puis les autres (au plus
 * `limit`). Ex. « Gymnase A » pris → « Gymnase B » avant « Salle 201 ».
 */
export function freeAlternatives(taken: RbsResource, all: RbsResource[], busyIds: number[], selectedIds: number[], limit = 5): RbsResource[] {
  const rank = (r: RbsResource) =>
    r.typeName && r.typeName === taken.typeName ? 0 : r.typeCategory && r.typeCategory === taken.typeCategory ? 1 : 2;
  return all
    .filter((r) => !busyIds.includes(r.id) && !selectedIds.includes(r.id))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .slice(0, limit)
    .map(({ r }) => r);
}

/**
 * Ressources correspondant aux salles « texte » d'un cours qui n'a jamais été lié à une
 * ressource (ex. cours importé ou généré par school-planner) : même corrélation par nom exact,
 * sans tenir compte de la casse ni des espaces, que l'AngularJS (loadRbsResources) et que la
 * détection de conflit serveur. Ex. roomLabels ["Amphithéâtre4"] → [ressource « Amphithéâtre4 »].
 */
export function resourcesFromRoomLabels(roomLabels: string[], resources: RbsResource[]): number[] {
  const wanted = roomLabels.map((l) => (l || '').trim().toLowerCase()).filter(Boolean);
  return resources.filter((r) => wanted.includes(r.name.trim().toLowerCase())).map((r) => r.id);
}
