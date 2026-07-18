#!/usr/bin/env bun
/**
 * Compile classics.db through the Literary Compiler 4-pass pipeline.
 *
 * Reads:  data/gutenberg/classics.db  (source books)
 * Writes: data/literary-compiler/classics-compiled.db  (quest templates + FTS5)
 *
 * Pipeline: DramaturgicPass → StylisticPass → EmotionalPass → MetadataPass → Linter
 */

import { Database } from 'bun:sqlite';
import { LiteraryCompilerDB } from '../src/mcp/literary-compiler/schema';
import { DramaturgicPass } from '../src/mcp/literary-compiler/dramaturgic-pass';
import { StylisticPass } from '../src/mcp/literary-compiler/stylistic-pass';
import { EmotionalPass } from '../src/mcp/literary-compiler/emotional-pass';
import { MetadataPass } from '../src/mcp/literary-compiler/metadata-pass';
import { Linter } from '../src/mcp/literary-compiler/linter';
import type { QuestTemplate } from '../src/mcp/literary-compiler/types';

// ── Config ──────────────────────────────────────────────────────────
const SOURCE_DB = './data/gutenberg/classics.db';
const OUTPUT_DB = './data/literary-compiler/classics-compiled.db';
const CHAPTER_WORD_TARGET = 3000; // words per chapter chunk
const MAX_TEMPLATE_WORDS = 500;

// ── Helpers ─────────────────────────────────────────────────────────

/** Split plain text into roughly chapter-sized chunks by paragraph boundaries */
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

/** Clean Gutenberg header/footer junk */
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\*\*\*\s*(END|END OF|End of).*$/gms, '')
    .replace(/Project Gutenberg.*?$/gm, '')
    .replace(/This etext was prepared.*?$/gm, '')
    .replace(/Produced by.*?$/gm, '')
    .trim();
}

// ── Main ────────────────────────────────────────────────────────────

console.log('=== Literary Compiler: classics.db → compiled DB ===\n');

// Open source DB (read-only)
const srcDb = new Database(SOURCE_DB, { readonly: true });
const books = srcDb.query(
  'SELECT etextno, book_title, author, context FROM gutenberg ORDER BY author, book_title'
).all() as Array<{
  etextno: number;
  book_title: string;
  author: string;
  context: string;
}>;

console.log(`Source: ${books.length} books from ${SOURCE_DB}\n`);

// Create output DB
const compilerDb = new LiteraryCompilerDB(OUTPUT_DB);

// Init passes
const dramaturgic = new DramaturgicPass(compilerDb);
const stylistic = new StylisticPass();
const emotional = new EmotionalPass();
const metadata = new MetadataPass();
const linter = new Linter();

let totalTemplates = 0;
let totalChapters = 0;
let totalErrors = 0;
const allTemplates: QuestTemplate[] = [];
const startTime = Date.now();

for (let i = 0; i < books.length; i++) {
  const book = books[i];
  const cleaned = cleanText(book.context);

  if (cleaned.length < 200) {
    console.log(`  [${i + 1}/${books.length}] SKIP (too short): ${book.book_title}`);
    continue;
  }

  const chapters = splitIntoChapters(cleaned, CHAPTER_WORD_TARGET);
  console.log(`[${i + 1}/${books.length}] ${book.author} — "${book.book_title}" (${chapters.length} chapters)`);

  for (let ch = 0; ch < chapters.length; ch++) {
    const chapterText = chapters[ch];
    const chapterNum = ch + 1;
    const sourceId = `${book.author}::${book.book_title}`;

    // ── Pass 1: Dramaturgic ──
    const dramResult = await dramaturgic.parse({
      text: chapterText,
      source_book: sourceId,
      source_chapter: chapterNum,
    });

    if (dramResult.errors.length > 0) {
      totalErrors += dramResult.errors.length;
    }

    for (const template of dramResult.templates) {
      // ── Pass 2: Stylistic ──
      const styResult = stylistic.analyze({
        text: chapterText,
        source_id: template.id,
      });

      // Enrich template with stylistic data
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
        template.mood = arc.dominant_emotion !== 'neutral' ? arc.dominant_emotion : template.mood;
        if (arc.tension_level > 0.7) {
          template.difficulty = 'high';
        } else if (arc.tension_level < 0.3) {
          template.difficulty = 'low';
        }
      }

      // ── Pass 4: Metadata ──
      const metaResult = metadata.enrich({ template, context: chapterText.substring(0, 1000) });
      template.tags = metaResult.metadata.tags;
      template.applicable_positions = metaResult.metadata.applicable_positions;

      // Truncate template text if too long
      const wordCount = template.template_text.split(/\s+/).length;
      if (wordCount > MAX_TEMPLATE_WORDS) {
        template.template_text = template.template_text.split(/\s+/).slice(0, MAX_TEMPLATE_WORDS).join(' ') + '...';
      }

      allTemplates.push(template);
      totalTemplates++;
    }

    totalChapters++;
  }

  // Progress: commit every 10 books
  if ((i + 1) % 10 === 0 || i === books.length - 1) {
    console.log(`  → ${totalTemplates} templates so far (${totalChapters} chapters processed)`);
  }
}

// ── Lint ────────────────────────────────────────────────────────────
console.log(`\n--- Linting ${allTemplates.length} templates ---`);
const lintResult = linter.lint(allTemplates);
console.log(`  Valid: ${lintResult.valid_templates.length}`);
console.log(`  Invalid: ${lintResult.invalid_templates.length}`);
console.log(`  Errors: ${lintResult.error_count}, Warnings: ${lintResult.warning_count}`);

// ── Final insert (valid templates only) ─────────────────────────────
// The dramaturgic pass already inserted into DB during parse().
// We need to delete invalid ones and re-insert valid enriched ones.
for (const t of lintResult.valid_templates) {
  compilerDb.insertTemplate(t);
}

// ── Stats ───────────────────────────────────────────────────────────
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const dbCount = compilerDb.getTemplateCount();

console.log(`\n=== Done in ${elapsed}s ===`);
console.log(`Templates in DB: ${dbCount}`);
console.log(`Errors during compilation: ${totalErrors}`);
console.log(`Output: ${OUTPUT_DB}`);

srcDb.close();
compilerDb.close();
