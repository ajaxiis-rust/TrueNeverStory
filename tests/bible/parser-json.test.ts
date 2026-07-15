import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { BibleParser } from '../../src/mcp/bible/parser';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

describe('BibleParser JSON loading', () => {
  let parser: BibleParser;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'bible-json-test-'));
    parser = new BibleParser({ dbPath: ':memory:', dataDir: tempDir });
  });

  afterAll(() => {
    parser.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should load from JSON file', async () => {
    const jsonPath = join(tempDir, 'test-bible.json');
    const testData = {
      translation: 'Test Bible',
      books: [
        {
          name: 'Genesis',
          chapters: [
            {
              chapter: 1,
              verses: [
                { verse: 1, text: 'In the beginning God created the heavens and the earth.' },
                { verse: 2, text: 'Now the earth was formless and void.' },
              ],
            },
          ],
        },
      ],
    };
    writeFileSync(jsonPath, JSON.stringify(testData));

    const result = await parser.loadFromJSON(jsonPath, 'test');

    expect(result.verseCount).toBe(2);
    expect(result.bookCount).toBe(1);

    const verses = parser.search('', { book: 'Genesis' });
    expect(verses.length).toBe(2);
    expect(verses[0]!.text).toContain('In the beginning');
    expect(verses[0]!.language).toBe('en');
  });

  it('should handle multiple JSON files with source priority', async () => {
    const json1 = join(tempDir, 'primary.json');
    const json2 = join(tempDir, 'secondary.json');

    writeFileSync(json1, JSON.stringify({
      translation: 'Primary',
      books: [{
        name: 'John',
        chapters: [{
          chapter: 1,
          verses: [{ verse: 1, text: 'Primary version of John 1:1' }],
        }],
      }],
    }));

    writeFileSync(json2, JSON.stringify({
      translation: 'Secondary',
      books: [{
        name: 'John',
        chapters: [{
          chapter: 1,
          verses: [
            { verse: 1, text: 'Secondary version of John 1:1' },
            { verse: 2, text: 'Secondary version of John 1:2' },
          ],
        }],
      }],
    }));

    await parser.loadFromJSON(json2, 'secondary');
    await parser.loadFromJSON(json1, 'primary');

    const verses = parser.search('', { book: 'John' });
    expect(verses.length).toBe(2);
    const john1 = verses.find(v => v.verse === 1);
    expect(john1!.text).toBe('Primary version of John 1:1');
  });
});
