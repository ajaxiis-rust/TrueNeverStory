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

function emit(msg: { phase: string; pct: number; message: string }) {
  console.log(JSON.stringify(msg));
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

  emit({ phase: 'v2', pct: 3, message: `Found ${books.length} books` });

  const litDb = new LiteraryCompilerDB(LITERARY_DB);
  litDb.createV2Tables();
  litDb.createNarrativeTables();

  const stylistic = new StylisticPass();

  let totalTemplates = 0;
  let skippedBooks = 0;

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

    // Transaction per book
    litDb.db.exec('BEGIN TRANSACTION');
    try {
      // 1. Chunk text
      const chunks = chunkText(cleaned, sourceId, { minTokens: 200, maxTokens: 400, overlap: 60 });
      if (chunks.length === 0) { litDb.db.exec('COMMIT'); continue; }

      // 2. AnalyzePass per chunk, insert into chunk_index
      for (const chunk of chunks) {
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
      }

      // 3. Filter candidates (pre_score > 0.3)
      const candidates = chunks.filter(c => c.pre_score > 0.3);
      if (candidates.length === 0) { litDb.db.exec('COMMIT'); continue; }

      // 4. Cluster by scene_type
      const clusters = clusterBySceneType(candidates);

      // 5. Select representatives (max pre_score per cluster)
      const representatives: TextChunk[] = [];
      for (const cluster of clusters) {
        const best = cluster.chunks.reduce((a, b) =>
          ((a as unknown as TextChunk).pre_score > (b as unknown as TextChunk).pre_score ? a : b)
        ) as unknown as TextChunk;
        representatives.push(best);
      }

      // 6. LLM extraction per representative
      if (llm) {
        let repIdx = 0;
        for (const rep of representatives) {
          try {
            const chunkIdx = chunks.findIndex(c => c.id === rep.id);
            const prevChunk = chunkIdx > 0 ? chunks[chunkIdx - 1].text : null;
            const nextChunk = chunkIdx < chunks.length - 1 ? chunks[chunkIdx + 1].text : null;

            const prompt = EXTRACT_TEMPLATE_PROMPT(prevChunk, rep.text, nextChunk);
            const response = await llm.generateText(prompt);
            const parsed = JSON.parse(response);

            const qualityScore = calculateLiteraryQuality(
              { template_text: parsed.template_text, archetype_secondary: parsed.archetype_secondary ?? null, variables: parsed.variables ?? [], tags: parsed.rhetorical_devices ?? [] },
              { sensory_tags: rep.sensory_tags }
            );

            if (qualityScore < 0.3) continue;

            // ── StylisticPass ──
            const styResult = stylistic.analyze({ text: rep.text, source_id: rep.id });
            const styPattern = styResult.patterns[0];

            const era = inferEra();
            const period = inferLiteraryPeriod();

            // ── Create SceneTemplate ──
            const templateId = `scene-${book.etextno}-${repIdx}`;
            const sceneTemplate: SceneTemplate = {
              id: templateId,
              source_book: sourceId,
              source_chapter: rep.source_chapter,
              source_chunk_ids: [rep.id],
              archetype_primary: parsed.archetype_primary ?? 'inner_monologue',
              archetype_secondary: parsed.archetype_secondary ?? null,
              applicable_positions: [],
              variables: parsed.variables ?? [],
              template_text: parsed.template_text ?? '',
              beat_sequence: parsed.beat_sequence ?? [],
              mood: parsed.mood ?? 'neutral',
              difficulty: parsed.difficulty ?? 'medium',
              moral_ambiguity: parsed.moral_ambiguity ?? 0.5,
              tension_curve: parsed.tension_curve ?? [],
              tags: parsed.rhetorical_devices ?? [],
              domain: 'general',
              scale: 1.0,
              embedding_id: null,
              quality_score: qualityScore,
              use_count: 0,
              last_used_at: null,
              created_at: Date.now() / 1000,
            };
            litDb.insertSceneTemplate(sceneTemplate);

            // ── Create StylePattern ──
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
              narrative_voice: parsed.narrative_voice ?? 'third_person',
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

            // ── Create template_style_link ──
            litDb.insertTemplateStyleLink({ template_id: templateId, style_id: styleId, weight: 1.0 });

            totalTemplates++;
            repIdx++;
          } catch (chunkErr) {
            console.warn(`Skipping chunk ${rep.id} for book ${sourceId}:`, chunkErr);
            continue;
          }
        }

        // Narrative structure extraction (S16)
        await extractNarrativeStructure(litDb, llm, book, sourceId, chunks);
      }

      litDb.db.exec('COMMIT');

      emit({
        phase: 'v2',
        pct: Math.round(((i + 1) / books.length) * 95 + 3),
        message: `Book ${i + 1}/${books.length}: ${sourceId} — ${totalTemplates} templates so far`,
      });
    } catch (err) {
      litDb.db.exec('ROLLBACK');
      console.warn(`Book ${sourceId} rolled back:`, err);
      continue;
    }
  }

  srcDb.close();
  litDb.close();

  emit({ phase: 'v2', pct: 100, message: `Phase B complete: ${totalTemplates} templates from ${books.length - skippedBooks} books` });
}

// ── Main ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const phaseArg = args.find(a => a.startsWith('--phase=')) ?? '--phase=all';
const phase = phaseArg.split('=')[1] ?? 'all';

async function main() {
  if (phase === 'v1' || phase === 'all') {
    await runPhaseA();
  }
  if (phase === 'v2' || phase === 'all') {
    await runPhaseB();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
