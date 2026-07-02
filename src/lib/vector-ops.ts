export function vectorToBlob(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer.slice(vec.byteOffset, vec.byteOffset + vec.byteLength));
}

export function blobToVector(blob: Buffer): Float32Array {
  const ab = new ArrayBuffer(blob.length);
  new Uint8Array(ab).set(new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength));
  return new Float32Array(ab);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error('Vector dimension mismatch');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface RankedItem {
  id: string;
  score: number;
  [key: string]: unknown;
}

export function reciprocalRankFusion(
  lists: RankedItem[][],
  k = 60
): RankedItem[] {
  const scores = new Map<string, number>();
  const items = new Map<string, RankedItem>();

  for (const list of lists) {
    list.forEach((item, rank) => {
      const current = scores.get(item.id) ?? 0;
      scores.set(item.id, current + 1 / (k + rank + 1));
      if (!items.has(item.id)) items.set(item.id, item);
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ ...items.get(id)!, score }));
}
