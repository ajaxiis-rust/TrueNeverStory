import type { EconomicDB, FactionLaborRule } from './economic-schema';
import { getLogger } from '@/utils/logger';

const logger = getLogger('FactionLaborRules');

/**
 * Результат применения правил труда
 */
export interface LaborResult {
  /** Фракция */
  faction: string;
  /** Заработная плата */
  wage: number;
  /** Фиксированная или нет */
  is_fixed: boolean;
  /** Модификатор лояльности */
  loyalty_modifier: number;
  /** Сообщение для игрока */
  message: string;
}

export class FactionLaborRules {
  constructor(private db: EconomicDB) {}

  /**
   * Установить правила труда для фракции
   */
  setRule(
    faction: string,
    fixedWages: boolean,
    wageAmount: number,
    loyaltyModifier: number = 0,
  ): void {
    this.db.insertLaborRule({
      faction,
      fixed_wages: fixedWages,
      wage_amount: wageAmount,
      loyalty_modifier: loyaltyModifier,
    });

    logger.info(`Labor rule set for ${faction}: fixed=${fixedWages}, wage=${wageAmount}`);
  }

  /**
   * Получить правила для фракции
   */
  getRule(faction: string): FactionLaborRule | null {
    return this.db.getLaborRule(faction);
  }

  /**
   * Получить все правила
   */
  getAllRules(): FactionLaborRule[] {
    return this.db.getAllLaborRules();
  }

  /**
   * Удалить правила фракции
   */
  deleteRule(faction: string): void {
    this.db.deleteLaborRule(faction);
    logger.info(`Labor rule deleted for ${faction}`);
  }

  /**
   * Рассчитать заработную плату для NPC
   */
  calculateWage(
    faction: string,
    baseWage: number,
    workedHours: number,
    productivity: number = 1.0,
  ): LaborResult {
    const rule = this.db.getLaborRule(faction);

    if (!rule) {
      // Нет правил = стандартная оплата
      return {
        faction,
        wage: baseWage * workedHours * productivity,
        is_fixed: false,
        loyalty_modifier: 0,
        message: `Standard wage calculated for ${faction}.`,
      };
    }

    let wage: number;
    if (rule.fixed_wages) {
      // Фиксированная оплата ( Workers in Vineyard )
      wage = rule.wage_amount;
    } else {
      // Пропорциональная оплата
      wage = rule.wage_amount * workedHours * productivity;
    }

    return {
      faction,
      wage,
      is_fixed: rule.fixed_wages,
      loyalty_modifier: rule.loyalty_modifier,
      message: rule.fixed_wages
        ? `${faction} workers receive fixed wage of ${wage} gold regardless of hours worked.`
        : `${faction} workers receive ${wage} gold for ${workedHours} hours of work.`,
    };
  }

  /**
   * Проверить конфликт лояльности
   * (когда работники получают одинаково, но работают по-разному)
   */
  checkLoyaltyConflict(
    workers: Array<{
      name: string;
      faction: string;
      hours_worked: number;
    }>,
  ): Array<{
    worker: string;
    conflict: boolean;
    reason: string;
  }> {
    const results: Array<{
      worker: string;
      conflict: boolean;
      reason: string;
    }> = [];

    // Группировать по фракциям
    const byFaction = new Map<string, typeof workers>();
    for (const worker of workers) {
      const group = byFaction.get(worker.faction) ?? [];
      group.push(worker);
      byFaction.set(worker.faction, group);
    }

    // Проверить каждую фракцию
    for (const [faction, factionWorkers] of byFaction) {
      const rule = this.db.getLaborRule(faction);
      if (!rule?.fixed_wages) continue;

      // Фиксированная оплата - проверить конфликт
      const hours = factionWorkers.map(w => w.hours_worked);
      const minHours = Math.min(...hours);
      const maxHours = Math.max(...hours);

      if (maxHours > minHours * 1.5) {
        // Есть существенная разница в часах
        for (const worker of factionWorkers) {
          results.push({
            worker: worker.name,
            conflict: true,
            reason: `${worker.name} worked ${worker.hours_worked} hours but receives same wage as those who worked ${minHours}-${maxHours} hours.`,
          });
        }
      }
    }

    return results;
  }
}
