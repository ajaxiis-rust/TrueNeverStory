import { describe, test, expect } from 'bun:test';
import { vectorToBlob, blobToVector, cosineSimilarity, reciprocalRankFusion } from './vector-ops';

describe('vector-ops', () => {
  test('vectorToBlob and blobToVector roundtrip', () => {
    const original = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    const blob = vectorToBlob(original);
    const restored = blobToVector(blob);

    expect(restored.length).toBe(4);
    expect(restored[0]).toBeCloseTo(1.0);
    expect(restored[3]).toBeCloseTo(4.0);
  });

  test('vectorToBlob handles empty vector', () => {
    const original = new Float32Array([]);
    const blob = vectorToBlob(original);
    const restored = blobToVector(blob);
    expect(restored.length).toBe(0);
  });

  test('cosineSimilarity of identical vectors is 1.0', () => {
    const v = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  test('cosineSimilarity of orthogonal vectors is 0.0', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  test('cosineSimilarity of opposite vectors is -1.0', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  test('cosineSimilarity throws on dimension mismatch', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(() => cosineSimilarity(a, b)).toThrow('Vector dimension mismatch');
  });

  test('cosineSimilarity of zero vector returns 0', () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([1, 1]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  test('reciprocalRankFusion merges results correctly', () => {
    const fts = [
      { id: 'a', score: 0.9 },
      { id: 'b', score: 0.7 },
    ];
    const vec = [
      { id: 'b', score: 0.95 },
      { id: 'c', score: 0.8 },
    ];

    const fused = reciprocalRankFusion([fts, vec]);
    expect(fused.length).toBe(3);
    expect(fused[0]!.id).toBe('b');
  });

  test('reciprocalRankFusion with single list', () => {
    const list = [
      { id: 'x', score: 1.0 },
      { id: 'y', score: 0.5 },
    ];

    const fused = reciprocalRankFusion([list]);
    expect(fused.length).toBe(2);
    expect(fused[0]!.id).toBe('x');
  });

  test('reciprocalRankFusion with empty lists', () => {
    const fused = reciprocalRankFusion([[], []]);
    expect(fused.length).toBe(0);
  });

  test('reciprocalRankFusion respects k parameter', () => {
    const list1 = [{ id: 'a', score: 1.0 }];
    const list2 = [{ id: 'b', score: 1.0 }];

    const fusedLowK = reciprocalRankFusion([list1, list2], 1);
    const fusedHighK = reciprocalRankFusion([list1, list2], 100);

    expect(fusedLowK.length).toBe(2);
    expect(fusedHighK.length).toBe(2);
  });
});
