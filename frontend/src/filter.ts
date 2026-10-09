// Sélection des classes, groupes et enseignants dont on affiche l'emploi du temps — mêmes règles
// que l'IHM AngularJS (public/ts/controllers/main.ts, syncCourses / dropGroup) :
//  1. sélectionner une classe y ajoute ses groupes (demi-groupes, options), pour voir AUSSI les
//     cours de ces groupes ;
//  2. un groupe ainsi ajouté peut être retiré à la main ; ce retrait tient tant que la classe reste
//     sélectionnée ;
//  3. le filtre envoyé est l'UNION des classes, groupes et enseignants retenus.

import type { CoursesFilter, Group } from './api';

/** Groupes rattachés à chaque classe, ex. 401 → [401 grp A, 401 grp B, Latin]. */
export type SubGroups = Map<string, Array<{ id: string; name: string }>>;

export interface Selection {
  /** Classes ou groupes choisis explicitement. */
  chosen: string[];
  /** Groupes retirés à la main alors que leur classe est choisie. */
  removed: string[];
  /** Enseignants dont on affiche aussi les cours. */
  teacherIds: string[];
}

export const EMPTY_SELECTION: Selection = { chosen: [], removed: [], teacherIds: [] };

/**
 * Classes et groupes effectivement affichés : les choix explicites, plus les groupes des classes
 * choisies, moins ceux retirés à la main. Ex. choix [401], groupes de 401 = [A, B], retiré [B]
 * → [401, A].
 */
export function effectiveGroupIds(selection: Selection, subGroups: SubGroups): string[] {
  const ids = new Set(selection.chosen);
  for (const classId of selection.chosen) {
    for (const g of subGroups.get(classId) ?? []) {
      if (!selection.removed.includes(g.id)) ids.add(g.id);
    }
  }
  return [...ids];
}

/** Bascule une classe ou un groupe dans la sélection. */
export function toggleGroup(selection: Selection, groupId: string, subGroups: SubGroups): Selection {
  const shown = effectiveGroupIds(selection, subGroups).includes(groupId);
  if (!shown) {
    // (Ré)ajout : choix explicite, et les groupes d'une classe rajoutée repartent tous affichés.
    const ofClass = (subGroups.get(groupId) ?? []).map((g) => g.id);
    return {
      ...selection,
      chosen: [...selection.chosen, groupId],
      removed: selection.removed.filter((id) => id !== groupId && !ofClass.includes(id)),
    };
  }
  if (selection.chosen.includes(groupId)) {
    return { ...selection, chosen: selection.chosen.filter((id) => id !== groupId) };
  }
  // Affiché seulement parce que sa classe est choisie : on le retire à la main.
  return { ...selection, removed: [...selection.removed, groupId] };
}

/** Toutes les classes et tous les groupes de l'établissement (« Tout sélectionner »). */
export const selectAll = (selection: Selection, groups: Group[]): Selection => ({
  ...selection,
  chosen: groups.map((g) => g.id),
  removed: [],
});

/** Aucune classe ni aucun groupe (« Tout désélectionner ») ; les enseignants restent. */
export const deselectAll = (selection: Selection): Selection => ({ ...selection, chosen: [], removed: [] });

export function toggleTeacher(selection: Selection, teacherId: string): Selection {
  const teacherIds = selection.teacherIds.includes(teacherId)
    ? selection.teacherIds.filter((id) => id !== teacherId)
    : [...selection.teacherIds, teacherId];
  return { ...selection, teacherIds };
}

/**
 * Corps du POST de lecture des cours. Un groupe qui n'est pas au référentiel de l'établissement
 * (groupe d'une classe connu par son seul nom) est envoyé par identifiant et par nom.
 */
export function coursesFilter(
  groupIds: string[],
  teacherIds: string[],
  groups: Group[],
  subGroups: SubGroups,
): CoursesFilter {
  const byId = new Map<string, { id: string; name: string; externalId?: string }>(groups.map((g) => [g.id, g]));
  for (const list of subGroups.values()) for (const g of list) if (!byId.has(g.id)) byId.set(g.id, g);
  const selected = groupIds.map((id) => byId.get(id)).filter((g): g is { id: string; name: string; externalId?: string } => !!g);
  return {
    teacherIds,
    groupIds: selected.map((g) => g.id),
    groupExternalIds: selected.map((g) => g.externalId).filter((x): x is string => !!x),
    groupNames: selected.map((g) => g.name),
    union: true,
    crossDateFilter: false,
  };
}
