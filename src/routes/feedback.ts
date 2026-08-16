/**
 * Feedback routes — like/dislike literary preferences.
 */

import { Hono } from "hono";
import { getFeedbackStore, type FeedbackReaction } from "../services/feedback-store";
import { LITERARY_PARAMS, type LiteraryParam } from "../services/literary-modulation";
import { getLogger } from "../utils/logger";
import { safeJsonBody } from "../utils/safe-request";

const log = getLogger("feedback-route");
export const feedbackRouter = new Hono();

/**
 * POST /feedback — record like/dislike/neutral for the last narrative turn.
 * Body: { turnId: number, reaction: 'like'|'dislike'|'neutral', techniques: string[] }
 */
feedbackRouter.post("/feedback", async (c) => {
  const body = await safeJsonBody<{ turnId?: number; reaction?: string; techniques?: string[] }>(c);
  const { turnId, reaction, techniques } = body;

  if (typeof turnId !== 'number' || !reaction || !Array.isArray(techniques)) {
    return c.json({ error: "Missing required fields: turnId (number), reaction, techniques (array)" }, 400);
  }
  if (!['like', 'dislike', 'neutral'].includes(reaction)) {
    return c.json({ error: "Invalid reaction. Must be: like, dislike, neutral" }, 400);
  }
  const unknown = techniques.filter((t: string) => !(LITERARY_PARAMS as readonly string[]).includes(t));
  if (unknown.length > 0) {
    return c.json({ error: `Unknown techniques: ${unknown.join(', ')}` }, 400);
  }

  getFeedbackStore().record({
    turnId,
    reaction: reaction as FeedbackReaction,
    techniques: techniques as LiteraryParam[],
  });
  log.info({ turnId, reaction }, "feedback recorded");
  return c.json({ ok: true });
});
