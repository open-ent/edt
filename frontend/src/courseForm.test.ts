import { describe, expect, it } from 'vitest';

import type { Group, TimeSlot } from './api';
import { CourseDraft, effectiveTimes, emptyDraft, prefillTimes, toCoursePayload, validateDraft } from './courseForm';

const slots: TimeSlot[] = [
  { id: 'M1', name: 'M1', startHour: '08:00', endHour: '09:00' },
  { id: 'M2', name: 'M2', startHour: '09:00', endHour: '10:00' },
  { id: 'M3', name: 'M3', startHour: '10:00', endHour: '11:00' },
];
const g = (id: string, name: string, type_groupe: number, externalId?: string): Group => ({ id, name, type_groupe, externalId, isInCurrentTeacher: false });
const NOW = new Date('2026-10-09T12:00:00');

const valid: CourseDraft = {
  ...emptyDraft('S1'),
  teacherIds: ['t1'],
  groups: [g('c4a', '4A', 0, 'EXT4A'), g('g1', '4A grp1', 1, 'EXTG1'), g('m1', 'Latin', 2)],
  subjectId: 'maths',
  date: '2026-10-12',
  startSlotId: 'M1',
  endSlotId: 'M2',
};

describe('horaires', () => {
  it('plages nommées : début de la première, fin de la dernière', () => {
    expect(effectiveTimes(valid, slots)).toEqual({ start: '08:00', end: '10:00' });
  });

  it('horaire libre', () => {
    expect(effectiveTimes({ ...valid, freeSchedule: true, startTime: '13:15', endTime: '14:00' }, slots)).toEqual({ start: '13:15', end: '14:00' });
    expect(effectiveTimes({ ...valid, freeSchedule: true }, slots)).toBeNull();
  });
});

describe('validations', () => {
  it('un formulaire complet ne bloque pas', () => {
    expect(validateDraft(valid, slots, NOW)).toEqual([]);
  });

  it('exige enseignant, classe, matière, date et horaire', () => {
    expect(validateDraft(emptyDraft('S1'), slots, NOW)).toEqual(['teachers', 'groups', 'subject', 'date', 'time']);
  });

  it('matière personnalisée non vide à la place de la matière', () => {
    expect(validateDraft({ ...valid, subjectId: '', isExceptional: true, exceptional: '  ' }, slots, NOW)).toEqual(['subject']);
    expect(validateDraft({ ...valid, subjectId: '', isExceptional: true, exceptional: 'Sortie' }, slots, NOW)).toEqual([]);
  });

  it('au moins 15 minutes en horaire libre, fin après début en plages', () => {
    expect(validateDraft({ ...valid, freeSchedule: true, startTime: '10:00', endTime: '10:10' }, slots, NOW)).toEqual(['order']);
    expect(validateDraft({ ...valid, freeSchedule: true, startTime: '10:00', endTime: '10:15' }, slots, NOW)).toEqual([]);
    expect(validateDraft({ ...valid, startSlotId: 'M3', endSlotId: 'M1' }, slots, NOW)).toEqual(['order']);
  });

  it('refuse un cours déjà commencé', () => {
    expect(validateDraft({ ...valid, date: '2026-10-09', startSlotId: 'M3', endSlotId: 'M3' }, slots, NOW)).toEqual(['past']);
  });
});

describe('cours envoyé au serveur', () => {
  it('sépare classes et groupes, plage nommée, jour de la semaine (0 = dimanche)', () => {
    const p = toCoursePayload({ ...valid, tagId: 4 }, slots, 'emael.shafy001', NOW);
    expect(p).toMatchObject({
      structureId: 'S1',
      subjectId: 'maths',
      teacherIds: ['t1'],
      tagIds: [4],
      classes: ['4A'],
      classesExternalIds: ['EXT4A'],
      classesIds: ['c4a'],
      groups: ['4A grp1', 'Latin'],
      groupsIds: ['g1', 'm1'],
      dayOfWeek: 1,
      manual: true,
      theoretical: false,
      everyTwoWeek: false,
      lastUser: 'emael.shafy001',
      startDate: '2026-10-12T08:00:00',
      endDate: '2026-10-12T10:00:00',
      idStartSlot: 'M1',
      idEndSlot: 'M2',
    });
    expect(p.exceptionnal).toBeUndefined();
  });

  it('envoie les documents attachés', () => {
    const doc = { type: 'workspace' as const, id: 'a1', name: 'Exercices.pdf', url: '/workspace/document/a1' };
    expect(toCoursePayload({ ...valid, resources: [doc] }, slots, 'x', NOW).resources).toEqual([doc]);
  });

  it('matière personnalisée : subjectId nul, texte envoyé ; horaire libre sans plage', () => {
    const p = toCoursePayload({ ...valid, isExceptional: true, exceptional: ' Sortie théâtre ', freeSchedule: true, startTime: '13:30', endTime: '15:00' }, slots, 'x', NOW);
    expect(p).toMatchObject({ subjectId: null, exceptionnal: 'Sortie théâtre', startDate: '2026-10-12T13:30:00', endDate: '2026-10-12T15:00:00' });
    expect(p.idStartSlot).toBeUndefined();
  });
});

describe('pré-remplissage au clic sur un créneau vide', () => {
  it('prend la plage nommée qui contient l’heure', () => {
    expect(prefillTimes(valid, slots, '2026-10-13', 10 * 60 + 7)).toMatchObject({ date: '2026-10-13', freeSchedule: false, startSlotId: 'M3', endSlotId: 'M3' });
  });

  it('hors plage : horaire libre arrondi au quart d’heure, une heure', () => {
    expect(prefillTimes(valid, slots, '2026-10-13', 14 * 60 + 20)).toMatchObject({ freeSchedule: true, startTime: '14:15', endTime: '15:15' });
  });
});
