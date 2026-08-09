import type { LiteraryCompilerDB } from './schema';
import type { QuestTemplate, DramaturgicInput, DramaturgicOutput } from './types';
import type { BibleParser } from '../bible/parser';
import { Delexifier } from '../gutenberg/delexifier';
import { getLogger } from '@/utils/logger';

const logger = getLogger('DramaturgicPass');

export interface LLMProvider {
  generateText(prompt: string): Promise<string>;
}

interface ArchetypeCacheEntry {
  archetype: string;
  confidence: number;
}

const ARCHETYPE_KEYWORDS: Record<string, string[]> = {
  escape: ['escape', 'flee', 'cross', 'sea', 'river', 'pass through', 'deliver', 'rescue'],
  judgment: ['judge', 'judgment', 'decide', 'dispute', 'claim', 'truth', 'verdict'],
  inheritance: ['inherit', 'son', 'daughter', 'father', 'estate', 'portion', 'return'],
  wisdom: ['wisdom', 'wise', 'counsel', 'advice', 'proverb', 'teach', 'learn'],
  loyalty: ['loyal', 'follow', 'faithful', 'devoted', 'stick', 'remain', 'serve'],
  political: ['king', 'queen', 'throne', 'power', 'plot', 'secret', 'decree'],
  endurance: ['suffer', 'endure', 'patience', 'trial', 'test', 'loss', 'grief'],
  rescue: ['save', 'deliver', 'oppressed', 'enemy', 'battle', 'war', 'victory'],
  liberation: ['free', 'liberate', 'bondage', 'slavery', 'chains', 'break'],
  rise_fall_rise: ['rise', 'fall', 'exalt', 'humble', 'power', 'servant'],
};

const DEFAULT_POSITIONS: Record<string, string[]> = {
  escape: ['leader', 'follower'],
  judgment: ['judge', 'leader'],
  inheritance: ['leader', 'follower', 'heir'],
  wisdom: ['follower', 'wise_one'],
  loyalty: ['follower', 'mentor'],
  political: ['leader', 'tyrant'],
  endurance: ['follower'],
  rescue: ['leader', 'savior'],
  liberation: ['leader', 'savior', 'follower'],
  rise_fall_rise: ['leader', 'tyrant', 'follower'],
};

const DEFAULT_VARIABLES: Record<string, string[]> = {
  escape: ['current_leader', 'followers', 'current_tyrant', 'obstacle', 'intervention'],
  judgment: ['claimant_A', 'claimant_B', 'object', 'judge', 'hidden_truth'],
  inheritance: ['current_hero', 'mentor', 'share', 'wealth'],
  wisdom: ['current_hero', 'dilemma', 'mentor', 'lesson', 'path'],
  loyalty: ['current_hero', 'mentor', 'hardship', 'reward'],
  political: ['current_hero', 'plot', 'ally', 'enemy'],
  endurance: ['current_hero', 'trial', 'loss', 'choice'],
  rescue: ['current_hero', 'nation', 'oppressor', 'allies'],
  liberation: ['current_hero', 'oppressor', 'allies', 'freedom'],
  rise_fall_rise: ['current_hero', 'mentor', 'rivals', 'power'],
};

const PROSE_ARCHETYPE_KEYWORDS: Record<string, { strong: string[]; weak: string[] }> = {
  escape: {
    strong: ['flee', 'escape', 'pursuit', 'chase', 'prison', 'captive'],
    weak:   ['river', 'cross', 'border', 'wall', 'gate', 'door', 'window']
  },
  judgment: {
    strong: ['trial', 'verdict', 'court', 'judge', 'jury', 'sentence', 'condemn'],
    weak:   ['decide', 'choice', 'justice', 'guilty', 'innocent']
  },
  political: {
    strong: ['throne', 'king', 'queen', 'crown', 'usurp', 'rebellion', 'treason', 'plot'],
    weak:   ['power', 'rule', 'palace', 'court', 'council']
  },
  rescue: {
    strong: ['save', 'rescue', 'deliver', 'liberate', 'free', 'release'],
    weak:   ['help', 'aid', 'danger', 'threat', 'enemy']
  },
  endurance: {
    strong: ['endure', 'suffer', 'bear', 'survive', 'starve', 'freeze', 'torture'],
    weak:   ['pain', 'hunger', 'cold', 'weary', 'tired', 'exhausted']
  },
  loyalty: {
    strong: ['loyal', 'faithful', 'betray', 'oath', 'allegiance', 'swear'],
    weak:   ['follow', 'serve', 'master', 'lord', 'duty']
  },
  wisdom: {
    strong: ['wisdom', 'wise', 'sage', 'prophecy', 'oracle', 'riddle'],
    weak:   ['learn', 'teach', 'study', 'book', 'knowledge']
  },
  romance: {
    strong: ['love', 'marry', 'wedding', 'propose', 'engagement'],
    weak:   ['kiss', 'embrace', 'heart', 'courtship', 'suitor', 'jealous']
  },
  revenge: {
    strong: ['revenge', 'vengeance', 'avenge', 'retribution', 'vendetta'],
    weak:   ['pay back', 'settle score', 'grudge', 'hatred']
  },
  discovery: {
    strong: ['discover', 'find', 'uncover', 'reveal', 'secret', 'hidden'],
    weak:   ['search', 'explore', 'map', 'treasure', 'artifact']
  },
  inner_monologue: {
    strong: ['conscience', 'torment', 'within me', 'my soul', 'I could not', 'I wondered', 'I felt'],
    weak:   ['thought', 'mind', 'doubt', 'questioned', 'pondered', 'conscious', 'guilt']
  },
  social_microscopy: {
    strong: ['propriety', 'reputation', 'eligible', 'match', 'fortune', 'connection', 'society'],
    weak:   ['bow', 'curtsey', 'glance', 'whisper', 'compliment', 'introduction', 'ball', 'dinner']
  },
  ironic_distance: {
    strong: ['indeed', 'perhaps', 'it must be admitted', 'one might suppose', 'it is a truth', 'reader'],
    weak:   ['certainly', 'naturally', 'of course', 'surely', 'doubtless', 'evidently']
  },
  polyphony: {
    strong: ['meanwhile', 'on the other hand', 'from where he stood', 'to her mind', 'as for him'],
    weak:   ['but', 'however', 'yet', 'still', 'though', 'although']
  },
  domestic_epic: {
    strong: ['breakfast', 'kitchen', 'garden', 'household', 'ordinary', 'commonplace', 'everyday'],
    weak:   ['tea', 'dinner', 'parlour', 'drawing room', 'servant', 'maid', 'butler']
  },
  temporal_layering: {
    strong: ['remembered', 'years ago', 'in those days', 'the old times', 'used to', 'it was then'],
    weak:   ['ago', 'before', 'once', 'former', 'past', 'memory', 'childhood', 'youth']
  },
  rise_fall_rise: {
    strong: ['rise', 'fall', 'ruin', 'bankrupt', 'fortune', 'restore', 'reclaim'],
    weak:   ['success', 'failure', 'wealth', 'poverty']
  },
};

const PROSE_DEFAULT_POSITIONS: Record<string, string[]> = {
  escape: ['leader', 'follower', 'prisoner'],
  judgment: ['judge', 'lawyer', 'accused'],
  political: ['leader', 'advisor', 'spy', 'rebel'],
  rescue: ['leader', 'savior', 'captive'],
  endurance: ['survivor', 'witness'],
  loyalty: ['follower', 'knight', 'vassal'],
  wisdom: ['sage', 'student', 'seeker'],
  romance: ['lover', 'suitor', 'rival'],
  revenge: ['avenger', 'victim', 'accomplice'],
  discovery: ['explorer', 'scholar', 'guide'],
  inner_monologue: ['thinker', 'tormented_soul', 'doubter'],
  social_microscopy: ['lady', 'gentleman', 'suitor', 'chaperone', 'matchmaker'],
  ironic_distance: ['narrator', 'observer', 'satirist'],
  polyphony: ['narrator', 'character_a', 'character_b', 'chorus'],
  domestic_epic: ['householder', 'servant', 'child', 'neighbour'],
  temporal_layering: ['elder', 'youth', 'ancestor', 'witness'],
  rise_fall_rise: ['hero', 'merchant', 'noble', 'outcast'],
};

const PROSE_DEFAULT_VARIABLES: Record<string, string[]> = {
  escape: ['PROTAGONIST', 'ANTAGONIST', 'ALLY', 'OBSTACLE', 'RESOLUTION'],
  judgment: ['JUDGE', 'ACCUSED', 'WITNESS', 'EVIDENCE', 'VERDICT'],
  political: ['RULER', 'ADVISOR', 'ENEMY', 'SECRET', 'CHOICE'],
  rescue: ['CAPTIVE', 'SAVIOR', 'THREAT', 'SACRIFICE', 'DELIVERANCE'],
  endurance: ['SUFFERER', 'TRIAL', 'LOSS', 'STRENGTH', 'SURVIVAL'],
  loyalty: ['FOLLOWER', 'LORD', 'BETRAYAL', 'TEST', 'REWARD'],
  wisdom: ['SEEKER', 'MENTOR', 'RIDDLE', 'KNOWLEDGE', 'CONSEQUENCE'],
  romance: ['LOVER', 'RIVAL', 'OBSTACLE', 'CHOICE', 'RESOLUTION'],
  revenge: ['AVENGER', 'VICTIM', 'GRUDGE', 'PLAN', 'CONSEQUENCE'],
  discovery: ['EXPLORER', 'SECRET', 'CLUE', 'DANGER', 'REVELATION'],
  inner_monologue: ['THINKER', 'CONSCIENCE', 'DOUBT', 'RESOLUTION'],
  social_microscopy: ['LADY', 'GENTLEMAN', 'SUITOR', 'FORTUNE', 'REPUTATION'],
  ironic_distance: ['NARRATOR', 'OBSERVER', 'CLAIM', 'CONTRADICTION'],
  polyphony: ['VOICE_A', 'VOICE_B', 'CONFLICT', 'SYNTHESIS'],
  domestic_epic: ['HOUSEHOLDER', 'SERVANT', 'RITUAL', 'CHANGE'],
  temporal_layering: ['ELDER', 'YOUTH', 'MEMORY', 'PRESENT', 'FUTURE'],
  rise_fall_rise: ['HERO', 'FORTUNE', 'RIVALS', 'DOWNFALL', 'RESTORATION'],
};

export class DramaturgicPass {
  private _llmCache: Map<string, ArchetypeCacheEntry> = new Map();
  private delexifier = new Delexifier();

  constructor(
    private db: LiteraryCompilerDB,
    private bibleParser?: BibleParser,
    private llm?: LLMProvider,
  ) {
    this._loadCacheFromDB();
  }

  private _loadCacheFromDB(): void {
    try {
      const rows = this.db.getArchetypeCache?.() ?? [];
      for (const row of rows) {
        this._llmCache.set(row.cache_key, { archetype: row.archetype, confidence: row.confidence });
      }
      logger.info(`Loaded ${this._llmCache.size} archetype cache entries`);
    } catch {
      // Cache table may not exist yet
    }
  }

  async parse(input: DramaturgicInput): Promise<DramaturgicOutput> {
    const templates: QuestTemplate[] = [];
    const errors: string[] = [];

    if (!input.text.trim()) {
      return { templates, errors };
    }

    try {
      const verses = this.extractVerses(input.text);

      if (verses.length === 0) {
        return { templates, errors };
      }

      const mode = input.mode ?? 'bible';
      const archetype = mode === 'prose'
        ? this._inferArchetypeProse(input.text)
        : await this.inferArchetype(input.text, input.source_book, input.source_chapter);
      const mood = this.inferMood(input.text);
      const difficulty = this.inferDifficulty(verses.length);
      const moralAmbiguity = this.inferMoralAmbiguity(input.text);
      const variables = mode === 'prose'
        ? (PROSE_DEFAULT_VARIABLES[archetype] ?? ['PROTAGONIST', 'CONFLICT'])
        : (DEFAULT_VARIABLES[archetype] ?? ['current_hero', 'obstacle']);
      const positions = mode === 'prose'
        ? (PROSE_DEFAULT_POSITIONS[archetype] ?? ['follower'])
        : (DEFAULT_POSITIONS[archetype] ?? ['follower']);
      let templateText: string;
      let devices: string[] = [];
      if (mode === 'prose') {
        const result = this.generateProseTemplate(input.text);
        templateText = result.template;
        devices = result.devices;
      } else {
        templateText = this.generateTemplateText(input.text, variables);
      }
      const tags = mode === 'prose'
        ? [...this.extractTags(input.text, archetype), ...devices]
        : this.extractTags(input.text, archetype);

      const template: QuestTemplate = {
        id: `${input.source_book}.${input.source_chapter}`,
        source_book: input.source_book,
        source_chapter: input.source_chapter,
        archetype,
        applicable_positions: positions,
        variables,
        template_text: templateText,
        mood,
        difficulty,
        moral_ambiguity: moralAmbiguity,
        tags,
        created_at: Math.floor(Date.now() / 1000),
      };

      templates.push(template);
      this.db.insertTemplate(template);

      logger.info(`Parsed ${input.source_book}.${input.source_chapter}: archetype=${archetype}, mood=${mood}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to parse ${input.source_book}.${input.source_chapter}: ${msg}`);
      logger.error(`Dramaturgic pass error: ${msg}`);
    }

    return { templates, errors };
  }

  private extractVerses(text: string): string[] {
    const verseRegex = /##\s*Verse\s+\d+\s*\n([\s\S]*?)(?=##\s*Verse\s+\d+|\n#|$)/gi;
    const verses: string[] = [];
    let match;

    while ((match = verseRegex.exec(text)) !== null) {
      const verse = match[1]?.trim();
      if (verse && verse.length > 10) {
        verses.push(verse);
      }
    }

    if (verses.length === 0) {
      const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
      verses.push(...paragraphs);
    }

    return verses;
  }

  private async inferArchetype(text: string, book?: string, chapter?: number): Promise<string> {
    // Try LLM first if available
    if (this.llm) {
      try {
        const llmResult = await this._inferArchetypeLLM(text, book, chapter);
        if (llmResult) return llmResult;
      } catch (err) {
        logger.warn(`LLM archetype inference failed, falling back to keywords: ${err}`);
      }
    }
    return this._inferArchetypeKeywords(text, book, chapter);
  }

  private async _inferArchetypeLLM(text: string, book?: string, chapter?: number): Promise<string | null> {
    const cacheKey = `${book ?? 'unknown'}.${chapter ?? 0}`;

    // Check cache first
    const cached = this._llmCache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for ${cacheKey}: ${cached.archetype}`);
      return cached.archetype;
    }

    const truncated = text.slice(0, 2000);
    const archetypeList = Object.keys(ARCHETYPE_KEYWORDS).join(', ');

    const prompt = `Classify this Bible passage into exactly ONE archetype.
Valid archetypes: ${archetypeList}, everyday_life

Passage (${book} ${chapter}):
${truncated}

Respond with ONLY the archetype name (lowercase, underscore). Nothing else.`;

    const result = await this.llm!.generateText(prompt);
    const cleaned = result.trim().toLowerCase().replace(/[^a-z_]/g, '');

    if (ARCHETYPE_KEYWORDS[cleaned] || cleaned === 'everyday_life') {
      // Cache the result
      this._llmCache.set(cacheKey, { archetype: cleaned, confidence: 1.0 });
      this.db.insertArchetypeCache?.(cacheKey, cleaned, 1.0);
      logger.info(`LLM archetype for ${cacheKey}: ${cleaned}`);
      return cleaned;
    }

    logger.warn(`LLM returned invalid archetype "${cleaned}" for ${cacheKey}`);
    return null;
  }

  private _inferArchetypeKeywords(text: string, book?: string, chapter?: number): string {
    const lowerText = text.toLowerCase();
    const scores: Record<string, number> = {};

    for (const [archetype, keywords] of Object.entries(ARCHETYPE_KEYWORDS)) {
      scores[archetype] = 0;
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          scores[archetype]++;
        }
      }
    }

    // Boost scores from cross-references
    if (book && chapter) {
      const hints = this.getCrossRefArchetypeHint(book, chapter);
      for (const [archetype, hintScore] of Object.entries(hints)) {
        scores[archetype] = (scores[archetype] ?? 0) + hintScore * 0.5;
      }
    }

    let maxScore = 0;
    let inferredArchetype = 'everyday_life';

    for (const [archetype, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        inferredArchetype = archetype;
      }
    }

    return inferredArchetype;
  }

  private getCrossRefArchetypeHint(book: string, chapter: number): Record<string, number> {
    if (!this.bibleParser) return {};

    const hints: Record<string, number> = {};
    const refs = this.bibleParser.getRelatedVerses(book, chapter, 1, 1);

    for (const ref of refs) {
      const verse = this.bibleParser.getVerse(`${ref.toBook}.${ref.toChapter}.${ref.toVerseStart}`);
      if (!verse) continue;

      const lowerText = verse.text.toLowerCase();
      for (const [archetype, keywords] of Object.entries(ARCHETYPE_KEYWORDS)) {
        for (const keyword of keywords) {
          if (lowerText.includes(keyword)) {
            hints[archetype] = (hints[archetype] ?? 0) + 1;
          }
        }
      }
    }

    return hints;
  }

  private inferMood(text: string): string {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('dark') || lowerText.includes('death') || lowerText.includes('destroy')) {
      return 'dark';
    }
    if (lowerText.includes('hope') || lowerText.includes('save') || lowerText.includes('deliver')) {
      return 'hopeful';
    }
    if (lowerText.includes('battle') || lowerText.includes('war') || lowerText.includes('enemy')) {
      return 'tense';
    }
    if (lowerText.includes('epic') || lowerText.includes('great') || lowerText.includes('mighty')) {
      return 'epic';
    }

    return 'neutral';
  }

  private inferDifficulty(verseCount: number): string {
    if (verseCount <= 5) return 'low';
    if (verseCount <= 15) return 'medium';
    return 'high';
  }

  private inferMoralAmbiguity(text: string): number {
    const lowerText = text.toLowerCase();
    let score = 0.3;

    if (lowerText.includes('kill') || lowerText.includes('murder')) score += 0.2;
    if (lowerText.includes('lie') || lowerText.includes('deceive')) score += 0.15;
    if (lowerText.includes('steal') || lowerText.includes('theft')) score += 0.1;
    if (lowerText.includes('war') || lowerText.includes('battle')) score += 0.1;

    if (lowerText.includes('love') || lowerText.includes('kindness')) score -= 0.1;
    if (lowerText.includes('help') || lowerText.includes('serve')) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  private extractTags(text: string, archetype: string): string[] {
    const tags = [archetype];
    const lowerText = text.toLowerCase();

    if (lowerText.includes('water') || lowerText.includes('sea') || lowerText.includes('river')) {
      tags.push('water');
    }
    if (lowerText.includes('mountain') || lowerText.includes('hill')) {
      tags.push('landscape');
    }
    if (lowerText.includes('family') || lowerText.includes('son') || lowerText.includes('daughter')) {
      tags.push('family');
    }
    if (lowerText.includes('king') || lowerText.includes('queen') || lowerText.includes('throne')) {
      tags.push('royalty');
    }
    if (lowerText.includes('battle') || lowerText.includes('war')) {
      tags.push('conflict');
    }
    if (lowerText.includes('miracle') || lowerText.includes('sign')) {
      tags.push('miracle');
    }

    return [...new Set(tags)];
  }

  private generateTemplateText(text: string, variables: string[]): string {
    const sentences = text
      .replace(/##\s*Verse\s+\d+\s*\n/gi, '')
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);

    if (sentences.length === 0) {
      return `[${variables[0] ?? 'current_hero'}] faces a challenge.`;
    }

    const templateParts = sentences.slice(0, 3).map((sentence, i) => {
      const varName = variables[i % variables.length] ?? 'current_hero';
      return sentence.replace(/\b(the hero|he|she|they|Moses|Aaron)\b/gi, `[${varName}]`);
    });

    return templateParts.join('. ') + '.';
  }

  private generateProseTemplate(text: string): { template: string; devices: string[] } {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (sentences.length === 0) {
      return { template: 'The [PROTAGONIST] faces [CONFLICT] at the [LOCATION].', devices: [] };
    }
    const scored = sentences.map((s, i) => {
      const lower = s.toLowerCase();
      const sensory = ['saw','heard','felt','smelled','tasted','bright','dark','cold','warm','silence']
        .filter(k => lower.includes(k)).length;
      const emotion = ['fear','love','hate','anger','joy','sad','grief','hope','despair']
        .filter(k => lower.includes(k)).length;
      return { s, i, score: sensory + emotion * 1.5 };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0]!;
    const neighbors = [best];
    if (best.i > 0) neighbors.unshift({ s: sentences[best.i - 1]!, i: best.i - 1, score: 0 });
    if (best.i < sentences.length - 1) neighbors.push({ s: sentences[best.i + 1]!, i: best.i + 1, score: 0 });
    let template = neighbors.map(n => n.s.trim()).join('. ') + '.';
    const devices: string[] = [];
    if (/(.+),\s*\1/i.test(template)) devices.push('anaphora');
    if (/(.+);\s*(.+);\s*(.+)/.test(template)) devices.push('tricolon');
    if (/not\s+\w+,\s+but\s+\w+/.test(template)) devices.push('antithesis');
    if (/\b(O\s+|alas|ah|how\s+\w+)\b/i.test(template)) devices.push('exclamation');
    if (/\b(reader|you|we)\b/i.test(template.toLowerCase())) devices.push('direct_address');
    template = this.delexifier.delexify(template);
    if (!/\[.*?\]/.test(template)) {
      template = 'The [PROTAGONIST] enters the [LOCATION], where [CONFLICT] unfolds as [ALLY] reveals [SECRET].';
    }
    return { template, devices };
  }

  private _inferArchetypeProse(text: string): string {
    const lowerText = text.toLowerCase();
    const scores: Record<string, number> = {};
    for (const [archetype, keywords] of Object.entries(PROSE_ARCHETYPE_KEYWORDS)) {
      scores[archetype] = 0;
      for (const kw of keywords.strong) { if (lowerText.includes(kw)) scores[archetype] += 2; }
      for (const kw of keywords.weak) { if (lowerText.includes(kw)) scores[archetype] += 1; }
    }
    let maxScore = 0;
    let inferred = 'everyday_life';
    for (const [archetype, score] of Object.entries(scores)) {
      if (score >= 2 && score > maxScore) { maxScore = score; inferred = archetype; }
    }
    return inferred;
  }
}
