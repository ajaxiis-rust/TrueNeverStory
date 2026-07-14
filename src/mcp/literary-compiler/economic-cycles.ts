import type { EconomicDB, EconomicCycle } from './economic-schema';
import { getLogger } from '@/utils/logger';

const logger = getLogger('EconomicCycles');

/**
 * Конфигурация экономических циклов
 */
export interface CycleConfig {
  /** Длительность фазы изобилия (дни) */
  abundance_duration_days: number;
  /** Длительность фазы перехода (дни) */
  transition_duration_days: number;
  /** Длительность фазы голода (дни) */
  famine_duration_days: number;
  /** Триггеры событий */
  event_triggers: string[];
  /** Модификаторы цен по фазам */
  price_modifiers: {
    abundance: number;
    transition: number;
    famine: number;
  };
}

/**
 * Результат перехода фазы
 */
export interface CycleTransition {
  /** Старая фаза */
  from_phase: EconomicCycle['phase'];
  /** Новая фаза */
  to_phase: EconomicCycle['phase'];
  /** Новый модификатор цен */
  price_modifier: number;
  /** Резерв */
  reserve: number;
  /** Сообщение для игрока */
  message: string;
}

/**
 * Конфигурация по умолчанию
 */
const DEFAULT_CONFIG: CycleConfig = {
  abundance_duration_days: 30,
  transition_duration_days: 10,
  famine_duration_days: 20,
  event_triggers: ['drought', 'plague', 'war', 'harvest_failure'],
  price_modifiers: {
    abundance: 0.8,
    transition: 1.0,
    famine: 2.0,
  },
};

export class EconomicCycles {
  constructor(
    private db: EconomicDB,
    private config: CycleConfig = DEFAULT_CONFIG,
  ) {}

  /**
   * Начать новый цикл
   */
  startCycle(
    worldId: string,
    initialReserve: number = 1000,
  ): EconomicCycle {
    const now = Math.floor(Date.now() / 1000);
    const durationDays = this.config.abundance_duration_days;
    const endsAt = now + durationDays * 24 * 60 * 60;

    const cycle: Omit<EconomicCycle, 'created_at'> = {
      id: `cycle_${worldId}_${Date.now()}`,
      world_id: worldId,
      phase: 'abundance',
      reserve: initialReserve,
      price_modifier: this.config.price_modifiers.abundance,
      started_at: now,
      ends_at: endsAt,
    };

    this.db.insertCycle(cycle);

    logger.info(`Economic cycle started in ${worldId}: abundance phase, reserve=${initialReserve}`);

    return { ...cycle, created_at: now } as EconomicCycle;
  }

  /**
   * Проверить и обновить фазу
   */
  checkAndUpdatePhase(worldId: string): CycleTransition | null {
    const currentCycle = this.db.getActiveCycle(worldId);
    if (!currentCycle) return null;

    const now = Math.floor(Date.now() / 1000);

    // Проверить, не закончилась ли текущая фаза
    if (currentCycle.ends_at > now) return null;

    // Определить следующую фазу
    const nextPhase = this.getNextPhase(currentCycle.phase);
    const durationDays = this.getPhaseDuration(nextPhase);
    const endsAt = now + durationDays * 24 * 60 * 60;
    const priceModifier = this.config.price_modifiers[nextPhase];

    // Обновить цикл
    this.db.updateCyclePhase(currentCycle.id, nextPhase, priceModifier);

    // Обновить ends_at
    this.db.insertCycle({
      ...currentCycle,
      phase: nextPhase,
      price_modifier: priceModifier,
      ends_at: endsAt,
    });

    const message = this.generateTransitionMessage(currentCycle.phase, nextPhase);

    logger.info(`Economic cycle transition in ${worldId}: ${currentCycle.phase} → ${nextPhase}`);

    return {
      from_phase: currentCycle.phase,
      to_phase: nextPhase,
      price_modifier: priceModifier,
      reserve: currentCycle.reserve,
      message,
    };
  }

  /**
   * Получить текущую фазу
   */
  getCurrentPhase(worldId: string): EconomicCycle | null {
    return this.db.getActiveCycle(worldId);
  }

  /**
   * Добавить ресурсы в резерв
   */
  addToReserve(worldId: string, amount: number): void {
    const cycle = this.db.getActiveCycle(worldId);
    if (!cycle) return;

    const newReserve = cycle.reserve + amount;
    this.db.insertCycle({
      ...cycle,
      reserve: newReserve,
    });

    logger.info(`Reserve updated in ${worldId}: ${cycle.reserve} → ${newReserve}`);
  }

  /**
   * Изъять ресурсы из резерва
   */
  withdrawFromReserve(worldId: string, amount: number): boolean {
    const cycle = this.db.getActiveCycle(worldId);
    if (!cycle || cycle.reserve < amount) return false;

    const newReserve = cycle.reserve - amount;
    this.db.insertCycle({
      ...cycle,
      reserve: newReserve,
    });

    logger.info(`Reserve withdrawn in ${worldId}: ${cycle.reserve} → ${newReserve}`);
    return true;
  }

  /**
   * Получить модификатор цен
   */
  getPriceModifier(worldId: string): number {
    const cycle = this.db.getActiveCycle(worldId);
    return cycle?.price_modifier ?? 1.0;
  }

  /**
   * Рассчитать цену с учётом фазы
   */
  calculatePrice(worldId: string, basePrice: number): number {
    const modifier = this.getPriceModifier(worldId);
    return Math.round(basePrice * modifier * 100) / 100;
  }

  /**
   * Получить следующую фазу
   */
  private getNextPhase(current: EconomicCycle['phase']): EconomicCycle['phase'] {
    switch (current) {
      case 'abundance': return 'transition';
      case 'transition': return 'famine';
      case 'famine': return 'abundance';
    }
  }

  /**
   * Получить длительность фазы
   */
  private getPhaseDuration(phase: EconomicCycle['phase']): number {
    switch (phase) {
      case 'abundance': return this.config.abundance_duration_days;
      case 'transition': return this.config.transition_duration_days;
      case 'famine': return this.config.famine_duration_days;
    }
  }

  /**
   * Сгенерировать сообщение о переходе
   */
  private generateTransitionMessage(from: EconomicCycle['phase'], to: EconomicCycle['phase']): string {
    const messages: Record<string, string> = {
      'abundance→transition': 'The era of abundance is ending. Times are changing.',
      'transition→famine': 'Famine has arrived. Resources are scarce. Prices rise.',
      'famine→abundance': 'The famine is over. Abundance returns to the land.',
    };

    return messages[`${from}→${to}`] ?? `Economic phase changed from ${from} to ${to}.`;
  }

  /**
   * Получить конфигурацию
   */
  getConfig(): CycleConfig {
    return { ...this.config };
  }
}
