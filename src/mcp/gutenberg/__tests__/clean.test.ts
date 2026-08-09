import { describe, it, expect } from 'bun:test';
import { cleanGutenbergText } from '../clean';

describe('cleanGutenbergText', () => {
  it('removes standard START/END markers', () => {
    const raw = `Header junk
*** START OF THE PROJECT GUTENBERG EBOOK ***
Real content here.
*** END OF THE PROJECT GUTENBERG EBOOK ***
Footer junk`;
    const result = cleanGutenbergText(raw);
    expect(result).toContain('Real content here.');
    expect(result).not.toContain('START OF');
    expect(result).not.toContain('END OF');
    expect(result).not.toContain('Header junk');
    expect(result).not.toContain('Footer junk');
  });

  it('removes variant START markers', () => {
    const raw = `*** START OF THIS PROJECT GUTENBERG EBOOK ***
Content
*** END OF THIS PROJECT GUTENBERG EBOOK ***`;
    const result = cleanGutenbergText(raw);
    expect(result).toBe('Content');
  });

  it('removes "Produced by" and "Transcriber\'s Note" lines', () => {
    const raw = `*** START OF THE PROJECT GUTENBERG EBOOK ***
Produced by John Doe
Transcriber's Note: fixed typos
Actual text.
*** END OF THE PROJECT GUTENBERG EBOOK ***`;
    const result = cleanGutenbergText(raw);
    expect(result).not.toContain('Produced by');
    expect(result).not.toContain('Transcriber');
    expect(result).toContain('Actual text.');
  });

  it('normalizes CRLF to LF', () => {
    const raw = 'line1\r\nline2\r\nline3';
    const result = cleanGutenbergText(raw);
    expect(result).not.toContain('\r');
  });

  it('collapses triple+ newlines to double', () => {
    const raw = 'a\n\n\n\n\nb';
    const result = cleanGutenbergText(raw);
    expect(result).toBe('a\n\nb');
  });

  it('trims whitespace', () => {
    const raw = '   content   ';
    const result = cleanGutenbergText(raw);
    expect(result).toBe('content');
  });

  it('handles text without markers (returns trimmed)', () => {
    const raw = 'Just plain text without markers.';
    const result = cleanGutenbergText(raw);
    expect(result).toBe('Just plain text without markers.');
  });
});
