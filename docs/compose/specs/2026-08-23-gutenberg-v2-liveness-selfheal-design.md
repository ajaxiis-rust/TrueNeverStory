# Gutenberg v2 Pipeline — Liveness, Self-Healing Reindex, Error Visibility

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/gutenberg-v2-liveness-selfheal.md)

Date: 2026-08-23 (local) / 2026-08-22 (UTC)
Status: approved (design review passed)
Scope: `scripts/process-gutenberg.ts`, `src/mcp/literary-compiler/schema.ts`, `src/routes/mcp.ts`, `public/mcp.html`

## [S1] Problem

User observed the v2 Gutenberg pipeline (MCP console) showing book progress while
`scenes = 0` and `styles = 0`, with a UI card that stays silent for minutes and looks hung.

Empirical findings (verified against live DB + processes):

1. **Chunk-stage stats already emit every 5 chunks** (`process-gutenberg.ts:509`). The silence
   comes from the LLM stage: zero `emit()` calls between a book's Transaction-2 start and its
   commit. One LLM call on the target hardware (qwen2.5-3b, 3 CPU threads) takes 5–15 minutes;
   a book has ~5–15 representative calls + 1 narrative call → hours of UI silence per book.
2. **scenes/styles = 0 is not a deferred pass.** `scene_templates` / `style_patterns` are written
   per-book inside the same v2 run (Transaction 2). Live DB showed 2119 chunks across 24 books
   with `archetype_llm_cache = 0`: every early book ran while llama-server was still loading its
   model, every LLM call failed, and the per-book catch rolled back Transaction 2 — silently,
   because the error goes to stderr.
3. **Dedup trap:** re-run skips any book that already has rows in `chunk_index`, so partially
   processed books (chunks committed, templates missing) are skipped forever.
4. **stderr is piped but never drained** (`mcp.ts:112`). Warnings/errors are invisible in the UI,
   and a full 64 KB pipe buffer would block the child process entirely (latent stall).

## [S2] Goals / Non-goals

Goals:

- G1: UI never stays silent longer than ~10 s while a v2 job runs (liveness).
- G2: Partially processed books are reprocessed automatically on the next v2 start (self-healing);
  the 26 currently trapped books get scenes/styles without manual SQL.
- G3: Book-level errors (rollbacks, LLM unavailability) are visible in the MCP console UI.
- G4: stderr of child scripts is drained (stall risk removed) and surfaced as job logs.

Non-goals (explicit user directives):

- N1: Do NOT change LLM call parameters (no maxTokens / temperature / representative-cap changes).
  Model choice is switched manually by the user.
- N2: No infrastructure changes (no extra llama-server, no provider changes). MCP mode is a
  standalone stack; the game server is not running concurrently.
- N3: v1 phase, calibration phase, and `download/import` scripts are out of scope.

## [S3] Root-cause summary (evidence)

- `chunk_index`: 2192 rows / 26 distinct books; `scene_templates` = 0, `style_patterns` = 0,
  `archetype_llm_cache` = 0, `narrative_arcs` = 0.
- `pre_score` distribution: 1786 chunks pass the > 0.3 filter — candidates exist; the filter is
  not the cause.
- `LLMQueue.getAgentClient('literary-compiler')` does not throw for the unknown agent id;
  `loadAgentConfig` falls back to defaults; provider resolution lands on `llamacpp`
  (http://localhost:5001/v1). llama-server took ~32 s to load its model at stack start; the v2 job
  processed its first books inside that window (and while the server was down), so every call
  failed and rolled back.
- Process inspection during a healthy run: llama-server at 266% CPU with an established
  connection from the pipeline — the pipeline was working, just silent.

## [S4] Marker table + self-healing reindex

New table (created in `LiteraryCompilerDB.createV2Tables()`, `schema.ts`):

```sql
CREATE TABLE IF NOT EXISTS v2_processed_books (
  source_book TEXT PRIMARY KEY,
  completed_at REAL
);
```

New helpers on `LiteraryCompilerDB`: `isBookProcessed(sourceBook): boolean`,
`markBookProcessed(sourceBook): void`.

`runPhaseB` changes:

- Dedup check becomes `litDb.isBookProcessed(sourceId)` instead of
  `SELECT COUNT(*) FROM chunk_index WHERE source_book = ?`.
- `markBookProcessed(sourceId)` is called only when:
  - (a) the LLM stage exists (`llm != null`) and Transaction 2 committed successfully, or
  - (b) the book produced zero LLM candidates (`chunks.filter(c => c.pre_score > 0.3)` is empty)
    — a final, deterministic state worth marking, or
  - (c) `llm == null`: NOT marked (book must be reprocessed once an LLM is available). In this
    case Transaction 2 is skipped entirely (no empty BEGIN/COMMIT needed).
- A mid-book failure (rollback) leaves no marker → the book is reprocessed on the next run.
  Chunk re-insertion is idempotent (`INSERT OR REPLACE` with deterministic
  `${sourceBook}:chunk:${n}` ids; all other v2 inserts are `INSERT OR REPLACE` too).
- Migration: none. The 26 trapped books simply lack markers and are picked up automatically.

## [S5] Live stats + heartbeat

`ProgressStats` extended (all optional, additive):

- `reps_done`, `reps_total` — representative progress inside the current book's LLM stage
- `scenes`, `styles` — running totals (== inserted scene_templates / style_patterns)
- `llm_calls`, `llm_avg_s` — aggregate LLM call stats
- `llm_elapsed_s` — elapsed seconds of the currently running LLM call (heartbeat)
- `errors` — count of rolled-back books
- `eta_min` — rough ETA: remaining books × recent per-book average

Emission points in `runPhaseB`:

- Existing every-5-chunks emission stays as is.
- After every representative iteration (LLM call, cache hit, or quality skip): emit with full
  stats.
- Before and after `extractNarrativeStructure` (a long call): emit.
- Heartbeat: while a book's LLM stage runs, a `setInterval` (~10 s) emits
  `LLM call in progress — <n>s elapsed` with the current pct and `llm_elapsed_s`; cleared at book
  end. The heartbeat keeps the same monotonic pct (no jitter backwards).
- Book rollback: emit an error line as JSON on stdout (includes `pct` and `message`, prefixed
  `ERROR:`) so it passes the existing server parser and reaches the UI.

## [S6] stderr draining + job logs in UI

`src/routes/mcp.ts`:

- `Job` gains `logs: string[]` (ring buffer, cap ~50 lines).
- `runScriptWithJob` drains child stderr line-by-line (same reader pattern as stdout). Each
  non-empty line is appended to `job.logs` and included in the SSE payload:
  `JSON.stringify({ progress, message, status, stats, logs })`.
- `/mcp/jobs/active` includes `logs` for reconnection consistency.

`public/mcp.html` (both job-card renderers, ~lines 1140 and ~1310):

- Render new stat rows when present: Representatives `reps_done/reps_total`, LLM
  (`llm_calls`, `llm_avg_s`, current call `llm_elapsed_s`), ETA `eta_min`, Errors `errors`.
- Render last ~5 `logs` lines in a small monospace block under the stats.
- i18n: new label keys added to all 7 locales used by the page (en/ru/de/fr/es/ja/zh) following
  the existing `data-i18n` pattern; the log block needs no keys.

## [S7] Testing / verification

1. `bun run lint` (`tsc --noEmit`) must pass — Bun's transpile-only test run does not check types.
2. Live smoke (MCP stack running):
   - Start v2 from the console; confirm SSE frames arrive at least every ~10 s during an LLM call
     (heartbeat), with `llm_elapsed_s` growing.
   - Confirm `v2_processed_books` rows appear as books complete; `scene_templates` /
     `style_patterns` counts grow; trapped books (e.g. the 26 existing ones) gain markers.
   - Kill the job mid-book, restart v2: the interrupted book is reprocessed (no marker), finished
     books are skipped (marker present).
   - Trigger an error (e.g. stop llama-server briefly): rollback appears as an `ERROR:` line in
     the UI log block; book is not marked.
3. Regression: `/mcp/pipeline/status` and `/mcp/jobs/active` responses unchanged apart from the
   additive `logs` field.

## [S8] Out of scope (accepted leftovers)

- Single LLM call duration (5–15 min on qwen2.5-3b/CPU) is accepted; liveness is solved via
  heartbeat, not speed. Model switch is a manual user action.
- Full 665-book run time (days) is accepted.
- v1/calibrate phase UX, `download/import` scripts, `extractNarrativeStructure` internals.
