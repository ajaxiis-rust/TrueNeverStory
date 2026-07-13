import { BaseAgentV2, AgentOutput, NarrativePattern } from '../agent-v2';
import { Intent } from '@/models/intent';
import { SimulationResult } from '@/models/simulation';
import { GameContext } from '@/services/context-builder';
import { LLMQueue } from '@/lib/llm-queue';
import { getLogger } from '@/utils/logger';

const logger = getLogger('CensorAgent');

// ─── AI Clichés to Remove ────────────────────────────────────────────────────

const AI_CLICHES = [
  // Overused words
  /\b(delved|tapestry|rich tapestry|weave|woven|palpable|visceral|ethereal)\b/gi,
  /\b(symphphony|cacophony|embrace|emerging|unfold|unfolding|reveal|revealing)\b/gi,
  /\b(meticulous|nuanced|profound|poignant|resonate|resonating|interplay)\b/gi,
  /\b(it'?s worth noting|it is worth noting|it goes without saying|needless to say)\b/gi,
  /\b(shifting sands|turning point|new chapter|sense of|air of)\b/gi,

  // Filler phrases
  /\b(in the realm of|at the end of the day|when it comes to|in terms of)\b/gi,
  /\b(on a deeper level|on a fundamental level|on a primal level)\b/gi,
  /\b(the very fabric of|the very nature of|the very essence of)\b/gi,

  // Repetitive structures
  /\b(suddenly,?\s*as if|it was as if|it felt as if)\b/gi,
  /\b(a sense of|an air of|a feeling of)\b/gi,
];

// ─── Anachronism Patterns ────────────────────────────────────────────────────

const ANACHRONISMS = [
  /\b(internet|website|email|phone|computer|software|technology|digital|online)\b/gi,
  /\b(car|automobile|airplane|television|radio|camera)\b/gi,
  /\b(dollar|euro|currency|stock market|investment)\b/gi,
  /\b(doctor|professor|scientist|engineer|programmer)\b/gi,
];

// ─── Censor Agent ────────────────────────────────────────────────────────────

export class CensorAgent extends BaseAgentV2 {
  readonly id = 'censor' as const;
  readonly name = 'Censor';
  readonly description = 'Removes AI clichés and enforces style consistency';
  readonly mcpTools = [];

  constructor(private llmQueue: LLMQueue) {
    super();
  }

  async process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput> {
    // This agent receives text from Stylist and cleans it
    // The text should be passed via metadata
    return {};
  }

  /**
   * Clean prose text by removing AI clichés and fixing issues.
   */
  async review(text: string, context: GameContext): Promise<string> {
    if (!text || text.length === 0) return text;

    let cleaned = text;

    // Step 1: Remove AI clichés via regex
    cleaned = this.removeCliches(cleaned);

    // Step 2: Fix anachronisms
    cleaned = this.fixAnachronisms(cleaned, context);

    // Step 3: LLM-based polish (for complex issues)
    cleaned = await this.llmPolish(cleaned, context);

    return cleaned;
  }

  private removeCliches(text: string): string {
    let cleaned = text;

    for (const pattern of AI_CLICHES) {
      cleaned = cleaned.replace(pattern, (match) => {
        // Replace with simpler alternatives
        const alternatives: Record<string, string> = {
          'delved': 'explored',
          'tapestry': 'mix',
          'rich tapestry': 'mix',
          'weave': 'blend',
          'woven': 'blended',
          'palpable': 'strong',
          'visceral': 'raw',
          'ethereal': 'airy',
          'symphphony': 'mix',
          'cacophony': 'noise',
          'embrace': 'accept',
          'emerging': 'appearing',
          'unfold': 'happen',
          'unfolding': 'happening',
          'reveal': 'show',
          'revealing': 'showing',
          'meticulous': 'careful',
          'nuanced': 'subtle',
          'profound': 'deep',
          'poignant': 'moving',
          'resonate': 'connect',
          'resonating': 'connecting',
          'interplay': 'interaction',
          "it's worth noting": '',
          'it is worth noting': '',
          'it goes without saying': '',
          'needless to say': '',
          'shifting sands': 'change',
          'turning point': 'change',
          'new chapter': 'next part',
          'sense of': 'feeling of',
          'air of': 'feeling of',
          'in the realm of': 'in',
          'at the end of the day': 'ultimately',
          'when it comes to': 'for',
          'in terms of': 'for',
          'on a deeper level': 'deeply',
          'on a fundamental level': 'fundamentally',
          'on a primal level': 'primitively',
          'the very fabric of': 'the',
          'the very nature of': 'the',
          'the very essence of': 'the',
        };

        const lower = match.toLowerCase();
        return alternatives[lower] ?? match;
      });
    }

    // Remove empty lines left by removed phrases
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');

    return cleaned;
  }

  private fixAnachronisms(text: string, context: GameContext): string {
    let cleaned = text;

    // Get world-appropriate replacements
    const world = context.world;
    const replacements = this.getWorldReplacements(world);

    for (const pattern of ANACHRONISMS) {
      cleaned = cleaned.replace(pattern, (match) => {
        const lower = match.toLowerCase();
        return replacements[lower] ?? match;
      });
    }

    return cleaned;
  }

  private getWorldReplacements(world: { name: string; rules: Record<string, unknown> }): Record<string, string> {
    // Default fantasy replacements
    return {
      'internet': 'messenger network',
      'website': 'notice board',
      'email': 'letter',
      'phone': 'signal',
      'computer': 'thinking machine',
      'software': 'instructions',
      'technology': 'craft',
      'digital': 'coded',
      'online': 'connected',
      'car': 'carriage',
      'automobile': 'horse',
      'airplane': 'flying ship',
      'television': 'scrying pool',
      'radio': 'message horn',
      'camera': 'sketching eye',
      'dollar': 'gold coin',
      'euro': 'silver coin',
      'currency': 'coins',
      'stock market': 'merchant guild',
      'investment': 'venture',
      'doctor': 'healer',
      'professor': 'scholar',
      'scientist': 'alchemist',
      'engineer': 'builder',
      'programmer': 'scribe',
    };
  }

  private async llmPolish(text: string, context: GameContext): Promise<string> {
    // Only polish if text is long enough
    if (text.length < 200) return text;

    const prompt = `You are a literary editor for a fantasy RPG. Polish this prose passage:

1. Remove any remaining AI-style phrases
2. Fix awkward phrasing
3. Ensure consistent tone and style
4. Keep the same meaning and events
5. Do NOT add new content, only polish existing

World: ${context.world.name}
Setting: ${context.location?.name ?? 'fantasy world'}

Prose to polish:
${text}

Return ONLY the polished prose, no explanation.`;

    const polished = await this.llmQueue.generateText(prompt, 1, 0.3, 'censor');

    // Verify length is reasonable (not too short or too long)
    if (polished.length < text.length * 0.5 || polished.length > text.length * 1.5) {
      logger.warn('LLM polish produced unexpected length, using original');
      return text;
    }

    return polished;
  }
}
