// ─── Gutenberg Types ─────────────────────────────────────────────────────────

export interface GutenbergStyle {
  id: string;
  name: string;
  description: string;
  examples: string[];
  vocabulary: string[];
  sentencePatterns: string[];
  moodTags: string[];
  source: string;
  sourceWorkId?: string;
}

export interface GutenbergText {
  id: string;
  title: string;
  author: string;
  language: string;
  text: string;
  sourceWorkId?: string;
}

export interface GutenbergParseResult {
  textCount: number;
  styleCount: number;
}

export interface GutenbergSearchOptions {
  mood?: string;
  limit?: number;
}

// ─── Style Extraction Config ─────────────────────────────────────────────────

export interface StyleExtractionConfig {
  minSentenceLength: number;
  maxSentencePatterns: number;
  minVocabularyFrequency: number;
  delexifyNames: boolean;
  delexifyPlaces: boolean;
}
