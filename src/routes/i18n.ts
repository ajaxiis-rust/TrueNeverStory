/**
 * i18n routes — translation CRUD for UI strings.
 */

import { Hono } from "hono";
import { SQLiteStore } from "../lib/sqlite-store";
import { getConfig } from "../config/env";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("i18n-route");
const i18n = new Hono();

// Global SQLite store for translations (not per-world)
let _globalStore: SQLiteStore | null = null;
function getGlobalStore(): SQLiteStore {
  if (!_globalStore) {
    const cfg = getConfig();
    const globalDbPath = join(cfg.WORLD_DB_PATH, "global");
    _globalStore = new SQLiteStore(globalDbPath);
  }
  return _globalStore;
}

/**
 * GET /api/i18n/translations/:lang/:page — Get translations for a language+page.
 */
i18n.get("/i18n/translations/:lang/:page", async (c) => {
  const lang = c.req.param("lang");
  const page = c.req.param("page");
  const store = getGlobalStore();
  const translations = store.getTranslations(lang, page);
  return c.json({ language: lang, page, translations });
});

/**
 * GET /api/i18n/translations/:lang — Get all translations for a language.
 */
i18n.get("/i18n/translations/:lang", async (c) => {
  const lang = c.req.param("lang");
  const store = getGlobalStore();
  const translations = store.getTranslations(lang);
  return c.json({ language: lang, translations });
});

/**
 * PUT /api/i18n/translations — Upsert batch of translations.
 * Body: { language, page, entries: { key: value } }
 */
i18n.put("/i18n/translations", async (c) => {
  const body = await c.req.json<{ language: string; page: string; entries: Record<string, string> }>();
  const { language, page, entries } = body;
  if (!language || !page || !entries) {
    return c.json({ error: "Missing language, page, or entries" }, 400);
  }
  const store = getGlobalStore();
  store.upsertTranslations(language, page, entries);
  log.info({ language, page, count: Object.keys(entries).length }, "Translations upserted");
  return c.json({ ok: true });
});

/**
 * DELETE /api/i18n/translations/:lang/:page/:key — Delete a single translation key.
 */
i18n.delete("/i18n/translations/:lang/:page/:key", async (c) => {
  const lang = c.req.param("lang");
  const page = c.req.param("page");
  const key = c.req.param("key");
  const store = getGlobalStore();
  store.deleteTranslation(lang, page, key);
  log.info({ lang, page, key }, "Translation deleted");
  return c.json({ ok: true });
});

export { i18n as i18nRouter };