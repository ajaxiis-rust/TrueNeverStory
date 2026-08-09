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

// ── Constants ─────────────────────────────────────────────────────────

const CLASSICS_DB = './data/gutenberg/classics.db';
const NORMALIZED_DB_DIR = './data/gutenberg';
const COMPILED_DB = './data/literary-compiler/classics-compiled.db';
const CHAPTER_WORD_TARGET = 3000;
const MAX_TEMPLATE_WORDS = 500;

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

// ── Main ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const phaseArg = args.find(a => a.startsWith('--phase=')) ?? '--phase=all';
const phase = phaseArg.split('=')[1] ?? 'all';

async function main() {
  if (phase === 'v1' || phase === 'all') {
    await runPhaseA();
  }
  if (phase === 'v2' || phase === 'all') {
    emit({ phase: 'v2', pct: 0, message: 'Phase B not implemented yet' });
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
