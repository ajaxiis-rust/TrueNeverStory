export interface ChunkAnalysis {
  pre_score: number;
  dict_hits: string[];
  scene_type: string;
  tempo: string;
  sensory_tags: string[];
  narrative_distance: number;
  temporal_markers: string[];
}

interface ChunkLike {
  scene_type: string;
  [key: string]: unknown;
}

interface SceneCluster {
  scene_type: string;
  chunks: ChunkLike[];
}

const SCENE_TYPE_KEYWORDS: Record<string, string[]> = {
  battle_scene: ['sword', 'struck', 'shield', 'blood', 'warrior', 'battle', 'raged', 'spear', 'enemy', 'fight', 'combat', 'weapon', 'attack', 'army', 'war', 'knight', 'slash', 'axe', 'clash', 'arrow', 'fortress', 'siege', 'stab', 'wound'],
  love_scene: ['kiss', 'kissed', 'tender', 'tenderly', 'embrace', 'gentle', 'heart', 'hearts', 'beating', 'love', 'passion', 'desire', 'lover', 'romance', 'affection', 'beloved', 'adore', 'devotion'],
  nature_scene: ['forest', 'tree', 'river', 'mountain', 'sky', 'flower', 'bird', 'sun', 'moon', 'ocean', 'stream', 'leaf', 'meadow', 'valley', 'garden', 'field', 'rain', 'cloud', 'storm', 'breeze', 'hill'],
  introspection: ['thought', 'felt', 'wonder', 'reflect', 'ponder', 'contemplate', 'muse', 'memory', 'remembered', 'conscience', 'soul', 'mind', 'realize', 'understood', 'regret'],
  travel_scene: ['journey', 'travel', 'road', 'path', 'walked', 'ride', 'horse', 'carriage', 'ship', 'sail', 'marched', 'trek', 'wander', 'voyage', 'crossed', 'distance'],
  ritual_scene: ['ritual', 'ceremony', 'prayer', 'sacred', 'temple', 'altar', 'offering', 'rite', 'blessing', 'holy', 'divine', 'chant', 'incense', 'priest'],
  death_scene: ['death', 'die', 'grave', 'mourn', 'funeral', 'corpse', 'tomb', 'buried', 'lament', 'grief', 'sorrow', 'mourning', 'dead'],
  chase_scene: ['chase', 'pursued', 'fled', 'escape', 'ran', 'hunted', 'pursuit', 'flight', 'dash', 'sprinted', 'sped', 'rush', 'quarry'],
};

const SENSORY_KEYWORDS: Record<string, string[]> = {
  sight: ['saw', 'see', 'look', 'bright', 'light', 'color', 'glimpse', 'watch', 'beheld', 'gaze', 'stare', 'vision', 'visible'],
  sound: ['heard', 'hear', 'thunder', 'whisper', 'loud', 'noise', 'echo', 'song', 'cry', 'voice', 'ring', 'silence'],
  touch: ['felt', 'feel', 'cold', 'warm', 'rough', 'smooth', 'soft', 'hard', 'grasp', 'held', 'press'],
  smell: ['smell', 'scent', 'odor', 'fragrance', 'perfume', 'aroma', 'stench', 'reek'],
  taste: ['taste', 'sweet', 'bitter', 'sour', 'flavor', 'savored', 'salt'],
  kinaesthetic: ['move', 'motion', 'sway', 'swing', 'dance', 'gesture', 'twist', 'spin', 'rush', 'fall'],
  temperature: ['cold', 'warm', 'hot', 'heat', 'chill', 'froze', 'freeze', 'cool', 'burning'],
  chiaroscuro: ['shadow', 'dark', 'shade', 'gloom', 'dim', 'flicker', 'bright', 'light'],
  silence: ['silence', 'quiet', 'still', 'hush', 'mute', 'soundless'],
  temporal: ['time', 'moment', 'hour', 'day', 'night', 'past', 'never', 'always', 'soon', 'later'],
};

const TEMPORAL_MARKERS: Record<string, string[]> = {
  flashback: ['remembered', 'ago', 'once', 'memories', 'recall', 'reminisce', 'past', 'before,', 'years ago', 'had been', 'was a'],
  flashforward: ['will', 'shall', 'foresee', 'prophecy', 'destiny', 'one day', 'future', 'someday'],
  simultaneity: ['while', 'meanwhile', 'simultaneous', 'at once'],
  timelessness: ['always', 'never', 'eternal', 'forever', 'timeless', 'everlasting', 'infinite'],
};

const INNER_MARKERS = new Set(['i', 'me', 'my', 'mine', 'myself', 'thought', 'felt']);
const PRONOUN_MARKERS = new Set([
  'i', 'me', 'my', 'mine', 'myself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'they', 'them', 'their', 'theirs', 'themselves',
  'it', 'its', 'itself',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

function countMatches(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw));
}

function quotedRatio(text: string): number {
  let inQuote = false;
  let quotedChars = 0;
  for (const ch of text) {
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) quotedChars++;
  }
  return quotedChars / Math.max(1, text.length);
}

function firstPersonRatio(words: string[]): number {
  const firstPerson = words.filter((w) => ['i', 'me', 'my', 'mine', 'myself'].includes(w)).length;
  return firstPerson / Math.max(1, words.length);
}

function computeTempo(text: string): string {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length < 2) return 'medium';
  const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev > 12) return 'fast';
  if (stdDev < 5) return 'slow';
  return 'medium';
}

function computeNarrativeDistance(words: string[]): number {
  let innerCount = 0;
  let pronounCount = 0;
  for (const w of words) {
    if (INNER_MARKERS.has(w)) innerCount++;
    if (PRONOUN_MARKERS.has(w)) pronounCount++;
  }
  if (pronounCount === 0) return 0;
  return innerCount / pronounCount;
}

export function analyzeChunk(text: string): ChunkAnalysis {
  const lower = text.toLowerCase();
  const words = tokenize(text);
  const qr = quotedRatio(text);

  // Scene type: count keyword hits per type
  const hitCounts: [string, number][] = Object.entries(SCENE_TYPE_KEYWORDS).map(([type, keywords]) => {
    const hits = countMatches(text, keywords);
    return [type, hits.length] as [string, number];
  });
  hitCounts.sort((a, b) => b[1] - a[1]);
  const [topType, topHits] = hitCounts[0];

  // Collect dict_hits from the winning type
  const dict_hits = topHits > 0 ? countMatches(text, SCENE_TYPE_KEYWORDS[topType]) : [];

  // Scene classification with fallback
  let scene_type: string;
  if (qr > 0.4) {
    scene_type = 'dialogue_scene';
  } else if (topHits > 0 && topType !== 'travel_scene' && topType !== 'introspection') {
    scene_type = topType;
  } else if (topType === 'introspection' && topHits > 0) {
    scene_type = 'introspection';
  } else if (firstPersonRatio(words) > 0.01) {
    scene_type = 'introspection';
  } else {
    scene_type = 'travel_scene';
  }

  // Sensory tags
  const sensory_tags: string[] = [];
  for (const [tag, keywords] of Object.entries(SENSORY_KEYWORDS)) {
    const matches = countMatches(text, keywords);
    if (matches.length > 0) sensory_tags.push(tag);
  }

  // Tempo
  const tempo = computeTempo(text);

  // Narrative distance
  const narrative_distance = computeNarrativeDistance(words);

  // Temporal markers
  const temporal_markers: string[] = [];
  for (const [marker, keywords] of Object.entries(TEMPORAL_MARKERS)) {
    const matches = countMatches(text, keywords);
    if (matches.length > 0) temporal_markers.push(marker);
  }

  // Pre-score
  const typeScore = Math.min(1, topHits / 10);
  const sensoryDiversity = sensory_tags.length / Object.keys(SENSORY_KEYWORDS).length;
  const dialogueBonus = qr > 0.1 ? 0.1 : 0;
  const pre_score = Math.min(1, typeScore * 0.4 + sensoryDiversity * 0.3 + dialogueBonus + 0.1);

  return { pre_score, dict_hits, scene_type, tempo, sensory_tags, narrative_distance, temporal_markers };
}

export function clusterBySceneType(chunks: ChunkLike[]): SceneCluster[] {
  const groups = new Map<string, ChunkLike[]>();
  for (const chunk of chunks) {
    const key = chunk.scene_type;
    const existing = groups.get(key);
    if (existing) {
      existing.push(chunk);
    } else {
      groups.set(key, [chunk]);
    }
  }
  return [...groups.entries()].map(([scene_type, chunks]) => ({ scene_type, chunks }));
}
