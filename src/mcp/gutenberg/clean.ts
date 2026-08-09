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

  return text.trim();
}
