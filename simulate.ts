/**
 * TNS Game Simulation — runs a full game session via WebSocket.
 * Simulates: login → setup → movement → dialogue → action → quests → observation
 */

const BASE_URL = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws";
const PASSWORD = "changeme";

interface WSMessage {
  type: string;
  [key: string]: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function login(): Promise<string> {
  console.log("[0] Logging in...");
  const res = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `password=${PASSWORD}`,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/bring_session=([^;]+)/);
  if (!match) throw new Error(`Login failed: ${res.status} ${setCookie}`);
  console.log(`    Logged in, session: ${match[1]!.slice(0, 12)}...`);
  return match[1]!;
}

function waitForMessage(ws: WebSocket, timeoutMs = 60000): Promise<WSMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
    const handler = (ev: MessageEvent) => {
      clearTimeout(timer);
      ws.removeEventListener("message", handler);
      try {
        resolve(JSON.parse(ev.data as string));
      } catch {
        resolve({ type: "raw", data: ev.data });
      }
    };
    ws.addEventListener("message", handler);
  });
}

async function sendAndReceive(ws: WebSocket, msg: Record<string, unknown>, label: string): Promise<WSMessage> {
  console.log(`\n>>> ${label}`);
  console.log(`    Sending: ${JSON.stringify(msg).slice(0, 200)}`);
  ws.send(JSON.stringify(msg));

  // Read all messages until we get a final one (narrative/agent/done/error)
  let finalResult: WSMessage | null = null;
  const startTime = Date.now();
  const timeout = 120000; // 2 min per turn (LLM can be slow)

  while (Date.now() - startTime < timeout) {
    const result = await waitForMessage(ws, timeout - (Date.now() - startTime));

    if (result.type === "heartbeat") {
      // Progress update — just log it briefly
      const stage = result.stage || result.message || "...";
      process.stdout.write(`\r    ⏳ ${stage}...`);
    } else {
      // Final result
      finalResult = result;
      process.stdout.write("\r" + " ".repeat(60) + "\r"); // clear heartbeat line
      break;
    }
  }

  if (!finalResult) {
    console.log("    ⚠️  Timeout waiting for response");
    return { type: "timeout" };
  }

  console.log(`<<< Response (${finalResult.type}):`);
  const text = (finalResult.narrative as string) || (finalResult.content as string) || JSON.stringify(finalResult, null, 2);
  const lines = text.split("\n");
  for (const line of lines.slice(0, 40)) {
    console.log(`    ${line}`);
  }
  if (lines.length > 40) console.log(`    ... (${lines.length - 40} more lines)`);
  return finalResult;
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  TrueNeverStory — Full Game Simulation");
  console.log("═══════════════════════════════════════════════════");

  // Login
  const sessionToken = await login();

  // Connect WebSocket with auth cookie
  console.log("\n[1] Connecting to WebSocket...");
  const ws = new WebSocket(WS_URL, {
    headers: { cookie: `bring_session=${sessionToken}` },
  });

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (e) => reject(e));
    setTimeout(() => reject(new Error("Connection timeout")), 5000);
  });
  console.log("    Connected!");

  try {
    // ── Phase 1: Setup Session ──────────────────────────────
    console.log("\n═══ Phase 1: Session Setup ═══");
    await sendAndReceive(ws, {
      type: "setup",
      character: "Aldric",
      location: "village_square",
      story_time: "2024-01-01T08:00:00Z",
      role: "protagonist",
    }, "Setup session — Character: Aldric, Location: village_square");

    await sleep(500);

    // ── Phase 2: Observation ────────────────────────────────
    console.log("\n═══ Phase 2: Look Around ═══");
    await sendAndReceive(ws, {
      type: "message",
      content: "look around",
    }, "Look around the village square");

    await sleep(1000);

    // ── Phase 3: Movement ──────────────────────────────────
    console.log("\n═══ Phase 3: Movement ═══");
    await sendAndReceive(ws, {
      type: "message",
      content: "go to the tavern",
    }, "Move to the tavern");

    await sleep(1000);

    // ── Phase 4: Dialogue with NPC ─────────────────────────
    console.log("\n═══ Phase 4: Dialogue ═══");
    await sendAndReceive(ws, {
      type: "message",
      content: "say to the bartender hello, what's the news?",
    }, "Talk to the bartender");

    await sleep(1000);

    // ── Phase 5: Action (examine) ──────────────────────────
    console.log("\n═══ Phase 5: Examine ═══");
    await sendAndReceive(ws, {
      type: "message",
      content: "examine the tavern menu",
    }, "Examine the tavern menu");

    await sleep(1000);

    // ── Phase 6: Quest check ───────────────────────────────
    console.log("\n═══ Phase 6: Quests ═══");
    await sendAndReceive(ws, {
      type: "message",
      content: "/quests",
    }, "Check active quests");

    await sleep(1000);

    // ── Phase 7: Movement to forest ────────────────────────
    console.log("\n═══ Phase 7: Move to Forest ═══");
    await sendAndReceive(ws, {
      type: "message",
      content: "go to the forest",
    }, "Move to the forest");

    await sleep(1000);

    // ── Phase 8: Action in forest ──────────────────────────
    console.log("\n═══ Phase 8: Forest Action ═══");
    await sendAndReceive(ws, {
      type: "message",
      content: "search for herbs in the forest",
    }, "Search for herbs");

    await sleep(1000);

    // ── Phase 9: Status ────────────────────────────────────
    console.log("\n═══ Phase 9: Status ═══");
    await sendAndReceive(ws, {
      type: "message",
      content: "/status",
    }, "Check character status");

    await sleep(1000);

    // ── Phase 10: More dialogue ────────────────────────────
    console.log("\n═══ Phase 10: Dialogue in Forest ═══");
    await sendAndReceive(ws, {
      type: "message",
      content: "look around the forest clearing",
    }, "Observe forest clearing");

    console.log("\n═══════════════════════════════════════════════════");
    console.log("  Simulation complete — 10 turns executed");
    console.log("═══════════════════════════════════════════════════");

  } catch (err) {
    console.error("\nSimulation error:", err);
  } finally {
    ws.close();
    console.log("\nWebSocket closed.");
  }
}

main().catch(console.error);
