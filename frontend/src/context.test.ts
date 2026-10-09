import { describe, expect, it } from 'vitest';

import type { Group } from './api';
import { composesOwnFilter, initialStructureId, profileOf, sortGroups, userStructures } from './context';

const structures = userStructures(['A', 'B', 'C'], ['Collège A', 'Lycée B', 'École C']);

const group = (name: string, type_groupe: number, isInCurrentTeacher = false): Group => ({
  id: name,
  name,
  type_groupe,
  isInCurrentTeacher,
});

describe('profileOf', () => {
  it('traduit les types de session', () => {
    expect(profileOf('ENSEIGNANT')).toBe('teacher');
    expect(profileOf('PERSEDUCNAT')).toBe('personnel');
    expect(profileOf('ELEVE')).toBe('student');
    expect(profileOf('PERSRELELEVE')).toBe('relative');
    expect(profileOf('SUPERADMIN')).toBe('other');
    expect(profileOf(undefined)).toBe('other');
  });

  it('réserve la composition du filtre au personnel et aux enseignants', () => {
    expect(composesOwnFilter('personnel')).toBe(true);
    expect(composesOwnFilter('teacher')).toBe(true);
    expect(composesOwnFilter('student')).toBe(false);
    expect(composesOwnFilter('relative')).toBe(false);
  });
});

describe('userStructures', () => {
  it('associe identifiants et noms dans l’ordre de la session', () => {
    expect(structures[1]).toEqual({ id: 'B', name: 'Lycée B' });
  });

  it('retombe sur l’identifiant si le nom manque', () => {
    expect(userStructures(['X'], [])).toEqual([{ id: 'X', name: 'X' }]);
  });
});

describe('initialStructureId', () => {
  it('reprend l’établissement mémorisé s’il est toujours rattaché', () => {
    expect(initialStructureId(structures, 'B', 'A')).toBe('B');
  });

  it('ignore une préférence obsolète au profit de l’établissement principal', () => {
    expect(initialStructureId(structures, 'Z', 'C')).toBe('C');
  });

  it('reprend « tous les établissements » quand l’usager en a plusieurs, sinon le seul', () => {
    expect(initialStructureId(structures, 'all_Structures', undefined)).toBe('all_Structures');
    expect(initialStructureId(userStructures(['A'], ['Collège A']), 'all_Structures', undefined)).toBe('A');
  });

  it('prend le premier établissement à défaut', () => {
    expect(initialStructureId(structures, undefined, undefined)).toBe('A');
    expect(initialStructureId([], undefined, undefined)).toBe('');
  });
});

describe('sortGroups', () => {
  it('met les classes de l’enseignant en tête, puis classes, groupes, groupes manuels, par nom', () => {
    const sorted = sortGroups([
      group('4B manuel', 2),
      group('4A', 0),
      group('4A grp1', 1),
      group('3C', 0, true),
      group('10A', 0),
    ]);
    expect(sorted.map((g) => g.name)).toEqual(['3C', '4A', '10A', '4A grp1', '4B manuel']);
  });
});
