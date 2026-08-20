/**
 * Strip Gutenberg header/footer boilerplate and normalize whitespace.
 * Shared across import-gutenberg-texts, process-gutenberg, and compile-classics.
 */
export function cleanGutenbergText(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n');

  const startMarkers = [
    '*** START OF THE PROJECT GUTENBERG EBOOK',
    '*** START OF THIS PROJECT GUTENBERG EBOOK',
    '***START OF THE PROJECT GUTENBERG EBOOK',
    '*** START OF THE PROJECT GUTENBERG E-TEXT',
  ];
  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      text = text.slice(text.indexOf('\n', idx) + 1);
      break;
    }
  }

  const endMarkers = [
    '*** END OF THE PROJECT GUTENBERG EBOOK',
    '*** END OF THIS PROJECT GUTENBERG EBOOK',
    '***END OF THE PROJECT GUTENBERG EBOOK',
    '*** END OF THE PROJECT GUTENBERG E-TEXT',
  ];
  for (const marker of endMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      text = text.slice(0, idx);
      break;
    }
  }

  text = text.replace(/^.*Project Gutenberg.*$/gm, '');
  text = text.replace(/^.*This etext was prepared.*$/gm, '');
  text = text.replace(/^.*Produced by.*$/gm, '');
  text = text.replace(/^.*Transcriber's [Nn]ote.*$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n');

  // Unwrap hard line breaks inside paragraphs (Gutenberg wraps at ~80 chars).
  // Skip paragraphs where most lines are short (poetry/verse/lists).
  const WRAP_WIDTH = 60;
  const POETRY_THRESHOLD = 0.5;
  text = text.split(/\n\n/).map(para => {
    const lines = para.split('\n');
    if (lines.length < 2) return para;
    const longLines = lines.filter(l => l.length >= WRAP_WIDTH).length;
    if (longLines / lines.length < POETRY_THRESHOLD) return para;
    const merged: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trimEnd();
      if (merged.length === 0) { merged.push(line); continue; }
      const prev = merged[merged.length - 1]!;
      const next = lines[i]!;
      const prevEndsSentence = /[.!?][\]"')\u2019\u201D]?\s*$/.test(prev);
      const nextStartsLower = /^\s*[a-z]/.test(next);
      if (!prevEndsSentence || nextStartsLower) {
        merged[merged.length - 1] = prev + ' ' + line.trimStart();
      } else {
        merged.push(line);
      }
    }
    return merged.join('\n');
  }).join('\n\n');

  return text.trim();
}
