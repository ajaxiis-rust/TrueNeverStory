/**
 * Circuit Breaker — prevents cascading failures when LLM providers are down.
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)
 */

import { getLogger } from "../utils/logger";

const log = getLogger("circuit-breaker");

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenMaxAttempts: number;
  successThreshold: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30_000,
  halfOpenMaxAttempts: 3,
  successThreshold: 2,
};

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailureTime: number;
  consecutiveSuccesses: number;
}

export class CircuitBreaker {
  private _state: CircuitState = CircuitState.CLOSED;
  private _config: CircuitBreakerConfig;
  private _stats: CircuitStats;
  private _halfOpenAttempts = 0;
  private _id: string;

  constructor(id: string, config?: Partial<CircuitBreakerConfig>) {
    this._id = id;
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._stats = {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      consecutiveSuccesses: 0,
    };
  }

  get state(): CircuitState {
    if (this._state === CircuitState.OPEN) {
      const elapsed = Date.now() - this._stats.lastFailureTime;
      if (elapsed >= this._config.recoveryTimeoutMs) {
        this._transitionTo(CircuitState.HALF_OPEN);
      }
    }
    return this._state;
  }

  get id(): string {
    return this._id;
  }

  get stats() {
    return {
      state: this.state,
      failures: this._stats.failures,
      successes: this._stats.successes,
      consecutiveSuccesses: this._stats.consecutiveSuccesses,
      halfOpenAttempts: this._halfOpenAttempts,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.state;

    if (currentState === CircuitState.OPEN) {
      throw new CircuitOpenError(
        `Circuit breaker "${this._id}" is OPEN. Retry after ${this._config.recoveryTimeoutMs}ms`,
        this._id,
      );
    }

    if (currentState === CircuitState.HALF_OPEN && this._halfOpenAttempts >= this._config.halfOpenMaxAttempts) {
      throw new CircuitOpenError(
        `Circuit breaker "${this._id}" HALF_OPEN limit reached (${this._config.halfOpenMaxAttempts})`,
        this._id,
      );
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  canExecute(): boolean {
    const s = this.state;
    if (s === CircuitState.CLOSED) return true;
    if (s === CircuitState.HALF_OPEN && this._halfOpenAttempts < this._config.halfOpenMaxAttempts) return true;
    return false;
  }

  reset(): void {
    this._transitionTo(CircuitState.CLOSED);
    this._stats = {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      consecutiveSuccesses: 0,
    };
    this._halfOpenAttempts = 0;
    log.info({ id: this._id }, "Circuit breaker manually reset");
  }

  private _onSuccess(): void {
    this._stats.successes++;
    this._stats.consecutiveSuccesses++;

    if (this._state === CircuitState.HALF_OPEN) {
      if (this._stats.consecutiveSuccesses >= this._config.successThreshold) {
        log.info(
          { id: this._id, successes: this._stats.consecutiveSuccesses },
          "Circuit breaker recovered → CLOSED",
        );
        this._transitionTo(CircuitState.CLOSED);
      }
    }
  }

  private _onFailure(): void {
    this._stats.failures++;
    this._stats.consecutiveSuccesses = 0;
    this._stats.lastFailureTime = Date.now();

    if (this._state === CircuitState.HALF_OPEN) {
      log.warn(
        { id: this._id, halfOpenAttempts: this._halfOpenAttempts },
        "Circuit breaker HALF_OPEN failure → OPEN",
      );
      this._transitionTo(CircuitState.OPEN);
      return;
    }

    if (this._stats.failures >= this._config.failureThreshold) {
      log.warn(
        { id: this._id, failures: this._stats.failures, threshold: this._config.failureThreshold },
        "Circuit breaker threshold reached → OPEN",
      );
      this._transitionTo(CircuitState.OPEN);
    }
  }

  private _transitionTo(newState: CircuitState): void {
    const prev = this._state;
    this._state = newState;

    if (newState === CircuitState.CLOSED) {
      this._stats.failures = 0;
      this._halfOpenAttempts = 0;
      this._stats.consecutiveSuccesses = 0;
    }

    if (newState === CircuitState.HALF_OPEN) {
      this._halfOpenAttempts = 0;
      this._stats.consecutiveSuccesses = 0;
    }

    log.info({ id: this._id, from: prev, to: newState }, "Circuit breaker state change");
  }
}

export class CircuitOpenError extends Error {
  circuitId: string;

  constructor(message: string, circuitId: string) {
    super(message);
    this.name = "CircuitOpenError";
    this.circuitId = circuitId;
  }
}
