// ─── Bible Types ─────────────────────────────────────────────────────────────

export interface BibleVerse {
  id: string;
  book: string;
  bookAbbr: string;
  chapter: number;
  verse: number;
  text: string;
  language: string;
  sourceTable?: string;
  sourceRowid?: number;
}

export interface BiblePattern {
  id: string;
  name: string;
  archetype: string;
  verses: string[];
  description: string;
  narrativeFunctions: string[];
  mood: string;
}

export interface BibleParseResult {
  verseCount: number;
  bookCount: number;
  books: string[];
}

export interface BibleSearchOptions {
  book?: string;
  chapter?: number;
  limit?: number;
  language?: string;
}

export interface BiblePatternFilter {
  archetype?: string;
  mood?: string;
  narrativeFunction?: string;
}

// ─── CrossRef Types ───────────────────────────────────────────────────────────

export interface CrossRef {
  id: number;
  fromBook: string;
  fromChapter: number;
  fromVerse: number;
  toBook: string;
  toChapter: number;
  toVerseStart: number;
  toVerseEnd: number;
  votes: number;
  source?: string;
}

export interface CrossRefSearchOptions {
  book?: string;
  chapter?: number;
  verse?: number;
  minVotes?: number;
  limit?: number;
}

// JSON schema types (matching scrollmapper/bible_databases format)

export interface BibleJSONVerse {
  verse: number;
  text: string;
}

export interface BibleJSONChapter {
  chapter: number;
  verses: BibleJSONVerse[];
}

export interface BibleJSONBook {
  name: string;
  chapters: BibleJSONChapter[];
}

export interface BibleJSONSchema {
  translation: string;
  books: BibleJSONBook[];
}

export interface CrossRefJSONFromVerse {
  book: string;
  chapter: number;
  verse: number;
}

export interface CrossRefJSONToVerse {
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
}

export interface CrossRefJSONEntry {
  from_verse: CrossRefJSONFromVerse;
  to_verse: CrossRefJSONToVerse[];
  votes: number;
}

export interface CrossRefJSONSchema {
  cross_references: CrossRefJSONEntry[];
}

// ─── Book Abbreviations ──────────────────────────────────────────────────────

export const BOOK_ABBREVIATIONS: Record<string, string> = {
  Genesis: 'GEN',
  Exodus: 'EXO',
  Leviticus: 'LEV',
  Numbers: 'NUM',
  Deuteronomy: 'DEU',
  Joshua: 'JOS',
  Judges: 'JDG',
  Ruth: 'RUT',
  '1 Samuel': '1SA',
  'I Samuel': '1SA',
  '2 Samuel': '2SA',
  'II Samuel': '2SA',
  '1 Kings': '1KI',
  'I Kings': '1KI',
  '2 Kings': '2KI',
  'II Kings': '2KI',
  '1 Chronicles': '1CH',
  'I Chronicles': '1CH',
  '2 Chronicles': '2CH',
  'II Chronicles': '2CH',
  Ezra: 'EZR',
  Nehemiah: 'NEH',
  Esther: 'EST',
  Job: 'JOB',
  Psalms: 'PSA',
  Proverbs: 'PRO',
  Ecclesiastes: 'ECC',
  'Song of Solomon': 'SON',
  Isaiah: 'ISA',
  Jeremiah: 'JER',
  Lamentations: 'LAM',
  Ezekiel: 'EZE',
  Daniel: 'DAN',
  Hosea: 'HOS',
  Joel: 'JOL',
  Amos: 'AMO',
  Obadiah: 'OBA',
  Jonah: 'JON',
  Micah: 'MIC',
  Nahum: 'NAH',
  Habakkuk: 'HAB',
  Zephaniah: 'ZEP',
  Haggai: 'HAG',
  Zechariah: 'ZEC',
  Malachi: 'MAL',
  Matthew: 'MAT',
  Mark: 'MAR',
  Luke: 'LUK',
  John: 'JOH',
  Acts: 'ACT',
  Romans: 'ROM',
  '1 Corinthians': '1CO',
  'I Corinthians': '1CO',
  '2 Corinthians': '2CO',
  'II Corinthians': '2CO',
  Galatians: 'GAL',
  Ephesians: 'EPH',
  Philippians: 'PHP',
  Colossians: 'COL',
  '1 Thessalonians': '1TH',
  'I Thessalonians': '1TH',
  '2 Thessalonians': '2TH',
  'II Thessalonians': '2TH',
  '1 Timothy': '1TI',
  'I Timothy': '1TI',
  '2 Timothy': '2TI',
  'II Timothy': '2TI',
  Titus: 'TIT',
  Philemon: 'PHM',
  Hebrews: 'HEB',
  James: 'JAM',
  '1 Peter': '1PE',
  'I Peter': '1PE',
  '2 Peter': '2PE',
  'II Peter': '2PE',
  '1 John': '1JO',
  'I John': '1JO',
  '2 John': '2JO',
  'II John': '2JO',
  '3 John': '3JO',
  'III John': '3JO',
  Jude: 'JUD',
  Revelation: 'REV',
  'Revelation of John': 'REV',
};
