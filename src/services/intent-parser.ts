import { Intent, IntentSchema, ParserContext } from '@/models/intent';
import { LLMQueue } from '@/lib/llm-queue';
import { getLogger } from '@/utils/logger';

const logger = getLogger('IntentParser');

// ─── Fast Regex Patterns ─────────────────────────────────────────────────────

const MOVE_PATTERNS = /^(?:go|move|travel|walk|run|head|пойти|идти|переместиться)\s+(?:to|toward|into|for|в|к|на)\s+(.+)/i;
const TALK_PATTERNS = /^(?:say to|talk to|ask|tell|shout at|whisper to|сказать|поговорить|спросить)\s+(\S+)\s+(.+)/i;
const OBSERVE_PATTERNS = /^(?:look at|examine|inspect|осмотреть|изучить|посмотреть)\s+(.+)/i;
const COMMAND_PATTERN = /^\/(\w+)\s*(.*)?$/;

// ─── Intent Parser ───────────────────────────────────────────────────────────

export class IntentParser {
  constructor(private llmQueue: LLMQueue) {}

  /**
   * Parse raw player input into a structured Intent.
   * Uses fast regex classification first, falls back to LLM for ambiguous input.
   */
  async parse(input: string, context: ParserContext): Promise<Intent> {
    const trimmed = input.trim();
    if (!trimmed) {
      return { type: 'observation', detail_level: 'brief' };
    }

    // 1. Try fast regex classification
    const fastIntent = this.tryFastParse(trimmed, context);
    if (fastIntent) {
      logger.debug(`Fast parse: ${fastIntent.type}`);
      return fastIntent;
    }

    // 2. Fall back to LLM-based classification
    logger.debug('Falling back to LLM classification');
    return this.llmClassify(trimmed, context);
  }

  // ─── Fast Path ───────────────────────────────────────────────────────────

  private tryFastParse(input: string, context: ParserContext): Intent | null {
    // Commands: /look, /inventory, etc.
    const cmdMatch = input.match(COMMAND_PATTERN);
    if (cmdMatch && cmdMatch[1]) {
      const command = cmdMatch[1].toLowerCase();
      const validCommands = [
        'look', 'inventory', 'craft', 'status', 'quests',
        'time', 'save', 'quit', 'party', 'attack',
      ];
      if (validCommands.includes(command)) {
        return {
          type: 'command' as const,
          command: command as 'look' | 'inventory' | 'craft' | 'status' | 'quests' | 'time' | 'save' | 'quit' | 'party' | 'attack',
          args: cmdMatch[2] ? { raw: cmdMatch[2] } : undefined,
        };
      }
    }

    // Movement: "go to the tavern", "walk to the forest"
    const moveMatch = input.match(MOVE_PATTERNS);
    if (moveMatch && moveMatch[1]) {
      return {
        type: 'movement',
        destination: moveMatch[1].trim(),
        speed: this.detectSpeed(input),
      };
    }

    // Dialogue: "say to Aldric hello", "tell the merchant about the quest"
    const talkMatch = input.match(TALK_PATTERNS);
    if (talkMatch && talkMatch[1] && talkMatch[2]) {
      return {
        type: 'dialogue',
        target: talkMatch[1].trim(),
        content: talkMatch[2].trim(),
        tone: this.detectTone(input),
      };
    }

    // Observation: "look at the painting", "examine the door"
    const observeMatch = input.match(OBSERVE_PATTERNS);
    if (observeMatch && observeMatch[1]) {
      return {
        type: 'observation',
        target: observeMatch[1].trim(),
        detail_level: input.toLowerCase().includes('examine') ? 'examine' : 'thorough',
      };
    }

    // Simple observation: just "look" or "осмотреться"
    if (/^(?:look|осмотреться|look around)$/i.test(input)) {
      return {
        type: 'observation',
        detail_level: 'brief',
      };
    }

    return null;
  }

  // ─── LLM Classification ──────────────────────────────────────────────────

  private async llmClassify(input: string, context: ParserContext): Promise<Intent> {
    const prompt = `You are an intent classifier for a text RPG. Classify the player's input into a structured intent.

Player input: "${input}"

Current context:
- Location: ${context.currentLocation}
- Character: ${context.activeCharacter ?? 'unknown'}
- Nearby NPCs: ${context.nearbyNpcs.join(', ') || 'none'}
- Active quests: ${context.activeQuests.join(', ') || 'none'}

Respond with ONLY a JSON object matching one of these schemas:

1. Movement: {"type":"movement","destination":"...","speed":"walk|run|travel","reason":"optional"}
2. Dialogue: {"type":"dialogue","target":"npc_name","content":"what they say","tone":"neutral|aggressive|friendly|secret|deceptive"}
3. Action: {"type":"action","verb":"...","target":"optional","modifiers":[],"risk_level":"safe|moderate|dangerous|deadly"}
4. Observation: {"type":"observation","target":"optional","detail_level":"brief|thorough|examine"}

Rules:
- If the player is addressing an NPC by name, use dialogue
- If the player mentions going somewhere, use movement
- If the player describes doing something, use action
- If the player wants to look/observe, use observation
- For attack/combat, use action with verb "attack" and risk_level "dangerous" or "deadly"
- Respond with ONLY the JSON, no explanation`;

    const response = await this.llmQueue.generateText(prompt, 1, 0.1, 'intent-parser', 30000);

    try {
      const parsed = JSON.parse(response.trim());
      const result = IntentSchema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
      logger.warn('LLM returned invalid intent schema, falling back to action');
      return { type: 'action', verb: input, risk_level: 'moderate' };
    } catch {
      logger.warn('Failed to parse LLM intent response, falling back to action');
      return { type: 'action', verb: input, risk_level: 'moderate' };
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private detectSpeed(input: string): 'walk' | 'run' | 'travel' {
    const lower = input.toLowerCase();
    if (/\b(run|sprint|dash|бежать|бросить)\b/.test(lower)) return 'run';
    if (/\b(travel|journey|voyage|путешествовать)\b/.test(lower)) return 'travel';
    return 'walk';
  }

  private detectTone(input: string): 'neutral' | 'aggressive' | 'friendly' | 'secret' | 'deceptive' {
    const lower = input.toLowerCase();
    if (/\b(shout|yell|scream|кричать|орать)\b/.test(lower)) return 'aggressive';
    if (/\b(whisper|молчать|тихо)\b/.test(lower)) return 'secret';
    if (/\b(friend|ally|comrade|друг|союзник)\b/.test(lower)) return 'friendly';
    if (/\b(lie|deceive|обмануть|солгать)\b/.test(lower)) return 'deceptive';
    return 'neutral';
  }
}
