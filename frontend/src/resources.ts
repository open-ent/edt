// Documents attachés à un cours : documents de l'espace documentaire et ressources du médiacentre,
// au format que stocke le serveur (champ `resources` du cours, cf. AngularJS manageCourse.ts) —
// même logique que la React de l'agenda (calendar/frontend/src/attachments.ts). Fonctions pures,
// testées dans resources.test.ts.

/**
 * Ressource d'un cours. Ex. document : { type: "workspace", id: "a1…", name: "Exercices.pdf",
 * url: "/workspace/document/a1…" } ; médiacentre : { type: "mediacentre", id: "…",
 * name: "Le Robert junior", url: "https://…", image: "https://…" }.
 */
export interface CourseResource {
  type: 'workspace' | 'mediacentre';
  id: string;
  name: string;
  url: string;
  image?: string;
}

/** Élément choisi dans la médiathèque du socle. */
export interface PickedFile {
  _id?: string;
  id?: string;
  name?: string;
  title?: string;
}

/** Ressource renvoyée par la recherche du médiacentre. */
export interface MediacentreItem {
  id?: string | number;
  title?: string;
  link?: string;
  url?: string;
  image?: string;
}

export function workspaceResource(file: PickedFile): CourseResource | null {
  const id = file?._id ?? file?.id;
  if (!id) return null;
  return { type: 'workspace', id, name: file.name || file.title || id, url: `/workspace/document/${id}` };
}

export function mediacentreResource(item: MediacentreItem): CourseResource | null {
  const id = item.id != null ? String(item.id) : item.link || item.title;
  if (!id) return null;
  return { type: 'mediacentre', id, name: item.title || item.link || id, url: item.link || item.url || '', image: item.image || '' };
}

/**
 * Ajoute des ressources sans doublon (même type et même identifiant).
 * Ex. ajouter deux fois « Exercices.pdf » → une seule ligne, duplicates = 1.
 */
export function addResources(current: CourseResource[], incoming: CourseResource[]): { resources: CourseResource[]; duplicates: number } {
  const key = (r: CourseResource) => `${r.type}|${r.id}`;
  const seen = new Set(current.map(key));
  const added: CourseResource[] = [];
  let duplicates = 0;
  for (const r of incoming) {
    if (seen.has(key(r))) {
      duplicates += 1;
      continue;
    }
    seen.add(key(r));
    added.push(r);
  }
  return { resources: [...current, ...added], duplicates };
}

/** Réponse du médiacentre : une trame par source (GAR, Signet, Moodle, PMB), chacune avec ses ressources. */
export function parseMediacentreFrames(frames: unknown): MediacentreItem[] {
  if (!Array.isArray(frames)) return [];
  return frames.flatMap((f) => {
    const list = (f as { data?: { resources?: unknown } })?.data?.resources;
    return Array.isArray(list) ? (list as MediacentreItem[]) : [];
  });
}
