import type { EconomicDB, FactionDilemma } from './economic-schema';
import { getLogger } from '@/utils/logger';

const logger = getLogger('FactionTaxDilemma');

/**
 * Конфигурация дилеммы
 */
export interface DilemmaConfig {
  /** Минимальная сумма налога */
  min_tax: number;
  /** Максимальная сумма налога */
  max_tax: number;
  /** Вероятность генерации дилеммы (0-1) */
  generation_chance: number;
  /** Кулдаун между дилеммами (дни) */
  cooldown_days: number;
}

/**
 * Результат генерации дилеммы
 */
export interface DilemmaResult {
  /** Сгенерированная дилемма */
  dilemma: FactionDilemma;
  /** Сообщение для игрока */
  message: string;
  /** Варианты выбора */
  choices: Array<{
    id: 'pay_a' | 'pay_b' | 'refuse';
    label: string;
    description: string;
    consequences: {
      loyalty_a: number;
      loyalty_b: number;
      reputation?: number;
    };
  }>;
}

/**
 * Конфигурация по умолчанию
 */
const DEFAULT_CONFIG: DilemmaConfig = {
  min_tax: 100,
  max_tax: 1000,
  generation_chance: 0.3,
  cooldown_days: 30,
};

export class FactionTaxDilemma {
  constructor(
    private db: EconomicDB,
    private config: DilemmaConfig = DEFAULT_CONFIG,
  ) {}

  /**
   * Сгенерировать дилемму между фракциями
   */
  generate(
    worldId: string,
    factionA: string,
    factionB: string,
  ): DilemmaResult | null {
    // Проверить кулдаун
    if (!this.canGenerate(worldId)) {
      logger.info(`Dilemma generation on cooldown for ${worldId}`);
      return null;
    }

    // Генерация с вероятностью
    if (Math.random() > this.config.generation_chance) {
      logger.info(`Dilemma generation chance failed for ${worldId}`);
      return null;
    }

    // Генерировать сумму налога
    const taxAmount = Math.floor(
      Math.random() * (this.config.max_tax - this.config.min_tax) + this.config.min_tax,
    );

    // Создать дилемму
    const dilemma: FactionDilemma = {
      id: `dilemma_${worldId}_${Date.now()}`,
      world_id: worldId,
      faction_a: factionA,
      faction_b: factionB,
      tax_amount: taxAmount,
      player_choice: null,
      resolved_at: null,
      created_at: Math.floor(Date.now() / 1000),
    };

    this.db.insertDilemma(dilemma);

    // Генерировать сообщение и варианты
    const message = this.generateMessage(factionA, factionB, taxAmount);
    const choices = this.generateChoices(factionA, factionB, taxAmount);

    logger.info(`Dilemma generated: ${factionA} vs ${factionB}, tax=${taxAmount}`);

    return { dilemma, message, choices };
  }

  /**
   * Проверить, можно ли сгенерировать дилемму
   */
  private canGenerate(worldId: string): boolean {
    const history = this.db.getDilemmaHistory(worldId);
    if (history.length === 0) return true;

    const lastDilemma = history[0]!;
    const cooldownMs = this.config.cooldown_days * 24 * 60 * 60 * 1000;
    const timeSinceLastDilemma = Date.now() - lastDilemma.created_at * 1000;

    return timeSinceLastDilemma >= cooldownMs;
  }

  /**
   * Сгенерировать сообщение для игрока
   */
  private generateMessage(factionA: string, factionB: string, taxAmount: number): string {
    return `The ${factionA} and ${factionB} are in dispute over taxes of ${taxAmount} gold. ` +
      `The ${factionA} demands payment from the ${factionB}, claiming they owe for protection. ` +
      `The ${factionB} refuses, saying they already pay their fair share. ` +
      `As the leader, you must decide who to support.`;
  }

  /**
   * Сгенерировать варианты выбора
   */
  private generateChoices(factionA: string, factionB: string, taxAmount: number): DilemmaResult['choices'] {
    return [
      {
        id: 'pay_a',
        label: `Support ${factionA}`,
        description: `Force ${factionB} to pay ${taxAmount} gold to ${factionA}.`,
        consequences: {
          loyalty_a: 0.2,
          loyalty_b: -0.3,
        },
      },
      {
        id: 'pay_b',
        label: `Support ${factionB}`,
        description: `Force ${factionA} to pay ${taxAmount} gold to ${factionB}.`,
        consequences: {
          loyalty_a: -0.3,
          loyalty_b: 0.2,
        },
      },
      {
        id: 'refuse',
        label: 'Refuse to intervene',
        description: 'Stay out of the dispute. Both factions will be disappointed.',
        consequences: {
          loyalty_a: -0.1,
          loyalty_b: -0.1,
          reputation: 0.1,
        },
      },
    ];
  }

  /**
   * Разрешить дилемму
   */
  resolve(dilemmaId: string, choice: 'pay_a' | 'pay_b' | 'refuse'): void {
    this.db.resolveDilemma(dilemmaId, choice);
    logger.info(`Dilemma ${dilemmaId} resolved with choice: ${choice}`);
  }

  /**
   * Получить конфигурацию
   */
  getConfig(): DilemmaConfig {
    return { ...this.config };
  }
}
