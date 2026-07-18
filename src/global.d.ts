import type { NarrativeService } from "./services/narrative-service";

declare global {
  var __narrativeService: NarrativeService | undefined;
}

export {};
