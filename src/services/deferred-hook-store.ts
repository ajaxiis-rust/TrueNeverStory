/**
 * Deferred Character Hook — soft callbacks for noticed-but-rejected NPCs.
 * Gated by 'deferred-hooks-enabled' feature flag.
 */

export interface DeferredHook {
  npcId: string;
  npcName: string;
  hookStrength: 1 | 2 | 3; // 1=trace, 2=edge, 3=soft contact
  sourceTurn: number;
  blockClosedAt?: number;
  used: boolean;
}

export class DeferredHookStore {
  private hooks: DeferredHook[] = [];

  add(hook: Omit<DeferredHook, 'used' | 'blockClosedAt'>): void {
    // Don't duplicate for same NPC
    if (this.hooks.some(h => h.npcId === hook.npcId && !h.used)) return;
    this.hooks.push({ ...hook, used: false });
  }

  closeBlock(turnNumber: number): void {
    for (const h of this.hooks) {
      if (!h.used && !h.blockClosedAt) {
        h.blockClosedAt = turnNumber;
      }
    }
  }

  getEligible(): DeferredHook[] {
    const eligible = this.hooks.filter(h => !h.used && h.blockClosedAt !== undefined);
    if (eligible.length === 0) return [];
    // Return only the strongest hook (max 1 per block)
    eligible.sort((a, b) => b.hookStrength - a.hookStrength);
    return [eligible[0]!];
  }

  markUsed(npcId: string): void {
    const hook = this.hooks.find(h => h.npcId === npcId);
    if (hook) hook.used = true;
  }

  getAll(): DeferredHook[] {
    return [...this.hooks];
  }

  toJSON(): DeferredHook[] {
    return this.hooks;
  }

  static fromJSON(data: DeferredHook[]): DeferredHookStore {
    const store = new DeferredHookStore();
    store.hooks = data.map(h => ({ ...h }));
    return store;
  }
}
