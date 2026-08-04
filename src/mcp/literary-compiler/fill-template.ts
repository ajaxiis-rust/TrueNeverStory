/**
 * Deterministic placeholder replacement for skeleton templates.
 * Replaces [placeholder] patterns with values from context.
 * Unreplaced placeholders stay as-is.
 */
export function fillTemplate(
  skeleton: string,
  context: Record<string, string>,
): string {
  return skeleton.replace(/\[([a-zA-Z_][a-zA-Z0-9_]*)\]/g, (match, key) => {
    return context[key as string] ?? match;
  });
}
