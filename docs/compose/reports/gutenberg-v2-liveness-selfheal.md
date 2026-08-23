---
feature: gutenberg-v2-liveness-selfheal
status: delivered
specs:
  - docs/compose/specs/2026-08-23-gutenberg-v2-liveness-selfheal-design.md
plans:
  - docs/compose/plans/2026-08-23-gutenberg-v2-liveness-selfheal.md
branch: main
commits: ab27fce..838b71b
---

# Gutenberg v2 Pipeline — Liveness, Self-Healing Reindex, Error Visibility — Final Report

## What Was Built

The v2 Gutenberg pipeline (LLM extraction of scene templates / style patterns into
`literary.db`) previously ran for hours with a silent UI card, and could permanently skip
books: any book whose chunk transaction committed but whose template transaction failed was
skipped by the chunk-existence dedup on every later run, with the failure visible only on an
undrained stderr pipe.

This feature makes the pipeline observably alive and self-repairing. The MCP console v2 card
now updates at least every ~10 seconds — including during single LLM calls that take 5–15
minutes on CPU — showing book/chunk progress, running scene/style totals, per-representative
progress, LLM call statistics (count, average seconds, seconds into the current call), an
ETA, and an error counter. Books are now deduplicated by a completion marker table instead of
by chunk existence, so any book that did not fully finish (LLM down, killed mid-book,
rollback) is automatically reprocessed on the next run — including the 26 books trapped by
the old dedup before this change. Child-process stderr is drained (removing a latent
pipe-buffer stall) and surfaced both as `logs` arrays in SSE frames and as `[stderr]` lines
in the console's system log; book rollbacks additionally emit explicit `ERROR:` progress
frames.

LLM call parameters (maxTokens, temperature, representative counts) were deliberately left
unchanged per user directive; liveness is achieved through heartbeat reporting, not faster
calls.

## Architecture

Four files, one concern each:

- **`src/mcp/literary-compiler/schema.ts`** — `createV2Tables()` now creates
  `v2_processed_books(source_book TEXT PRIMARY KEY, completed_at REAL)`. Two helpers:
  `isBookProcessed(sourceBook): boolean` and `markBookProcessed(sourceBook): void`
  (`INSERT OR REPLACE`, idempotent).
- **`scripts/process-gutenberg.ts` (`runPhaseB`)** — dedup consults the marker table instead
  of `chunk_index`. A book is marked only on successful Transaction-2 commit, or when it has
  zero LLM candidates (a deterministic final state). When the LLM client is unavailable the
  book is explicitly left unmarked and skipped with a "will retry" message. A closure trio —
  `bookStats()` (uniform stats object), `emitLive()` (emits + remembers last frame), and a
  `setInterval(10s)` heartbeat armed by `live.llmCallStart` around every LLM call — emits
  `{phase:'v2', pct, message, stats}` JSON lines. Rollbacks increment `errors` and emit an
  `ERROR:` frame at the current pct. New stats fields: `scenes`, `styles`, `reps_done/total`,
  `llm_calls`, `llm_avg_s`, `llm_elapsed_s`, `errors`, `eta_min`.
- **`src/routes/mcp.ts`** — `Job` gains `logs` (ring buffer, 50) and `pendingLogs`. A shared
  `drainStream()` reader handles both child stdout (JSON progress) and stderr (each line →
  `appendJobLog` + immediate rebroadcast). Every SSE payload from
  `updateJob/completeJob/failJob` includes `logs` (drained `pendingLogs`) when non-empty;
  `/mcp/jobs/active` exposes the last 10 log lines for reconnection.
- **`public/mcp.html`** — `updateStatsDisplay()` renders the new rows (Scenes, Styles, Reps,
  LLM avg/current, Errors, ETA) and is now also used by `trackPhaseProgress` (previously a
  duplicated inline renderer). SSE `logs` are routed to the existing system log as
  `[stderr]` lines; `reconnectPhaseJob` replays recent logs on page reload.

Data flow: script `emit()` → stdout JSON → server `drainStream` → `updateJob` → SSE frame
`{progress, message, status, stats, logs}` → `updateStatsDisplay` / `addLog`.

### Design Decisions

- **Marker table over repair SQL**: reprocessing is idempotent (`INSERT OR REPLACE` with
  deterministic chunk ids), so a missing marker alone is sufficient to heal a book — no
  one-time cleanup scripts, and all future partial failures heal the same way.
- **Heartbeat via `live.llmCallStart`**: the heartbeat fires only while an LLM call is
  in flight, reusing the last pct/message — progress percentage never moves backwards and
  fast stages are not spammed.
- **No new i18n keys**: the existing stats rows ("Book", "Chunks", ...) are hardcoded
  English; the new rows follow the file's convention.
- **The always-true `if (llm)` wrapper was kept** inside Transaction 2 to minimize diff;
  the early `if (!llm) continue` guard carries the semantics.

## Usage

No configuration. Run the stack and start the phase as before:

```bash
bash startgame.sh --mcp                       # MCP console on :8000
curl -X POST http://localhost:8000/mcp/gutenberg/compile-v2   # or the Pipeline tab button
```

- Books interrupted or failed for any reason are reprocessed automatically on the next run;
  fully processed books are skipped via `v2_processed_books`.
- To force a full re-index from scratch: `DELETE FROM v2_processed_books;` (only that table).
- `GET /mcp/jobs/active` now includes `logs` (last 10 stderr lines) per running job.

## Verification

- Unit: `src/mcp/literary-compiler/schema-processed-books.test.ts` — 3 tests (mark/check,
  idempotency, per-book independence) pass; `bun run lint` (`tsc --noEmit`) clean after every
  task; inline JS of `mcp.html` parse-checked.
- Live smoke (real stack, qwen2.5-3b on CPU): SSE frames every ~10 s during an LLM call with
  `llm_elapsed_s` growing (10s→20s→30s…); first processed book was a previously trapped one
  (auto-healed). Killing the script mid-book left no marker and preserved chunks; the
  restarted job reprocessed the same book. Killing llama-server produced `ERROR: Book …
  rolled back:` frames plus stderr content in `logs` (`"Unable to connect…"`), the `errors`
  counter rose to 38, no book was marked, and processing resumed after the LLM returned
  (0 new errors, heartbeat active). User confirmed the console card is visibly alive.

## Journey Log

> Brief notes on what informed the final design. Not required reading.

- [lesson] "scenes=0 / styles=0" was not a deferred pass: every early book silently rolled
  back while llama-server was still loading its model (~32 s window), and chunk-existence
  dedup then skipped those books forever. Completion state must be recorded explicitly, not
  inferred from intermediate artifacts.
- [lesson] stderr that is piped but never drained hides every failure and risks a silent
  64 KB pipe-buffer stall — drain it and broadcast it.
- [dead end] `pkill -f '<pattern>'` matched the wrapping shell's own command line twice,
  hanging the smoke commands; even the `[x]` bracket trick fails when the same literal
  appears elsewhere in the command (echo text, URLs). Capture streams to files and keep
  kill commands minimal.
- [pivot] Speed-oriented code fixes (maxTokens↓, temperature, representative caps) were
  dropped by user directive; perceived hang was solved with heartbeat reporting instead.

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-08-23-gutenberg-v2-liveness-selfheal-design.md` | Design spec (S1–S8) | Superseded by this report |
| `docs/compose/plans/2026-08-23-gutenberg-v2-liveness-selfheal.md` | Implementation plan (5 tasks) | Complete; all tasks landed |
