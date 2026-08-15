import { readFileSync, existsSync } from 'node:fs';
import type { LLMQueue } from '@/lib/llm-queue';
import { cosineSimilarity as vecCosine } from '@/lib/vector-ops';
import {
  topNAuthors,
  psychotypeToProfile,
  createDefaultProfile,
  type AuthorEntry,
  type AuthorMatch,
  type JungianProfile,
  type TextAnalysis,
} from './jungian-profiler';

const _corpusCache = new Map<string, AuthorEntry[]>();

export function loadAuthorCorpus(path = 'data/author-embeddings.json'): AuthorEntry[] {
  const cached = _corpusCache.get(path);
  if (cached) return cached;
  let entries: AuthorEntry[] = [];
  if (existsSync(path)) {
    try {
      entries = JSON.parse(readFileSync(path, 'utf8')) as AuthorEntry[];
    } catch {
      entries = [];
    }
  }
  _corpusCache.set(path, entries);
  return entries;
}

export async function selectAuthor(
  top3: AuthorEntry[],
  prologue: string,
  llmQueue?: LLMQueue,
): Promise<{ author: AuthorEntry; reason: string }> {
  if (top3.length === 0) throw new Error('selectAuthor: empty top3 — matchAuthor гарантирует non-empty');
  if (!llmQueue || top3.length <= 1) return { author: top3[0]!, reason: 'cosine top-1 (LLM fallback)' };
  const snippet = prologue.length > 2000 ? prologue.slice(0, 2000) : prologue; // ~500 слов
  const candidates = top3
    .map((a, i) => `${i + 1}) ${a.name}\n   sample: ${a.samplePhrases.slice(0, 3).join(' / ')}`)
    .join('\n');
  const prompt = `You are matching a player's writing style to a classical author for a few-shot style reference.

Player prologue:
"""
${snippet}
"""

Candidate authors (chosen by embedding cosine similarity):
${candidates}

Which candidate's prose style best matches the player's prologue? Consider register, pacing, sensory focus, sentence rhythm.
Reply with exactly the author name, nothing else.`;
  try {
    const answer = await llmQueue.generateText(prompt, 1, 0.2, 'author-matcher');
    const picked = top3.find(a => answer.includes(a.name));
    return picked
      ? { author: picked, reason: 'LLM pick among top-3' }
      : { author: top3[0]!, reason: 'cosine top-1 (LLM fallback)' }; // LLM вне top-3 → top-1
  } catch {
    return { author: top3[0]!, reason: 'cosine top-1 (LLM fallback)' }; // LLM недоступен → top-1
  }
}

export async function matchAuthor(
  prologue: string,
  corpus: AuthorEntry[],
  embed: (text: string) => Promise<number[]>,
  llmQueue?: LLMQueue,
): Promise<AuthorMatch | null> {
  if (!prologue.trim() || corpus.length === 0) return null;
  let prologueEmbedding: number[];
  try {
    prologueEmbedding = await embed(prologue);
  } catch {
    return null; // embedding-сервер недоступен → graceful fallback (closestAuthor отсутствует)
  }
  if (prologueEmbedding.length === 0) return null;
  const top3 = topNAuthors(prologueEmbedding, corpus, 3);
  if (top3.length === 0) return null; // ни один автор не совпал по dim → не ранжируем мусор
  const { author: chosen, reason } = await selectAuthor(top3, prologue, llmQueue);
  return {
    name: chosen.name,
    matchConfidence: Math.max(0, vecCosine(Float32Array.from(prologueEmbedding), Float32Array.from(chosen.embedding))),
    matchReason: reason,
  };
}

export async function analyzeBirth(
  hints: string,
  prologue: string,
  corpus: AuthorEntry[],
  embed: (text: string) => Promise<number[]>,
  llmQueue?: LLMQueue,
): Promise<{ psychotype: JungianProfile; closestAuthor: string | null } | null> {
  if (corpus.length === 0) return null;

  // S5.2 step 2: embed пролога → cosine top-3 (0 LLM)
  let top3: AuthorEntry[] = [];
  if (prologue.trim()) {
    try {
      const e = await embed(prologue);
      if (e.length > 0) top3 = topNAuthors(e, corpus, 3);
    } catch {
      top3 = [];
    }
  }

  if (!llmQueue) {
    return top3.length > 0 ? { psychotype: top3[0]!.psychotype, closestAuthor: top3[0]!.name } : null;
  }

  const candidates = top3
    .map((a, i) => `${i + 1}) ${a.name}\n   sample: ${a.samplePhrases.slice(0, 3).join(' / ')}`)
    .join('\n');
  const prompt = `Analyze the player's character description and story prologue to determine psychological type and the closest classical author.

CHARACTER DESCRIPTION:
${hints.trim() || '(none)'}

PROLOGUE:
${prologue.trim() || '(none)'}

CANDIDATE AUTHORS (ranked by embedding similarity):
${candidates || '(none)'}

Respond as JSON ONLY:
{
  "psychotype": {
    "extraversion": 0.5, "intuition": 0.5, "thinking": 0.5, "judging": 0.5,
    "axisConfidence": { "extraversion": 0.5, "intuition": 0.5, "thinking": 0.5, "judging": 0.5 },
    "confidence": 0.5
  },
  "closestAuthor": "Author Name"
}`;

  try {
    const answer = await llmQueue.generateText(prompt, 1, 0.3, 'psychotype-analyzer');
    const parsed = JSON.parse(answer.trim()) as {
      psychotype?: Partial<TextAnalysis['psychotype']>;
      closestAuthor?: string;
    };
    const psychotype = parsed.psychotype
      ? psychotypeToProfile({
          extraversion: parsed.psychotype.extraversion ?? 0.5,
          intuition: parsed.psychotype.intuition ?? 0.5,
          thinking: parsed.psychotype.thinking ?? 0.5,
          judging: parsed.psychotype.judging ?? 0.5,
          axisConfidence: parsed.psychotype.axisConfidence ?? { extraversion: 0, intuition: 0, thinking: 0, judging: 0 },
          confidence: parsed.psychotype.confidence ?? 0,
        }, prologue.length + hints.length)
      : (top3[0]?.psychotype ?? createDefaultProfile());

    let closestAuthor: string | null = null;
    if (parsed.closestAuthor) {
      const picked = top3.find(a => parsed.closestAuthor === a.name || parsed.closestAuthor!.includes(a.name));
      closestAuthor = picked?.name ?? top3[0]?.name ?? null;
    } else {
      closestAuthor = top3[0]?.name ?? null;
    }

    return { psychotype, closestAuthor };
  } catch {
    // LLM down / bad JSON → graceful: top-1 author, no psychotype refinement
    return top3.length > 0 ? { psychotype: top3[0]!.psychotype, closestAuthor: top3[0]!.name } : null;
  }
}
