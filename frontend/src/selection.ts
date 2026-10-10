// Sélection de cours pour les actions de masse (supprimer, poser une étiquette), comme la sélection
// au clic droit de l'AngularJS (utils/dragAndDrop.ts) : seuls les cours encore modifiables
// (début dans plus de 15 minutes) sont sélectionnables. Fonctions pures, testées dans selection.test.ts.

import type { Course } from './api';
import { isEditable } from './courseForm';

/** Ajoute ou retire un cours ; un cours passé ou imminent n'est jamais ajouté. Ex. {a} + b → {a, b}. */
export function toggleSelected(selected: ReadonlySet<string>, course: Course, now: Date): Set<string> {
  const next = new Set(selected);
  if (next.has(course._id)) next.delete(course._id);
  else if (isEditable(course.startDate, now)) next.add(course._id);
  return next;
}

/** « Tout sélectionner » : les cours affichés encore modifiables. Ex. 10 cours dont 3 passés → 7. */
export function selectableIds(courses: Course[], now: Date): Set<string> {
  return new Set(courses.filter((c) => isEditable(c.startDate, now)).map((c) => c._id));
}
