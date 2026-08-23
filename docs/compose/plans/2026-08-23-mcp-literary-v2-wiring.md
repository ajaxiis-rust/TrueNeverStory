# MCP Literary Tab → V2 Wiring Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/mcp-literary-v2-wiring.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переподключить вкладку Literary в `public/mcp.html` на `literary.db` (v2: `scene_templates` + `style_patterns`) с поиском и expandable-rows, перенацелить Compact на `literary.db`, убрать кнопку Compile.

**Architecture:** Бэкенд `src/routes/mcp.ts`: 4 эндпоинта Literary читают `LITERARY_DB` вместо `LIT_COMP_DB`. Фронтенд `public/mcp.html`: 2 секции поиска (Scene Templates, Style Patterns) + expandable rows + только Compact-кнопка. LIKE-поиск, без FTS5/зависимостей.

**Tech Stack:** Hono (backend), SQLite (`bun:sqlite`), vanilla JS/HTML (frontend), `bun:test`.

## Global Constraints

- Не трогать `POST /literary/compile` эндпоинт и `scripts/compile-classics.ts` — на нём держится тест `src/routes/mcp.test.ts:191`.
- Не трогать Pipeline-вкладку и `scripts/process-gutenberg.ts`.
- LIKE-поиск как в существующем коде (не FTS5).
- `data/literary-compiler/literary.db` существует на диске (175 МБ) — эндпоинты работают с реальным файлом.
- Compact через существующий `scripts/compact-db.ts` (логику скрипта не меняем, только пути `--src`/`--dst`).
- i18n-ключи добавляются в `en` + `ru`; для остальных языков сработает fallback на `en` через `t(k) = I18N[currentLang]?.[k] || I18N.en[k] || k`.

---

## File Structure

- **Modify** `src/routes/mcp.ts:638-677` — переписать `literary/stats`, `literary/templates`, `literary/compact`; добавить `literary/styles`.
- **Modify** `public/mcp.html` — панель Literary (`:265-280`), JS (`:1043-1056`), i18n (`:421-422, 498-499`), loader (`:1343`).
- **Test** `src/routes/mcp.test.ts` — добавить блок «Literary v2».

---

## Task 1: Backend — Literary endpoints на v2 (`literary.db`)

**Covers:** бэкенд-часть дизайна.

**Files:**
- Modify: `src/routes/mcp.ts:638-677`
- Test: `src/routes/mcp.test.ts` (добавить блок после `:190-198`)

**Interfaces:**
- Consumes: `LITERARY_DB` const (`mcp.ts:29`), `existsSync`/`statSync`/`Database`/`log` (уже импортированы).
- Produces:
  - `GET /literary/stats` → `{ exists, sceneTemplates, stylePatterns, avgQuality, size, dbPath }`
  - `GET /literary/templates?q=` → `{ templates: SceneTemplate[], query }`
  - `GET /literary/styles?q=` → `{ styles: StylePattern[], query }`
  - `POST /literary/compact` → `{ jobId, stream }`

- [ ] **Step 1: Write failing tests in `src/routes/mcp.test.ts`**

Вставить после существующего блока `describe("Literary compile", ...)` (строка ~198):

```typescript
  describe("Literary v2", () => {
    test("GET /mcp/literary/stats returns v2 fields", async () => {
      const res = await app.request("/mcp/literary/stats");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("sceneTemplates");
      expect(body).toHaveProperty("stylePatterns");
      expect(body).toHaveProperty("avgQuality");
      expect(typeof body.size).toBe("number");
    });

    test("GET /mcp/literary/templates returns scene rows array", async () => {
      const res = await app.request("/mcp/literary/templates?q=a");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.templates).toBeArray();
    });

    test("GET /mcp/literary/styles returns style rows array", async () => {
      const res = await app.request("/mcp/literary/styles?q=a");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.styles).toBeArray();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/routes/mcp.test.ts`
Expected: FAIL — `literary/styles` 404 (нет эндпоинта), `literary/stats` ещё не имеет `sceneTemplates`.

- [ ] **Step 3: Rewrite the 4 endpoints in `src/routes/mcp.ts`**

Заменить блок `mcpRouter.get("/literary/stats", ...)` … `mcpRouter.post("/literary/compact", ...)` (строки 638–677) целиком:

```typescript
mcpRouter.get("/literary/stats", (c) => {
  if (!existsSync(LITERARY_DB)) return c.json({ error: "Literary DB not found", exists: false }, 200);
  const stat = statSync(LITERARY_DB);
  let sceneTemplates = 0, stylePatterns = 0, avgQuality = 0;
  try {
    const db = new Database(LITERARY_DB, { readonly: true });
    sceneTemplates = (db.query("SELECT COUNT(*) as n FROM scene_templates").get() as { n: number } | null)?.n ?? 0;
    stylePatterns = (db.query("SELECT COUNT(*) as n FROM style_patterns").get() as { n: number } | null)?.n ?? 0;
    avgQuality = (db.query("SELECT AVG(quality_score) as a FROM scene_templates").get() as { a: number | null } | null)?.a ?? 0;
    db.close();
  } catch (err) { log.debug({ err }, 'mcp literary stats query skipped, table may not exist'); }
  return c.json({ exists: true, sceneTemplates, stylePatterns, avgQuality: Math.round((avgQuality ?? 0) * 100) / 100, size: stat.size, dbPath: LITERARY_DB });
});

mcpRouter.get("/literary/templates", (c) => {
  const q = c.req.query("q") ?? "";
  if (!existsSync(LITERARY_DB)) return c.json({ error: "Literary DB not found" }, 200);
  let templates: unknown[] = [];
  try {
    const db = new Database(LITERARY_DB, { readonly: true });
    if (q) {
      templates = db.query(
        "SELECT * FROM scene_templates WHERE template_text LIKE ? OR source_book LIKE ? OR archetype_primary LIKE ? OR mood LIKE ? OR tags LIKE ? ORDER BY quality_score DESC LIMIT 50"
      ).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`) as unknown[];
    } else {
      templates = db.query("SELECT * FROM scene_templates ORDER BY quality_score DESC LIMIT 50").all() as unknown[];
    }
    db.close();
  } catch (err) { log.debug({ err }, 'mcp literary templates query skipped, table may not exist'); }
  return c.json({ templates, query: q });
});

mcpRouter.get("/literary/styles", (c) => {
  const q = c.req.query("q") ?? "";
  if (!existsSync(LITERARY_DB)) return c.json({ error: "Literary DB not found" }, 200);
  let styles: unknown[] = [];
  try {
    const db = new Database(LITERARY_DB, { readonly: true });
    if (q) {
      styles = db.query(
        "SELECT * FROM style_patterns WHERE source_author_or_era LIKE ? OR register LIKE ? OR tone LIKE ? OR era LIKE ? OR literary_period LIKE ? ORDER BY quality_score DESC LIMIT 50"
      ).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`) as unknown[];
    } else {
      styles = db.query("SELECT * FROM style_patterns ORDER BY quality_score DESC LIMIT 50").all() as unknown[];
    }
    db.close();
  } catch (err) { log.debug({ err }, 'mcp literary styles query skipped, table may not exist'); }
  return c.json({ styles, query: q });
});

mcpRouter.post("/literary/compile", (c) => {
  const result = runScriptWithJob(["bun", "run", "scripts/compile-classics.ts"]);
  return c.json(result);
});

mcpRouter.post("/literary/compact", (c) => {
  if (!existsSync(LITERARY_DB)) return c.json({ error: "Literary DB not found" }, 200);
  const result = runScriptWithJob(["bun", "run", "scripts/compact-db.ts", "--src", LITERARY_DB, "--dst", LITERARY_DB + ".compact"]);
  return c.json(result);
});
```

> `literary/compile` эндпоинт оставлен без изменений (требование Global Constraints) — кнопка из UI убирается в Task 2, но эндпоинт жив.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/routes/mcp.test.ts`
Expected: PASS — 3 новых теста `Literary v2` зелёные, существующий `Literary compile` тест тоже зелёный.

- [ ] **Step 5: Commit**

```bash
git add src/routes/mcp.ts src/routes/mcp.test.ts
git commit -m "feat(mcp): wire literary endpoints to v2 literary.db (scene_templates + style_patterns)"
```

---

## Task 2: Frontend — вкладка Literary v2

**Covers:** фронтенд-часть дизайна.

**Files:**
- Modify: `public/mcp.html` — панель Literary (`:265-280`), JS-блок Literary (`:1043-1056`), i18n en (`:421-422`), i18n ru (`:498-499`), loader (`:1343`).

**Interfaces:**
- Consumes: эндпоинты Task 1 (`literary/stats`, `literary/templates`, `literary/styles`, `literary/compact`).
- Produces: рабочая вкладка Literary с 2 секциями поиска, expandable rows, 1 кнопкой Compact.

- [ ] **Step 1: Replace the Literary panel HTML (`public/mcp.html:265-280`)**

Заменить весь блок `<!-- Literary -->` … закрывающий `</div>` панели:

```html
  <!-- Literary -->
  <div class="panel" id="panel-literary">
    <div class="stats-grid" id="literary-stats"></div>
    <div class="section">
      <div class="section__title" data-i18n="mcp.literary.scenes">Scene Templates</div>
      <div class="search-row">
        <input class="input" id="literary-scenes-q" placeholder="Search scene templates..." data-i18n-placeholder="mcp.literary.scenesPlaceholder">
        <button class="btn" onclick="searchLiteraryScenes()" data-i18n="mcp.search" data-i18n-title="mcp.search.title">Search</button>
      </div>
      <div id="literary-scenes-results"></div>
    </div>
    <div class="section">
      <div class="section__title" data-i18n="mcp.literary.styles">Style Patterns</div>
      <div class="search-row">
        <input class="input" id="literary-styles-q" placeholder="Search style patterns..." data-i18n-placeholder="mcp.literary.stylesPlaceholder">
        <button class="btn" onclick="searchLiteraryStyles()" data-i18n="mcp.search" data-i18n-title="mcp.search.title">Search</button>
      </div>
      <div id="literary-styles-results"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="runAction('literary/compact')" data-i18n="mcp.literary.compact" data-i18n-title="mcp.literary.compact.title">Compact</button>
    </div>
  </div>
```

- [ ] **Step 2: Update i18n keys — en block (`public/mcp.html:421-422`)**

Заменить две строки:
```
    "mcp.literary.templates": "Quest Templates", "mcp.literary.searchPlaceholder": "Search templates...",
    "mcp.literary.compile": "Compile", "mcp.literary.compact": "Compact",
```
на:
```
    "mcp.literary.scenes": "Scene Templates", "mcp.literary.scenesPlaceholder": "Search scene templates...",
    "mcp.literary.styles": "Style Patterns", "mcp.literary.stylesPlaceholder": "Search style patterns...",
    "mcp.literary.compact": "Compact",
```

- [ ] **Step 3: Update i18n keys — ru block (`public/mcp.html:498-499`)**

Заменить:
```
    "mcp.literary.templates": "Шаблоны квестов", "mcp.literary.searchPlaceholder": "Поиск шаблонов...",
    "mcp.literary.compile": "Компилировать", "mcp.literary.compact": "Компактизировать",
```
на:
```
    "mcp.literary.scenes": "Сцены-шаблоны", "mcp.literary.scenesPlaceholder": "Поиск сцен-шаблонов...",
    "mcp.literary.styles": "Стилевые паттерны", "mcp.literary.stylesPlaceholder": "Поиск стилевых паттернов...",
    "mcp.literary.compact": "Компактизировать",
```

- [ ] **Step 4: Replace the Literary JS block (`public/mcp.html:1043-1056`)**

Заменить функции `loadLiteraryStats` и `searchLiterary` целиком:

```javascript
// ── Literary ──────────────────────────────────────────────────
async function loadLiteraryStats() {
  const d = await api("literary/stats");
  const el = document.getElementById("literary-stats");
  if (!d?.exists) { el.innerHTML = '<div class="empty">Literary DB not found</div>'; return; }
  el.innerHTML = `<div class="stat-card"><div class="stat-card__value">${d.sceneTemplates}</div><div class="stat-card__label">Scene Templates</div></div><div class="stat-card"><div class="stat-card__value">${d.stylePatterns}</div><div class="stat-card__label">Style Patterns</div></div><div class="stat-card"><div class="stat-card__value">${fmtBytes(d.size)}</div><div class="stat-card__label">Size</div></div><div class="stat-card"><div class="stat-card__value">${d.avgQuality ?? 0}</div><div class="stat-card__label">Avg Quality</div></div>`;
}

async function searchLiteraryScenes() {
  const q = document.getElementById("literary-scenes-q").value;
  const d = await api("literary/templates" + (q ? "?q=" + encodeURIComponent(q) : ""));
  const el = document.getElementById("literary-scenes-results");
  if (!d?.templates?.length) { el.innerHTML = '<div class="empty">No results</div>'; return; }
  el.innerHTML = '<table class="result-table"><tr><th>Book</th><th>Archetype</th><th>Template</th><th>Mood</th><th>Quality</th></tr>' + d.templates.map(r => {
    const rid = "scene-" + escapeHtml(String(r.id || ""));
    return `<tr style="cursor:pointer" onclick="toggleLiteraryRow('${rid}')"><td>${escapeHtml((r.source_book||"-").split("::").pop().slice(0,30))}</td><td>${escapeHtml(r.archetype_primary||"-")}${r.archetype_secondary?' / '+escapeHtml(r.archetype_secondary):''}</td><td>${escapeHtml((r.template_text||"").slice(0,80))}…</td><td>${escapeHtml(r.mood||"-")}</td><td>${Number(r.quality_score||0).toFixed(2)}</td></tr><tr id="${rid}" style="display:none"><td colspan="5"><div class="result-box">${formatSceneFields(r)}</div></td></tr>`;
  }).join("") + '</table>';
}

async function searchLiteraryStyles() {
  const q = document.getElementById("literary-styles-q").value;
  const d = await api("literary/styles" + (q ? "?q=" + encodeURIComponent(q) : ""));
  const el = document.getElementById("literary-styles-results");
  if (!d?.styles?.length) { el.innerHTML = '<div class="empty">No results</div>'; return; }
  el.innerHTML = '<table class="result-table"><tr><th>Author/Era</th><th>Register</th><th>Tone</th><th>Era</th><th>Voice</th></tr>' + d.styles.map(r => {
    const rid = "style-" + escapeHtml(String(r.id || ""));
    return `<tr style="cursor:pointer" onclick="toggleLiteraryRow('${rid}')"><td>${escapeHtml((r.source_author_or_era||"-").slice(0,30))}</td><td>${escapeHtml(r.register||"-")}</td><td>${escapeHtml(r.tone||"-")}</td><td>${escapeHtml(r.era||"-")}</td><td>${escapeHtml(r.narrative_voice||"-")}</td></tr><tr id="${rid}" style="display:none"><td colspan="5"><div class="result-box">${formatStyleFields(r)}</div></td></tr>`;
  }).join("") + '</table>';
}

function toggleLiteraryRow(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === "none" ? "table-row" : "none";
}

function formatSceneFields(r) {
  const fields = [
    ["ID", r.id], ["Source", r.source_book], ["Chapter", r.source_chapter],
    ["Archetype (primary/secondary)", [r.archetype_primary, r.archetype_secondary].filter(Boolean).join(" / ")],
    ["Mood", r.mood], ["Difficulty", r.difficulty], ["Domain", r.domain], ["Scale", r.scale],
    ["Moral ambiguity", r.moral_ambiguity],
    ["Quality score", r.quality_score != null ? Number(r.quality_score).toFixed(3) : null],
    ["Use count", r.use_count], ["Last used at", r.last_used_at ? new Date(r.last_used_at*1000).toISOString() : null],
    ["Tags", Array.isArray(r.tags) ? r.tags.join(", ") : r.tags],
    ["Variables", Array.isArray(r.variables) ? r.variables.join(", ") : r.variables],
    ["Beat sequence", Array.isArray(r.beat_sequence) ? r.beat_sequence.join(" → ") : r.beat_sequence],
    ["Tension curve", Array.isArray(r.tension_curve) ? r.tension_curve.join(", ") : r.tension_curve],
    ["Applicable positions", Array.isArray(r.applicable_positions) ? r.applicable_positions.join(", ") : r.applicable_positions],
    ["Embedding id", r.embedding_id],
    ["Created at", r.created_at ? new Date(r.created_at*1000).toISOString() : null],
    ["Template text", r.template_text],
  ];
  return fields.filter(f => f[1] != null && f[1] !== "").map(f => `<div><strong>${f[0]}:</strong> ${escapeHtml(String(f[1]))}</div>`).join("");
}

function formatStyleFields(r) {
  const fields = [
    ["ID", r.id], ["Author/Era", r.source_author_or_era], ["Register", r.register],
    ["Pacing", r.pacing], ["Tone", r.tone], ["Sensory ratio", r.sensory_ratio],
    ["Avg sentence len", r.avg_sentence_len], ["Sentence len variance", r.sentence_len_variance],
    ["Narrative voice", r.narrative_voice], ["Temporal style", r.temporal_style],
    ["Dialogue style", r.dialogue_style], ["Metaphor density", r.metaphor_density],
    ["Paragraph length avg", r.paragraph_length_avg], ["Exclamation ratio", r.exclamation_ratio],
    ["Era", r.era], ["Literary period", r.literary_period],
    ["Quality score", r.quality_score != null ? Number(r.quality_score).toFixed(3) : null],
    ["Rhetorical devices", Array.isArray(r.rhetorical_devices) ? r.rhetorical_devices.join(", ") : r.rhetorical_devices],
    ["Preferred constructions", Array.isArray(r.preferred_constructions) ? r.preferred_constructions.join("; ") : r.preferred_constructions],
    ["Forbidden phrases", Array.isArray(r.forbidden_phrases) ? r.forbidden_phrases.join("; ") : r.forbidden_phrases],
    ["Example snippets", Array.isArray(r.example_snippets) ? r.example_snippets.join(" ⏐ ") : r.example_snippets],
    ["Created at", r.created_at ? new Date(r.created_at*1000).toISOString() : null],
  ];
  return fields.filter(f => f[1] != null && f[1] !== "").map(f => `<div><strong>${f[0]}:</strong> ${escapeHtml(String(f[1]))}</div>`).join("");
}
```

- [ ] **Step 5: Verify loader entry (`public/mcp.html:1343`)**

Строка `const loaders = { dashboard: loadDashboard, ..., literary: loadLiteraryStats, ... };` — `loadLiteraryStats` имя не изменилось, правка не нужна. Просто проверить, что `searchLiterary` больше нигде не вызывается из HTML (кнопка убрана в Step 1).

Run: `rg "searchLiterary\b" public/mcp.html`
Expected: нет совпадений (только `searchLiteraryScenes`/`searchLiteraryStyles`).

- [ ] **Step 6: Manual verification**

Run: `bash startgame.sh --mcp` (или как проект запускает MCP-консоль на :8000), открыть `http://localhost:8000/mcp.html`, вкладка Literary:
- Stats показывает 4 карточки (Scene Templates / Style Patterns / Size / Avg Quality).
- Поиск по сценам возвращает таблицу; клик по строке раскрывает все поля.
- Поиск по стилям — аналогично.
- Кнопка Compact запускает job (progress-bar).
- Кнопки Compile во вкладке Literary нет.

- [ ] **Step 7: Commit**

```bash
git add public/mcp.html
git commit -m "feat(mcp): rewrite Literary tab to v2 (scene_templates + style_patterns, expandable rows)"
```

---

## Self-Review

**1. Spec coverage:** Дизайн (бэкенд + фронтенд) покрыт Task 1 (Covers: бэкенд) + Task 2 (Covers: фронтенд). Раскрытие полей («понятно что записано») — `formatSceneFields`/`formatStyleFields` в Task 2. Compact-перенацелка — Task 1 Step 3 + Task 2 Step 1 (кнопка). Compile убран — Task 2 Step 1. ✓

**2. Placeholder scan:** Нет «TODO»/«TBD»; каждый шаг содержит полный код или точную команду. ✓

**3. Type consistency:** Имена эндпоинтов и полей согласованы: `literary/stats` → `sceneTemplates`/`stylePatterns`/`avgQuality` (Task 1) == `d.sceneTemplates`/`d.stylePatterns`/`d.avgQuality` (Task 2 `loadLiteraryStats`). `literary/templates` → `templates` (Task 1) == `d.templates` (Task 2 `searchLiteraryScenes`). `literary/styles` → `styles` == `d.styles`. Колонки таблиц `source_book`/`archetype_primary`/`template_text`/`mood`/`quality_score` (scene) и `source_author_or_era`/`register`/`tone`/`era`/`narrative_voice` (style) совпадают со схемой `src/mcp/literary-compiler/schema.ts:174-227`. ✓

---

## Execution Handoff

План сохранён в `docs/compose/plans/2026-08-23-mcp-literary-v2-wiring.md`. Дальше — выбор стиля исполнения.
