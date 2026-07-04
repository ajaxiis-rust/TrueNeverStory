/**
 * JSON parse + retry logic for LLM responses.
 *
 * When the LLM returns non-JSON text, retries with a stricter prompt
 * instead of immediately throwing.
 */

/**
 * Try to parse JSON from LLM text output.
 * Handles: direct JSON, markdown code-fenced JSON, and retry with stricter prompt.
 *
 * @param text - Raw LLM text output from first attempt
 * @param generateText - Function to re-prompt the LLM on retry
 * @param basePrompt - The original prompt sent to the LLM
 * @param maxRetries - Maximum retry attempts (default 2)
 * @returns Parsed JSON object
 * @throws Error if JSON cannot be parsed after all retries
 */
export async function parseJsonWithRetry(
  text: string,
  generateText: (prompt: string) => Promise<string>,
  basePrompt: string,
  maxRetries = 2,
): Promise<Record<string, unknown>> {
  // Helper: try to parse JSON from text, handling code fences
  function tryParse(t: string): Record<string, unknown> | null {
    try {
      return JSON.parse(t) as Record<string, unknown>;
    } catch {
      const match = t.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match?.[1]) {
        try {
          return JSON.parse(match[1].trim()) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  // Attempt 1: try the raw text from first LLM call
  const firstResult = tryParse(text);
  if (firstResult) return firstResult;

  // Retry: re-prompt with stricter instructions
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const retryPrompt = `${basePrompt}\n\nCRITICAL: You MUST respond with ONLY a valid JSON object. No text, no explanation, no markdown fences. Just the raw JSON.`;
    const retryText = await generateText(retryPrompt);
    const result = tryParse(retryText);
    if (result) return result;
  }

  throw new Error("Failed to parse JSON from LLM after retries");
}
