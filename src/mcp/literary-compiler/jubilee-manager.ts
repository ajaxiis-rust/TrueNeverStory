import type { EconomicDB, JubileeEvent } from './economic-schema';
import { getLogger } from '@/utils/logger';

const logger = getLogger('JubileeManager');

/**
 * Конфигурация юбилейного цикла
 */
export interface JubileeConfig {
  /** Цикл юбилея (по умолчанию 50 лет) */
  cycle_years: number;
  /** Сброс долгов */
  reset_debts: boolean;
  /** Возврат земель */
  return_land: boolean;
  /** Буст лояльности */
  loyalty_boost: number;
  /** Длительность буста (дни) */
  loyalty_duration_days: number;
}

/**
 * Результат юбилейного события
 */
export interface JubileeResult {
  /** Событие */
  event: JubileeEvent;
  /** Затронутые NPC */
  affected_npcs: string[];
  /** Сообщение для игрока */
  message: string;
}

/**
 * Конфигурация по умолчанию
 */
const DEFAULT_CONFIG: JubileeConfig = {
  cycle_years: 50,
  reset_debts: true,
  return_land: true,
  loyalty_boost: 0.3,
  loyalty_duration_days: 10,
};

export class JubileeManager {
  constructor(
    private db: EconomicDB,
    private config: JubileeConfig = DEFAULT_CONFIG,
  ) {}

  /**
   * Проверить, наступил ли юбилей
   */
  shouldTriggerJubilee(worldId: string, currentYear: number): boolean {
    const lastJubileeYear = this.db.getLastJubileeYear(worldId);

    if (lastJubileeYear === null) {
      // Первый юбилей через cycle_years
      return currentYear >= this.config.cycle_years;
    }

    const yearsSinceLastJubilee = currentYear - lastJubileeYear;
    return yearsSinceLastJubilee >= this.config.cycle_years;
  }

  /**
   * Запустить юбилейное событие
   */
  triggerJubilee(
    worldId: string,
    currentYear: number,
    worldState: {
      debts: Map<string, number>;
      lands: Map<string, string>;
      npcs: string[];
    },
  ): JubileeResult {
    const eventId = `jubilee_${worldId}_${currentYear}`;

    // Сбросить долги
    let debtsReset = 0;
    if (this.config.reset_debts) {
      debtsReset = worldState.debts.size;
      worldState.debts.clear();
    }

    // Вернуть земли
    let landsReturned = 0;
    if (this.config.return_land) {
      landsReturned = worldState.lands.size;
      worldState.lands.clear();
    }

    // Создать событие
    const event: JubileeEvent = {
      id: eventId,
      world_id: worldId,
      year: currentYear,
      debts_reset: debtsReset,
      lands_returned: landsReturned,
      loyalty_boost: this.config.loyalty_boost,
      created_at: Math.floor(Date.now() / 1000),
    };

    this.db.insertJubileeEvent(event);

    // Сообщение для игрока
    const message = this.generateJubileeMessage(debtsReset, landsReturned);

    logger.info(`Jubilee triggered in ${worldId}: year=${currentYear}, debts_reset=${debtsReset}, lands_returned=${landsReturned}`);

    return {
      event,
      affected_npcs: worldState.npcs,
      message,
    };
  }

  /**
   * Получить информацию о следующем юбилее
   */
  getNextJubileeInfo(worldId: string, currentYear: number): {
    years_until: number;
    next_year: number;
    last_year: number | null;
  } {
    const lastYear = this.db.getLastJubileeYear(worldId);
    const nextYear = lastYear === null
      ? this.config.cycle_years
      : lastYear + this.config.cycle_years;

    return {
      years_until: Math.max(0, nextYear - currentYear),
      next_year: nextYear,
      last_year: lastYear,
    };
  }

  /**
   * Генерировать сообщение о юбилее
   */
  private generateJubileeMessage(debtsReset: number, landsReturned: number): string {
    const parts: string[] = [];

    parts.push('The Jubilee year has arrived!');

    if (debtsReset > 0) {
      parts.push(`${debtsReset} debts have been forgiven.`);
    }

    if (landsReturned > 0) {
      parts.push(`${landsReturned} lands have been returned to their original owners.`);
    }

    parts.push('A time of renewal and hope begins.');

    return parts.join(' ');
  }

  /**
   * Получить конфигурацию
   */
  getConfig(): JubileeConfig {
    return { ...this.config };
  }
}
