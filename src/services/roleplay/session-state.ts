export interface SessionParams {
  character?: string | null;
  location?: string;
  time?: Date;
  role?: string;
  sessionId?: string | null;
}

export class SessionState {
  activeCharacter: string | null = null;
  currentLocation = 'unknown';
  currentTime = new Date();
  userRole = 'protagonist';
  activeSessionId: string | null = null;
  allowAutoEvents = true;
  visitedLocations = new Set<string>();

  set(params: SessionParams): void {
    if (params.character !== undefined) this.activeCharacter = params.character;
    if (params.location !== undefined) this.currentLocation = params.location;
    if (params.time !== undefined) this.currentTime = params.time;
    if (params.role !== undefined) this.userRole = params.role;
    if (params.sessionId !== undefined) this.activeSessionId = params.sessionId;
    this.visitedLocations.clear();
    if (params.location) this.visitedLocations.add(params.location);
  }

  reset(): void {
    this.activeCharacter = null;
    this.currentLocation = 'unknown';
    this.currentTime = new Date();
    this.userRole = 'protagonist';
    this.activeSessionId = null;
    this.allowAutoEvents = true;
    this.visitedLocations.clear();
  }

  toJSON() {
    return {
      character: this.activeCharacter,
      location: this.currentLocation,
      time: this.currentTime.toISOString(),
      role: this.userRole,
      sessionId: this.activeSessionId,
      visitedCount: this.visitedLocations.size,
    };
  }
}
