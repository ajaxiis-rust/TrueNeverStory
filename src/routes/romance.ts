/**
 * Romance routes — full implementation.
 * Replaces api.py romance endpoints.
 */
import { Hono } from "hono";

interface RomanceEngine {
  getRelationship(char1: string, char2: string): Promise<{
    status: string; affection: number; compatibility: number;
    progressionStage: string; lastInteraction?: Date;
  } | null>;
  attemptAttraction(character: string, target: string, location: string): Promise<[boolean, string, number]>;
  attemptConfession(character: string, target: string, location: string, message: string): Promise<[boolean, string, number]>;
  attemptDate(character: string, target: string, location: string): Promise<[boolean, string, number]>;
  attemptKiss(character: string, target: string, location: string): Promise<[boolean, string, number]>;
  attemptProposal(character: string, target: string, location: string): Promise<[boolean, string, number]>;
  attemptBreakup(character: string, target: string, message: string): Promise<[boolean, string, number]>;
  getAllRelationships(character: string): Promise<Array<{
    partner: string; status: string; affection: number; progressionStage: string;
  }>>;
}

const romance = new Hono();

let _romanceEngine: RomanceEngine | null = null;

export function initRomance(romanceEngine: RomanceEngine): void {
  _romanceEngine = romanceEngine;
}

/**
 * GET /romance/:character1/:character2 — Get romance status.
 */
romance.get("/romance/:character1/:character2", async (c) => {
  const char1 = c.req.param("character1");
  const char2 = c.req.param("character2");

  if (!_romanceEngine) {
    return c.json({ status: "no_relationship", character1: char1, character2: char2 });
  }

  try {
    const rel = await _romanceEngine.getRelationship(char1, char2);
    if (!rel) return c.json({ status: "no_relationship" });
    return c.json({
      status: rel.status,
      affection: rel.affection,
      compatibility: rel.compatibility,
      stage: rel.progressionStage,
      last_interaction: rel.lastInteraction?.toISOString?.() ?? null,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * POST /romance/attempt/:action — Attempt a romance action.
 */
romance.post("/romance/attempt/:action", async (c) => {
  const action = c.req.param("action");
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const character = body.character as string;
  const target = body.target as string;
  const location = (body.location as string) ?? "unknown";
  const message = (body.message as string) ?? "";

  if (!character || !target) {
    return c.json({ error: "character and target are required" }, 400);
  }

  if (!_romanceEngine) {
    return c.json({ success: false, narrative: "Romance engine not initialized", affection_change: 0 });
  }

  try {
    let result: [boolean, string, number];
    switch (action) {
      case "attraction":
        result = await _romanceEngine.attemptAttraction(character, target, location);
        break;
      case "confess":
        result = await _romanceEngine.attemptConfession(character, target, location, message);
        break;
      case "date":
        result = await _romanceEngine.attemptDate(character, target, location);
        break;
      case "kiss":
        result = await _romanceEngine.attemptKiss(character, target, location);
        break;
      case "propose":
        result = await _romanceEngine.attemptProposal(character, target, location);
        break;
      case "breakup":
        result = await _romanceEngine.attemptBreakup(character, target, message);
        break;
      default:
        return c.json({ error: `Unknown romance action: ${action}` }, 400);
    }
    const [success, narrative, aff] = result;
    return c.json({ success, narrative, affection_change: aff });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * GET /romance/characters/:character — Get all romances for a character.
 */
romance.get("/romance/characters/:character", async (c) => {
  const character = c.req.param("character");
  if (!_romanceEngine) {
    return c.json({ character, relationships: [] });
  }

  try {
    const rels = await _romanceEngine.getAllRelationships(character);
    return c.json({
      character,
      relationships: rels.map((r: { partner: string; status: string; affection: number; progressionStage: string }) => ({
        partner: r.partner,
        status: r.status,
        affection: r.affection,
        stage: r.progressionStage,
      })),
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export { romance as romanceRouter };
