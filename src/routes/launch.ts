/**
 * Launch / new game routes — real implementation.
 * Replaces api.py launch endpoints.
 *
 * POST /launch    — create new game (birth wizard)
 * POST /continue  — continue existing game
 * GET  /sessions  — list available sessions
 * POST /snapshot  — save game snapshot
 */
import { Hono } from "hono";
import type { NarrativeService } from "../services/narrative-service";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("launch");
const launch = new Hono();

let _narrativeCtx: NarrativeService | null = null;

export function initLaunch(narrativeCtx: NarrativeService): void {
  _narrativeCtx = narrativeCtx;
}

/**
 * POST /launch — Create a new game session with birth wizard.
 */
launch.post("/launch", async (c) => {
  if (!_narrativeCtx) {
    return c.json({ status: "error", error: "Server not initialized" }, 503);
  }
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const hints = (body.hints as string) ?? "";
  const isekai = (body.isekai as boolean) ?? false;
  const startingAge = (body.starting_age as number) ?? 5;

  try {
    const birthScenario = _narrativeCtx.createBirthScenario();
    const { openingNarrative, params } = await birthScenario.generateAndApply(
      hints,
      isekai,
      startingAge,
    );

    const sessionId = `newgame_${params.character_name.toLowerCase().replace(/\s+/g, "_")}`;

    // Post-birth: schedule initial story beat
    try {
      await _narrativeCtx.clock.scheduleRelative(120, "generate_event", {
        category: "discovery",
        severity: 0.6,
        involved_entities: [params.character_name],
      });
    } catch (err) {
      log.warn({ err }, "Could not schedule initial beat");
    }

    // Set initial global luck
    try {
      await _narrativeCtx.clock.setGlobalLuck(0.55);
    } catch { /* ignore */ }

    // Add welcome quest
    try {
      _narrativeCtx.questMgr.addQuest({
        id: "birth_quest",
        title: "Awakening",
        description: `As ${params.character_name}, explore your surroundings and find a worthy goal.`,
        giver: "The World",
        status: "active",
        objectives: [{ type: "explore", description: "Explore the world", completed: false }],
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      log.warn({ err }, "Could not add welcome quest");
    }

    await _narrativeCtx.chronicler.logEvent(
      `New game started: ${params.character_name}`,
      new Date(),
      "system",
    );

    return c.json({
      status: "success",
      session_id: sessionId,
      character_name: params.character_name,
      opening_narrative: openingNarrative,
      race: params.race,
      social_class: params.social_class,
      birthplace: params.birthplace,
      initial_location: params.initial_location,
    });
  } catch (err) {
    log.error({ err }, "Launch failed");
    return c.json({
      status: "error",
      error: err instanceof Error ? err.message : "Launch failed",
    }, 500);
  }
});

/**
 * POST /continue — Continue an existing game session.
 */
launch.post("/continue", async (c) => {
  if (!_narrativeCtx) {
    return c.json({ status: "error", error: "Server not initialized" }, 503);
  }
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = body.session_id as string;
  if (!sessionId) {
    return c.json({ status: "error", error: "session_id is required" }, 400);
  }

  // Try to load snapshot
  const snapshotDir = join(_narrativeCtx.dbPath, "snapshots");
  const snapshotPath = join(snapshotDir, `${sessionId}.json`);
  if (existsSync(snapshotPath)) {
    try {
      const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
      // Restore clock time
      if (snapshot.clock) {
        _narrativeCtx.clock.currentTime = new Date(snapshot.clock);
      }
      if (snapshot.global_luck != null) {
        await _narrativeCtx.clock.setGlobalLuck(snapshot.global_luck);
      }
      return c.json({
        status: "success",
        session_id: sessionId,
        character_name: snapshot.character_name ?? "Unknown",
        restored: true,
      });
    } catch (err) {
      log.warn({ err }, "Failed to load snapshot, continuing with current state");
    }
  }

  return c.json({
    status: "success",
    session_id: sessionId,
    character_name: "Unknown",
    restored: false,
  });
});

/**
 * GET /sessions — List available game sessions.
 */
launch.get("/sessions", (c) => {
  if (!_narrativeCtx) {
    return c.json({ status: "error", error: "Server not initialized" }, 503);
  }
  const sessions: string[] = [];

  // Check snapshots
  const snapshotDir = join(_narrativeCtx.dbPath, "snapshots");
  if (existsSync(snapshotDir)) {
    for (const f of readdirSync(snapshotDir)) {
      if (f.endsWith(".json")) {
        sessions.push(f.replace(".json", ""));
      }
    }
  }

  // Check session history files
  const historyDir = join(_narrativeCtx.dbPath, "session_history");
  if (existsSync(historyDir)) {
    for (const f of readdirSync(historyDir)) {
      if (f.endsWith(".json") && !sessions.includes(f.replace(".json", ""))) {
        sessions.push(f.replace(".json", ""));
      }
    }
  }

  return c.json({ sessions: sessions.sort() });
});

/**
 * POST /snapshot — Save current game state.
 */
launch.post("/snapshot", async (c) => {
  if (!_narrativeCtx) {
    return c.json({ status: "error", error: "Server not initialized" }, 503);
  }
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = (body.session_id as string) ?? `snapshot_${Date.now()}`;

  const snapshotDir = join(_narrativeCtx.dbPath, "snapshots");
  if (!existsSync(snapshotDir)) {
    mkdirSync(snapshotDir, { recursive: true });
  }

  const state = {
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    clock: _narrativeCtx.clock.currentTime?.toISOString() ?? null,
    global_luck: 0.55,
    db_path: _narrativeCtx.dbPath,
  };

  writeFileSync(join(snapshotDir, `${sessionId}.json`), JSON.stringify(state, null, 2));
  log.info({ sessionId }, "Snapshot saved");

  return c.json({ status: "success", session_id: sessionId });
});

export { launch as launchRouter };
