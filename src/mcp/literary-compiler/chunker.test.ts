import { describe, it, expect } from 'bun:test';
import { chunkText, type Chunk, type ChunkOptions } from './chunker';

const defaultOptions: ChunkOptions = {
  maxTokens: 300,
  overlapSentences: 2,
  minTokens: 50,
};

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

describe('chunkText', () => {
  it('splits long text into chunks', () => {
    // ~500 words, should produce 2+ chunks
    const text = Array.from(
      { length: 50 },
      (_, i) => `Sentence ${i} with some words here. Another sentence ${i}. And one more for good measure!`,
    ).join(' ');

    const chunks = chunkText(text, defaultOptions);

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    for (const chunk of chunks) {
      expect(chunk.id).toBeTypeOf('string');
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
    }
  });

  it('each chunk has id, text, startOffset, endOffset', () => {
    const text =
      'First sentence here. Second sentence there. Third sentence is here too. Fourth sentence goes on.';
    const chunks = chunkText(text, defaultOptions);

    for (const chunk of chunks) {
      expect(chunk.id).toBeDefined();
      expect(typeof chunk.id).toBe('string');
      expect(typeof chunk.text).toBe('string');
      expect(typeof chunk.startOffset).toBe('number');
      expect(typeof chunk.endOffset).toBe('number');
      // text content should match offsets
      expect(text.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.text);
    }
  });

  it('short text produces single chunk', () => {
    const text = 'Short text. Only a few words.';
    const chunks = chunkText(text, defaultOptions);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe(text);
    expect(chunks[0]!.startOffset).toBe(0);
    expect(chunks[0]!.endOffset).toBe(text.length);
  });

  it('overlap contains sentences from adjacent chunks', () => {
    // Create a text long enough to produce multiple chunks
    const sentences = Array.from(
      { length: 30 },
      (_, i) => `Sentence number ${i} contains enough words to fill space and be counted.`,
    );
    const text = sentences.join(' ');

    const chunks = chunkText(text, { ...defaultOptions, maxTokens: 80, overlapSentences: 2 });

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Check that overlap exists: last N sentences of chunk[i] appear in chunk[i+1]
    for (let i = 0; i < chunks.length - 1; i++) {
      const currentChunk = chunks[i]!;
      const nextChunk = chunks[i + 1]!;

      // The end of current chunk should overlap with start of next chunk
      // Find overlapping content
      const overlapText = currentChunk.text.slice(-100);
      expect(nextChunk.text).toContain(overlapText.slice(overlapText.indexOf(' ') + 1));
    }
  });

  it('sourceRef is passed through to chunks', () => {
    const text = 'Sentence one. Sentence two. Sentence three. Sentence four.';
    const sourceRef = { book: 'Genesis', chapter: 1 };
    const chunks = chunkText(text, { ...defaultOptions, maxTokens: 3 }, sourceRef);

    for (const chunk of chunks) {
      expect(chunk.sourceRef).toEqual(sourceRef);
    }
  });

  it('respects minTokens by merging small tail into last chunk', () => {
    // 5 long sentences (15 words) + 2 short ones (4 words) with maxTokens=12
    // First chunk fills at ~15 words, tail has only 4 words (< minTokens=6), so it merges
    const text =
      'The quick brown fox jumps over the lazy dog now. A second long sentence with many extra words inside it. Another lengthy sentence fills up the space here too. More words are written in this sentence for sure. Yet another long sentence to finish the first chunk up. Short. Tiny.';
    const chunks = chunkText(text, { ...defaultOptions, maxTokens: 12, minTokens: 6 });

    // Last chunk should have been merged because tail was too small
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) {
      expect(wordCount(chunk.text)).toBeGreaterThanOrEqual(6);
    }
  });
});
