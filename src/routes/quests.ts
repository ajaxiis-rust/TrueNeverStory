/**
 * Quest routes — full implementation.
 * Replaces api.py quest endpoints.
 */
import { Hono } from "hono";
import type { QuestManager } from "../services/quest-manager";
import { getLogger } from "../utils/logger";

const log = getLogger("quests-route");

interface QuestResponse {
  id: string;
  title: string;
  description: string;
  progress: number;
  status: string;
  npc: string;
  location: string;
  objectives: string[];
}

const quests = new Hono();

let _questMgr: QuestManager | null = null;

export function initQuests(questMgr: QuestManager): void {
  _questMgr = questMgr;
}

quests.get("/quests", async (c) => {
  if (!_questMgr) return c.json({ quests: [] });

  try {
    const allQuests = _questMgr.getAllQuests?.() ?? [];
    return c.json({
      quests: allQuests.map((q): QuestResponse => ({
        id: q.id,
        title: q.title,
        description: q.description,
        progress: 0,
        status: q.status,
        npc: q.giver ?? "",
        location: "",
        objectives: (q.objectives ?? []).map((o) => typeof o === "string" ? o : o.description ?? ""),
      })),
    });
  } catch (err) {
    log.warn({ err }, "Failed to load quests");
    return c.json({ quests: [] });
  }
});

quests.get("/quest/:questId", async (c) => {
  const questId = c.req.param("questId");
  if (!_questMgr) return c.json({ error: "Quest not found" }, 404);

  const quest = _questMgr.getQuest?.(questId);
  if (!quest) return c.json({ error: "Quest not found" }, 404);

  return c.json({
    id: quest.id,
    title: quest.title,
    description: quest.description,
    status: quest.status,
    objectives: (quest.objectives ?? []).map((o) => typeof o === "string" ? o : o.description ?? ""),
  });
});

export { quests as questsRouter };
