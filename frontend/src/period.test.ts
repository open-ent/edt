import { describe, expect, it } from 'vitest';

import { initialAnchor, periodOf, step } from './period';
import { ymd } from './utils';

const d = (iso: string) => new Date(`${iso}T12:00:00`);
const range = (p: { first: Date; last: Date; days: Date[] }) => [ymd(p.first), ymd(p.last), p.days.length];

describe('période affichée', () => {
  it('jour, semaine et quinzaine partent du lundi', () => {
    expect(range(periodOf('day', d('2026-10-14')))).toEqual(['2026-10-14', '2026-10-14', 1]);
    expect(range(periodOf('week', d('2026-10-14')))).toEqual(['2026-10-12', '2026-10-18', 7]);
    expect(range(periodOf('fortnight', d('2026-10-14')))).toEqual(['2026-10-12', '2026-10-25', 14]);
  });

  it('le mois est complété aux semaines entières', () => {
    expect(range(periodOf('month', d('2026-10-14')))).toEqual(['2026-09-28', '2026-11-01', 35]);
    // Février 2027 commence un lundi et finit un dimanche : exactement 4 semaines.
    expect(range(periodOf('month', d('2027-02-10')))).toEqual(['2027-02-01', '2027-02-28', 28]);
  });
});

describe('navigation', () => {
  it('avance d’un jour, d’une semaine, de deux semaines ou d’un mois', () => {
    expect(ymd(step('day', d('2026-10-14'), 1))).toBe('2026-10-15');
    expect(ymd(step('week', d('2026-10-14'), -1))).toBe('2026-10-07');
    expect(ymd(step('fortnight', d('2026-10-14'), 1))).toBe('2026-10-28');
    expect(ymd(step('month', d('2026-10-31'), 1))).toBe('2026-11-01');
    expect(ymd(step('month', d('2026-01-15'), -1))).toBe('2025-12-01');
  });

  it('un aller-retour en quinzaine revient exactement à la même période', () => {
    const start = d('2026-10-14');
    expect(range(periodOf('fortnight', step('fortnight', step('fortnight', start, 1), -1)))).toEqual(range(periodOf('fortnight', start)));
  });

  it('le dimanche, ouverture sur la semaine suivante', () => {
    expect(ymd(initialAnchor(d('2026-10-18')))).toBe('2026-10-19');
    expect(ymd(initialAnchor(d('2026-10-14')))).toBe('2026-10-14');
  });
});
