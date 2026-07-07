/**
 * Narrative Facade — thin facade for lifecycle management.
 * Delegates to bootstrapped services without exposing internal wiring.
 */

import type { BootstrapperResult } from "./narrative-bootstrapper";
import { getLogger } from "../utils/logger";

const log = getLogger("narrative-facade");

export interface NarrativeFacadeDeps {
  dbPath: string;
  worldFrame: Record<string, unknown>;
  services: BootstrapperResult;
}

export class NarrativeFacade {
  readonly dbPath: string;
  readonly worldFrame: Record<string, unknown>;
  readonly services: BootstrapperResult;

  private _servicesStarted = false;

  constructor(deps: NarrativeFacadeDeps) {
    this.dbPath = deps.dbPath;
    this.worldFrame = deps.worldFrame;
    this.services = deps.services;
  }

  async start(): Promise<void> {
    if (this._servicesStarted) return;
    await this.services.llmQueue.start();
    await this.services.graphStore.boot();

    for (const node of this.services.entityStore.allNodes()) {
      this.services.sqliteStore.upsertEntity({
        uid: node.uid,
        name: node.name,
        entityType: node.entityType,
        summary: node.profile.summary,
        tags: JSON.stringify(node.profile.tags),
        description: (node.profile.l1.description as string) || "",
        profile: JSON.stringify(node.profile.toDict()),
      });
    }
    log.info({ count: this.services.sqliteStore.entityCount() }, "Synced entities to SQLite");

    this.services.director.start();
    this._servicesStarted = true;
    log.info("Narrative services started");
  }

  async stop(): Promise<void> {
    if (!this._servicesStarted) return;
    this.services.director.stop();
    await this.services.llmQueue.stop();
    this._servicesStarted = false;
    log.info("Narrative services stopped");
  }

  pause(): void {
    this.services.director.pause();
    log.info("Narrative services paused");
  }

  resume(): void {
    this.services.director.resume();
    log.info("Narrative services resumed");
  }

  get isRunning(): boolean {
    return this._servicesStarted;
  }

  get directorRunning(): boolean {
    return this.services.director.isRunning;
  }

  get directorPaused(): boolean {
    return this.services.director.isPaused;
  }
}
