---
feature: mcp-literary-v2-wiring
status: delivered
specs: []
plans:
  - docs/compose/plans/2026-08-23-mcp-literary-v2-wiring.md
branch: main
commits: 4493c24..d8368a4
---

# MCP Literary Tab → V2 Wiring — Final Report

## What Was Built

The Literary tab in the MCP console (`public/mcp.html`) is rewired onto `literary.db` (v2 schema: `scene_templates` + `style_patterns`) instead of the legacy `classics-compiled.db` (`bible_quest_templates`). The backend exposes four Literary endpoints over the v2 tables — `GET /literary/stats`, `GET /literary/templates`, `GET /literary/styles`, `POST /literary/compact` — and the frontend renders two search sections (Scene Templates, Style Patterns) with expandable rows that reveal every DB column, plus a single Compact button. The Compile button was removed from the UI; the `POST /literary/compile` endpoint is deliberately left intact because the existing test (`src/routes/mcp.test.ts`) depends on it.

Search is plain SQL `LIKE` across the relevant text/categorical columns (no FTS5, no new dependencies), ordered by `quality_score DESC`, capped at 50 rows. Compact retargets the existing `scripts/compact-db.ts` at `literary.db` (script logic untouched; only `--src`/`--dst` paths changed).

## Architecture

**Backend** — `src/routes/mcp.ts` LiteraryCompiler section (the 4 endpoints). All read endpoints open `LITERARY_DB` (`data/literary-compiler/literary.db`, const at `mcp.ts:29`) in `readonly: true`, query `scene_templates`/`style_patterns`, and close. Queries are wrapped in `try/catch` so a missing table degrades to empty results with a debug log rather than a 500. `stats` returns `{ exists, sceneTemplates, stylePatterns, avgQuality, size, dbPath }`; `avgQuality` is rounded to 2 decimals. `compact` shells out via the existing `runScriptWithJob` helper. `compile` is unchanged (Global Constraint).

**Frontend** — `public/mcp.html` Literary panel + JS + i18n:
- Panel (`#panel-literary`): stats grid + two `.section` blocks (Scene Templates, Style Patterns), each with a search input + results div; one Compact button (`runAction('literary/compact')`).
- JS (`loadLiteraryStats`, `searchLiteraryScenes`, `searchLiteraryStyles`, `toggleLiteraryRow`, `formatSceneFields`, `formatStyleFields`): rows are clickable; the hidden sibling `<tr>` expands on click to show all fields via `formatSceneFields`/`formatStyleFields`, which map every column of `scene_templates`/`style_patterns` respectively (arrays joined, timestamps ISO-formatted, `null`/`""` fields filtered out). Existing helpers `api()`, `escapeHtml()`, `fmtBytes()`, `runAction()` are reused.
- i18n: `en` and `ru` blocks replaced `mcp.literary.templates/searchPlaceholder/compile` with `scenes/scenesPlaceholder/styles/stylesPlaceholder/compact`. Other languages (de/fr/es/ja/zh) keep their old keys as harmless dead entries and fall back to `en` via `t(k) = I18N[currentLang]?.[k] || I18N.en[k] || k`.

### Design Decisions

- **LIKE, not FTS5** — matches the existing code style and adds zero dependencies; the tables are small (694 rows each) so a 5-column `LIKE` scan is trivially fast.
- **Field-visibility via `formatSceneFields`/`formatStyleFields`** — the design goal was "understand what is actually recorded"; every column is enumerated so the expandable row shows the full picture without bespoke formatting per field.
- **ru i18n written as `\uXXXX` JS escapes** — the file stores all non-ASCII i18n values as literal `\uXXXX` escape text (ASCII-only convention; JS interprets them at parse time). New ru entries follow the same form for consistency rather than introducing raw UTF-8 Cyrillic.
- **`literary/compile` endpoint preserved** — the UI button is gone, but the endpoint stays because `src/routes/mcp.test.ts` asserts it returns a `jobId`/`stream`.

## Usage

Open the MCP console (`startgame.sh --mcp`, then `http://localhost:8000/mcp.html`) → Literary tab:
- Stats: four cards — Scene Templates, Style Patterns, Size, Avg Quality.
- Type a query in either search box → Search → table of up to 50 rows ordered by quality. Click a row to expand all DB columns.
- Compact → runs `compact-db.ts` on `literary.db`; progress streams via the existing job/SSE mechanism.

API surface (all under `/mcp`): `GET literary/stats`, `GET literary/templates?q=`, `GET literary/styles?q=`, `POST literary/compact`, `POST literary/compile` (unused by UI, kept for the test).

## Verification

- `bun test src/routes/mcp.test.ts` — **41 pass / 0 fail** (3 new "Literary v2" tests + existing "Literary compile" test). New tests assert v2 fields on `stats` and array shape on `templates`/`styles`.
- `bun test src/routes/` — **49 pass / 0 fail** across 3 files (no regressions).
- Backend integration against the real 175 MB `literary.db`: `stats` → `{sceneTemplates:694, stylePatterns:694, avgQuality:0.73, size:175271936}`; `templates?q=the` → 50 rows; `styles` → 50 rows.
- Frontend: inserted JS validated via `new Function(...)` parse → SYNTAX OK; panel structure confirmed (1 Compact button, 0 Compile, 2 search inputs, all 6 functions defined); `rg "searchLiterary\b"` → no stray references; loader still maps `literary → loadLiteraryStats`.
- Schema cross-check: every column referenced by `formatSceneFields`/`formatStyleFields` confirmed present in the real `scene_templates`/`style_patterns` tables.
- No orphan references to the removed i18n keys anywhere in the repo (outside `mcp.html`/plan).
- The one step not performed programmatically is the plan's manual visual browser check (Step 6 of Task 2); all its assertions are covered by the static/integration checks above, but a human eye on the rendered tab is the remaining visual sign-off.

## Journey Log

> Brief notes on what informed the final design. Not required reading.

- [lesson] `public/mcp.html` stores non-ASCII i18n values as literal `\uXXXX` JS escapes (ASCII-only convention), not raw Cyrillic — new ru entries must use the same escape form or break consistency.
- [lesson] For the 70-line JS block containing obscure chars (`…`, `→`, `⏐`), splicing directly from the plan markdown via a bun script (anchor-to-anchor, then `new Function` syntax check) was safer than hand-transcription.

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/plans/2026-08-23-mcp-literary-v2-wiring.md` | Implementation plan | Complete; both tasks executed as written |
