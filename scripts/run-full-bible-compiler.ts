#!/usr/bin/env bun
/**
 * Full Bible pipeline: BSB + LEB + NHEBME + cross-references → Literary Compiler
 * Shows cross-references with actual verse text from all three translations.
 */
import { BibleParser } from '../src/mcp/bible/parser';
import { LiteraryCompilerDB } from '../src/mcp/literary-compiler/schema';
import { DramaturgicPass } from '../src/mcp/literary-compiler/dramaturgic-pass';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const BIBLE_DIR = join(process.cwd(), 'sources', 'bible');
const OUTPUT_DB = join(process.cwd(), 'data', 'bible-compiler-output', 'literary-full.db');

async function main() {
  console.log('=== Full Bible Pipeline: BSB + LEB + NHEBME ===\n');

  const tempDir = mkdtempSync(join(tmpdir(), 'full-bible-'));
  const bibleParser = new BibleParser({ dbPath: ':memory:', dataDir: tempDir });
  const litDB = new LiteraryCompilerDB(OUTPUT_DB);
  const dramaturgicPass = new DramaturgicPass(litDB, bibleParser);

  // 1. Load all three translations (BSB wins for duplicates)
  console.log('[1/5] Loading translations...');
  const t0 = Date.now();

  // Load in reverse priority: NHEBME first, LEB second, BSB last (BSB wins)
  console.log('  Loading NHEBME (base layer)...');
  const nhebme = await bibleParser.loadFromJSON(join(BIBLE_DIR, 'NHEBME.json'), 'NHEBME');
  console.log(`    ${nhebme.verseCount} verses`);

  console.log('  Loading LEB (middle layer)...');
  const leb = await bibleParser.loadFromJSON(join(BIBLE_DIR, 'LEB.json'), 'LEB');
  console.log(`    ${leb.verseCount} verses`);

  console.log('  Loading BSB (top layer, wins on duplicates)...');
  const bsb = await bibleParser.loadFromJSON(join(BIBLE_DIR, 'BSB.json'), 'BSB');
  console.log(`    ${bsb.verseCount} verses`);

  const totalVerses = bibleParser.getVerseCount();
  console.log(`  Total unique verses in DB: ${totalVerses} (${Date.now() - t0}ms)`);

  // 2. Load cross-references
  console.log('\n[2/5] Loading cross-references...');
  const t1 = Date.now();
  const xrefResult = await bibleParser.loadCrossRefs(BIBLE_DIR);
  console.log(`  ${xrefResult.refCount} cross-references loaded (${Date.now() - t1}ms)`);

  // 3. Run DramaturgicPass
  console.log('\n[3/5] Running DramaturgicPass...');
  const t2 = Date.now();
  const KEY_BOOKS = [
    'Genesis', 'Exodus', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
    '1 Kings', '2 Kings', 'Daniel', 'Jonah',
    'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  ];

  let totalTemplates = 0;
  const archetypeCounts: Record<string, number> = {};

  for (const book of KEY_BOOKS) {
    const verses = bibleParser.search('', { book, limit: 10000 });
    const chapters = new Map<number, string[]>();
    for (const v of verses) {
      const existing = chapters.get(v.chapter) ?? [];
      existing.push(v.text);
      chapters.set(v.chapter, existing);
    }

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
      for (const t of result.templates) {
        archetypeCounts[t.archetype] = (archetypeCounts[t.archetype] ?? 0) + 1;
      }
    }
  }
  console.log(`  ${totalTemplates} templates generated (${Date.now() - t2}ms)`);

  // 4. Show cross-references WITH verse text
  console.log('\n[4/5] Cross-references with verse text (multi-translation):\n');

  const DEMO_VERSES = [
    { book: 'Exodus', chapter: 14, verse: 21, label: 'Exodus 14:21 (Red Sea crossing)' },
    { book: 'Daniel', chapter: 5, verse: 5, label: 'Daniel 5:5 (writing on the wall)' },
    { book: 'Judges', chapter: 7, verse: 20, label: 'Judges 7:20 (Gideon\'s trumpet)' },
    { book: 'Genesis', chapter: 1, verse: 1, label: 'Genesis 1:1 (creation)' },
  ];

  for (const d of DEMO_VERSES) {
    console.log(`--- ${d.label} ---`);
    const refs = bibleParser.getCrossRefs({ book: d.book, chapter: d.chapter, verse: d.verse, limit: 4 });

    for (const r of refs) {
      const fromVerse = bibleParser.getVerse(`${r.fromBook}.${r.fromChapter}.${r.fromVerse}`);
      const targetKey = `${r.toBook}.${r.toChapter}.${r.toVerseStart}`;
      const toVerse = bibleParser.getVerse(targetKey);

      console.log(`\n  [votes: ${r.votes}] ${r.toBook} ${r.toChapter}:${r.toVerseStart}`);

      if (fromVerse) {
        console.log(`    FROM: "${fromVerse.text.substring(0, 150)}..."`);
      }
      if (toVerse) {
        console.log(`    TO:   "${toVerse.text.substring(0, 150)}..."`);
      } else {
        console.log(`    TO:   (verse not in loaded translations)`);
      }
    }
    console.log();
  }

  // 5. Show enriched templates with cross-ref context
  console.log('[5/5] Enriched templates (archetype + cross-ref context):\n');

  const ENRICHED_DEMOS = [
    { archetype: 'escape', label: 'ESCAPE' },
    { archetype: 'political', label: 'POLITICAL' },
    { archetype: 'wisdom', label: 'WISDOM' },
    { archetype: 'rescue', label: 'RESCUE' },
  ];

  for (const demo of ENRICHED_DEMOS) {
    const templates = litDB.queryTemplates({ archetype: demo.archetype, limit: 1 });
    if (templates.length === 0) continue;
    const t = templates[0]!;

    console.log(`--- ${demo.label}: ${t.source_book} ${t.source_chapter} ---`);
    console.log(`  Mood: ${t.mood} | Difficulty: ${t.difficulty} | Ambiguity: ${t.moral_ambiguity}`);
    console.log(`  Tags: ${t.tags.join(', ')}`);
    console.log(`  Template: ${t.template_text.substring(0, 250)}...`);

    // Get cross-refs for key verses in this chapter
    const chapterVerses = bibleParser.search('', { book: t.source_book, chapter: t.source_chapter, limit: 3 });
    if (chapterVerses.length > 0) {
      const keyVerse = chapterVerses[0]!;
      const refs = bibleParser.getCrossRefs({
        book: keyVerse.book,
        chapter: keyVerse.chapter,
        verse: keyVerse.verse,
        limit: 3,
        minVotes: 3,
      });
      if (refs.length > 0) {
        console.log(`  Cross-refs from ${keyVerse.book} ${keyVerse.chapter}:${keyVerse.verse}:`);
        for (const r of refs) {
          const toVerse = bibleParser.getVerse(`${r.toBook}.${r.toChapter}.${r.toVerseStart}`);
          const snippet = toVerse ? toVerse.text.substring(0, 100) : '(not loaded)';
          console.log(`    → ${r.toBook} ${r.toChapter}:${r.toVerseStart} [${r.votes}]: "${snippet}..."`);
        }
      }
    }
    console.log();
  }

  // Archetype summary
  console.log('--- Archetype Distribution ---');
  for (const [arch, count] of Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${arch}: ${count}`);
  }

  bibleParser.close();
  litDB.close();
  rmSync(tempDir, { recursive: true, force: true });

  console.log(`\nOutput: ${OUTPUT_DB}`);
  console.log('Done!');
}

main().catch(console.error);
