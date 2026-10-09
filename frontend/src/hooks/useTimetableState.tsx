import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

import { EMPTY_SELECTION, Selection } from '../filter';
import { initialAnchor, ViewMode } from '../period';

/**
 * État de l'emploi du temps partagé entre les écrans (consultation, formulaire de cours) : la
 * sélection affichée et la période consultée survivent à un aller-retour dans le formulaire, comme
 * l'IHM AngularJS (`returnDate`). Ex. semaine du 12/10, classe 401 → « Créer un cours » →
 * « Annuler » : retour sur la semaine du 12/10, 401 toujours affichée, et le nouveau cours part
 * avec 401 présélectionnée.
 */
interface TimetableState {
  selection: Selection;
  setSelection: (next: Selection | ((previous: Selection) => Selection)) => void;
  /** Contexte de la sélection (établissement, profil) : une sélection d'un autre contexte est périmée. */
  selectionKey: string;
  setSelectionKey: (key: string) => void;
  anchor: Date;
  setAnchor: (next: Date | ((previous: Date) => Date)) => void;
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  view: 'grid' | 'list';
  setView: (view: 'grid' | 'list') => void;
  showQuarterHours: boolean;
  setShowQuarterHours: (show: boolean) => void;
}

const Context = createContext<TimetableState | null>(null);

export function TimetableStateProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [selectionKey, setSelectionKey] = useState('');
  const [anchor, setAnchor] = useState(() => initialAnchor(new Date()));
  const [mode, setMode] = useState<ViewMode>('week');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showQuarterHours, setShowQuarterHours] = useState(true);
  const value = useMemo(
    () => ({ selection, setSelection, selectionKey, setSelectionKey, anchor, setAnchor, mode, setMode, view, setView, showQuarterHours, setShowQuarterHours }),
    [selection, selectionKey, anchor, mode, view, showQuarterHours],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTimetableState(): TimetableState {
  const state = useContext(Context);
  if (!state) throw new Error('useTimetableState hors de TimetableStateProvider');
  return state;
}
