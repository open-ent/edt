import { describe, expect, it } from 'vitest';

import { addResources, mediacentreResource, parseMediacentreFrames, workspaceResource } from './resources';

describe('documents attachés', () => {
  it('document de l’espace documentaire', () => {
    expect(workspaceResource({ _id: 'a1', name: 'Exercices.pdf' })).toEqual({
      type: 'workspace',
      id: 'a1',
      name: 'Exercices.pdf',
      url: '/workspace/document/a1',
    });
    expect(workspaceResource({})).toBeNull();
  });

  it('ressource du médiacentre, identifiant de repli sur le lien', () => {
    expect(mediacentreResource({ id: 42, title: 'Le Robert junior', link: 'https://x', image: 'https://i' })).toEqual({
      type: 'mediacentre',
      id: '42',
      name: 'Le Robert junior',
      url: 'https://x',
      image: 'https://i',
    });
    expect(mediacentreResource({ link: 'https://y' })?.id).toBe('https://y');
    expect(mediacentreResource({})).toBeNull();
  });

  it('pas de doublon (même type et même identifiant)', () => {
    const doc = workspaceResource({ _id: 'a1', name: 'Exercices.pdf' })!;
    const res = mediacentreResource({ id: 'a1', title: 'Homonyme' })!;
    const once = addResources([], [doc]);
    const twice = addResources(once.resources, [doc, res]);
    expect(twice.resources).toHaveLength(2);
    expect(twice.duplicates).toBe(1);
  });

  it('lit les trames du médiacentre, source par source', () => {
    const frames = [{ data: { resources: [{ id: 1 }, { id: 2 }] } }, { data: {} }, null, { data: { resources: [{ id: 3 }] } }];
    expect(parseMediacentreFrames(frames).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(parseMediacentreFrames('x')).toEqual([]);
  });
});
