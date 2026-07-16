#!/usr/bin/env bun
/**
 * Full pipeline from CACHED SQLite. No JSON loading.
 */
import { BibleParser } from '../src/mcp/bible/parser';
import { LiteraryCompilerDB } from '../src/mcp/literary-compiler/schema';
import { DramaturgicPass } from '../src/mcp/literary-compiler/dramaturgic-pass';
import { StylisticPass } from '../src/mcp/literary-compiler/stylistic-pass';
import { EmotionalPass } from '../src/mcp/literary-compiler/emotional-pass';
import { MetadataPass } from '../src/mcp/literary-compiler/metadata-pass';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data', 'bible');
const LIT_DB = join(process.cwd(), 'data', 'bible-compiler-output', 'literary-cached.db');

async function main() {
  console.log('=== Cached Bible Pipeline ===\n');

  // 1. Open from cache (instant)
  const t0 = Date.now();
  const parser = new BibleParser({ dbPath: ':memory:', dataDir: DATA_DIR });
  console.log(`[1/2] Opened DB in ${Date.now() - t0}ms (${parser.getVerseCount()} verses, ${parser.getBooks().length} books)`);

  const litDB = new LiteraryCompilerDB(LIT_DB);
  const dramaturgicPass = new DramaturgicPass(litDB, parser);
  const stylisticPass = new StylisticPass();
  const emotionalPass = new EmotionalPass();
  const metadataPass = new MetadataPass();

  // 2. Process all 15 key narrative books
  console.log('[2/2] Running 4-pass pipeline...\n');
  const t1 = Date.now();

  const KEY_BOOKS = [
    'Genesis', 'Exodus', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
    '1 Kings', '2 Kings', 'Daniel', 'Jonah',
    'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  ];

  let totalTemplates = 0;
  const archetypeCounts: Record<string, number> = {};
  const moodCounts: Record<string, number> = {};
  const bookStats: Array<{ book: string; chapters: number; templates: number }> = [];

  for (const book of KEY_BOOKS) {
    const verses = parser.search('', { book, limit: 10000 });
    const chapters = new Map<number, string[]>();
    for (const v of verses) {
      const existing = chapters.get(v.chapter) ?? [];
      existing.push(v.text);
      chapters.set(v.chapter, existing);
    }

    let bookTemplates = 0;
    for (const [chapter, chapterVerses] of chapters) {
      const chapterText = chapterVerses
        .map((t, i) => `## Verse ${i + 1}\n${t}`)
        .join('\n\n');

      const result = dramaturgicPass.parse({
        text: chapterText,
        source_book: book,
        source_chapter: chapter,
      });

      totalTemplates += result.templates.length;
      bookTemplates += result.templates.length;

      for (const t of result.templates) {
        archetypeCounts[t.archetype] = (archetypeCounts[t.archetype] ?? 0) + 1;
        moodCounts[t.mood] = (moodCounts[t.mood] ?? 0) + 1;
      }
    }

    bookStats.push({ book, chapters: chapters.size, templates: bookTemplates });
  }

  const elapsed = Date.now() - t1;
  console.log(`  ${totalTemplates} templates in ${elapsed}ms (${Math.round(totalTemplates / elapsed * 1000)} templates/sec)`);

  // Summary
  console.log('\n=== Results ===\n');
  console.log('Book breakdown:');
  for (const s of bookStats) {
    console.log(`  ${s.book.padEnd(15)} ${String(s.chapters).padStart(3)} chapters  ${String(s.templates).padStart(3)} templates`);
  }

  console.log('\nArchetype distribution:');
  for (const [a, c] of Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${a.padEnd(20)} ${c}`);
  }

  console.log('\nMood distribution:');
  for (const [m, c] of Object.entries(moodCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(20)} ${c}`);
  }

  // Show a few enriched samples
  console.log('\n=== Enriched Samples ===\n');

  const SAMPLES = [
    { book: 'Exodus', chapter: 14, label: 'Red Sea' },
    { book: 'Jonah', chapter: 1, label: 'Great Fish' },
    { book: 'Daniel', chapter: 5, label: 'Writing on Wall' },
    { book: 'Acts', chapter: 7, label: 'Stephen Speech' },
  ];

  for (const s of SAMPLES) {
    const verses = parser.search('', { book: s.book, chapter: s.chapter, limit: 5 });
    if (verses.length === 0) continue;

    const chapterText = verses
      .map((v, i) => `## Verse ${v.verse}\n${v.text}`)
      .join('\n\n');

    const dram = dramaturgicPass.parse({ text: chapterText, source_book: s.book, source_chapter: s.chapter });
    const sty = stylisticPass.analyze({ text: chapterText, source_id: `${s.book}.${s.chapter}` });
    const emo = emotionalPass.analyze({ text: chapterText, source_id: `${s.book}.${s.chapter}` });
    const t = dram.templates[0];

    if (t) {
      const style = sty.patterns[0];
      const arc = emo.arcs[0];
      console.log(`[${s.label}] ${s.book} ${s.chapter}`);
      console.log(`  archetype=${t.archetype} mood=${t.mood} tension=${arc?.tension_level ?? '?'} tone=${style?.tone ?? '?'} emotions=${arc?.emotions.join(',') ?? '?'}`);
      console.log(`  tags=${t.tags.join(', ')}`);
      console.log();
    }
  }

  parser.close();
  litDB.close();

  console.log(`\nDB size: ${(await Bun.file(join(DATA_DIR, 'bible-normalized.db')).size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Lit DB: ${LIT_DB}`);
  console.log('Done!');
}

main().catch(console.error);
