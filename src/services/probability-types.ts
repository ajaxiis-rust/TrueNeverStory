/**
 * Shared interfaces for probability subsystem dependencies.
 */

export interface IContextResolver {
  buildContext(
    actor: string,
    target?: string | null,
    actionType?: string,
    location?: string | null,
  ): Promise<Record<string, unknown>>;
}

export interface INpcState {
  health?: number;
  mood?: string;
  [key: string]: unknown;
}

export interface INpcManager {
  get(name: string): INpcState | null;
  listAll(): Record<string, INpcState>;
}

export interface IWorldMemory {
  retrieve(query: string, topK?: number): Promise<Array<{ id: string; content: string; score: number }>>;
  addMemory(content: string, sourceType: string, sourceId: string, importance?: number): Promise<string>;
}

export interface IWorldClock {
  getGlobalLuck(): number;
}
