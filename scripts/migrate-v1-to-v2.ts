import { LiteraryCompilerDB } from '../src/mcp/literary-compiler/schema';
import { isValidArchetype, type Archetype } from '../src/mcp/literary-compiler/archetypes';

const MIGRATION_MAP: Record<string, Archetype> = {
  'escape': 'escape_liberation',
  'liberation': 'escape_liberation',
  'judgment': 'judgment_trial',
  'political': 'political_intrigue',
  'inheritance': 'inheritance_return',
  'wisdom': 'wisdom_counsel',
  'loyalty': 'loyalty',
  'endurance': 'endurance_suffering',
  'rescue': 'rescue',
  'rise_fall_rise': 'rise_fall_rise',
};

function migrateArchetype(oldArchetype: string): Archetype {
  return MIGRATION_MAP[oldArchetype] ?? oldArchetype as Archetype;
}

async function main() {
  const dbPath = process.argv[2] ?? 'data/bible-compiler-output/literary.db';
  console.log(`Migrating ${dbPath} from v1 to v2...`);

  const db = new LiteraryCompilerDB(dbPath);
  db.createV2Tables();

  // Read existing bible_quest_templates
  const templates = db.db.prepare(
    'SELECT * FROM bible_quest_templates'
  ).all() as Array<Record<string, unknown>>;

  console.log(`Found ${templates.length} existing templates`);

  let migrated = 0;
  let skipped = 0;

  for (const t of templates) {
    const archetype = migrateArchetype(t.archetype as string);

    if (!isValidArchetype(archetype)) {
      console.warn(`Skipping template ${t.id}: invalid archetype ${t.archetype}`);
      skipped++;
      continue;
    }

    // Simple skeleton extraction: first 120 tokens worth of text
    const text = (t.template_text as string ?? '').slice(0, 480); // ~120 tokens
    const variables = t.variables ? JSON.parse(t.variables as string) : [];
    const positions = t.applicable_positions ? JSON.parse(t.applicable_positions as string) : [];

    db.db.prepare(`
      INSERT OR IGNORE INTO scene_templates
      (id, archetype_primary, template_text, variables, applicable_positions,
       mood, source_book, quality_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `v2-${t.id}`,
      archetype,
      text,
      JSON.stringify(variables),
      JSON.stringify(positions),
      t.mood ?? null,
      t.source_book ?? null,
      t.quality_score ?? 0.5,
    );

    migrated++;
  }

  console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped`);
}

main().catch(console.error);
