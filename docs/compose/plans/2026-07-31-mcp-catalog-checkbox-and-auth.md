# MCP Catalog Checkbox Fix + Auth Guard

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken per-book checkbox toggle in MCP Catalog tab and add password authentication to MCP mode.

**Architecture:** Two independent changes in two files — backend endpoint in `src/routes/mcp.ts`, frontend fix + auth in `public/mcp.html`. The auth reuse is minimal: just apply existing `authMiddleware` in MCP mode gate in `src/app.ts`.

**Tech Stack:** Hono (backend), vanilla JS (frontend), existing `authMiddleware` from `src/middleware/auth.ts`.

## Global Constraints

- No new dependencies
- Auth password is the same as the main server — reuse `authMiddleware` from `src/middleware/auth.ts`
- No password configured = open access (same as main server — intentional for local dev)
- `GutenbergCatalog.select()` and `deselect()` already accept `number[]` — reuse as-is
- MCP mode flag: `TNS_MCP_MODE=1` in `src/app.ts:87`

---

### Task 1: Add `POST /mcp/gutenberg/catalog/select` endpoint

**Files:**
- Modify: `src/routes/mcp.ts:408` (after `deselect-all` block)
- Test: `src/routes/mcp.test.ts:255` (after `deselect-all` test)

**Interfaces:**
- Consumes: `GutenbergCatalog.select(etextnos: number[])`, `GutenbergCatalog.deselect(etextnos: number[])`
- Produces: `POST /mcp/gutenberg/catalog/select` — accepts `{ etextnos: number[], selected: boolean }`

- [ ] **Step 1: Add failing test**

In `src/routes/mcp.test.ts`, add after the `deselect-all` test block (line ~271):

```typescript
test("POST /mcp/gutenberg/catalog/select toggles individual book", async () => {
  // First select-all so we have books with selected=1
  await app.request("/mcp/gutenberg/catalog/select-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  // Deselect one book
  const res = await app.request("/mcp/gutenberg/catalog/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ etextnos: [74], selected: false }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.changed).toBeNumber();
});

test("POST /mcp/gutenberg/catalog/select with empty etextnos returns 400", async () => {
  const res = await app.request("/mcp/gutenberg/catalog/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ etextnos: [], selected: true }),
  });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/mcp.test.ts`
Expected: FAIL — endpoint `/mcp/gutenberg/catalog/select` returns 404.

- [ ] **Step 3: Implement endpoint**

In `src/routes/mcp.ts`, add after the `deselect-all` handler (after line 437):

```typescript
mcpRouter.post("/gutenberg/catalog/select", async (c) => {
  const { etextnos, selected } = await c.req.json<{ etextnos: number[]; selected: boolean }>();
  if (!etextnos || etextnos.length === 0) {
    return c.json({ error: 'No etextnos provided' }, 400);
  }
  const catalog = new GutenbergCatalog(GUTENBERG_CATALOG_DB);
  try {
    if (selected) {
      catalog.select(etextnos);
    } else {
      catalog.deselect(etextnos);
    }
    return c.json({ ok: true, changed: etextnos.length });
  } finally {
    catalog.close();
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/routes/mcp.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/mcp.ts src/routes/mcp.test.ts
git commit -m "fix(mcp): add single-book select/deselect endpoint for catalog checkbox"
```

---

### Task 2: Fix `toggleCatalogBook` in frontend

**Files:**
- Modify: `public/mcp.html:523-528` (the broken `toggleCatalogBook` function)

**Interfaces:**
- Consumes: `POST /mcp/gutenberg/catalog/select` from Task 1
- Produces: working checkbox toggle in Catalog tab

- [ ] **Step 1: Replace broken function**

In `public/mcp.html`, replace lines 523-528:

```javascript
async function toggleCatalogBook(etextno, selected) {
  const endpoint = selected ? "gutenberg/catalog/select-all" : "gutenberg/catalog/deselect-all";
  // For individual toggle, we need a different approach - use filter with etextno
  // Actually, let's just reload the page to keep it simple
  loadCatalogPage(catalogPage);
}
```

With:

```javascript
async function toggleCatalogBook(etextno, selected) {
  await api("gutenberg/catalog/select", { method: "POST", body: JSON.stringify({ etextnos: [etextno], selected }) });
  loadCatalogStats();
}
```

- [ ] **Step 2: Verify in browser**

1. `bun run start` (or `TNS_MCP_MODE=1 bun run start`)
2. Open `/mcp.html` → Catalog tab
3. Build a catalog (or use existing)
4. Click individual checkboxes — they should persist after page reload
5. Verify stats update (Selected count changes)

- [ ] **Step 3: Commit**

```bash
git add public/mcp.html
git commit -m "fix(mcp): wire toggleCatalogBook to new select endpoint"
```

---

### Task 3: Add auth guard to MCP mode

**Files:**
- Modify: `src/app.ts:87-92` (MCP mode gate)

**Interfaces:**
- Consumes: `authMiddleware`, `loginPage`, `loginHandler`, `logoutHandler` from `src/middleware/auth.ts` (already imported at line 12)
- Produces: MCP page behind password — same credentials as main server

- [ ] **Step 1: Add auth routes and middleware to MCP mode**

In `src/app.ts`, replace lines 87-92:

```typescript
if (process.env.TNS_MCP_MODE === "1") {
    app.route("/mcp", mcpRouter);
    app.get("/", (c) => c.redirect("/mcp.html"));
    app.get("/mcp.html", (c) => serveHtml("mcp.html"));
    return app;
  }
```

With:

```typescript
if (process.env.TNS_MCP_MODE === "1") {
    app.get("/login", loginPage);
    app.post("/login", loginHandler);
    app.post("/logout", logoutHandler);
    app.use("*", authMiddleware);
    app.route("/mcp", mcpRouter);
    app.get("/", (c) => c.redirect("/mcp.html"));
    app.get("/mcp.html", (c) => serveHtml("mcp.html"));
    return app;
  }
```

- [ ] **Step 2: Verify with password**

1. Set `AUTH_PASSWORD=test123` in env or configure in Settings
2. Restart with `TNS_MCP_MODE=1`
3. Open `/` → should redirect to `/login`
4. Enter password → should redirect to `/mcp.html`
5. API calls to `/mcp/*` should work (session cookie is set)

- [ ] **Step 3: Verify no-password fallback**

Remove `AUTH_PASSWORD` from env. Restart. Open `/mcp.html` — should load without login (same as main server behavior).

- [ ] **Step 4: Commit**

```bash
git add src/app.ts
git commit -m "feat(mcp): protect MCP mode with password auth"
```
