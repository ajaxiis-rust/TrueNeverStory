export interface Chunk {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  sourceRef?: unknown;
}

export interface ChunkOptions {
  maxTokens: number;
  overlapSentences: number;
  minTokens: number;
}

interface SentenceSlice {
  text: string;
  start: number;
  end: number;
}

function splitSentences(text: string): SentenceSlice[] {
  if (!text) return [];
  const slices: SentenceSlice[] = [];
  const re = /[.!?]+\s*/g;
  let lastEnd = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const matchEnd = m.index + m[0].length;
    slices.push({ text: text.slice(lastEnd, matchEnd), start: lastEnd, end: matchEnd });
    lastEnd = matchEnd;
  }

  if (lastEnd < text.length) {
    slices.push({ text: text.slice(lastEnd), start: lastEnd, end: text.length });
  }

  return slices;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function chunkText(
  text: string,
  options: ChunkOptions,
  sourceRef?: unknown,
): Chunk[] {
  const { maxTokens, overlapSentences, minTokens } = options;
  const maxWords = Math.ceil(maxTokens / 0.75);

  if (!text || text.trim().length === 0) return [];

  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const chunks: Chunk[] = [];
  let buffer: SentenceSlice[] = [];
  let bufferWords = 0;

  for (const sentence of sentences) {
    const words = countWords(sentence.text);

    if (bufferWords + words > maxWords && buffer.length > 0) {
      const start = buffer[0]!.start;
      const end = buffer[buffer.length - 1]!.end;
      const chunkId = `chunk-${chunks.length}`;
      chunks.push({
        id: chunkId,
        text: text.slice(start, end),
        startOffset: start,
        endOffset: end,
        sourceRef,
      });

      // Overlap: keep last N sentences
      const overlapStart = Math.max(0, buffer.length - overlapSentences);
      const overlapSlice = buffer.slice(overlapStart);
      const overlapWords = overlapSlice.reduce((sum, s) => sum + countWords(s.text), 0);

      if (overlapWords >= maxWords * 0.8) {
        buffer = [sentence];
        bufferWords = words;
      } else {
        buffer = [...overlapSlice, sentence];
        bufferWords = overlapWords + words;
      }
    } else {
      buffer.push(sentence);
      bufferWords += words;
    }
  }

  // Flush remaining
  if (buffer.length > 0) {
    const start = buffer[0]!.start;
    const end = buffer[buffer.length - 1]!.end;
    const lastChunk: Chunk = {
      id: `chunk-${chunks.length}`,
      text: text.slice(start, end),
      startOffset: start,
      endOffset: end,
      sourceRef,
    };

    // Merge small tail into previous chunk
    if (chunks.length > 0 && countWords(lastChunk.text) < minTokens) {
      const prev = chunks[chunks.length - 1]!;
      const tailText = text.slice(prev.endOffset, lastChunk.endOffset);
      if (tailText.trim().length > 0) {
        chunks[chunks.length - 1] = {
          ...prev,
          text: text.slice(prev.startOffset, lastChunk.endOffset),
          endOffset: lastChunk.endOffset,
        };
      }
    } else {
      chunks.push(lastChunk);
    }
  }

  return chunks;
}
