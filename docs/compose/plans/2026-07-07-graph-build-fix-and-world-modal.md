# Graph Build Fix + World Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix graph not building due to dead code in world-builder pipeline + add world statistics modal with entity/NPC/hero details.

**Architecture:** Two independent subsystems: (1) backend fix for `buildRelationships` persistence and startup wiring, (2) frontend modal for world details. Both share a new API endpoint.

**Tech Stack:** TypeScript (Hono routes), vanilla JS (D3 graph page, worlds.html), SQLite (entity queries).

---

### Task 1: Fix `buildRelationships()` persistence bug

**Covers:** Core bug — relationships built in memory but never saved to disk.

**Files:**
- Modify: `src/services/world-builder.ts:191-224`

- [ ] **Step 1: Add entityStore.save() after relationship push**

In `src/services/world-builder.ts`, after the for-loop that pushes relationships (line 213), add a save call:

```typescript
      // After the for-loop (line 214), before publishSimple:
      this._entityStore.save();
```

The full block becomes:

```typescript
      for (const rel of rels) {
        const srcUid = rel.source as string;
        const tgtUid = rel.target as string;
        const relType = (rel.type as string) ?? "related";
        const srcNode = this._entityStore.get(srcUid);
        const tgtNode = this._entityStore.get(tgtUid);
        if (srcNode && tgtNode) {
          srcNode.profile.relationships.push({ target: tgtUid, type: relType });
        }
      }
      this._entityStore.save();
      await this._eventBus.publishSimple(
```

- [ ] **Step 2: Verify build passes**

Run: `bun build --no-bundle src/services/world-builder.ts 2>&1 | head -5` or `npx tsc --noEmit` if available. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/world-builder.ts
git commit -m "fix: persist relationships after buildRelationships() mutates entity profiles"
```

---

### Task 2: Add heuristic relationship builder (LLM-free fallback)

**Covers:** When LLM is not configured, generate relationships from entity co-location and type affinity.

**Files:**
- Modify: `src/services/world-builder.ts` — add `buildRelationshipsHeuristic()` method

- [ ] **Step 1: Add heuristic method to WorldBuilder**

Add after `buildRelationships()` method (after line 224):

```typescript
  buildRelationshipsHeuristic(): number {
    if (!this.worldFrame) return 0;
    log.info("Building heuristic relationships...");

    const allNodes = this._entityStore.allNodes();
    const chars = allNodes.filter((n) => n.entityType === "Character");
    const factions = allNodes.filter((n) => n.entityType === "Faction");
    const locations = allNodes.filter((n) => n.entityType === "Location");
    let added = 0;

    for (const char of chars) {
      if (char.profile.relationships.length > 0) continue;

      const charRace = (char.profile.l1.tags as string[] | undefined)?.find((t) =>
        allNodes.some((n) => n.entityType === "Race" && n.name.toLowerCase() === t.toLowerCase()),
      );
      if (charRace) {
        const raceNode = allNodes.find((n) => n.entityType === "Race" && n.name.toLowerCase() === charRace.toLowerCase());
        if (raceNode) {
          char.profile.relationships.push({ target: raceNode.uid, type: "race" });
          added++;
        }
      }

      for (const faction of factions) {
        const fGoal = ((faction.profile.l1.summary as string) ?? "").toLowerCase();
        const cTags = ((char.profile.l1.tags as string[]) ?? []).map((t) => t.toLowerCase());
        if (cTags.some((t) => fGoal.includes(t))) {
          char.profile.relationships.push({ target: faction.uid, type: "member_of" });
          added++;
          break;
        }
      }

      if (char.profile.relationships.length === 0 && chars.length > 1) {
        const other = chars.find((c) => c.uid !== char.uid);
        if (other) {
          char.profile.relationships.push({ target: other.uid, type: "knows" });
          added++;
        }
      }
    }

    for (const loc of locations) {
      const locTags = ((loc.profile.l1.tags as string[]) ?? []).map((t) => t.toLowerCase());
      for (const char of chars) {
        const cTags = ((char.profile.l1.tags as string[]) ?? []).map((t) => t.toLowerCase());
        if (cTags.some((t) => locTags.includes(t)) || cTags.some((t) => loc.name.toLowerCase().includes(t))) {
          char.profile.relationships.push({ target: loc.uid, type: "located_in" });
          added++;
        }
      }
    }

    if (added > 0) {
      this._entityStore.save();
      log.info({ count: added }, "Heuristic relationships built");
    }
    return added;
  }
```

- [ ] **Step 2: Verify build passes**

Run: `bun build --no-bundle src/services/world-builder.ts 2>&1 | head -5` or typecheck. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/world-builder.ts
git commit -m "feat: add heuristic relationship builder for LLM-free world initialization"
```

---

### Task 3: Wire build pipeline into NarrativeFacade.start()

**Covers:** Ensure relationships are built at startup if missing.

**Files:**
- Modify: `src/services/narrative-facade.ts:30-51`

- [ ] **Step 1: Add auto-build check in facade start()**

In `src/services/narrative-facade.ts`, modify the `start()` method. After `graphStore.boot()` and before director.start(), add:

```typescript
  async start(): Promise<void> {
    if (this._servicesStarted) return;
    await this.services.llmQueue.start();
    await this.services.graphStore.boot();

    // Auto-build relationships if entities exist but have none
    const allNodes = this.services.entityStore.allNodes();
    const hasRelationships = allNodes.some((n) => n.profile.relationships.length > 0);
    if (allNodes.length > 0 && !hasRelationships) {
      log.info("No relationships found — building heuristic relationships");
      this.services.worldBuilder.buildRelationshipsHeuristic();
      await this.services.graphStore.boot();
    }

    for (const node of allNodes) {
      this.services.sqliteStore.upsertEntity({
        uid: node.uid,
        name: node.name,
        entityType: node.entityType,
        summary: node.profile.summary,
        tags: JSON.stringify(node.profile.tags),
        description: (node.profile.l1.description as string) || "",
        profile: JSON.stringify(node.profile.toDict()),
      });
    }
    log.info({ count: this.services.sqliteStore.entityCount() }, "Synced entities to SQLite");

    this.services.director.start();
    this._servicesStarted = true;
    log.info("Narrative services started");
  }
```

- [ ] **Step 2: Verify build passes**

Run: `bun build --no-bundle src/services/narrative-facade.ts 2>&1 | head -5`. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/narrative-facade.ts
git commit -m "fix: auto-build heuristic relationships at startup when entities lack connections"
```

---

### Task 4: Add world detail API endpoint

**Covers:** Backend data for the world modal — entity counts, character list, NPC list, graph stats.

**Files:**
- Modify: `src/routes/worlds.ts` — add `GET /worlds/:name/detail` endpoint

- [ ] **Step 1: Add the detail endpoint**

Add before `export { worlds as worldsRouter }` in `src/routes/worlds.ts`:

```typescript
/**
 * GET /worlds/:name/detail — Full world statistics for modal.
 */
worlds.get("/worlds/:name/detail", async (c) => {
  const name = c.req.param("name");
  if (!isValidWorldName(name)) return c.json({ error: "Invalid world name" }, 400);

  const { getConfig } = await import("../config/env");
  const worldPath = join(getConfig().WORLDS_ROOT, name);
  if (!existsSync(worldPath)) return c.json({ error: "World not found" }, 404);

  const frame = getWorldFrame(name) ?? {};

  // Entity counts by type
  const entitiesPath = join(worldPath, "entities.json");
  let entities: Array<Record<string, unknown>> = [];
  if (existsSync(entitiesPath)) {
    try { entities = readJsonFileSync(entitiesPath) ?? []; } catch {}
  }

  const byType: Record<string, number> = {};
  const characters: Array<{ name: string; summary: string; tags: string[]; relationships: unknown[] }> = [];
  const locations: Array<{ name: string; summary: string }> = [];
  const factions: Array<{ name: string; summary: string }> = [];
  const items: Array<{ name: string; summary: string }> = [];

  for (const e of entities) {
    const t = (e.entity_type as string) ?? "Unknown";
    byType[t] = (byType[t] ?? 0) + 1;

    const profile = e.profile as Record<string, unknown> | undefined;
    const l1 = (profile?.l1 ?? {}) as Record<string, unknown>;
    const summary = (l1.summary as string) ?? "";
    const tags = (l1.tags as string[]) ?? [];
    const relationships = (l1.relationships as unknown[]) ?? [];

    if (t === "Character") characters.push({ name: (e.name as string) ?? "", summary, tags, relationships });
    else if (t === "Location") locations.push({ name: (e.name as string) ?? "", summary });
    else if (t === "Faction") factions.push({ name: (e.name as string) ?? "", summary });
    else if (t === "Item") items.push({ name: (e.name as string) ?? "", summary });
  }

  // Session count
  const sessionDir = join(worldPath, "session_history");
  let sessionCount = 0;
  if (existsSync(sessionDir)) {
    sessionCount = readdirSync(sessionDir).filter((f) => f.endsWith(".json")).length;
  }

  // Timeline events
  const timelinePath = join(worldPath, "timeline.jsonl");
  let eventCount = 0;
  if (existsSync(timelinePath)) {
    try {
      const content = readFileSync(timelinePath, "utf-8");
      eventCount = content.split("\n").filter((l) => l.trim()).length;
    } catch {}
  }

  // Chapters
  const chaptersDir = join(worldPath, "chapters");
  let chapterCount = 0;
  if (existsSync(chaptersDir)) {
    chapterCount = readdirSync(chaptersDir).filter((f) => f.endsWith(".md")).length;
  }

  // Villains
  const villainsPath = join(worldPath, "villains.json");
  let villainCount = 0;
  if (existsSync(villainsPath)) {
    try {
      const v = readJsonFileSync(villainsPath);
      villainCount = Array.isArray(v) ? v.length : 0;
    } catch {}
  }

  return c.json({
    name,
    title: (frame.title as string) ?? (frame.world_name as string) ?? name,
    description: (frame.description as string) ?? "",
    genre: (frame.genre as string) ?? "",
    language: (frame.language as string) ?? "en",
    worldRules: (frame.world_rules as Array<{ name: string; description: string }>) ?? [],
    magicSystem: frame.magic_system,
    entityCounts: byType,
    totalEntities: entities.length,
    characters,
    locations,
    factions,
    items,
    sessionCount,
    eventCount,
    chapterCount,
    villainCount,
    hasFrame: existsSync(join(worldPath, "world_frame.json")),
  });
});
```

- [ ] **Step 2: Verify build passes**

Run typecheck. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/worlds.ts
git commit -m "feat: add GET /worlds/:name/detail endpoint for world statistics modal"
```

---

### Task 5: Add world statistics modal to worlds.html

**Covers:** UI modal showing world details, entity lists, character/NPC info.

**Files:**
- Modify: `public/worlds.html` — add modal HTML, CSS, JS

- [ ] **Step 1: Add modal CSS**

Add after the existing `.birth-wizard__loading::after` animation block (before `@keyframes fadeIn`), inside the `<style>` block:

```css
/* World Detail Modal */
.detail-modal{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.7);display:none;align-items:center;justify-content:center;animation:fadeIn 150ms var(--ease-out)}
.detail-modal--open{display:flex}
.detail-modal__box{background:var(--surface-raised);border:1px solid var(--border-visible);border-radius:var(--radius-lg);width:640px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden}
.detail-modal__head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)}
.detail-modal__title{font-family:var(--font-mono);font-size:14px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-display)}
.detail-modal__close{background:transparent;border:none;color:var(--text-disabled);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}
.detail-modal__close:hover{color:var(--text-primary)}
.detail-modal__body{flex:1;overflow-y:auto;padding:16px 20px}
.detail-modal__section{margin-bottom:16px}
.detail-modal__section-title{font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;gap:8px}
.detail-modal__section-title::after{content:'';flex:1;height:1px;background:var(--border)}
.detail-modal__stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:12px}
.detail-modal__stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 12px;text-align:center}
.detail-modal__stat-val{font-family:var(--font-body);font-size:22px;color:var(--text-display);font-weight:600}
.detail-modal__stat-label{font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-disabled);margin-top:2px}
.detail-modal__entity-list{display:flex;flex-direction:column;gap:6px}
.detail-modal__entity{display:flex;align-items:start;gap:10px;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);transition:border-color var(--dur-fast)}
.detail-modal__entity:hover{border-color:var(--border-visible)}
.detail-modal__entity-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:4px}
.detail-modal__entity-dot--char{background:var(--interactive)}
.detail-modal__entity-dot--loc{background:var(--success)}
.detail-modal__entity-dot--faction{background:var(--accent)}
.detail-modal__entity-dot--item{background:var(--warning)}
.detail-modal__entity-info{flex:1;min-width:0}
.detail-modal__entity-name{font-family:var(--font-body);font-size:13px;color:var(--text-display);font-weight:500}
.detail-modal__entity-summary{font-size:11px;color:var(--text-tertiary);line-height:1.4;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.detail-modal__entity-tags{display:flex;gap:4px;margin-top:4px;flex-wrap:wrap}
.detail-modal__entity-tag{font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.06em;padding:1px 6px;border:1px solid var(--border);border-radius:var(--radius-pill);color:var(--text-disabled)}
.detail-modal__rule{padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)}
.detail-modal__rule:last-child{border-bottom:none}
.detail-modal__rule-name{color:var(--text-display);font-weight:500}
.detail-modal__rule-desc{color:var(--text-tertiary);font-size:11px;margin-top:2px}
.detail-modal__empty{text-align:center;padding:24px;color:var(--text-disabled);font-size:12px}
@media(max-width:768px){.detail-modal__box{width:calc(100vw - 32px)}}
```

- [ ] **Step 2: Add modal HTML**

Add after the birth-wizard div (after line 273, before `<script>`):

```html
<div class="detail-modal" id="detailModal">
  <div class="detail-modal__box">
    <div class="detail-modal__head">
      <span class="detail-modal__title" id="detailModalTitle">World Details</span>
      <button class="detail-modal__close" onclick="closeDetailModal()">&times;</button>
    </div>
    <div class="detail-modal__body" id="detailModalBody"></div>
  </div>
</div>
```

- [ ] **Step 3: Add modal JS functions**

Add before `loadLang().then(() => loadWorlds());` at the end of the `<script>` block:

```javascript
// ── World Detail Modal ──
async function openDetailModal(worldName, e) {
  if (e) e.stopPropagation();
  const modal = document.getElementById('detailModal');
  const body = document.getElementById('detailModalBody');
  const title = document.getElementById('detailModalTitle');

  title.textContent = worldName;
  body.innerHTML = '<div class="detail-modal__empty">Loading...</div>';
  modal.classList.add('detail-modal--open');

  try {
    const data = await apiFetch('/worlds/' + worldName + '/detail');
    title.textContent = data.title || data.name;

    let html = '';

    // Stats grid
    html += '<div class="detail-modal__stats">';
    html += statBlock(data.totalEntities, t('uiEntities'));
    html += statBlock(data.entityCounts?.Character ?? 0, 'Characters');
    html += statBlock(data.entityCounts?.Location ?? 0, 'Locations');
    html += statBlock(data.entityCounts?.Faction ?? 0, 'Factions');
    html += statBlock(data.entityCounts?.Item ?? 0, 'Items');
    html += statBlock(data.entityCounts?.WorldRule ?? 0, 'Rules');
    html += statBlock(data.sessionCount, t('uiSessions'));
    html += statBlock(data.eventCount, 'Events');
    html += statBlock(data.chapterCount, 'Chapters');
    html += statBlock(data.villainCount, 'Villains');
    html += '</div>';

    // Description
    if (data.description) {
      html += '<div class="detail-modal__section">';
      html += '<div class="detail-modal__section-title">Description</div>';
      html += '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6">' + esc(data.description) + '</div>';
      html += '</div>';
    }

    // World Rules
    if (data.worldRules && data.worldRules.length > 0) {
      html += '<div class="detail-modal__section">';
      html += '<div class="detail-modal__section-title">World Rules</div>';
      for (const rule of data.worldRules) {
        html += '<div class="detail-modal__rule"><span class="detail-modal__rule-name">' + esc(rule.name) + '</span>';
        if (rule.description) html += '<div class="detail-modal__rule-desc">' + esc(rule.description) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    // Characters
    if (data.characters && data.characters.length > 0) {
      html += '<div class="detail-modal__section">';
      html += '<div class="detail-modal__section-title">Characters (' + data.characters.length + ')</div>';
      html += '<div class="detail-modal__entity-list">';
      for (const c of data.characters) {
        html += entityCard(c.name, c.summary, c.tags, 'char');
      }
      html += '</div></div>';
    }

    // Locations
    if (data.locations && data.locations.length > 0) {
      html += '<div class="detail-modal__section">';
      html += '<div class="detail-modal__section-title">Locations (' + data.locations.length + ')</div>';
      html += '<div class="detail-modal__entity-list">';
      for (const l of data.locations) {
        html += entityCard(l.name, l.summary, [], 'loc');
      }
      html += '</div></div>';
    }

    // Factions
    if (data.factions && data.factions.length > 0) {
      html += '<div class="detail-modal__section">';
      html += '<div class="detail-modal__section-title">Factions (' + data.factions.length + ')</div>';
      html += '<div class="detail-modal__entity-list">';
      for (const f of data.factions) {
        html += entityCard(f.name, f.summary, [], 'faction');
      }
      html += '</div></div>';
    }

    // Items
    if (data.items && data.items.length > 0) {
      html += '<div class="detail-modal__section">';
      html += '<div class="detail-modal__section-title">Items (' + data.items.length + ')</div>';
      html += '<div class="detail-modal__entity-list">';
      for (const i of data.items) {
        html += entityCard(i.name, i.summary, [], 'item');
      }
      html += '</div></div>';
    }

    if (!html.includes('detail-modal__entity')) {
      html += '<div class="detail-modal__empty">No entities yet. Start a new game to populate the world.</div>';
    }

    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<div class="detail-modal__empty" style="color:var(--accent)">' + esc(e.message) + '</div>';
  }
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('detail-modal--open');
}

function statBlock(val, label) {
  return '<div class="detail-modal__stat"><div class="detail-modal__stat-val">' + val + '</div><div class="detail-modal__stat-label">' + esc(label) + '</div></div>';
}

function entityCard(name, summary, tags, type) {
  let html = '<div class="detail-modal__entity">';
  html += '<span class="detail-modal__entity-dot detail-modal__entity-dot--' + type + '"></span>';
  html += '<div class="detail-modal__entity-info">';
  html += '<div class="detail-modal__entity-name">' + esc(name) + '</div>';
  if (summary) html += '<div class="detail-modal__entity-summary">' + esc(summary) + '</div>';
  if (tags && tags.length > 0) {
    html += '<div class="detail-modal__entity-tags">';
    for (const tag of tags.filter(Boolean)) {
      html += '<span class="detail-modal__entity-tag">' + esc(tag) + '</span>';
    }
    html += '</div>';
  }
  html += '</div></div>';
  return html;
}
```

- [ ] **Step 4: Update world card click to open modal**

In the `loadWorlds()` function, change the onclick of each world card from `selectWorld('${w.name}')` to `openDetailModal('${w.name}', event)`:

Find:
```javascript
      <div class="world-card ${w.name === activeWorld ? 'world-card--active' : ''}" onclick="selectWorld('${w.name}')">
```

Replace with:
```javascript
      <div class="world-card ${w.name === activeWorld ? 'world-card--active' : ''}" onclick="openDetailModal('${w.name}', event)">
```

- [ ] **Step 5: Add close-on-overlay-click for detail modal**

Add after the `closeDetailModal` function:

```javascript
document.getElementById('detailModal').addEventListener('click', function(e) {
  if (e.target === this) closeDetailModal();
});
```

- [ ] **Step 6: Add i18n keys for modal**

In the `I18N.en` object, add:
```javascript
    uiWorldDetails:"World Details",uiDescription:"Description",uiWorldRules:"World Rules",
    uiCharacters:"Characters",uiLocations:"Locations",uiFactions:"Factions",uiItems:"Items",
    uiEvents:"Events",uiChapters:"Chapters",uiVillains:"Villains",
    uiNoEntities:"No entities yet. Start a new game to populate the world.",
```

In `I18N.ru`, add:
```javascript
    uiWorldDetails:"Детали мира",uiDescription:"Описание",uiWorldRules:"Правила мира",
    uiCharacters:"Персонажи",uiLocations:"Локации",uiFactions:"Фракции",uiItems:"Предметы",
    uiEvents:"События",uiChapters:"Главы",uiVillains:"Злодеи",
    uiNoEntities:"Пока нет сущностей. Начните новую игру, чтобы заселить мир.",
```

Add the same keys to de, fr, es, ja, zh with appropriate translations.

- [ ] **Step 7: Verify build passes**

Open `public/worlds.html` in a browser, check no JS console errors. Expected: modal opens on card click, shows world stats.

- [ ] **Step 8: Commit**

```bash
git add public/worlds.html
git commit -m "feat: add world statistics modal with entity lists, rules, and character details"
```

---

### Task 6: Run full verification

**Covers:** All tasks — end-to-end verification.

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20` or the project's typecheck command. Expected: no errors.

- [ ] **Step 2: Run existing tests**

Run: `bun test 2>&1 | tail -20` (or whatever test runner the project uses). Expected: all tests pass.

- [ ] **Step 3: Manual smoke test**

Start the server and verify:
1. `/api/graph/summary` returns non-zero nodes and edges
2. `/api/graph/d3` returns nodes with links
3. `/api/worlds/default/detail` returns full world stats
4. `/worlds` page shows world cards, clicking opens modal with stats

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix: graph build pipeline complete — heuristic relationships + world modal"
```
