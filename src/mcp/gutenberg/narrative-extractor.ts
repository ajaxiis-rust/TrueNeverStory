import type { LiteraryCompilerDB } from '../literary-compiler/schema';

interface NarrativeLLM { generateText(prompt: string): Promise<string>; }

const NARRATIVE_STRUCTURE_PROMPT = (
  title: string,
  author: string,
  excerpts: Array<{ chapter: number; text: string }>,
) => `
You are a literary analyst extracting narrative structure from a novel.

TITLE: ${title}
AUTHOR: ${author}

Excerpts from the book (${excerpts.length} evenly-spaced samples):
${excerpts.map(e => `--- Excerpt ${e.chapter} ---
${e.text.slice(0, 800)}`).join('\n\n')}

Analyze and return the following in JSON:
{
  "plot_arc": {
    "archetype": "string (e.g., quest, tragedy, comedy, rebirth, overcoming-the-monster, rags-to-riches, voyage-and-return)",
    "tension_points": ["string (key plot beats in chronological order)"]
  },
  "character_arcs": [
    {
      "character_name": "string",
      "start_state": "string (the character's initial condition)",
      "end_state": "string (the character's final condition)",
      "transformation": "string (how and why the character changed)",
      "archetype": "string (e.g., hero, mentor, trickster, shadow, herald, shapeshifter)"
    }
  ],
  "thematic_motifs": [
    {
      "name": "string (short label for the motif)",
      "symbolic_layer": "string (what the motif symbolizes)",
      "evolution": "string (how the motif develops across the narrative)"
    }
  ],
  "moral_vector": "string or null (the central moral argument or ethical stance of the work)",
  "scale": "string (epic / book / personal — the scope of the narrative)"
}

Return JSON only. No markdown.`;

export async function extractNarrativeStructure(
  litDb: LiteraryCompilerDB,
  llm: NarrativeLLM,
  book: { etextno: number; book_title: string; author: string },
  sourceBook: string,
  chunks: Array<{ text: string }>,
): Promise<void> {
  const count = Math.min(5, chunks.length);
  const step = Math.floor(chunks.length / Math.max(count, 1));
  const excerpts: Array<{ chapter: number; text: string }> = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(i * step, chunks.length - 1);
    excerpts.push({ chapter: i + 1, text: chunks[idx]!.text });
  }

  try {
    const raw = await llm.generateText(NARRATIVE_STRUCTURE_PROMPT(book.book_title, book.author, excerpts));
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const result = JSON.parse(jsonMatch[0]);

    const now = Math.floor(Date.now() / 1000);

    litDb.insertNarrativeArc({
      id: `arc-plot-${book.etextno}`,
      source_book: sourceBook,
      arc_type: 'plot_arc',
      archetype: result.plot_arc.archetype,
      tension_points: JSON.stringify(result.plot_arc.tension_points),
      transformation: null,
      thematic_motifs: JSON.stringify((result.thematic_motifs ?? []).map((m: any) => m.name)),
      moral_vector: result.moral_vector ?? null,
      scale: result.scale ?? 'book',
      quality_score: 0.7,
      created_at: now,
    });

    for (const char of (result.character_arcs || []).slice(0, 3)) {
      litDb.insertNarrativeArc({
        id: `arc-char-${book.etextno}-${char.character_name.toLowerCase().replace(/\s+/g, '-')}`,
        source_book: sourceBook,
        arc_type: 'character_arc',
        archetype: char.archetype,
        tension_points: '[]',
        transformation: char.transformation ?? null,
        thematic_motifs: '[]',
        moral_vector: null,
        scale: 'personal',
        quality_score: 0.7,
        created_at: now,
      });
    }

    for (const motif of (result.thematic_motifs || [])) {
      litDb.insertThematicMotif({
        id: `motif-${book.etextno}-${motif.name.toLowerCase().replace(/\s+/g, '-')}`,
        source_book: sourceBook,
        motif_name: motif.name,
        occurrences: '[]',
        symbolic_layer: motif.symbolic_layer ?? null,
        evolution: motif.evolution ?? null,
        created_at: now,
      });
    }
  } catch (_error) {
    // Non-fatal — pipeline continues
  }
}
