#!/usr/bin/env bun
/**
 * process-gutenberg.ts — Main orchestration script for the Gutenberg pipeline.
 *
 * Phase A (V1): Rule-based, no LLM.
 *   A1. GutenbergParser — reads classics.db → gutenberg-normalized.db
 *   A2. 4-pass compiler — DramaturgicPass → StylisticPass → EmotionalPass → MetadataPass → Linter
 *
 * Usage: bun run scripts/process-gutenberg.ts [--phase v1|v2|all]
 */

import { Database } from 'bun:sqlite';
import { GutenbergParser } from '../src/mcp/gutenberg/parser';
import { cleanGutenbergText } from '../src/mcp/gutenberg/clean';
import { LiteraryCompilerDB } from '../src/mcp/literary-compiler/schema';
import { DramaturgicPass } from '../src/mcp/literary-compiler/dramaturgic-pass';
import { StylisticPass } from '../src/mcp/literary-compiler/stylistic-pass';
import { EmotionalPass } from '../src/mcp/literary-compiler/emotional-pass';
import { MetadataPass } from '../src/mcp/literary-compiler/metadata-pass';
import { Linter } from '../src/mcp/literary-compiler/linter';
import type { QuestTemplate } from '../src/mcp/literary-compiler/types';
import { analyzeChunk, clusterBySceneType } from '../src/mcp/gutenberg/analyze-pass';
import { inferEra, inferLiteraryPeriod, sampleExcerpts } from '../src/mcp/gutenberg/helpers';
import { extractNarrativeStructure } from '../src/mcp/gutenberg/narrative-extractor';
import type { SceneTemplate, StylePattern } from '../src/mcp/literary-compiler/schema';

// ── Constants ─────────────────────────────────────────────────────────

const CLASSICS_DB = './data/gutenberg/classics.db';
const NORMALIZED_DB_DIR = './data/gutenberg';
const COMPILED_DB = './data/literary-compiler/classics-compiled.db';
const CHAPTER_WORD_TARGET = 3000;
const MAX_TEMPLATE_WORDS = 500;
const LITERARY_DB = './data/literary-compiler/literary.db';

// ── Progress Emitter ──────────────────────────────────────────────────

interface ProgressStats {
  book_current?: number;
  book_total?: number;
  book_title?: string;
  chunks_done?: number;
  chunks_total?: number;
  templates?: number;
  elapsed_s?: number;
}

function emit(msg: { phase: string; pct: number; message: string; stats?: ProgressStats }) {
  console.log(JSON.stringify(msg));
}

function parseJsonSafe(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw); } catch {}
  // Try extracting JSON from markdown code block
  const m = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (m) { try { return JSON.parse(m[1]!); } catch {} }
  // Try finding first { ... } block
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) { try { return JSON.parse(raw.slice(start, end + 1)); } catch {} }
  throw new Error('No valid JSON in LLM response');
}

// ── Cache Hash ────────────────────────────────────────────────────────

function chunkHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Split plain text into roughly chapter-sized chunks by paragraph boundaries.
 * Each chunk targets ~targetWords words.
 */
function splitIntoChapters(text: string, targetWords: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  const chapters: string[] = [];
  let current = '';
  let wordCount = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).length;
    if (wordCount + paraWords > targetWords && current.length > 100) {
      chapters.push(current.trim());
      current = '';
      wordCount = 0;
    }
    current += para + '\n\n';
    wordCount += paraWords;
  }

  if (current.trim().length > 100) {
    chapters.push(current.trim());
  }

  return chapters.length > 0 ? chapters : [text.substring(0, 5000)];
}

/**
 * Parse catalog tags from subjects/bookshelves columns.
 * Each is a semicolon-delimited string like "Science fiction;Adventure".
 */
function parseCatalogTags(subjects?: string, bookshelves?: string): string[] {
  const tags: string[] = [];
  const raw = [subjects, bookshelves].filter(Boolean).join(';');
  if (!raw) return tags;

  for (const part of raw.split(';')) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      tags.push(trimmed);
    }
  }
  return tags;
}

function hasMoralizing(text: string): boolean {
  return /\b(ought|should|must always|never forget|always remember|lesson|moral)\b/.test(text.toLowerCase());
}

function calculateLiteraryQuality(
  template: { template_text: string; archetype_secondary: string | null; variables: string[]; tags: string[] },
  chunk: { sensory_tags: string[] }
): number {
  let score = 0.5;
  const variableCount = (template.template_text.match(/\[.*?\]/g) ?? []).length;
  const wordCount = template.template_text.split(/\s+/).length;
  score += (1 - (variableCount / Math.max(wordCount, 1))) * 0.15;
  score += Math.min(chunk.sensory_tags.length / 5, 0.15);
  if (template.archetype_secondary) score += 0.05;
  if (template.variables.includes('CHOICE')) score += 0.05;
  if (template.variables.includes('CONFLICT')) score += 0.05;
  const devices = template.tags.filter((t: string) => ['anaphora','chiasmus','litotes','antithesis','tricolon'].includes(t));
  score += Math.min(devices.length * 0.03, 0.1);
  if (wordCount > 120) score -= 0.15;
  if (hasMoralizing(template.template_text)) score -= 0.25;
  return Math.max(0, Math.min(1, score));
}

interface TextChunk {
  id: string; text: string; token_est: number; char_start: number; char_end: number;
  source_book: string; source_chapter: number;
  pre_score: number; dict_hits: number; scene_type: string; tempo: string;
  sensory_tags: string[]; narrative_distance: number; temporal_markers: string[];
}

function chunkText(text: string, sourceBook: string, opts: { minTokens: number; maxTokens: number; overlap: number }): TextChunk[] {
  const words = text.split(/\s+/);
  const chunks: TextChunk[] = [];
  const step = opts.maxTokens - opts.overlap;
  let charPos = 0;
  for (let i = 0; i < words.length; i += step) {
    const chunkWords = words.slice(i, i + opts.maxTokens);
    if (chunkWords.length < opts.minTokens) break;
    const chunkText = chunkWords.join(' ');
    chunks.push({
      id: `${sourceBook}:chunk:${chunks.length}`, text: chunkText, token_est: chunkWords.length,
      char_start: charPos, char_end: charPos + chunkText.length, source_book: sourceBook, source_chapter: 0,
      pre_score: 0, dict_hits: 0, scene_type: 'unknown', tempo: 'medium',
      sensory_tags: [], narrative_distance: 0.5, temporal_markers: [],
    });
    charPos += chunkText.length + 1;
  }
  return chunks;
}

async function checkEmbeddingServer(): Promise<boolean> {
  try {
    const resp = await fetch('http://localhost:5002/health', { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch { return false; }
}

// ── Phase A: V1 Pipeline ──────────────────────────────────────────────

async function runPhaseA() {
  // ── A1: Gutenberg Parser ──
  emit({ phase: 'v1-a1', pct: 0, message: 'Starting Phase A1: GutenbergParser' });

  const parser = new GutenbergParser({
    dbPath: CLASSICS_DB,
    dataDir: NORMALIZED_DB_DIR,
    extractStyles: true,
  });
  const parseResult = await parser.parse();
  parser.close();

  emit({
    phase: 'v1-a1',
    pct: 100,
    message: `A1 done: ${parseResult.textCount} texts, ${parseResult.styleCount} styles`,
  });

  // ── A2: 4-pass Compiler ──
  emit({ phase: 'v1-a2', pct: 0, message: 'Starting Phase A2: 4-pass compiler' });

  const srcDb = new Database(CLASSICS_DB, { readonly: true });
  const books = srcDb.query(
    'SELECT etextno, book_title, author, subjects, bookshelves, context FROM gutenberg ORDER BY author, book_title'
  ).all() as Array<{
    etextno: number;
    book_title: string;
    author: string;
    subjects: string | null;
    bookshelves: string | null;
    context: string;
  }>;

  emit({ phase: 'v1-a2', pct: 1, message: `Found ${books.length} books` });

  const compilerDb = new LiteraryCompilerDB(COMPILED_DB);

  const dramaturgic = new DramaturgicPass(compilerDb);
  const stylistic = new StylisticPass();
  const emotional = new EmotionalPass();
  const metadata = new MetadataPass();

  const allTemplates: QuestTemplate[] = [];
  let totalChapters = 0;
  let skippedBooks = 0;
  const startTime = Date.now();

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const sourceId = `${book.author}::${book.book_title}`;

    // Dedup: skip books already in bible_quest_templates
    const dedup = compilerDb.db
      .prepare('SELECT COUNT(*) as n FROM bible_quest_templates WHERE source_book = ?')
      .get(sourceId) as { n: number };
    if (dedup.n > 0) {
      skippedBooks++;
      if ((i + 1) % 5 === 0 || i === books.length - 1) {
        emit({
          phase: 'v1-a2',
          pct: Math.round(((i + 1) / books.length) * 100),
          message: `${i + 1 - skippedBooks}/${books.length} books processed (${skippedBooks} skipped), ${allTemplates.length} templates`,
        });
      }
      continue;
    }

    const cleaned = cleanGutenbergText(book.context);
    if (cleaned.length < 200) continue;

    const catalogTags = parseCatalogTags(book.subjects ?? undefined, book.bookshelves ?? undefined);
    const chapters = splitIntoChapters(cleaned, CHAPTER_WORD_TARGET);

    for (let ch = 0; ch < chapters.length; ch++) {
      const chapterText = chapters[ch];
      const chapterNum = ch + 1;

      // ── Pass 1: Dramaturgic (prose mode) ──
      const dramResult = await dramaturgic.parse({
        text: chapterText,
        source_book: sourceId,
        source_chapter: chapterNum,
        mode: 'prose',
      });

      for (const template of dramResult.templates) {
        // ── Pass 2: Stylistic ──
        const styResult = stylistic.analyze({
          text: chapterText,
          source_id: template.id,
        });
        if (styResult.patterns.length > 0) {
          const p = styResult.patterns[0];
          if (p.sensory_markers.length > 0) {
            template.tags = [...new Set([...template.tags, ...p.sensory_markers])];
          }
        }

        // ── Pass 3: Emotional ──
        const emoResult = emotional.analyze({
          text: chapterText,
          source_id: template.id,
        });
        if (emoResult.arcs.length > 0) {
          const arc = emoResult.arcs[0];
          if (arc.dominant_emotion !== 'neutral') {
            template.mood = arc.dominant_emotion;
          }
          if (arc.tension_level > 0.7) {
            template.difficulty = 'high';
          } else if (arc.tension_level < 0.3) {
            template.difficulty = 'low';
          }
        }

        // ── Pass 4: Metadata (enrich + catalog tags) ──
        const metaResult = metadata.enrich({
          template,
          context: chapterText.substring(0, 1000),
        });
        template.tags = metaResult.metadata.tags;
        template.applicable_positions = metaResult.metadata.applicable_positions;

        // Inject catalog tags (subjects + bookshelves)
        if (catalogTags.length > 0) {
          template.tags = [...new Set([...template.tags, ...catalogTags])];
        }

        // Truncate template text if too long
        const wordCount = template.template_text.split(/\s+/).length;
        if (wordCount > MAX_TEMPLATE_WORDS) {
          template.template_text =
            template.template_text.split(/\s+/).slice(0, MAX_TEMPLATE_WORDS).join(' ') + '...';
        }

        allTemplates.push(template);
      }

      totalChapters++;
    }

    // Emit progress every 5 books
    if ((i + 1) % 5 === 0 || i === books.length - 1) {
      emit({
        phase: 'v1-a2',
        pct: Math.round(((i + 1) / books.length) * 100),
        message: `${i + 1 - skippedBooks}/${books.length} books processed (${skippedBooks} skipped), ${allTemplates.length} templates / ${totalChapters} chapters`,
      });
    }
  }

  // ── Lint ──
  emit({ phase: 'v1-a2', pct: 95, message: `Linting ${allTemplates.length} templates...` });
  const linter = new Linter();
  const lintResult = linter.lint(allTemplates);

  emit({
    phase: 'v1-a2',
    pct: 97,
    message: `Lint: ${lintResult.valid_templates.length} valid, ${lintResult.invalid_templates.length} invalid (${lintResult.error_count} errors, ${lintResult.warning_count} warnings)`,
  });

  // Insert only valid templates (overshadows auto-inserts from DramaturgicPass.parse)
  for (const t of lintResult.valid_templates) {
    compilerDb.insertTemplate(t);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const dbCount = compilerDb.getTemplateCount();

  emit({
    phase: 'v1-a2',
    pct: 100,
    message: `Inserted ${lintResult.valid_templates.length} valid templates. DB total: ${dbCount}. Elapsed: ${elapsed}s`,
  });

  srcDb.close();
  compilerDb.close();

  emit({ phase: 'v1', pct: 100, message: 'Phase A complete' });
}

// ── Phase B: V2 Pipeline ──────────────────────────────────────────────

const EXTRACT_TEMPLATE_PROMPT = (prevChunk: string | null, currentChunk: string, nextChunk: string | null) => `
You are a literary analyst extracting narrative templates from classical prose.

CONTEXT:
${prevChunk ? `PREVIOUS: "${prevChunk.slice(0, 300)}"` : '(beginning of chapter)'}
CURRENT: "${currentChunk}"
${nextChunk ? `NEXT: "${nextChunk.slice(0, 300)}"` : '(end of chapter)'}

Extract:
1. template_text: A reusable narrative template (≤120 words) with [VARIABLE] placeholders
2. archetype_primary: The dominant archetype (escape/judgment/political/rescue/endurance/loyalty/romance/revenge/discovery/inner_monologue/social_microscopy/ironic_distance)
3. rhetorical_devices: List of rhetorical devices found (anaphora/chiasmus/litotes/antithesis/tricolon/direct_address)
4. narrative_voice: first_person / third_person / omniscient / free_indirect
5. tempo: fast / medium / slow
6. sensory_dominance: Which sense is most prominent (sight/sound/touch/smell/taste/kinaesthetic)

Return JSON:
{
  "template_text": "string (≤120 words)",
  "archetype_primary": "string",
  "archetype_secondary": null,
  "variables": ["VARIABLE"],
  "rhetorical_devices": ["anaphora"],
  "narrative_voice": "third_person",
  "mood": "dark/hopeful/tense/epic/neutral/romantic/melancholic",
  "difficulty": "low/medium/high",
  "moral_ambiguity": 0.0-1.0,
  "beat_sequence": ["opening", "escalation", "climax", "resolution"],
  "tension_curve": [0.1, 0.3, 0.7, 0.9, 0.5]
}

Return JSON only. No markdown.`;

async function runPhaseB() {
  emit({ phase: 'v2', pct: 0, message: 'Starting Phase B: V2 LLM pipeline' });

  // ── LLM client (dynamic import, graceful) ──
  let llm: { generateText: (p: string) => Promise<string> } | null = null;
  try {
    const { LLMQueue } = await import('../src/lib/llm-queue');
    const { LLMClient } = await import('../src/lib/llm-client');
    const llmClient = new LLMClient();
    const queue = new LLMQueue(llmClient);
    const client = queue.getAgentClient('literary-compiler');
    llm = { generateText: (p: string) => client.generateText(p) };
    emit({ phase: 'v2', pct: 1, message: 'LLM client initialized' });
  } catch (e) {
    console.warn('LLM not available, skipping LLM extraction:', e);
  }

  const hasEmbeddings = await checkEmbeddingServer();
  emit({ phase: 'v2', pct: 2, message: `Embedding server: ${hasEmbeddings ? 'available' : 'unavailable'}` });

  // ── Open source DB and literary DB ──
  const srcDb = new Database(CLASSICS_DB, { readonly: true });
  const books = srcDb.query(
    'SELECT etextno, book_title, author, subjects, bookshelves, context FROM gutenberg ORDER BY author, book_title'
  ).all() as Array<{
    etextno: number;
    book_title: string;
    author: string;
    subjects: string | null;
    bookshelves: string | null;
    context: string;
  }>;

  emit({ phase: 'v2', pct: 3, message: `Found ${books.length} books`, stats: { book_current: 0, book_total: books.length, chunks_done: 0, templates: 0, elapsed_s: 0 } });

  const litDb = new LiteraryCompilerDB(LITERARY_DB);
  litDb.createV2Tables();
  litDb.createNarrativeTables();

  const stylistic = new StylisticPass();

  let totalTemplates = 0;
  let totalChunks = 0;
  let skippedBooks = 0;
  let llmCalls = 0;
  let llmSeconds = 0;
  const phaseStart = Date.now();

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const sourceId = `${book.author}::${book.book_title}`;

    // Dedup: skip if already in chunk_index
    const dedup = litDb.db
      .prepare('SELECT COUNT(*) as n FROM chunk_index WHERE source_book = ?')
      .get(sourceId) as { n: number };
    if (dedup.n > 0) {
      skippedBooks++;
      if ((i + 1) % 5 === 0 || i === books.length - 1) {
        emit({
          phase: 'v2',
          pct: Math.round(((i + 1) / books.length) * 95 + 3),
          message: `${i + 1 - skippedBooks}/${books.length} books (${skippedBooks} skipped), ${totalTemplates} templates`,
        });
      }
      continue;
    }

    const cleaned = cleanGutenbergText(book.context);
    if (cleaned.length < 200) continue;

    // ── Transaction 1: Chunks (fast, rule-based) ──────────────────────
    let chunks: TextChunk[];
    litDb.db.exec('BEGIN TRANSACTION');
    try {
      chunks = chunkText(cleaned, sourceId, { minTokens: 200, maxTokens: 400, overlap: 60 });
      if (chunks.length === 0) { litDb.db.exec('COMMIT'); continue; }

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci]!;
        const analysis = analyzeChunk(chunk.text);
        chunk.pre_score = analysis.pre_score;
        chunk.dict_hits = analysis.dict_hits.length;
        chunk.scene_type = analysis.scene_type;
        chunk.tempo = analysis.tempo;
        chunk.sensory_tags = analysis.sensory_tags;
        chunk.narrative_distance = analysis.narrative_distance;
        chunk.temporal_markers = analysis.temporal_markers;

        litDb.insertChunkIndex({
          chunk_id: chunk.id,
          source_book: chunk.source_book,
          source_chapter: chunk.source_chapter,
          text: chunk.text,
          token_est: chunk.token_est,
          char_start: chunk.char_start,
          char_end: chunk.char_end,
          embedding_ref: null,
          dict_hits: chunk.dict_hits,
          pre_score: chunk.pre_score,
          cluster_id: null,
          scene_type: chunk.scene_type,
          tempo: chunk.tempo,
          sensory_tags: JSON.stringify(chunk.sensory_tags),
          narrative_distance: chunk.narrative_distance,
          temporal_markers: JSON.stringify(chunk.temporal_markers),
          created_at: Date.now() / 1000,
        });

        // Emit progress every 5 chunks
        if ((ci + 1) % 5 === 0 || ci === chunks.length - 1) {
          emit({
            phase: 'v2',
            pct: Math.round(((i + (ci + 1) / chunks.length * 0.5) / books.length) * 95 + 3),
            message: `Book ${i + 1}/${books.length}: ${sourceId} — chunk ${ci + 1}/${chunks.length}`,
            stats: {
              book_current: i + 1,
              book_total: books.length,
              book_title: sourceId,
              chunks_done: totalChunks + ci + 1,
              templates: totalTemplates,
              elapsed_s: Math.round((Date.now() - phaseStart) / 1000),
            },
          });
        }
      }

      litDb.db.exec('COMMIT');
      litDb.db.exec('PRAGMA wal_checkpoint(PASSIVE)');
      totalChunks += chunks.length;

      const elapsed = Math.round((Date.now() - phaseStart) / 1000);
      emit({
        phase: 'v2',
        pct: Math.round(((i + 0.5) / books.length) * 95 + 3),
        message: `Book ${i + 1}/${books.length}: ${sourceId} — chunks ready`,
        stats: {
          book_current: i + 1,
          book_total: books.length,
          book_title: sourceId,
          chunks_done: totalChunks,
          templates: totalTemplates,
          elapsed_s: elapsed,
        },
      });
    } catch (err) {
      litDb.db.exec('ROLLBACK');
      console.warn(`Book ${sourceId} chunks rolled back:`, err);
      continue;
    }

    // ── Transaction 2: Templates (slow, LLM) ──────────────────────────
    const candidates = chunks.filter(c => c.pre_score > 0.3);
    if (candidates.length === 0) continue;

    const clusters = clusterBySceneType(candidates);
    const representatives: TextChunk[] = [];
    for (const cluster of clusters) {
      const best = cluster.chunks.reduce((a, b) =>
        ((a as unknown as TextChunk).pre_score > (b as unknown as TextChunk).pre_score ? a : b)
      ) as unknown as TextChunk;
      representatives.push(best);
    }

    litDb.db.exec('BEGIN TRANSACTION');
    try {
      if (llm) {
        let repIdx = 0;
        for (const rep of representatives) {
          // ── LLM cache lookup ──
          const hash = chunkHash(rep.text);
          const cached = litDb.db.prepare(
            'SELECT result_json FROM archetype_llm_cache WHERE cache_key = ?'
          ).get(hash) as { result_json: string } | null;

          let parsed: Record<string, unknown>;
          if (cached) {
            parsed = JSON.parse(cached.result_json);
          } else {
            const chunkIdx = chunks.findIndex(c => c.id === rep.id);
            const prevChunk = chunkIdx > 0 ? chunks[chunkIdx - 1].text : null;
            const nextChunk = chunkIdx < chunks.length - 1 ? chunks[chunkIdx + 1].text : null;

            const prompt = EXTRACT_TEMPLATE_PROMPT(prevChunk, rep.text, nextChunk);
            const t0 = Date.now();
            const response = await llm.generateText(prompt);
            const elapsed = (Date.now() - t0) / 1000;
            llmCalls++;
            llmSeconds += elapsed;

            parsed = parseJsonSafe(response);

            // Cache result
            litDb.db.prepare(
              'INSERT OR IGNORE INTO archetype_llm_cache (cache_key, archetype, confidence, result_json, mood, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(hash, (parsed.archetype_primary as string) ?? 'unknown', 1.0, JSON.stringify(parsed), (parsed.mood as string) ?? 'neutral', Math.floor(Date.now() / 1000));
          }

          const qualityScore = calculateLiteraryQuality(
            { template_text: parsed.template_text, archetype_secondary: parsed.archetype_secondary ?? null, variables: parsed.variables ?? [], tags: parsed.rhetorical_devices ?? [] },
            { sensory_tags: rep.sensory_tags }
          );

          if (qualityScore < 0.3) { console.warn(`[v2] Low quality (${qualityScore.toFixed(2)}): ${rep.id} in ${sourceId}`); continue; }

          const styResult = stylistic.analyze({ text: rep.text, source_id: rep.id });
          const styPattern = styResult.patterns[0];
          const era = inferEra();
          const period = inferLiteraryPeriod();

          const templateId = `scene-${book.etextno}-${repIdx}`;
          const sceneTemplate: SceneTemplate = {
            id: templateId,
            source_book: sourceId,
            source_chapter: rep.source_chapter,
            source_chunk_ids: [rep.id],
            archetype_primary: (parsed.archetype_primary as string) ?? 'inner_monologue',
            archetype_secondary: (parsed.archetype_secondary as string) ?? null,
            applicable_positions: [],
            variables: (parsed.variables as string[]) ?? [],
            template_text: (parsed.template_text as string) ?? '',
            beat_sequence: (parsed.beat_sequence as string[]) ?? [],
            mood: (parsed.mood as string) ?? 'neutral',
            difficulty: (parsed.difficulty as string) ?? 'medium',
            moral_ambiguity: (parsed.moral_ambiguity as number) ?? 0.5,
            tension_curve: (parsed.tension_curve as number[]) ?? [],
            tags: (parsed.rhetorical_devices as string[]) ?? [],
            domain: 'general',
            scale: 1.0,
            embedding_id: null,
            quality_score: qualityScore,
            use_count: 0,
            last_used_at: null,
            created_at: Date.now() / 1000,
          };
          litDb.insertSceneTemplate(sceneTemplate);

          const styleId = `style-${templateId}`;
          const stylePattern: StylePattern = {
            id: styleId,
            source_author_or_era: book.author,
            source_chunk_ids: [rep.id],
            avg_sentence_len: styPattern?.avg_sentence_length ?? 0,
            sentence_len_variance: 0,
            sensory_ratio: (styPattern?.sensory_markers.length ?? 0) / 10,
            register: 'neutral',
            pacing: styPattern?.pacing ?? 'medium',
            tone: styPattern?.tone ?? 'neutral',
            preferred_constructions: styPattern?.syntax_patterns ?? [],
            forbidden_phrases: [],
            example_snippets: sampleExcerpts(rep.text, 3, 200),
            quality_score: qualityScore,
            narrative_voice: (parsed.narrative_voice as string) ?? 'third_person',
            temporal_style: rep.temporal_markers.join(',') || 'linear',
            dialogue_style: 'direct',
            metaphor_density: 0.5,
            sentence_opening_variance: 0.5,
            paragraph_length_avg: 60.0,
            exclamation_ratio: 0.05,
            rhetorical_devices: JSON.stringify(parsed.rhetorical_devices ?? []),
            era,
            literary_period: period,
            created_at: Date.now() / 1000,
          };
          litDb.insertStylePattern(stylePattern);
          litDb.insertTemplateStyleLink({ template_id: templateId, style_id: styleId, weight: 1.0 });

          totalTemplates++;
          repIdx++;
        }

        await extractNarrativeStructure(litDb, llm, book, sourceId, chunks);
      }

      litDb.db.exec('COMMIT');
      litDb.db.exec('PRAGMA wal_checkpoint(PASSIVE)');

      const elapsed = Math.round((Date.now() - phaseStart) / 1000);
      emit({
        phase: 'v2',
        pct: Math.round(((i + 1) / books.length) * 95 + 3),
        message: `Book ${i + 1}/${books.length}: ${sourceId}`,
        stats: {
          book_current: i + 1,
          book_total: books.length,
          book_title: sourceId,
          chunks_done: totalChunks,
          chunks_total: totalChunks,
          templates: totalTemplates,
          elapsed_s: elapsed,
        },
      });
    } catch (err) {
      litDb.db.exec('ROLLBACK');
      console.warn(`Book ${sourceId} templates rolled back (chunks preserved):`, err);
    }
  }

  srcDb.close();
  litDb.close();

  const totalElapsed = Math.round((Date.now() - phaseStart) / 1000);
  const avgTps = llmCalls > 0 ? (llmSeconds / llmCalls).toFixed(1) : '0';
  emit({
    phase: 'v2',
    pct: 100,
    message: `Done: ${totalTemplates} templates, ${totalChunks} chunks, ${llmCalls} LLM calls (${avgTps}s/call)`,
    stats: {
      book_current: books.length,
      book_total: books.length,
      chunks_done: totalChunks,
      chunks_total: totalChunks,
      templates: totalTemplates,
      elapsed_s: totalElapsed,
    },
  });
}

// ── Quality Calibration (S17) ────────────────────────────────────────

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
  return den === 0 ? 0 : num / den;
}

async function calibrateQualityScores(): Promise<void> {
  emit({ phase: 'calibration', pct: 0, message: 'Starting quality calibration' });
  let llm: { generateText(prompt: string): Promise<string> } | null = null;
  try {
    const { LLMQueue } = await import('../src/lib/llm-queue');
    const { LLMClient } = await import('../src/lib/llm-client');
    const llmClient = new LLMClient();
    const queue = new LLMQueue(llmClient);
    const client = queue.getAgentClient('literary-compiler');
    llm = { generateText: (p: string) => client.generateText(p) };
  } catch {
    emit({ phase: 'calibration', pct: 100, message: 'LLM unavailable, skipping calibration' });
    return;
  }

  const litDb = new LiteraryCompilerDB(LITERARY_DB);
  const books = litDb.db.prepare('SELECT DISTINCT source_book FROM scene_templates').all() as Array<{source_book:string}>;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const templates = litDb.db.prepare('SELECT id, template_text, quality_score FROM scene_templates WHERE source_book = ?').all(book.source_book) as Array<{id:string;template_text:string;quality_score:number}>;
    if (templates.length < 3) continue;

    const sample = templates.slice(0, 10);
    try {
      const prompt = `Rate these narrative templates on a scale of 0.0-1.0 for literary quality. Consider: originality, emotional depth, dramatic potential, language quality, and narrative structure. Return JSON array: [{"id":"...","composite_score":0.0-1.0}]`;

      const raw = await llm!.generateText(prompt + '\n' + sample.map((t, i) => `${i + 1}. [${t.id}] "${t.template_text.slice(0, 200)}"`).join('\n'));
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const l1Result = JSON.parse(jsonMatch[0]) as Array<{id:string;composite_score:number}>;
      const l1Map = new Map(l1Result.map(r => [r.id, r.composite_score]));
      const paired = sample.filter(t => l1Map.has(t.id)).map(t => ({l0: t.quality_score, l1: l1Map.get(t.id)!}));
      if (paired.length < 2) continue;

      const correlation = pearsonCorrelation(paired.map(p => p.l0), paired.map(p => p.l1));
      const l0Avg = sample.reduce((a, t) => a + t.quality_score, 0) / sample.length;
      const l1Avg = paired.reduce((a, p) => a + p.l1, 0) / paired.length;

      litDb.insertQualityCalibration({
        source_book: book.source_book, l0_avg: l0Avg, l1_avg: l1Avg,
        correlation, template_count: templates.length,
        outlier_count: paired.filter(p => Math.abs(p.l0 - p.l1) > 0.3).length,
        calibrated_at: Math.floor(Date.now() / 1000),
      });

      emit({ phase: 'calibration', pct: Math.floor(((i + 1) / books.length) * 100), message: `Calibrated ${book.source_book} (r=${correlation.toFixed(2)}, ${paired.length} paired)` });
    } catch { continue; }
  }

  litDb.close();
  emit({ phase: 'calibration-done', pct: 100, message: `Quality calibration complete — ${books.length} books processed` });
}

// ── Main ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let phase = 'all';
const phaseEq = args.find(a => a.startsWith('--phase='));
if (phaseEq) {
  phase = phaseEq.split('=')[1] ?? 'all';
} else {
  const phaseIdx = args.indexOf('--phase');
  if (phaseIdx !== -1 && phaseIdx + 1 < args.length) {
    phase = args[phaseIdx + 1];
  }
}

async function main() {
  if (phase === 'v1' || phase === 'all') {
    await runPhaseA();
  }
  if (phase === 'v2' || phase === 'all') {
    await runPhaseB();
  }
  if (phase === 'calibrate' || phase === 'all') {
    await calibrateQualityScores();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
