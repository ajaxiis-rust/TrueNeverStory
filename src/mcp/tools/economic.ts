/**
 * Economic MCP Tools — exposes economic models to agents via MCP.
 */

import type { EconomicService } from '@/services/economic-service';
import { getLogger } from '@/utils/logger';

const logger = getLogger('EconomicMCPTools');

export class EconomicMCPTools {
  constructor(private economicService: EconomicService) {}

  async getEconomicPhase(input: { worldId: string }): Promise<{
    phase: string | null;
    reserve: number;
    priceModifier: number;
    endsAt: number | null;
  }> {
    const cycle = this.economicService.getCurrentPhase(input.worldId);

    if (!cycle) {
      return { phase: null, reserve: 0, priceModifier: 1.0, endsAt: null };
    }

    logger.info(`Economic phase for ${input.worldId}: ${cycle.phase}`);

    return {
      phase: cycle.phase,
      reserve: cycle.reserve,
      priceModifier: cycle.price_modifier,
      endsAt: cycle.ends_at,
    };
  }

  async getPriceModifier(input: { worldId: string }): Promise<{ modifier: number }> {
    const modifier = this.economicService.getPriceModifier(input.worldId);
    return { modifier };
  }

  async calculatePrice(input: { worldId: string; basePrice: number }): Promise<{
    basePrice: number;
    modifier: number;
    finalPrice: number;
  }> {
    const modifier = this.economicService.getPriceModifier(input.worldId);
    const finalPrice = this.economicService.calculatePrice(input.worldId, input.basePrice);

    return {
      basePrice: input.basePrice,
      modifier,
      finalPrice,
    };
  }

  async getWage(input: {
    faction: string;
    baseWage: number;
    workedHours: number;
    productivity?: number;
  }): Promise<{
    faction: string;
    wage: number;
    isFixed: boolean;
    loyaltyModifier: number;
    message: string;
  }> {
    const result = this.economicService.calculateWage(
      input.faction,
      input.baseWage,
      input.workedHours,
      input.productivity ?? 1.0,
    );

    logger.info(`Wage for ${input.faction}: ${result.wage} (fixed=${result.is_fixed})`);

    return {
      faction: result.faction,
      wage: result.wage,
      isFixed: result.is_fixed,
      loyaltyModifier: result.loyalty_modifier,
      message: result.message,
    };
  }

  async generateDilemma(input: {
    worldId: string;
    factionA: string;
    factionB: string;
  }): Promise<{
    generated: boolean;
    dilemmaId: string | null;
    message: string | null;
    choices: Array<{
      id: string;
      label: string;
      description: string;
      consequences: Record<string, number>;
    }> | null;
  }> {
    const result = this.economicService.generateDilemma(
      input.worldId,
      input.factionA,
      input.factionB,
    );

    if (!result) {
      return { generated: false, dilemmaId: null, message: null, choices: null };
    }

    logger.info(`Dilemma generated: ${input.factionA} vs ${input.factionB}`);

    return {
      generated: true,
      dilemmaId: result.dilemma.id,
      message: result.message,
      choices: result.choices.map(c => ({
        id: c.id,
        label: c.label,
        description: c.description,
        consequences: c.consequences as Record<string, number>,
      })),
    };
  }

  async checkJubilee(input: { worldId: string; currentYear: number }): Promise<{
    shouldTrigger: boolean;
    yearsUntil: number;
    nextYear: number;
    lastYear: number | null;
  }> {
    const shouldTrigger = this.economicService.checkJubilee(input.worldId, input.currentYear);
    const info = this.economicService.getNextJubileeInfo(input.worldId, input.currentYear);

    return {
      shouldTrigger,
      yearsUntil: info.years_until,
      nextYear: info.next_year,
      lastYear: info.last_year,
    };
  }

  async getJubileeInfo(input: { worldId: string; currentYear: number }): Promise<{
    yearsUntil: number;
    nextYear: number;
    lastYear: number | null;
    config: {
      cycleYears: number;
      resetDebts: boolean;
      returnLand: boolean;
      loyaltyBoost: number;
    };
  }> {
    const info = this.economicService.getNextJubileeInfo(input.worldId, input.currentYear);

    return {
      yearsUntil: info.years_until,
      nextYear: info.next_year,
      lastYear: info.last_year,
      config: {
        cycleYears: 50,
        resetDebts: true,
        returnLand: true,
        loyaltyBoost: 0.3,
      },
    };
  }
}
