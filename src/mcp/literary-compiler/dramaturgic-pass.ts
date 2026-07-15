import type { LiteraryCompilerDB } from './schema';
import type { QuestTemplate, DramaturgicInput, DramaturgicOutput } from './types';
import type { BibleParser } from '../bible/parser';
import { getLogger } from '@/utils/logger';

const logger = getLogger('DramaturgicPass');

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

export class DramaturgicPass {
  constructor(
    private db: LiteraryCompilerDB,
    private bibleParser?: BibleParser,
  ) {}

  parse(input: DramaturgicInput): DramaturgicOutput {
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

      const archetype = this.inferArchetype(input.text, input.source_book, input.source_chapter);
      const mood = this.inferMood(input.text);
      const difficulty = this.inferDifficulty(verses.length);
      const moralAmbiguity = this.inferMoralAmbiguity(input.text);
      const variables = DEFAULT_VARIABLES[archetype] ?? ['current_hero', 'obstacle'];
      const positions = DEFAULT_POSITIONS[archetype] ?? ['follower'];
      const tags = this.extractTags(input.text, archetype);
      const templateText = this.generateTemplateText(input.text, variables);

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

  private inferArchetype(text: string, book?: string, chapter?: number): string {
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
}
