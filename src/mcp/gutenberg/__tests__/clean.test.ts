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

  // ── Hard line break unwrapping ──────────────────────────────

  it('unwraps hard line breaks inside paragraphs', () => {
    const raw = 'To be, or not to be, that is the question: whether tis nobler in the mind\nto suffer the slings and arrows of outrageous fortune, or to take arms against';
    const result = cleanGutenbergText(raw);
    expect(result).toBe('To be, or not to be, that is the question: whether tis nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take arms against');
  });

  it('preserves paragraph breaks (double newline)', () => {
    const raw = 'First paragraph ends here and it is long enough to pass the threshold.\n\nSecond paragraph starts here and is also long enough to pass.';
    const result = cleanGutenbergText(raw);
    expect(result).toBe('First paragraph ends here and it is long enough to pass the threshold.\n\nSecond paragraph starts here and is also long enough to pass.');
  });

  it('unwraps multi-line prose paragraph', () => {
    const raw = 'This is a long sentence that was wrapped at eighty characters by the\nGutenberg formatting process and should be joined back together into one line.';
    const result = cleanGutenbergText(raw);
    expect(result).toBe('This is a long sentence that was wrapped at eighty characters by the Gutenberg formatting process and should be joined back together into one line.');
  });

  it('preserves blank-line-separated paragraphs while unwrapping inside', () => {
    const raw = 'First line of para one continues here and is long enough for the threshold.\n\nSecond paragraph also wraps and is long enough for the threshold too.';
    const result = cleanGutenbergText(raw);
    expect(result).toBe('First line of para one continues here and is long enough for the threshold.\n\nSecond paragraph also wraps and is long enough for the threshold too.');
  });

  it('preserves poetry (short lines are not unwrapped)', () => {
    const raw = 'Shall I compare thee to a summers day?\nThou art more lovely and more temperate:\nRough winds do shake the darling buds of May,\nAnd summers lease hath all too short a date.';
    const result = cleanGutenbergText(raw);
    expect(result).toContain('Shall I compare thee');
    expect(result).toContain('Thou art more lovely');
    expect(result.split('\n').length).toBe(4);
  });
});
