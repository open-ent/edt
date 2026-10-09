import { describe, expect, it } from 'vitest';

import { addDays, courseSortKey, dayLabel, hhmm, mondayOf, weekLabel, ymd } from './utils';

describe('ymd', () => {
  it('formate en YYYY-MM-DD', () => {
    expect(ymd(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
});

describe('addDays', () => {
  it('ajoute des jours (passage de mois)', () => {
    expect(ymd(addDays(new Date(2026, 8, 30), 2))).toBe('2026-10-02');
  });
});

describe('mondayOf', () => {
  it('renvoie le lundi de la semaine (depuis un mercredi)', () => {
    // 2026-09-16 est un mercredi -> lundi 2026-09-14
    expect(ymd(mondayOf(new Date(2026, 8, 16)))).toBe('2026-09-14');
  });
  it('renvoie le même jour si déjà lundi', () => {
    expect(ymd(mondayOf(new Date(2026, 8, 14)))).toBe('2026-09-14');
  });
  it('gère le dimanche (rattaché à la semaine précédente)', () => {
    // 2026-09-20 dimanche -> lundi 2026-09-14
    expect(ymd(mondayOf(new Date(2026, 8, 20)))).toBe('2026-09-14');
  });
});

describe('dayLabel', () => {
  it('donne le jour FR', () => {
    expect(dayLabel('2026-09-14T08:00:00')).toBe('Lundi');
    expect(dayLabel('2026-09-20T10:00:00')).toBe('Dimanche');
    expect(dayLabel('')).toBe('');
  });
});

describe('hhmm', () => {
  it('extrait HH:MM', () => {
    expect(hhmm('2026-09-14T08:05:00')).toBe('08:05');
    expect(hhmm('bogus')).toBe('');
  });
});

describe('courseSortKey', () => {
  it('ordonne chronologiquement, illisible en dernier', () => {
    expect(courseSortKey('2026-09-14T08:00:00') < courseSortKey('2026-09-14T10:00:00')).toBe(true);
    expect(courseSortKey(undefined)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('weekLabel', () => {
  it('formate la plage de la semaine', () => {
    expect(weekLabel(new Date(2026, 8, 14))).toBe('du 14/09 au 20/09');
  });
});
