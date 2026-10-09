import { useEdificeClient, useHasWorkflow } from '@open-ent/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { ALL_STRUCTURES, initialStructureId, Profile, profileOf, StructureRef, userStructures, WORKFLOW } from '../context';

export interface EdtContext {
  /** Session chargée et établissement initial résolu. */
  ready: boolean;
  userId: string;
  profile: Profile;
  canManage: boolean;
  canSearch: boolean;
  structures: StructureRef[];
  /** Établissement courant ; absent en mode « Tous mes établissements ». */
  structure: StructureRef | undefined;
  /** Mode « Tous mes établissements » : propres cours de l'usager dans chacun de ses établissements. */
  allStructures: boolean;
  /** Change d'établissement (ou ALL_STRUCTURES) et le mémorise, ex. « Collège A » → « Lycée B ». */
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
    if (id === ALL_STRUCTURES && structures.length > 1) {
      setStructureId(id);
      savePreference.mutate({ id, name: 'Tous mes établissements' });
      return;
    }
    const next = structures.find((s) => s.id === id);
    if (!next) return;
    setStructureId(id);
    savePreference.mutate(next);
  };

  return {
    // Prêt seulement une fois l'établissement résolu : sinon, au remontage d'un écran, un premier
    // rendu « prêt » sans établissement fait croire à un changement de contexte (et efface la
    // sélection de l'emploi du temps au retour du formulaire de cours).
    ready: init && !preferenceQuery.isLoading && (structureId !== '' || structures.length === 0),
    userId: user?.userId ?? '',
    profile: profileOf(user?.type),
    canManage,
    canSearch,
    structures,
    structure,
    allStructures: structureId === ALL_STRUCTURES,
    selectStructure,
  };
}
