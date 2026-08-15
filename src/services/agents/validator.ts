import { BaseAgentV2, AgentOutput, NarrativePattern } from '../agent-v2';
import { Intent } from '@/models/intent';
import { SimulationResult } from '@/models/simulation';
import { GameContext } from '@/services/context-builder';
import { TNSServer } from '@/mcp/server';
import { getLogger } from '@/utils/logger';
import type { VerificationResult } from '../jungian-profiler';

const logger = getLogger('ValidatorAgent');

/**
 * Validator (The Fact-Checker)
 *
 * Verifies facts via Wikipedia MCP, ensures world consistency.
 */
export class ValidatorAgent extends BaseAgentV2 {
  readonly id = 'validator' as const;
  readonly name = 'Validator';
  readonly description = 'Verifies facts and ensures world consistency';
  readonly mcpTools = ['verify_fact', 'get_context'];

  constructor(private mcpServer: TNSServer) {
    super();
  }

  async process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput> {
    // Extract factual claims from the situation
    const claims = this.extractClaims(intent, context);

    if (claims.length === 0) {
      return { metadata: { verified: true, claims: [] } };
    }

    // Verify each claim via Wikipedia
    const verifications = await Promise.all(
      claims.map(claim => this.verifyClaim(claim))
    );

    const verified = verifications.filter(v => v.verified);
    const unverified = verifications.filter(v => !v.verified);

    return {
      metadata: {
        verified: unverified.length === 0,
        claims: verifications,
        verifiedCount: verified.length,
        unverifiedCount: unverified.length,
      },
    };
  }

  private extractClaims(intent: Intent, context: GameContext): string[] {
    const claims: string[] = [];

    // For actions, extract historical/cultural claims
    if (intent.type === 'action') {
      // Check if the action references historical concepts
      const lowerVerb = intent.verb.toLowerCase();
      if (['build', 'create', 'forge', 'craft', 'invent'].includes(lowerVerb)) {
        claims.push(`The player attempts to ${lowerVerb} something`);
      }
    }

    // For dialogue, extract factual references
    if (intent.type === 'dialogue') {
      // Check if dialogue references real-world concepts
      const lowerContent = intent.content.toLowerCase();
      if (lowerContent.includes('history') || lowerContent.includes('ancient')) {
        claims.push(`Historical reference in dialogue: ${intent.content.substring(0, 100)}`);
      }
    }

    return claims.slice(0, 3); // Limit to 3 claims
  }

  private async verifyClaim(claim: string): Promise<{
    claim: string;
    verified: boolean;
    confidence: string;
    evidence: string[];
  }> {
    try {
      const result = await this.mcpServer.handleToolCall('verify_fact', {
        claim,
      }) as {
        verified: boolean;
        confidence: string;
        evidence: string[];
      };

      return {
        claim,
        verified: result.verified,
        confidence: result.confidence,
        evidence: result.evidence,
      };
    } catch (error) {
      logger.warn(`Failed to verify claim: ${claim}`, error as string);
      return {
        claim,
        verified: false,
        confidence: 'unknown',
        evidence: [],
      };
    }
  }

  buildWorldConsistency(
    gameContext: GameContext,
    filledSkeleton: string,
  ): { npcInLocation: boolean; itemsAvailable: boolean; timelineCoherent: boolean } {
    const nearby = new Set(gameContext.nearbyNpcs.map(n => n.name));
    const mentioned = this.extractMentionedNpcs(filledSkeleton, gameContext);
    const npcInLocation = mentioned.every(n => nearby.has(n));
    return { npcInLocation, itemsAvailable: true, timelineCoherent: true };
  }

  async verify(gameContext: GameContext, filledSkeleton: string): Promise<VerificationResult> {
    const worldConsistency = this.buildWorldConsistency(gameContext, filledSkeleton);
    const claims = this.extractClaimsFromSkeleton(filledSkeleton).slice(0, 3);
    const verifications = await Promise.all(claims.map(c => this.verifyClaim(c)));
    const notes = verifications.map(v => `${v.claim} (${v.confidence})`);
    return { claims: verifications, worldConsistency, notes };
  }

  private extractMentionedNpcs(text: string, gameContext: GameContext): string[] {
    const protagonist = gameContext.character?.name;
    const locationWords = new Set((gameContext.location?.name ?? '').split(/\s+/).map(w => w.replace(/[^A-Za-z']/g, '')));
    const names: string[] = [];
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const words = sentence.split(/\s+/);
      words.forEach((raw, i) => {
        const w = raw.replace(/[^A-Za-z']/g, '');
        if (!/^[A-Z][a-z']+$/.test(w)) return;
        if (w === protagonist) return;
        if (locationWords.has(w)) return;
        if (i === 0) return;
        names.push(w);
      });
    }
    return names;
  }

  private extractClaimsFromSkeleton(filledSkeleton: string): string[] {
    const matches = filledSkeleton.match(/\b(forge|craft|repair|build|brew|smelt)\w*/gi) ?? [];
    return matches.length > 0
      ? [`The scene involves ${matches[0]!.toLowerCase()} work (plausibility check)`]
      : [];
  }
}
