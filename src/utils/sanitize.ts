/**
 * Input sanitization against prompt injection attacks.
 * Strips common injection patterns from user input before LLM processing.
 */

const INJECTION_PATTERNS = [
  // Direct instruction override
  /ignore\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|prompts?|rules?|context)/gi,
  /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/gi,
  /forget\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/gi,

  // System prompt injection
  /(?:^|\n)\s*(?:system|SYSTEM)\s*(?::|：)\s*/g,
  /\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/g,
  /<\|im_start\|>|<\|im_end\|>/g,
  /<\|system\|>|<\|user\|>|<\|assistant\|>/g,

  // Role hijacking
  /you\s+are\s+now\s+(?:a|an|the)\s+(?:different|new|admin|root|sudo)/gi,
  /act\s+as\s+(?:if\s+)?(?:you\s+are\s+)?(?:a\s+)?(?:different|new|unrestricted)/gi,
  /pretend\s+(?:you\s+are|to\s+be)\s+(?:a\s+)?(?:different|new|unrestricted)/gi,

  // Output manipulation
  /(?:output|print|reveal|show)\s+(?:the\s+)?(?:system\s+)?(?:prompt|instructions?|rules?|configuration)/gi,
  /what\s+(?:are|is)\s+your\s+(?:system\s+)?(?:prompt|instructions?|rules?)/gi,
  /repeat\s+(?:the\s+)?(?:above|previous|your)\s+(?:system\s+)?(?:prompt|instructions?)/gi,

  // DAN-style jailbreaks
  /do\s+anything\s+now|DAN\s+mode|jailbreak/gi,
  /developer\s+mode|debug\s+mode|admin\s+mode/gi,

  // Markdown/code injection
  /```[\s\S]*?(?:system|prompt|instruction)[\s\S]*?```/gi,
];

const MAX_MESSAGE_LENGTH = 8_000;

export interface SanitizeResult {
  clean: string;
  wasModified: boolean;
  patterns: string[];
}

/**
 * Sanitize user input against prompt injection.
 * Returns cleaned text and whether modifications were made.
 */
export function sanitizeInput(input: string): SanitizeResult {
  const matched: string[] = [];
  let clean = input;

  // Truncate to max length
  if (clean.length > MAX_MESSAGE_LENGTH) {
    clean = clean.slice(0, MAX_MESSAGE_LENGTH);
    matched.push("TRUNCATED");
  }

  // Check and strip injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(clean)) {
      matched.push(pattern.source.slice(0, 40));
      clean = clean.replace(pattern, "");
    }
  }

  // Collapse excessive whitespace (often used to hide injection)
  clean = clean.replace(/\n{5,}/g, "\n\n\n");

  return {
    clean: clean.trim(),
    wasModified: matched.length > 0,
    patterns: matched,
  };
}

/**
 * Wrap user content in markers to clearly separate it from system prompt.
 * This is a defense-in-depth measure.
 */
export function wrapUserContent(content: string): string {
  return `<user_message>\n${content}\n</user_message>`;
}
