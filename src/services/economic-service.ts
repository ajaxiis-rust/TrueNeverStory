/**
 * EconomicService — Facade for all Literary Compiler economic models.
 * Integrates EconomicCycles, JubileeManager, FactionTaxDilemma, FactionLaborRules.
 */

import { EconomicDB } from "../mcp/literary-compiler/economic-schema";
import { EconomicCycles, type CycleTransition } from "../mcp/literary-compiler/economic-cycles";
import { JubileeManager, type JubileeResult } from "../mcp/literary-compiler/jubilee-manager";
import { FactionTaxDilemma, type DilemmaResult } from "../mcp/literary-compiler/faction-tax-dilemma";
import { FactionLaborRules, type LaborResult } from "../mcp/literary-compiler/faction-labor-rules";
import { getLogger } from "../utils/logger";

const log = getLogger("economic-service");

export interface EconomicTickResult {
  cycle_transition: boolean;
  jubilee_triggered: boolean;
  dilemma_generated: boolean;
  transition: CycleTransition | null;
  messages: string[];
}

export class EconomicService {
  private cycles: EconomicCycles;
  private jubilee: JubileeManager;
  private dilemma: FactionTaxDilemma;
  private labor: FactionLaborRules;

  constructor(private db: EconomicDB) {
    this.cycles = new EconomicCycles(db);
    this.jubilee = new JubileeManager(db);
    this.dilemma = new FactionTaxDilemma(db);
    this.labor = new FactionLaborRules(db);
  }

  // ─── Economic Cycles ─────────────────────────────────────────────

  startCycle(worldId: string, initialReserve: number = 1000): void {
    this.cycles.startCycle(worldId, initialReserve);
  }

  checkTick(worldId: string): EconomicTickResult {
    const result: EconomicTickResult = {
      cycle_transition: false,
      jubilee_triggered: false,
      dilemma_generated: false,
      transition: null,
      messages: [],
    };

    const transition = this.cycles.checkAndUpdatePhase(worldId);
    if (transition) {
      result.cycle_transition = true;
      result.transition = transition;
      result.messages.push(transition.message);
      log.info(`Economic cycle transition in ${worldId}: ${transition.from_phase} → ${transition.to_phase}`);
    }

    return result;
  }

  getCurrentPhase(worldId: string) {
    return this.cycles.getCurrentPhase(worldId);
  }

  getPriceModifier(worldId: string): number {
    return this.cycles.getPriceModifier(worldId);
  }

  calculatePrice(worldId: string, basePrice: number): number {
    return this.cycles.calculatePrice(worldId, basePrice);
  }

  addToReserve(worldId: string, amount: number): void {
    this.cycles.addToReserve(worldId, amount);
  }

  withdrawFromReserve(worldId: string, amount: number): boolean {
    return this.cycles.withdrawFromReserve(worldId, amount);
  }

  // ─── Faction Labor Rules ─────────────────────────────────────────

  setLaborRule(faction: string, fixedWages: boolean, wageAmount: number, loyaltyModifier: number = 0): void {
    this.labor.setRule(faction, fixedWages, wageAmount, loyaltyModifier);
  }

  getLaborRule(faction: string) {
    return this.labor.getRule(faction);
  }

  calculateWage(faction: string, baseWage: number, workedHours: number, productivity: number = 1.0): LaborResult {
    return this.labor.calculateWage(faction, baseWage, workedHours, productivity);
  }

  checkLoyaltyConflict(workers: Array<{ name: string; faction: string; hours_worked: number }>) {
    return this.labor.checkLoyaltyConflict(workers);
  }

  // ─── Faction Tax Dilemma ─────────────────────────────────────────

  generateDilemma(worldId: string, factionA: string, factionB: string): DilemmaResult | null {
    return this.dilemma.generate(worldId, factionA, factionB);
  }

  resolveDilemma(dilemmaId: string, choice: 'pay_a' | 'pay_b' | 'refuse'): void {
    this.dilemma.resolve(dilemmaId, choice);
  }

  getUnresolvedDilemmas(worldId: string) {
    return this.db.getUnresolvedDilemmas(worldId);
  }

  // ─── Jubilee Manager ─────────────────────────────────────────────

  checkJubilee(worldId: string, currentYear: number): boolean {
    return this.jubilee.shouldTriggerJubilee(worldId, currentYear);
  }

  triggerJubilee(worldId: string, currentYear: number, worldState: {
    debts: Map<string, number>;
    lands: Map<string, string>;
    npcs: string[];
  }): JubileeResult {
    return this.jubilee.triggerJubilee(worldId, currentYear, worldState);
  }

  getNextJubileeInfo(worldId: string, currentYear: number) {
    return this.jubilee.getNextJubileeInfo(worldId, currentYear);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
