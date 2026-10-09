import { describe, expect, it } from 'vitest';

import type { Course, TimeSlot } from './api';
import { axisBounds, courseSubject, dayOf, isPast, minutesOf, minutesOfHour, placeDay } from './grid';

const course = (id: string, start: string, end: string, extra: Partial<Course> = {}): Course => ({
  _id: id,
  startDate: `2026-10-12 ${start}:00`,
  endDate: `2026-10-12 ${end}:00`,
  ...extra,
});

describe('lecture des dates serveur', () => {
  it('accepte l’espace et le T comme séparateur', () => {
    expect(minutesOf('2026-10-12 08:30:00')).toBe(510);
    expect(minutesOf('2026-10-12T08:30:00')).toBe(510);
    expect(minutesOf(undefined)).toBe(-1);
    expect(dayOf('2026-10-12 08:30:00')).toBe('2026-10-12');
    expect(minutesOfHour('13:45')).toBe(825);
  });
});

describe('axe horaire', () => {
  const slots: TimeSlot[] = [
    { id: 'M1', name: 'M1', startHour: '08:00', endHour: '09:00' },
    { id: 'AM5', name: 'AM5', startHour: '16:00', endHour: '17:00' },
  ];

  it('couvre les créneaux et les cours qui en débordent', () => {
    expect(axisBounds(slots, [course('a', '17:00', '18:30')])).toEqual({ start: 480, end: 1110 });
  });

  it('se replie sur 8 h-18 h sans créneau ni cours', () => {
    expect(axisBounds([], [])).toEqual({ start: 480, end: 1080 });
  });
});

describe('placement d’une journée', () => {
  it('met côte à côte les cours qui se chevauchent, puis libère la largeur', () => {
    const placed = placeDay([
      course('a', '08:00', '10:00'),
      course('b', '09:00', '10:00'),
      course('c', '10:00', '11:00'),
    ]);
    const byId = Object.fromEntries(placed.map((p) => [p.course._id, p]));
    expect([byId.a.lane, byId.a.lanes]).toEqual([0, 2]);
    expect([byId.b.lane, byId.b.lanes]).toEqual([1, 2]);
    expect([byId.c.lane, byId.c.lanes]).toEqual([0, 1]);
  });

  it('garde tous les cours simultanés (aucun n’est écrasé)', () => {
    const placed = placeDay([course('a', '08:00', '09:00'), course('b', '08:00', '09:00'), course('c', '08:00', '09:00')]);
    expect(placed).toHaveLength(3);
    expect(new Set(placed.map((p) => p.lane))).toEqual(new Set([0, 1, 2]));
    expect(placed.every((p) => p.lanes === 3)).toBe(true);
  });

  it('ignore un cours aux horaires illisibles', () => {
    expect(placeDay([{ _id: 'x', startDate: '', endDate: '' }])).toEqual([]);
  });
});

describe('libellés et état', () => {
  it('privilégie la matière personnalisée', () => {
    expect(courseSubject(course('a', '08:00', '09:00', { exceptionnal: 'Sortie théâtre', subject: { name: 'FRANCAIS' } }))).toBe('Sortie théâtre');
    expect(courseSubject(course('a', '08:00', '09:00', { subject: { name: 'FRANCAIS' } }))).toBe('FRANCAIS');
    expect(courseSubject(course('a', '08:00', '09:00', { subjectId: 'm1' }), () => 'MATHS')).toBe('MATHS');
  });

  it('un cours est passé une fois terminé', () => {
    const c = course('a', '08:00', '09:00');
    expect(isPast(c, new Date('2026-10-12T09:30:00'))).toBe(true);
    expect(isPast(c, new Date('2026-10-12T08:30:00'))).toBe(false);
  });
});
