import { ARCHETYPES, ARCHETYPE_KEYWORDS, type Archetype } from './archetypes';
import { type Chunk } from './chunker';

export interface DictHit {
  keyword: string;
  archetype: string;
  position: number;
}

export interface PreScoreResult {
  archetypeScores: Record<string, number>;
  dictHits: DictHit[];
  narrativeScore: number;
}

const DIALOGUE_MARKS = ['"', '"', '"', '—', '--'];
const ACTION_VERBS = [
  'fought', 'charged', 'drew', 'struck', 'ran', 'fled', 'killed',
  'attacked', 'shouted', 'yelled', 'screamed', 'threw', 'grabbed',
  'leaped', 'jumped', 'kicked', 'punched', 'swung', 'cut', 'pierced',
  'slash', 'stab', 'blow', 'strike', 'charge', 'rush', 'sprint',
];
const CONFLICT_CUES = [
  'enemy', 'battle', 'war', 'fight', 'attack', 'defend', 'weapon',
  'sword', 'shield', 'armor', 'siege', 'ambush', 'retreat', 'conquer',
  'defeat', 'victory', 'death', 'kill', 'blood', 'wound', 'destroy',
  'threat', 'danger', 'fear', 'terror', 'panic', 'desperate',
];

export function preScoreChunk(chunk: Chunk): PreScoreResult {
  const text = chunk.text.toLowerCase();

  const dictHits: DictHit[] = [];
  const archetypeMatches: Record<string, number> = {};

  for (const archetype of ARCHETYPES) {
    archetypeMatches[archetype] = 0;
    const keywords = ARCHETYPE_KEYWORDS[archetype];

    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      let searchFrom = 0;

      while (searchFrom < text.length) {
        const idx = text.indexOf(lowerKeyword, searchFrom);
        if (idx === -1) break;

        dictHits.push({ keyword, archetype, position: idx });
        archetypeMatches[archetype]++;
        searchFrom = idx + lowerKeyword.length;
      }
    }
  }

  const totalKeywords = ARCHETYPES.reduce(
    (sum, a) => sum + ARCHETYPE_KEYWORDS[a].length,
    0,
  );

  const archetypeScores: Record<string, number> = {};
  for (const archetype of ARCHETYPES) {
    const count = archetypeMatches[archetype]!;
    const total = ARCHETYPE_KEYWORDS[archetype]!.length;
    archetypeScores[archetype] = total > 0 ? count / total : 0;
  }

  // Narrative density: weighted combination of dialogue, action, and conflict
  let dialogueCount = 0;
  for (const mark of DIALOGUE_MARKS) {
    const re = new RegExp(escapeRegex(mark), 'g');
    const matches = text.match(re);
    if (matches) dialogueCount += matches.length;
  }

  let actionCount = 0;
  for (const verb of ACTION_VERBS) {
    if (text.includes(verb)) actionCount++;
  }

  let conflictCount = 0;
  for (const cue of CONFLICT_CUES) {
    if (text.includes(cue)) conflictCount++;
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length || 1;
  const dialogueDensity = Math.min(dialogueCount / wordCount, 1);
  const actionDensity = Math.min(actionCount / ACTION_VERBS.length, 1);
  const conflictDensity = Math.min(conflictCount / CONFLICT_CUES.length, 1);

  const narrativeScore = Math.min(
    dialogueDensity * 0.4 + actionDensity * 0.3 + conflictDensity * 0.3,
    1,
  );

  return { archetypeScores, dictHits, narrativeScore };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
