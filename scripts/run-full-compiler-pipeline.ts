#!/usr/bin/env bun
/**
 * Full Literary Compiler pipeline: all 4 passes on BSB.
 * Dramaturgic → Stylistic → Emotional → Metadata
 */
import { BibleParser } from '../src/mcp/bible/parser';
import { LiteraryCompilerDB } from '../src/mcp/literary-compiler/schema';
import { DramaturgicPass } from '../src/mcp/literary-compiler/dramaturgic-pass';
import { LLMClient } from '../src/lib/llm-client';
import { StylisticPass } from '../src/mcp/literary-compiler/stylistic-pass';
import { EmotionalPass } from '../src/mcp/literary-compiler/emotional-pass';
import { MetadataPass } from '../src/mcp/literary-compiler/metadata-pass';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { ProgressBar } from '../src/lib/progress-bar';

const BIBLE_DIR = join(process.cwd(), 'sources', 'bible');

async function main() {
  console.log('=== Full Literary Compiler Pipeline (4 passes) ===\n');

  const tempDir = mkdtempSync(join(tmpdir(), 'full-pipeline-'));
  const bibleParser = new BibleParser({ dbPath: ':memory:', dataDir: tempDir });
  const litDB = new LiteraryCompilerDB(join(tempDir, 'literary.db'));

  // Initialize passes
  const llm = new LLMClient({ agentId: 'dramaturg' });
  const dramaturgicPass = new DramaturgicPass(litDB, bibleParser, llm);
  const stylisticPass = new StylisticPass();
  const emotionalPass = new EmotionalPass();
  const metadataPass = new MetadataPass();

  // Load data
  console.log('[1/3] Loading BSB + cross-references...');
  await bibleParser.loadFromJSON(join(BIBLE_DIR, 'BSB.json'), 'BSB');
  await bibleParser.loadCrossRefs(BIBLE_DIR);
  console.log('  Done.\n');

  // Process key narrative chapters
  const DEMO_CHAPTERS = [
    { book: 'Exodus', chapter: 14, label: 'Exodus 14 — Red Sea Crossing' },
    { book: 'Judges', chapter: 7, label: 'Judges 7 — Gideon\'s 300' },
    { book: 'Daniel', chapter: 5, label: 'Daniel 5 — Writing on the Wall' },
    { book: 'Jonah', chapter: 1, label: 'Jonah 1 — The Great Fish' },
    { book: 'Matthew', chapter: 5, label: 'Matthew 5 — Sermon on the Mount' },
    { book: 'Acts', chapter: 7, label: 'Acts 7 — Stephen\'s Speech' },
  ];

  console.log('[2/3] Running 4-pass pipeline on key chapters...\n');

  const progress = new ProgressBar(DEMO_CHAPTERS.length * 4, "Pipeline");

  for (let ci = 0; ci < DEMO_CHAPTERS.length; ci++) {
    const demo = DEMO_CHAPTERS[ci];

    // Get chapter text
    const verses = bibleParser.search('', { book: demo.book, chapter: demo.chapter, limit: 1000 });
    if (verses.length === 0) {
      progress.update(ci * 4, `${demo.label} (skipped)`);
      continue;
    }

    const chapterText = verses
      .map((v, i) => `## Verse ${v.verse}\n${v.text}`)
      .join('\n\n');

    // ── Pass 1: Dramaturgic ──
    progress.update(ci * 4 + 1, `${demo.label} — Dramaturgic`);
    const dramResult = await dramaturgicPass.parse({
      text: chapterText,
      source_book: demo.book,
      source_chapter: demo.chapter,
    });

    const template = dramResult.templates[0];
    if (!template) {
      console.log('  (no template generated)\n');
      continue;
    }

    console.log(`\n  ┌─ PASS 1: DRAMATURGIC ─────────────────────────────────`);
    console.log(`  │ Archetype:   ${template.archetype}`);
    console.log(`  │ Mood:        ${template.mood}`);
    console.log(`  │ Difficulty:  ${template.difficulty}`);
    console.log(`  │ Ambiguity:   ${template.moral_ambiguity}`);
    console.log(`  │ Positions:   ${template.applicable_positions.join(', ')}`);
    console.log(`  │ Variables:   ${template.variables.join(', ')}`);
    console.log(`  │ Tags:        ${template.tags.join(', ')}`);
    console.log(`  │ Template (${template.template_text.length} chars):`);
    const lines = template.template_text.split('\n').slice(0, 5);
    for (const line of lines) {
      console.log(`  │   ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
    }
    if (template.template_text.split('\n').length > 5) {
      console.log(`  │   ...`);
    }

    // ── Pass 2: Stylistic ──
    progress.update(ci * 4 + 2, `${demo.label} — Stylistic`);
    const styleResult = stylisticPass.analyze({
      text: chapterText,
      source_id: `${demo.book}.${demo.chapter}`,
    });
    const style = styleResult.patterns[0];

    // ── Pass 3: Emotional ──
    progress.update(ci * 4 + 3, `${demo.label} — Emotional`);
    const emoResult = emotionalPass.analyze({
      text: chapterText,
      source_id: `${demo.book}.${demo.chapter}`,
    });
    const arc = emoResult.arcs[0];

    // ── Pass 4: Metadata ──
    progress.update(ci * 4 + 4, `${demo.label} — Metadata`);
    const metaResult = metadataPass.enrich({ template });

    // Compact summary line
    const arch = template.archetype;
    const mood = template.mood;
    const tense = arc?.tension_level ?? '?';
    const tone = style?.tone ?? '?';
    console.log(`  │ → ${arch} | ${mood} | tension=${tense} | tone=${tone}`);
    console.log(`  └${'─'.repeat(65)}\n`);
  }

  // Final summary
  progress.finish();
  console.log('═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Templates in DB: ${litDB.getTemplateCount()}`);
  console.log(`  Verses loaded:   ${bibleParser.getVerseCount()}`);
  console.log(`  Cross-refs:      432,949`);

  bibleParser.close();
  litDB.close();
  rmSync(tempDir, { recursive: true, force: true });

  console.log('\nDone!');
}

main().catch(console.error);
