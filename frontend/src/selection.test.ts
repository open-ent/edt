import { describe, expect, it } from 'vitest';

import type { Course } from './api';
import { selectableIds, toggleSelected } from './selection';

const NOW = new Date('2026-10-09T12:00:00');
const c = (id: string, startDate: string) => ({ _id: id, startDate, endDate: startDate }) as Course;

describe('sélection de cours', () => {
  it('ajoute puis retire un cours à venir', () => {
    const once = toggleSelected(new Set(), c('a', '2026-10-12T08:00:00'), NOW);
    expect([...once]).toEqual(['a']);
    expect([...toggleSelected(once, c('a', '2026-10-12T08:00:00'), NOW)]).toEqual([]);
  });

  it('jamais un cours passé ou qui commence dans moins de 15 minutes', () => {
    expect([...toggleSelected(new Set(), c('p', '2026-10-09T08:00:00'), NOW)]).toEqual([]);
    expect([...toggleSelected(new Set(), c('i', '2026-10-09T12:10:00'), NOW)]).toEqual([]);
  });

  it('tout sélectionner : seulement les cours modifiables', () => {
    expect([...selectableIds([c('p', '2026-10-08 08:00:00'), c('a', '2026-10-12 08:00:00'), c('b', '2026-10-13T10:00:00')], NOW)]).toEqual(['a', 'b']);
  });
});
