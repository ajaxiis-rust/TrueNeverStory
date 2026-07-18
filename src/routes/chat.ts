/**
 * Chat routes — REST, SSE streaming, and WebSocket for roleplay.
 * Replaces world_explorer/routes/chat.py + api.py WebSocket endpoints.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ChatMessageSchema, SessionSetupSchema } from "../models/chat";
import type { RoleplayEngine } from "../services/roleplay-engine";
import type { WebSocketManager } from "../services/websocket-manager";
import { getLogger } from "../utils/logger";
import { sanitizeInput } from "../utils/sanitize";

const log = getLogger("chat");
const chat = new Hono();

let _engine: RoleplayEngine | null = null;
let _wsManager: WebSocketManager | null = null;

export function setEngine(engine: RoleplayEngine): void {
  _engine = engine;
}

export function setWSManager(manager: WebSocketManager): void {
  _wsManager = manager;
}

function getEngine(): RoleplayEngine {
  if (!_engine) throw new Error("RoleplayEngine not initialised");
  return _engine;
}

/**
 * POST /chat/setup — Initialize or update the active roleplay session.
 */
chat.post("/setup", zValidator("json", SessionSetupSchema), async (c) => {
  const body = c.req.valid("json");
  const engine = getEngine();

  const storyTime = body.story_time ? new Date(body.story_time) : new Date();
  const sessionId = body.session_id ?? `session_${Math.floor(Date.now() / 1000)}`;

  engine.setSession({
    character: body.character,
    location: body.location,
    storyTime,
    role: body.role,
    sessionId,
  });

  return c.json({
    active_character: engine.activeCharacter,
    current_location: engine.currentLocation,
    current_time: engine.currentTime.toISOString(),
    session_id: sessionId,
  });
});

/**
 * POST /chat/message — Send message, get narrative response.
 */
chat.post("/message", zValidator("json", ChatMessageSchema), async (c) => {
  const body = c.req.valid("json");
  const engine = getEngine();

  // Sanitize user input against prompt injection
  const sanitized = sanitizeInput(body.content);
  if (sanitized.wasModified) {
    log.warn({ patterns: sanitized.patterns }, "Prompt injection patterns detected and stripped");
  }

  if (body.character && body.character !== engine.activeCharacter) {
    engine.activeCharacter = body.character;
  }
  if (body.location && body.location !== engine.currentLocation) {
    engine.currentLocation = body.location;
  }
  if (body.story_time) {
    try { engine.currentTime = new Date(body.story_time); } catch (e) { log.debug({ err: e }, "Invalid story_time"); }
  }

  try {
    const result = await engine.processInput(sanitized.clean);
    if (typeof result === "object" && result !== null && "agentResponse" in result) {
      const agentResult = (result as { agentResponse: { response: string; agentId: string; agentName: string } }).agentResponse;
      return c.json({
        narrative: `【${agentResult.agentName}】\n${agentResult.response}`,
        agent_id: agentResult.agentId,
        agent_name: agentResult.agentName,
        location: engine.currentLocation,
        story_time: engine.currentTime.toISOString(),
        active_character: engine.activeCharacter,
        success: true,
      });
    }
    return c.json({
      narrative: result as string,
      location: engine.currentLocation,
      story_time: engine.currentTime.toISOString(),
      active_character: engine.activeCharacter,
      success: true,
    });
  } catch (err: unknown) {
    log.error({ err }, "Error processing message");
    return c.json({
      narrative: "",
      location: engine.currentLocation,
      story_time: engine.currentTime.toISOString(),
      active_character: engine.activeCharacter,
      success: false,
      error: "Internal error",
    });
  }
});

/**
 * POST /chat/agent — Send private service message to an agent.
 * Body: { agentId: string, message: string }
 */
chat.post("/agent", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { agentId?: string; message?: string };
  const engine = getEngine();

  if (!body.agentId || !body.message) {
    return c.json({ error: "agentId and message are required" }, 400);
  }

  // Sanitize user input against prompt injection
  const sanitized = sanitizeInput(body.message);
  if (sanitized.wasModified) {
    log.warn({ patterns: sanitized.patterns, agentId: body.agentId }, "Prompt injection detected in agent message");
  }

  try {
    const result = await engine.processAgentMessage(body.agentId, sanitized.clean);
    return c.json({
      narrative: `【${result.agentName}】\n${result.response}`,
      agent_id: result.agentId,
      agent_name: result.agentName,
      location: engine.currentLocation,
      story_time: engine.currentTime.toISOString(),
      active_character: engine.activeCharacter,
      success: true,
    });
  } catch (err: unknown) {
    log.error({ err }, "Error processing agent message");
    return c.json({
      narrative: "",
      success: false,
      error: "Internal error",
    });
  }
});

/**
 * POST /chat/stream — SSE streaming response for narrative.
 * Client sends same body as /message, receives streamed chunks.
 */
chat.post("/stream", zValidator("json", ChatMessageSchema), async (c) => {
  const body = c.req.valid("json");
  const engine = getEngine();

  // Sanitize user input against prompt injection
  const sanitized = sanitizeInput(body.content);
  if (sanitized.wasModified) {
    log.warn({ patterns: sanitized.patterns }, "Prompt injection patterns detected in stream");
  }

  if (body.character && body.character !== engine.activeCharacter) {
    engine.activeCharacter = body.character;
  }
  if (body.location && body.location !== engine.currentLocation) {
    engine.currentLocation = body.location;
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: "start", location: engine.currentLocation });

        // Collect chunks from generator into a queue (non-blocking)
        const queue: { type: string; content?: string; agent_id?: string; agent_name?: string; location?: string; story_time?: string; active_character?: string; error?: string }[] = [];
        let done = false;

        const genTask = (async () => {
          try {
            for await (const event of engine.processInputStream(sanitized.clean)) {
              queue.push(event);
            }
          } catch (err) {
            queue.push({ type: "error", error: err instanceof Error ? err.message : String(err) });
          }
          done = true;
        })();

        // Drain queue with keepalive pings while waiting for chunks
        while (!done || queue.length > 0) {
          if (queue.length > 0) {
            const event = queue.shift()!;
            send(event);
          } else {
            // Send keepalive comment while waiting for next chunk
            controller.enqueue(encoder.encode(": keepalive\n\n"));
            await new Promise(r => setTimeout(r, 100));
          }
        }

        await genTask;
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

/**
 * GET /chat/session — Current session state.
 */
chat.get("/session", async (c) => {
  const engine = getEngine();
  return c.json({
    active_character: engine.activeCharacter,
    current_location: engine.currentLocation,
    current_time: engine.currentTime.toISOString(),
    session_id: engine.activeSessionId,
  });
});

/**
 * GET /chat/history — Recent conversation history.
 */
chat.get("/history", async (c) => {
  const engine = getEngine();
  const limit = Number(c.req.query("limit") ?? "20");
  return c.json(engine.memory.getRecent(limit));
});

export { chat as chatRouter };
