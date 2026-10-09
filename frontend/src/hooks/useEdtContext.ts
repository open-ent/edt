import { useEdificeClient, useHasWorkflow } from '@open-ent/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { initialStructureId, Profile, profileOf, StructureRef, userStructures, WORKFLOW } from '../context';

export interface EdtContext {
  /** Session chargée et établissement initial résolu. */
  ready: boolean;
  userId: string;
  profile: Profile;
  canManage: boolean;
  canSearch: boolean;
  structures: StructureRef[];
  structure: StructureRef | undefined;
  /** Change d'établissement et le mémorise, ex. passage de « Collège A » à « Lycée B ». */
  selectStructure: (id: string) => void;
}

/** Profil, droits et établissement courant de l'usager connecté. */
export function useEdtContext(): EdtContext {
  const { user, init } = useEdificeClient();
  const canManage = useHasWorkflow(WORKFLOW.manage) === true;
  const canSearch = useHasWorkflow(WORKFLOW.search) === true;

  const structures = useMemo(() => userStructures(user?.structures, user?.structureNames), [user]);
  // `idMainStructure` est fourni par la session sans être typé dans le socle.
  const mainStructureId = (user as { idMainStructure?: string } | undefined)?.idMainStructure;

  const preferenceQuery = useQuery({
    queryKey: ['edt', 'structure-preference'],
    queryFn: api.getStructurePreference,
    staleTime: Infinity,
    enabled: init,
  });
  const savePreference = useMutation({ mutationFn: api.saveStructurePreference });

  const [structureId, setStructureId] = useState('');
  useEffect(() => {
    if (structureId || !init || preferenceQuery.isLoading) return;
    setStructureId(initialStructureId(structures, preferenceQuery.data?.id, mainStructureId));
  }, [structureId, init, preferenceQuery.isLoading, preferenceQuery.data, structures, mainStructureId]);

  const structure = structures.find((s) => s.id === structureId);

  const selectStructure = (id: string) => {
    const next = structures.find((s) => s.id === id);
    if (!next) return;
    setStructureId(id);
    savePreference.mutate(next);
  };

  return {
    ready: init && !preferenceQuery.isLoading,
    userId: user?.userId ?? '',
    profile: profileOf(user?.type),
    canManage,
    canSearch,
    structures,
    structure,
    selectStructure,
  };
}
