/**
 * Template resolver — replaces {var} placeholders in agent userTemplate strings.
 */

export function resolveTemplate(
  template: string,
  vars: Record<string, string | string[] | null | undefined>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = vars[key];
    if (val === undefined || val === null) return match;
    if (Array.isArray(val)) {
      return val.length > 0 ? val.join(", ") : "None";
    }
    return String(val);
  });
}
