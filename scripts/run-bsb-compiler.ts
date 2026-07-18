#!/usr/bin/env bun
/**
 * Run BSB through the Literary Compiler pipeline.
 * Loads BSB JSON + cross-refs → DramaturgicPass → QuestTemplates → shows results.
 */
import { BibleParser } from '../src/mcp/bible/parser';
import { LiteraryCompilerDB } from '../src/mcp/literary-compiler/schema';
import { DramaturgicPass } from '../src/mcp/literary-compiler/dramaturgic-pass';
import { LLMClient } from '../src/lib/llm-client';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { ProgressBar } from '../src/lib/progress-bar';

const BIBLE_DIR = join(process.cwd(), 'sources', 'bible');
const OUTPUT_DB = join(process.cwd(), 'data', 'bible-compiler-output', 'literary.db');

async function main() {
  console.log('=== BSB Literary Compiler Pipeline ===\n');

  // 1. Setup
  const tempDir = mkdtempSync(join(tmpdir(), 'bsb-compiler-'));
  console.log(`Temp dir: ${tempDir}`);

  const bibleParser = new BibleParser({ dbPath: ':memory:', dataDir: tempDir });
  const litDB = new LiteraryCompilerDB(OUTPUT_DB);
  const llm = new LLMClient({ agentId: 'dramaturg' });
  const dramaturgicPass = new DramaturgicPass(litDB, bibleParser, llm);

  // 2. Load BSB
  console.log('\n[1/4] Loading BSB.json...');
  const t0 = Date.now();
  const bsbResult = await bibleParser.loadFromJSON(join(BIBLE_DIR, 'BSB.json'), 'BSB');
  console.log(`  Loaded ${bsbResult.verseCount} verses in ${bsbResult.bookCount} books (${Date.now() - t0}ms)`);

  // 3. Load cross-references
  console.log('\n[2/4] Loading cross-references (7 shards)...');
  const t1 = Date.now();
  const xrefResult = await bibleParser.loadCrossRefs(BIBLE_DIR);
  console.log(`  Loaded ${xrefResult.refCount} cross-references (${Date.now() - t1}ms)`);

  // 4. Run DramaturgicPass on key books
  console.log('\n[3/4] Running DramaturgicPass on key narrative books...');
  const t2 = Date.now();

  const KEY_BOOKS = [
    'Genesis', 'Exodus', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
    '1 Kings', '2 Kings', 'Daniel', 'Jonah',
    'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  ];

  let totalTemplates = 0;
  let totalErrors = 0;
  const archetypeCounts: Record<string, number> = {};
  const moodCounts: Record<string, number> = {};

  // Count total chapters for progress bar
  let totalChapters = 0;
  const bookData = new Map<string, Map<number, string[]>>();
  for (const book of KEY_BOOKS) {
    if (!bibleParser.getBooks().includes(book)) continue;
    const verses = bibleParser.search('', { book, limit: 10000 });
    const chapters = new Map<number, string[]>();
    for (const v of verses) {
      const existing = chapters.get(v.chapter) ?? [];
      existing.push(v.text);
      chapters.set(v.chapter, existing);
    }
    bookData.set(book, chapters);
    totalChapters += chapters.size;
  }

  const progress = new ProgressBar(totalChapters, "Dramaturgic");
  let chapterIdx = 0;

  for (const book of KEY_BOOKS) {
    const chapters = bookData.get(book);
    if (!chapters) continue;

    for (const [chapter, chapterVerses] of chapters) {
      chapterIdx++;
      progress.update(chapterIdx, `${book} ${chapter}`);

      const chapterText = chapterVerses
        .map((t, i) => `## Verse ${i + 1}\n${t}`)
        .join('\n\n');

      const result = await dramaturgicPass.parse({
        text: chapterText,
        source_book: book,
        source_chapter: chapter,
      });

      totalTemplates += result.templates.length;
      totalErrors += result.errors.length;

      for (const t of result.templates) {
        archetypeCounts[t.archetype] = (archetypeCounts[t.archetype] ?? 0) + 1;
        moodCounts[t.mood] = (moodCounts[t.mood] ?? 0) + 1;
      }
    }
  }

  progress.finish(`${totalTemplates} templates, ${totalErrors} errors`);

  // 5. Results
  console.log('\n[4/4] Results:');
  console.log(`  Total templates generated: ${totalTemplates}`);
  console.log(`  Total errors: ${totalErrors}`);
  console.log(`  Templates in DB: ${litDB.getTemplateCount()}`);

  console.log('\n  Archetype distribution:');
  for (const [archetype, count] of Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${archetype}: ${count}`);
  }

  console.log('\n  Mood distribution:');
  for (const [mood, count] of Object.entries(moodCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${mood}: ${count}`);
  }

  // 6. Show sample templates
  console.log('\n--- Sample Templates ---\n');

  const sampleArchetypes = ['escape', 'judgment', 'wisdom', 'political', 'rescue'];
  for (const arch of sampleArchetypes) {
    const templates = litDB.queryTemplates({ archetype: arch, limit: 2 });
    if (templates.length > 0) {
      console.log(`[${arch.toUpperCase()}]`);
      for (const t of templates) {
        console.log(`  ${t.source_book} ${t.source_chapter} | mood=${t.mood} difficulty=${t.difficulty} ambiguity=${t.moral_ambiguity}`);
        console.log(`  Tags: ${t.tags.join(', ')}`);
        console.log(`  Template: ${t.template_text.substring(0, 200)}...`);
        console.log();
      }
    }
  }

  // 7. Show cross-ref enriched example
  console.log('--- Cross-Ref Enriched Example ---\n');
  const exodusRefs = bibleParser.getCrossRefs({ book: 'Exodus', chapter: 14, verse: 21, limit: 5 });
  console.log('Exodus 14:21 cross-references:');
  for (const ref of exodusRefs) {
    console.log(`  → ${ref.toBook} ${ref.toChapter}:${ref.toVerseStart}-${ref.toVerseEnd} (votes: ${ref.votes})`);
  }

  // 8. Show graph traversal
  console.log('\nExodus 14:21 related verses (depth=2):');
  const related = bibleParser.getRelatedVerses('Exodus', 14, 21, 2);
  for (const r of related.slice(0, 10)) {
    console.log(`  → ${r.toBook} ${r.toChapter}:${r.toVerseStart}-${r.toVerseEnd} (votes: ${r.votes})`);
  }

  // Cleanup
  bibleParser.close();
  litDB.close();
  rmSync(tempDir, { recursive: true, force: true });

  console.log(`\nOutput DB: ${OUTPUT_DB}`);
  console.log('Done!');
}

main().catch(console.error);
