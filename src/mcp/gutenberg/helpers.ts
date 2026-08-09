export function inferEra(birthYear?: number, deathYear?: number): string {
  const mid = ((birthYear ?? 1800) + (deathYear ?? 1900)) / 2;
  if (mid < 1790) return '18th_century';
  if (mid < 1900) return '19th_century';
  return 'early_20th_century';
}

export function inferLiteraryPeriod(birthYear?: number, deathYear?: number): string {
  const mid = ((birthYear ?? 1800) + (deathYear ?? 1900)) / 2;
  if (mid < 1790) return 'enlightenment';
  if (mid < 1860) return 'romanticism';
  if (mid < 1900) return 'victorian';
  return 'modernism';
}

export function sampleExcerpts(text: string, count: number, length: number): string[] {
  if (text.length <= length * count) {
    const results: string[] = [];
    for (let i = 0; i < count && i * length < text.length; i++) {
      results.push(text.slice(i * length, (i + 1) * length));
    }
    return results;
  }
  const step = Math.floor((text.length - length) / Math.max(count - 1, 1));
  const excerpts: string[] = [];
  for (let i = 0; i < count; i++) {
    excerpts.push(text.slice(i * step, i * step + length));
  }
  return excerpts;
}
