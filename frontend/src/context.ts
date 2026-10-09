// Contexte de l'usager pour l'emploi du temps : profil, droits, établissement, référentiel de groupes.
// Fonctions pures, testées dans context.test.ts ; les hooks React qui s'en servent sont dans
// hooks/useEdtContext.ts. Même logique que l'IHM AngularJS, pour que les deux accordent
// exactement les mêmes affichages et les mêmes actions.

import type { Group } from './api';

/** Droits de workflow du module (clés de la session, cf. public/ts/edtBehaviours.ts). */
export const WORKFLOW = {
  /** Consulter l'emploi du temps. */
  view: 'fr.cgi.edt.controllers.EdtController|view',
  /** Créer, modifier, déplacer, supprimer des cours. */
  manage: 'fr.cgi.edt.controllers.EdtController|create',
  /** Rechercher un enseignant ou une classe. */
  search: 'fr.cgi.edt.controllers.SearchController|searchUsers',
} as const;

/** Profils, d'après `user.type` de la session (cf. public/ts/model/user-types.ts). */
export type Profile = 'teacher' | 'personnel' | 'student' | 'relative' | 'other';

export function profileOf(type: string | undefined): Profile {
  switch (type) {
    case 'ENSEIGNANT':
      return 'teacher';
    case 'PERSEDUCNAT':
      return 'personnel';
    case 'ELEVE':
      return 'student';
    case 'PERSRELELEVE':
      return 'relative';
    default:
      return 'other';
  }
}

/**
 * Le profil compose-t-il lui-même son emploi du temps (classes, groupes, enseignants) ?
 * Vrai pour le personnel et les enseignants (Angular `checkAccess`) ; un élève ou un parent
 * voit directement l'emploi du temps de l'élève concerné.
 */
export const composesOwnFilter = (profile: Profile): boolean =>
  profile === 'personnel' || profile === 'teacher';

export interface StructureRef {
  id: string;
  name: string;
}

/** Établissements de l'usager, dans l'ordre de la session (`structures` / `structureNames`). */
export function userStructures(ids: string[] | undefined, names: string[] | undefined): StructureRef[] {
  return (ids ?? []).map((id, i) => ({ id, name: names?.[i] ?? id }));
}

/**
 * Choix « Tous mes établissements » (identifiant mémorisé par l'IHM AngularJS, clé i18n
 * all.structures.id) : les propres cours de l'usager dans chacun de ses établissements.
 */
export const ALL_STRUCTURES = 'all_Structures';

/**
 * Établissement affiché à l'ouverture, comme l'Angular (`getStructure` + `Structures.first`) :
 * le dernier choisi (préférence `edt.structure`) s'il fait toujours partie des établissements de
 * l'usager (ou « Tous mes établissements » s'il en a plusieurs), sinon l'établissement principal,
 * sinon le premier.
 * Ex. préférence « Lycée B » retirée du compte → établissement principal « Collège A ».
 */
export function initialStructureId(
  structures: StructureRef[],
  preferredId: string | undefined,
  mainStructureId: string | undefined,
): string {
  const ids = structures.map((s) => s.id);
  if (preferredId === ALL_STRUCTURES && ids.length > 1) return ALL_STRUCTURES;
  if (preferredId && ids.includes(preferredId)) return preferredId;
  if (mainStructureId && ids.includes(mainStructureId)) return mainStructureId;
  return ids[0] ?? '';
}

/**
 * Ordre d'affichage des classes et groupes : ceux de l'enseignant d'abord (« ma classe »), puis
 * par nature (0 classe, 1 groupe d'enseignement, 2 groupe manuel), puis par nom.
 * Ex. [« 4B » grp manuel, « 4A » classe, « 3C » classe de l'enseignant] → 3C, 4A, 4B.
 */
export function sortGroups(groups: Group[]): Group[] {
  return [...groups].sort(
    (a, b) =>
      Number(b.isInCurrentTeacher) - Number(a.isInCurrentTeacher) ||
      a.type_groupe - b.type_groupe ||
      a.name.localeCompare(b.name, 'fr', { numeric: true }),
  );
}
