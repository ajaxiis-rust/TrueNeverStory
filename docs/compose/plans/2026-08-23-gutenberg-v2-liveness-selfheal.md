# Gutenberg v2 Pipeline — Liveness + Self-Healing Reindex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the v2 Gutenberg pipeline visibly alive in the MCP console (per-rep stats + 10 s heartbeat), self-heal partially processed books via a marker table, and surface child-process stderr as job logs in the UI.

**Architecture:** Marker table `v2_processed_books` replaces chunk-existence dedup in `runPhaseB`; a closure-based `emitLive`/`heartbeat` pair in the script emits SSE-compatible JSON progress at least every 10 s during LLM calls; the MCP server drains child stderr into a per-job ring buffer broadcast with every SSE frame; the console frontend renders the new stat fields through a single deduplicated renderer and routes log lines into the existing system log.

**Tech Stack:** TypeScript, Bun (`bun:sqlite`, `Bun.spawn`), Hono SSE, static HTML/JS (`public/mcp.html`), `bun:test` + `tsc --noEmit`.

Spec: `docs/compose/specs/2026-08-23-gutenberg-v2-liveness-selfheal-design.md`

## Global Constraints

- **Do NOT change LLM call parameters** (no maxTokens / temperature / representative-count changes) — explicit user directive 2026-08-23. Model switching is done manually by the user, outside this plan.
- No infrastructure changes (no extra llama-server, no provider/config edits).
- English only in code, identifiers, emitted strings, and UI labels (project rule).
- `bun run lint` (`tsc --noEmit`) must pass after every task — `bun test` does NOT typecheck.
- One commit per task; stage specific files; NEVER `git add -A`.
- `data/literary-compiler/literary.db` is a live WAL database — the fix must not touch it with manual SQL; trapped books are healed by the marker mechanism itself.
- `public/*.html` are static files (no bundling step). But the MCP console server runs the COMPILED binary `dist/linux-x64/tns-server` — after changing `src/routes/mcp.ts` the binary must be rebuilt with the fast path: `bun build --compile src/index.ts --outfile dist/linux-x64/tns-server`.
- SSE contract: any new field must be threaded through `ScriptProgress` / `Job` / `updateJob()` (project lesson). Frames must stay single-line JSON.

---

### Task 1: Marker table `v2_processed_books` in LiteraryCompilerDB

**Covers:** [S4]

**Files:**
- Modify: `src/mcp/literary-compiler/schema.ts` (`createV2Tables()` ~lines 168-296; new methods after `insertChunkIndex` ~line 467)
- Test: `src/mcp/literary-compiler/schema-processed-books.test.ts` (create)

**Interfaces:**
- Consumes: existing `LiteraryCompilerDB` (`readonly db: Database`, `createV2Tables(): void`, `close(): void`).
- Produces (Task 2 relies on these exact signatures):
  - `LiteraryCompilerDB.isBookProcessed(sourceBook: string): boolean`
  - `LiteraryCompilerDB.markBookProcessed(sourceBook: string): void`
  - Table DDL: `v2_processed_books(source_book TEXT PRIMARY KEY, completed_at REAL)`, created inside `createV2Tables()`.

- [ ] **Step 1: Write the failing test**

Create `src/mcp/literary-compiler/schema-processed-books.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { LiteraryCompilerDB } from './schema';

describe('v2_processed_books marker', () => {
  it('returns false for unprocessed book, true after markBookProcessed', () => {
    const db = new LiteraryCompilerDB(':memory:');
    db.createV2Tables();
    try {
      expect(db.isBookProcessed('Author::Title')).toBe(false);
      db.markBookProcessed('Author::Title');
      expect(db.isBookProcessed('Author::Title')).toBe(true);
    } finally {
      db.close();
    }
  });

  it('markBookProcessed is idempotent (INSERT OR REPLACE)', () => {
    const db = new LiteraryCompilerDB(':memory:');
    db.createV2Tables();
    try {
      db.markBookProcessed('A::B');
      db.markBookProcessed('A::B');
      expect(db.isBookProcessed('A::B')).toBe(true);
      const row = db.db.prepare('SELECT COUNT(*) AS n FROM v2_processed_books').get() as { n: number };
      expect(row.n).toBe(1);
    } finally {
      db.close();
    }
  });

  it('different books are tracked independently', () => {
    const db = new LiteraryCompilerDB(':memory:');
    db.createV2Tables();
    try {
      db.markBookProcessed('A::Done');
      expect(db.isBookProcessed('A::Done')).toBe(true);
      expect(db.isBookProcessed('A::Other')).toBe(false);
    } finally {
      db.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/mcp/literary-compiler/schema-processed-books.test.ts`
Expected: FAIL — `db.isBookProcessed is not a function` (methods do not exist yet).

- [ ] **Step 3: Implement table + methods**

In `src/mcp/literary-compiler/schema.ts`, inside `createV2Tables()`, immediately after the `chunk_index` `this.db.exec(...)` block (the one ending with `` temporal_markers TEXT DEFAULT '[]', created_at INTEGER DEFAULT (unixepoch()) `); ``), add:

```ts
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS v2_processed_books (
        source_book TEXT PRIMARY KEY,
        completed_at REAL
      );
    `);
```

In the same class, immediately after the `insertChunkIndex(...)` method, add:

```ts
  isBookProcessed(sourceBook: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS x FROM v2_processed_books WHERE source_book = ?')
      .get(sourceBook);
    return row != null;
  }

  markBookProcessed(sourceBook: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO v2_processed_books (source_book, completed_at) VALUES (?, ?)')
      .run(sourceBook, Date.now() / 1000);
  }
```

Note: callers must ensure `createV2Tables()` ran first (the v2 pipeline script always does). The runtime engine path (`roleplay-engine.ts`) never calls these methods.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/mcp/literary-compiler/schema-processed-books.test.ts`
Expected: 3 pass, 0 fail.

- [ ] **Step 5: Typecheck**

Run: `bun run lint`
Expected: no new errors (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/mcp/literary-compiler/schema.ts src/mcp/literary-compiler/schema-processed-books.test.ts
git commit -m "feat(literary-compiler): add v2_processed_books marker table for self-healing reindex"
```

---

### Task 2: runPhaseB — marker dedup, per-rep live stats, heartbeat, error events

**Covers:** [S4, S5]

**Files:**
- Modify: `scripts/process-gutenberg.ts` (`ProgressStats` interface lines 38-46; `runPhaseB()` lines 399-715)

**Interfaces:**
- Consumes: `isBookProcessed` / `markBookProcessed` from Task 1.
- Produces (consumed by Task 3 server passthrough and Task 4 frontend): stdout JSON lines of shape
  `{ phase: 'v2', pct: number, message: string, stats?: ProgressStats }` where

```ts
interface ProgressStats {
  book_current?: number;
  book_total?: number;
  book_title?: string;
  chunks_done?: number;
  chunks_total?: number;
  templates?: number;   // legacy field, kept for other emitters; v2 no longer sends it
  scenes?: number;      // running total of inserted scene_templates
  styles?: number;      // running total of inserted style_patterns
  reps_done?: number;
  reps_total?: number;
  llm_calls?: number;
  llm_avg_s?: number;
  llm_elapsed_s?: number; // heartbeat: seconds into the currently running LLM call
  errors?: number;        // rolled-back books
  eta_min?: number;
  elapsed_s?: number;
}
```

Heartbeat frames reuse the last `pct` and set message suffix ` — LLM <n>s`. Error frames keep the current `pct` and have message `ERROR: Book <id> rolled back: <err>`.

- [ ] **Step 1: Extend `ProgressStats`**

Replace the interface (lines 38-46) with the version above.

- [ ] **Step 2: Add live-state infrastructure in `runPhaseB`**

Immediately after `const phaseStart = Date.now();` (line 445), insert:

```ts
  let totalStyles = 0;
  let totalErrors = 0;

  // ── Live progress state + heartbeat (UI must never go silent during LLM calls) ──
  const live: { pct: number; message: string; stats: ProgressStats; llmCallStart: number | null } = {
    pct: 3,
    message: 'Starting Phase B: V2 LLM pipeline',
    stats: { book_current: 0, book_total: books.length, chunks_done: 0, scenes: 0, styles: 0, errors: 0, elapsed_s: 0 },
    llmCallStart: null,
  };
  const etaMin = (bookIdx: number): number => {
    const done = bookIdx + 1 - skippedBooks;
    if (done <= 0) return 0;
    const avgMin = (Date.now() - phaseStart) / 60000 / done;
    return Math.round((books.length - bookIdx - 1) * avgMin);
  };
  const bookStats = (bookIdx: number, sourceId: string, extra: Partial<ProgressStats> = {}): ProgressStats => ({
    book_current: bookIdx + 1,
    book_total: books.length,
    book_title: sourceId,
    chunks_done: totalChunks,
    scenes: totalTemplates,
    styles: totalStyles,
    llm_calls: llmCalls,
    llm_avg_s: llmCalls > 0 ? Math.round(llmSeconds / llmCalls) : 0,
    errors: totalErrors,
    eta_min: etaMin(bookIdx),
    elapsed_s: Math.round((Date.now() - phaseStart) / 1000),
    ...extra,
  });
  const emitLive = (pct: number, message: string, stats: ProgressStats) => {
    live.pct = pct;
    live.message = message;
    live.stats = stats;
    emit({ phase: 'v2', pct, message, stats });
  };
  const heartbeat = setInterval(() => {
    if (live.llmCallStart == null) return;
    const elapsed = Math.round((Date.now() - live.llmCallStart) / 1000);
    emit({
      phase: 'v2',
      pct: live.pct,
      message: `${live.message} — LLM ${elapsed}s`,
      stats: { ...live.stats, llm_elapsed_s: elapsed },
    });
  }, 10_000);
```

- [ ] **Step 3: Replace chunk-existence dedup with marker dedup**

Replace the dedup block (lines 452-465, `const dedup = litDb.db.prepare('SELECT COUNT(*) as n FROM chunk_index ...` through the closing `}` of the `if (dedup.n > 0) {` statement) with:

```ts
    // Dedup: skip books fully processed in a previous run (marker-based, self-healing)
    if (litDb.isBookProcessed(sourceId)) {
      skippedBooks++;
      if ((i + 1) % 5 === 0 || i === books.length - 1) {
        emitLive(
          Math.round(((i + 1) / books.length) * 95 + 3),
          `${i + 1 - skippedBooks}/${books.length} books (${skippedBooks} skipped), ${totalTemplates} scenes`,
          bookStats(i, sourceId),
        );
      }
      continue;
    }
```

- [ ] **Step 4: Convert chunk-stage emits to `emitLive`**

Replace the every-5-chunks emit inside Transaction 1 (lines 509-523) with:

```ts
        // Emit progress every 5 chunks
        if ((ci + 1) % 5 === 0 || ci === chunks.length - 1) {
          emitLive(
            Math.round(((i + (ci + 1) / chunks.length * 0.5) / books.length) * 95 + 3),
            `Book ${i + 1}/${books.length}: ${sourceId} — chunk ${ci + 1}/${chunks.length}`,
            bookStats(i, sourceId, { chunks_done: totalChunks + ci + 1 }),
          );
        }
```

Replace the "chunks ready" emit after COMMIT (lines 530-543) with:

```ts
      emitLive(
        Math.round(((i + 0.5) / books.length) * 95 + 3),
        `Book ${i + 1}/${books.length}: ${sourceId} — chunks ready`,
        bookStats(i, sourceId),
      );
```

(The existing intermediate `const elapsed = Math.round(...)` line there is deleted as part of the replacement.)

- [ ] **Step 5: Mark books with zero candidates; skip Transaction 2 when LLM is unavailable**

Replace (lines 551-552):

```ts
    const candidates = chunks.filter(c => c.pre_score > 0.3);
    if (candidates.length === 0) continue;
```

with:

```ts
    const candidates = chunks.filter(c => c.pre_score > 0.3);
    if (candidates.length === 0) {
      // Deterministic final state (rule-based pre_score) — safe to mark done.
      litDb.markBookProcessed(sourceId);
      continue;
    }

    if (!llm) {
      // No LLM available — do NOT mark; the book is reprocessed once an LLM is up.
      emitLive(
        Math.round(((i + 1) / books.length) * 95 + 3),
        `Book ${i + 1}/${books.length}: ${sourceId} — LLM unavailable, skipped (will retry next run)`,
        bookStats(i, sourceId),
      );
      continue;
    }
```

The existing `if (llm) {` wrapper inside Transaction 2 stays as-is (now always true; kept to minimize the diff).

- [ ] **Step 6: Heartbeat markers around the template-extraction LLM call**

Inside the representatives loop, replace the uncached branch (lines 577-595):

```ts
          } else {
            const chunkIdx = chunks.findIndex(c => c.id === rep.id);
            const prevChunk = chunkIdx > 0 ? chunks[chunkIdx - 1].text : null;
            const nextChunk = chunkIdx < chunks.length - 1 ? chunks[chunkIdx + 1].text : null;

            const prompt = EXTRACT_TEMPLATE_PROMPT(prevChunk, rep.text, nextChunk);
            const t0 = Date.now();
            live.llmCallStart = t0;
            let response: string;
            try {
              response = await llm.generateText(prompt);
            } finally {
              live.llmCallStart = null;
            }
            const elapsed = (Date.now() - t0) / 1000;
            llmCalls++;
            llmSeconds += elapsed;

            parsed = parseJsonSafe(response);

            // Cache result
            litDb.db.prepare(
              'INSERT OR IGNORE INTO archetype_llm_cache (cache_key, archetype, confidence, result_json, mood, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(hash, (parsed.archetype_primary as string) ?? 'unknown', 1.0, JSON.stringify(parsed), (parsed.mood as string) ?? 'neutral', Math.floor(Date.now() / 1000));
          }
```

- [ ] **Step 7: Per-rep emits (quality-skip path and success path)**

Replace the quality gate one-liner (line 602):

```ts
          if (qualityScore < 0.3) { console.warn(`[v2] Low quality (${qualityScore.toFixed(2)}): ${rep.id} in ${sourceId}`); continue; }
```

with:

```ts
          if (qualityScore < 0.3) {
            console.warn(`[v2] Low quality (${qualityScore.toFixed(2)}): ${rep.id} in ${sourceId}`);
            emitLive(
              Math.round(((i + 0.5 + 0.5 * ((repIdx + 1) / representatives.length)) / books.length) * 95 + 3),
              `Book ${i + 1}/${books.length}: ${sourceId} — rep ${repIdx + 1}/${representatives.length} low quality, skipped`,
              bookStats(i, sourceId, { reps_done: repIdx, reps_total: representatives.length }),
            );
            continue;
          }
```

Add `totalStyles++;` immediately after `litDb.insertStylePattern(stylePattern);` (line 663).

Immediately after `repIdx++;` (line 667), add the success-path emit:

```ts
          emitLive(
            Math.round(((i + 0.5 + 0.5 * (repIdx / representatives.length)) / books.length) * 95 + 3),
            `Book ${i + 1}/${books.length}: ${sourceId} — rep ${repIdx}/${representatives.length}`,
            bookStats(i, sourceId, { reps_done: repIdx, reps_total: representatives.length }),
          );
```

- [ ] **Step 8: Heartbeat markers + emit around `extractNarrativeStructure`**

Replace the call (line 670):

```ts
        await extractNarrativeStructure(litDb, llm, book, sourceId, chunks);
```

with:

```ts
        emitLive(
          Math.round(((i + 0.9) / books.length) * 95 + 3),
          `Book ${i + 1}/${books.length}: ${sourceId} — narrative structure`,
          bookStats(i, sourceId),
        );
        live.llmCallStart = Date.now();
        try {
          await extractNarrativeStructure(litDb, llm, book, sourceId, chunks);
        } finally {
          live.llmCallStart = null;
        }
```

- [ ] **Step 9: Mark book processed on commit; error event on rollback**

Replace lines 673-690 (COMMIT through the book-done emit) with:

```ts
      litDb.db.exec('COMMIT');
      litDb.db.exec('PRAGMA wal_checkpoint(PASSIVE)');
      litDb.markBookProcessed(sourceId);

      emitLive(
        Math.round(((i + 1) / books.length) * 95 + 3),
        `Book ${i + 1}/${books.length}: ${sourceId}`,
        bookStats(i, sourceId, { chunks_total: totalChunks }),
      );
```

Replace the catch block (lines 691-694) with:

```ts
    } catch (err) {
      live.llmCallStart = null;
      litDb.db.exec('ROLLBACK');
      totalErrors++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`Book ${sourceId} templates rolled back (chunks preserved):`, err);
      emitLive(
        live.pct,
        `ERROR: Book ${sourceId} rolled back: ${errMsg.slice(0, 200)}`,
        bookStats(i, sourceId),
      );
    }
```

- [ ] **Step 10: Stop heartbeat after the loop; update final emit**

Immediately after the book loop's closing `}` (line 695) and before `srcDb.close();` (line 697), insert:

```ts
  clearInterval(heartbeat);
```

Replace the final emit (lines 702-714) with:

```ts
  emit({
    phase: 'v2',
    pct: 100,
    message: `Done: ${totalTemplates} scenes, ${totalStyles} styles, ${totalChunks} chunks, ${llmCalls} LLM calls (${avgTps}s/call), ${totalErrors} errors, ${skippedBooks} skipped`,
    stats: {
      book_current: books.length,
      book_total: books.length,
      chunks_done: totalChunks,
      chunks_total: totalChunks,
      scenes: totalTemplates,
      styles: totalStyles,
      llm_calls: llmCalls,
      errors: totalErrors,
      elapsed_s: totalElapsed,
    },
  });
```

- [ ] **Step 11: Typecheck**

Run: `bun run lint`
Expected: no errors. (Script is not covered by unit tests; behavior is verified in Task 5's live smoke.)

- [ ] **Step 12: Commit**

```bash
git add scripts/process-gutenberg.ts
git commit -m "feat(gutenberg-v2): marker-based self-healing dedup, per-rep live stats, 10s heartbeat, error events"
```

---

### Task 3: MCP server — drain child stderr, broadcast job logs over SSE

**Covers:** [S6]

**Files:**
- Modify: `src/routes/mcp.ts` (`Job` interface lines 34-43; `createJob` 47-58; `updateJob` 60-68; `completeJob` 70-80; `failJob` 82-90; `runScriptWithJob` 101-155; `/jobs/active` 198-203)

**Interfaces:**
- Consumes: nothing from earlier tasks (orthogonal server change).
- Produces (Task 4 frontend consumes): SSE frames `data: {"progress":number,"message":string,"status":string,"stats":object|undefined,"logs":string[]|undefined}` — `logs` present only when new stderr lines arrived since the previous frame. `GET /mcp/jobs/active` items gain `logs: string[]` (last 10).

- [ ] **Step 1: Extend `Job` and `createJob`**

Replace the `Job` interface (lines 34-43) with:

```ts
interface Job {
  id: string;
  phase?: string;
  status: "running" | "done" | "error";
  progress: number;
  message: string;
  stats?: Record<string, unknown>;
  /** Ring buffer of child stderr lines (cap 50). */
  logs: string[];
  /** stderr lines not yet broadcast; drained on every updateJob/completeJob/failJob. */
  pendingLogs: string[];
  result?: unknown;
  listeners: Set<(data: string) => void>;
}
```

In `createJob`, add `logs: [], pendingLogs: [],` to the object literal.

- [ ] **Step 2: Drain `pendingLogs` in `updateJob` / `completeJob` / `failJob`; add `appendJobLog` helper**

Replace `updateJob` (lines 60-68) with:

```ts
function updateJob(job: Job, progress: number, message: string, stats?: Record<string, unknown>) {
  job.progress = progress;
  job.message = message;
  if (stats) job.stats = stats;
  const logs = job.pendingLogs.length > 0 ? job.pendingLogs.splice(0) : undefined;
  const data = JSON.stringify({ progress, message, status: job.status, stats: job.stats, logs });
  for (const listener of job.listeners) {
    listener(`data: ${data}\n\n`);
  }
}

function appendJobLog(job: Job, line: string) {
  const trimmed = line.trim().slice(0, 500);
  if (!trimmed) return;
  job.logs.push(trimmed);
  if (job.logs.length > 50) job.logs.shift();
  job.pendingLogs.push(trimmed);
}
```

In `completeJob`, replace the `const data = JSON.stringify({ progress: 100, message: "Done", status: "done", result });` line with:

```ts
  const logs = job.pendingLogs.length > 0 ? job.pendingLogs.splice(0) : undefined;
  const data = JSON.stringify({ progress: 100, message: "Done", status: "done", result, logs });
```

In `failJob`, replace the `const data = JSON.stringify({ progress: job.progress, message: error, status: "error" });` line with:

```ts
  const logs = job.pendingLogs.length > 0 ? job.pendingLogs.splice(0) : undefined;
  const data = JSON.stringify({ progress: job.progress, message: error, status: "error", logs });
```

- [ ] **Step 3: Drain stderr in `runScriptWithJob` (shared stream reader)**

Replace lines 112-142 — from `const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });` through `const exitCode = await proc.exited;` (inclusive; this removes the old `decoder`/`buffer`/`reader`/`readLoop` declarations AND the old `exitCode` line, so there is no duplicate declaration) — with:

```ts
      const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });

      const drainStream = async (
        stream: ReadableStream<Uint8Array>,
        onLine: (line: string) => void,
      ) => {
        const decoder = new TextDecoder();
        let buffer = "";
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) onLine(line);
        }
      };

      // stderr: keep UI alive + prevent pipe-buffer stall; surface as job logs
      const stderrDone = drainStream(proc.stderr, (line) => {
        appendJobLog(job, line);
        updateJob(job, job.progress, job.message);
      });

      // stdout: JSON progress lines
      await drainStream(proc.stdout, (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const msg = JSON.parse(trimmed) as ScriptProgress;
          if (typeof msg.pct === "number" && msg.message) {
            updateJob(job, msg.pct, msg.message, msg.stats);
          }
        } catch {
          // non-JSON line — ignore
        }
      });

      const exitCode = await proc.exited;
      await stderrDone; // flush remaining stderr before final frame
```

(The old `const decoder`, `let buffer`, `const reader`, `readLoop` declarations and the old `const exitCode = await proc.exited;` line are removed by this replacement; the following `if (exitCode === 0) ...` block stays unchanged.)

- [ ] **Step 4: Include logs in `/jobs/active`**

Replace the `.map(...)` in `/jobs/active` (line 201) with:

```ts
    .map(j => ({ id: j.id, phase: j.phase, progress: j.progress, message: j.message, stats: j.stats, logs: j.logs.slice(-10), status: j.status }));
```

- [ ] **Step 5: Typecheck**

Run: `bun run lint`
Expected: no errors.

- [ ] **Step 6: Rebuild the MCP binary**

The MCP console runs the compiled binary, so rebuild it (fast TS-only path):

Run: `bun build --compile src/index.ts --outfile dist/linux-x64/tns-server`
Expected: compiles to a ~92MB binary without errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/mcp.ts
git commit -m "feat(mcp): drain child stderr into job logs, broadcast via SSE, expose in /jobs/active"
```

(`dist/` is gitignored/release artifact — do not stage the binary.)

---

### Task 4: Console frontend — new stat fields, deduplicated renderer, stderr lines in system log

**Covers:** [S5, S6]

**Files:**
- Modify: `public/mcp.html` (`updateStatsDisplay` lines 1138-1150; `reconnectPhaseJob` 1115-1136; `trackProgress` onmessage 1215-1234; `trackPhaseProgress` onmessage 1301-1330)

**Interfaces:**
- Consumes: SSE frames from Task 3 (`stats` with v2 fields from Task 2; `logs?: string[]`), `/jobs/active` items with `logs`.
- Produces: none (terminal UI task).
- Note: stats labels stay hardcoded English — the existing rows ("Book", "Chunks", "Templates", "Elapsed") are hardcoded too; we follow the file's convention (no new i18n keys).

- [ ] **Step 1: Extend `updateStatsDisplay` with the v2 fields**

Replace the whole `updateStatsDisplay` function (lines 1138-1150) with:

```js
function updateStatsDisplay(statsEl, s) {
  let html = "";
  if (s.book_title) html += "<div><span>Book</span><span>" + s.book_current + "/" + s.book_total + ": " + escapeHtml(s.book_title.split("::").pop() || s.book_title) + "</span></div>";
  else if (s.book_current != null) html += "<div><span>Book</span><span>" + s.book_current + "/" + s.book_total + "</span></div>";
  if (s.chunks_done != null) html += "<div><span>Chunks</span><span>" + s.chunks_done + "</span></div>";
  if (s.templates != null) html += "<div><span>Templates</span><span>" + s.templates + "</span></div>";
  if (s.scenes != null) html += "<div><span>Scenes</span><span>" + s.scenes + "</span></div>";
  if (s.styles != null) html += "<div><span>Styles</span><span>" + s.styles + "</span></div>";
  if (s.reps_done != null && s.reps_total != null) html += "<div><span>Reps</span><span>" + s.reps_done + "/" + s.reps_total + "</span></div>";
  if (s.llm_calls != null) html += "<div><span>LLM</span><span>" + s.llm_calls + " calls" + (s.llm_avg_s ? ", avg " + s.llm_avg_s + "s" : "") + (s.llm_elapsed_s != null ? ", current " + s.llm_elapsed_s + "s" : "") + "</span></div>";
  if (s.errors != null && s.errors > 0) html += "<div><span>Errors</span><span>" + s.errors + "</span></div>";
  if (s.eta_min != null && s.eta_min > 0) html += "<div><span>ETA</span><span>~" + s.eta_min + "m</span></div>";
  if (s.elapsed_s != null) {
    const m = Math.floor(s.elapsed_s / 60);
    const sec = s.elapsed_s % 60;
    html += "<div><span>Elapsed</span><span>" + m + "m " + sec + "s</span></div>";
  }
  if (html) statsEl.innerHTML = html;
}
```

- [ ] **Step 2: Deduplicate `trackPhaseProgress` stats rendering + render stderr lines**

In `trackPhaseProgress`'s `es.onmessage`, replace the inline stats block (lines 1307-1320, `if (d.stats && statsEl) { const s = d.stats; ... statsEl.innerHTML = html; }`) with:

```js
    if (d.stats && statsEl) {
      updateStatsDisplay(statsEl, d.stats);
    }
    if (d.logs) {
      for (const l of d.logs) addLog(path + " [stderr]: " + l);
    }
```

- [ ] **Step 3: Render stderr lines in the generic `trackProgress`**

In `trackProgress`'s `es.onmessage`, immediately after the line `label.textContent = d.message + " (" + d.progress + "%)";` (line 1219), insert:

```js
    if (d.logs) {
      for (const l of d.logs) addLog(path + " [stderr]: " + l);
    }
```

- [ ] **Step 4: Replay recent logs on reconnect**

Replace the `reconnectPhaseJob` signature line `function reconnectPhaseJob(phaseId, jobId, progress, stats) {` (line 1115) with:

```js
function reconnectPhaseJob(phaseId, jobId, progress, stats, logs) {
```

Inside it, immediately before the `// Reconnect SSE` comment, insert:

```js
  if (logs && logs.length) {
    for (const l of logs) addLog(phaseId + " [stderr]: " + l);
  }
```

Update the caller in `loadPipeline` (line 1109) from:

```js
        reconnectPhaseJob(job.phase, job.id, job.progress, job.stats);
```

to:

```js
        reconnectPhaseJob(job.phase, job.id, job.progress, job.stats, job.logs);
```

- [ ] **Step 5: Verify**

Static HTML — no build step. Verification:

1. `bun run lint` (sanity; the HTML is not typechecked but the command must stay green).
2. Syntax-check all inline scripts: `bun -e 'const html = require("fs").readFileSync("public/mcp.html","utf8"); const ms = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]; let i = 0; for (const m of ms) { new Function(m[1]); i++; } console.log("JS parse OK (" + i + " scripts)")'`
   Expected: `JS parse OK (N scripts)` — N matches the number of inline `<script>` blocks.
3. Rendering is verified in the Task 5 live smoke (real SSE frames).

- [ ] **Step 6: Commit**

```bash
git add public/mcp.html
git commit -m "feat(mcp-console): v2 live stats fields (scenes/styles/reps/llm/eta/errors), dedupe stats renderer, surface stderr in system log"
```

---

### Task 5: End-to-end live smoke (liveness, self-healing, error visibility)

**Covers:** [S7]

**Files:**
- Create/Modify: none (verification only). May touch `docs/about.md` + translations only if the final step finds a stale dedup/resume description.

**Interfaces:**
- Consumes: all previous tasks.

- [ ] **Step 1: Final static gate**

Run: `bun run lint && bun test src/mcp/literary-compiler/schema-processed-books.test.ts`
Expected: lint clean; 3 tests pass.

- [ ] **Step 2: Start the MCP stack**

Run: `bash startgame.sh --mcp` (background, e.g. `nohup ... &` so this session stays usable).
Wait ~40 s for llama-server model load; confirm:

```bash
curl -s -m 2 -o /dev/null -w "%{http_code}" http://localhost:5001/health   # expect 200
curl -s -m 2 http://localhost:8000/mcp/status | head -c 200                # expect JSON
```

- [ ] **Step 3: Start v2 and watch the SSE stream for ~90 s**

```bash
curl -s -X POST http://localhost:8000/mcp/gutenberg/compile-v2             # => {"jobId":"...","stream":"/mcp/stream/<id>"}
curl -s -N --max-time 90 http://localhost:8000/mcp/stream/<jobId>
```

Expected:
- Frames arrive at least every ~10 s while an LLM call runs (heartbeat), message ends with `— LLM <n>s` and `stats.llm_elapsed_s` grows between frames.
- `stats` contains `scenes`, `styles`, `reps_done/reps_total`, `llm_calls`, `eta_min`, `errors`.
- First books processed are the previously trapped ones (they had no markers).

- [ ] **Step 4: Self-healing check (kill mid-book → restart)**

1. Note the current book from a heartbeat frame; kill ONLY the pipeline script: `pkill -f "process-gutenberg.ts --phase=v2"`.
2. Verify no marker for that book:

```bash
bun -e 'import { Database } from "bun:sqlite"; const db = new Database("data/literary-compiler/literary.db", { readonly: true }); console.log(db.query("SELECT COUNT(*) n FROM v2_processed_books").get()); db.close();'
```

Expected: count = number of fully completed books only (in-flight book absent).
3. Restart: `curl -s -X POST http://localhost:8000/mcp/gutenberg/compile-v2` and re-attach to the stream.
Expected: the interrupted book reappears as `Book N/...` (reprocessed), previously marked books are skipped fast.

- [ ] **Step 5: Error visibility check**

1. Stop the LLM server: `pkill -f "llama-server.*port 5001"` (leave the rest running).
2. Watch the stream: within one call-timeout the book rolls back and a frame with `ERROR: Book ... rolled back:` appears; `[stderr]`-originated lines are present in frames' `logs` arrays; `stats.errors` increments.
3. Restart the stack's LLM (restart `startgame.sh --mcp` fully, or restart just the llama-server as the script does) and confirm processing resumes; the failed book is still unmarked and retried on the next run.

- [ ] **Step 6: User UI confirmation**

Ask the user to confirm in the open MCP console (`http://localhost:8000`, Pipeline tab): the v2 card shows Book / Chunks / Scenes / Styles / Reps / LLM (avg + current) / ETA / Elapsed rows, updates at least every ~10 s, and `[stderr]` lines appear in the system log panel.

- [ ] **Step 7: Docs freshness check (project rule)**

`docs/about.md` and its translations: if any of them describe the v2 pipeline's resume/dedup behavior (previously "skip books already in chunk_index"), update that sentence to the marker-based behavior in all 7 locales (en/ru/de/fr/es/ja/zh), per the doc-sync workflow. If dedup/resume is not documented, skip.

- [ ] **Step 8: Final commit (if docs changed)**

```bash
git add docs/about.md docs/<changed-locale-dirs>
git commit -m "docs: v2 pipeline resume is marker-based (v2_processed_books)"
```

---

## Self-Review

**Spec coverage:**
- S1 (problem), S2 (goals/non-goals), S3 (evidence) — informational; no code tasks required. S2's non-goals are enforced as Global Constraints.
- S4 → Tasks 1, 2. S5 → Tasks 2, 4. S6 → Tasks 3, 4. S7 → Task 5. S8 — out of scope, nothing to cover.
- Every `Covers:` ID resolves to a real spec section.

**Placeholder scan:** none — all code steps contain complete code.

**Type consistency:** `isBookProcessed`/`markBookProcessed` (Task 1) match Task 2 usage; `ProgressStats` fields (Task 2) match `updateStatsDisplay` rows (Task 4) and the SSE `logs` shape (Task 3) matches the frontend `d.logs` loops (Task 4). `emitLive`/`bookStats`/`etaMin`/`live`/`heartbeat` names are consistent throughout Task 2.
