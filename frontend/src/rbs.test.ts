import { describe, expect, it } from 'vitest';

import { categoryLabel, categoryMatches, localRequiredCategory, mismatchedResources, RbsResource, resourceLabel, sortForCategory } from './rbs';

const r = (id: number, name: string, typeCategory: string, typeName = ''): RbsResource => ({ id, name, typeCategory, typeName });

describe('catégorie attendue (repli local)', () => {
  it('reconnaît les matières à salle spécialisée, accents ignorés', () => {
    expect(localRequiredCategory('SCIENCES DE LA VIE ET DE LA TERRE')).toBe('LABO_SVT');
    expect(localRequiredCategory('ÉDUCATION PHYSIQUE ET SPORTIVE')).toBe('GYMNASE');
    expect(localRequiredCategory('EDUCATION MUSICALE')).toBe('MUSIQUE');
    expect(localRequiredCategory('MATHEMATIQUES')).toBeNull();
  });
});

describe('compatibilité de catégorie', () => {
  it('tolère une catégorie générique ou plus fine', () => {
    expect(categoryMatches('LABO', 'LABO_SVT')).toBe(true);
    expect(categoryMatches('LABO_SVT', 'LABO')).toBe(true);
    expect(categoryMatches('GYMNASE', 'LABO_SVT')).toBe(false);
    expect(categoryMatches('', 'LABO_SVT')).toBe(false);
  });
});

describe('ressources proposées et avertissement', () => {
  const resources = [r(1, 'Salle 201', 'SALLE_COURS'), r(2, 'Gymnase', 'GYMNASE'), r(3, 'Vidéoprojecteur', ''), r(4, 'Préau', 'GENERAL')];

  it('met la catégorie attendue en tête sans masquer les autres', () => {
    expect(sortForCategory(resources, 'GYMNASE').map((x) => x.id)).toEqual([2, 1, 3, 4]);
    expect(sortForCategory(resources, null)).toBe(resources);
  });

  it('signale seulement les ressources catégorisées qui ne conviennent pas', () => {
    expect(mismatchedResources(resources, 'GYMNASE').map((x) => x.name)).toEqual(['Salle 201']);
    expect(mismatchedResources(resources, null)).toEqual([]);
  });

  it('libellé avec le type', () => {
    expect(resourceLabel(r(1, 'Salle 201', 'X', 'Salles du collège'))).toBe('Salle 201 (Salles du collège)');
    expect(resourceLabel(r(1, 'Salle 201', 'X'))).toBe('Salle 201');
  });
});

describe('libellé de catégorie', () => {
  it('jamais le code technique', () => {
    expect(categoryLabel('LABO_SVT')).toBe('laboratoire de sciences de la vie et de la Terre');
    expect(categoryLabel('SALLE_POLYVALENTE')).toBe('salle polyvalente');
  });
});
