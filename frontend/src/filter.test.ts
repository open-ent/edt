import { describe, expect, it } from 'vitest';

import type { Group } from './api';
import {
  coursesFilter,
  deselectAll,
  effectiveGroupIds,
  EMPTY_SELECTION,
  selectAll,
  SubGroups,
  toggleGroup,
  toggleTeacher,
} from './filter';

const subGroups: SubGroups = new Map([
  ['c401', [{ id: 'gA', name: '401 grp A' }, { id: 'gB', name: '401 grp B' }]],
  ['c402', [{ id: 'gB', name: '401 grp B' }]],
]);

const group = (id: string, name: string, type_groupe = 0): Group => ({ id, name, type_groupe, isInCurrentTeacher: false });
const groups: Group[] = [group('c401', '401'), group('c402', '402'), group('gM', 'Latin', 2)];

describe('sélection des classes et groupes', () => {
  it('une classe choisie affiche aussi ses groupes', () => {
    const s = toggleGroup(EMPTY_SELECTION, 'c401', subGroups);
    expect(effectiveGroupIds(s, subGroups).sort()).toEqual(['c401', 'gA', 'gB']);
  });

  it('un groupe ajouté par sa classe peut être retiré à la main', () => {
    let s = toggleGroup(EMPTY_SELECTION, 'c401', subGroups);
    s = toggleGroup(s, 'gB', subGroups);
    expect(effectiveGroupIds(s, subGroups).sort()).toEqual(['c401', 'gA']);
    expect(s.removed).toEqual(['gB']);
  });

  it('retirer la classe retire ses groupes ; la rajouter les réaffiche tous', () => {
    let s = toggleGroup(EMPTY_SELECTION, 'c401', subGroups);
    s = toggleGroup(s, 'gB', subGroups);
    s = toggleGroup(s, 'c401', subGroups);
    expect(effectiveGroupIds(s, subGroups)).toEqual([]);
    s = toggleGroup(s, 'c401', subGroups);
    expect(effectiveGroupIds(s, subGroups).sort()).toEqual(['c401', 'gA', 'gB']);
  });

  it('un groupe choisi explicitement se décoche normalement', () => {
    let s = toggleGroup(EMPTY_SELECTION, 'gM', subGroups);
    expect(effectiveGroupIds(s, subGroups)).toEqual(['gM']);
    s = toggleGroup(s, 'gM', subGroups);
    expect(effectiveGroupIds(s, subGroups)).toEqual([]);
  });

  it('tout sélectionner / tout désélectionner, sans toucher aux enseignants', () => {
    let s = toggleTeacher(EMPTY_SELECTION, 't1');
    s = selectAll(s, groups);
    expect(effectiveGroupIds(s, subGroups).sort()).toEqual(['c401', 'c402', 'gA', 'gB', 'gM']);
    s = deselectAll(s);
    expect(effectiveGroupIds(s, subGroups)).toEqual([]);
    expect(s.teacherIds).toEqual(['t1']);
  });
});

describe('enseignants', () => {
  it('ajoute puis retire un enseignant', () => {
    let s = toggleTeacher(EMPTY_SELECTION, 't1');
    s = toggleTeacher(s, 't2');
    expect(s.teacherIds).toEqual(['t1', 't2']);
    expect(toggleTeacher(s, 't1').teacherIds).toEqual(['t2']);
  });
});

describe('filtre envoyé au serveur', () => {
  it('union des groupes (référentiel et groupes de classe) et des enseignants', () => {
    const f = coursesFilter(['c401', 'gA'], ['t1'], [{ ...group('c401', '401'), externalId: 'EXT401' }], subGroups);
    expect(f).toEqual({
      teacherIds: ['t1'],
      groupIds: ['c401', 'gA'],
      groupExternalIds: ['EXT401'],
      groupNames: ['401', '401 grp A'],
      union: true,
      crossDateFilter: false,
    });
  });
});
