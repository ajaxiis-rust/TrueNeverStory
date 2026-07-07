# Settings Page Tab Redesign + Feature Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign settings.html from a single scrolling page into a tabbed interface, and wire up all 6 unconnected backend features (Cross-World, Plugins, Feature Flags, Agent Registry, Rules API, API versioning).

**Architecture:** Single `settings.html` rewrite with CSS tab system. Tabs are flat — max 3 clicks to any setting (tab bar → section → field). No nested navigation. Backend API calls added inline per tab.

**Tech Stack:** Vanilla HTML/CSS/JS, Hono API routes (existing), i18n via `data-i18n` attributes.

**Design constraint:** 3-click rule — tab bar (1 click) → content panel (2 clicks to any field). No recursion deeper than 3.

---

## Tab Layout

| Tab | Sections | Clicks to deepest field |
|-----|----------|------------------------|
| **General** | Language, Server, Auth, MAX Serve | 2 |
| **LLM** | LLM Config, Embeddings, Local Model Compute, Local Model Sampling, LLM Server Control | 2 |
| **World** | World basics, Cross-World Bus | 2 |
| **Agents** | Agent Registry (list, enable/disable, stats) | 2 |
| **Plugins** | Plugin list, capabilities, agents, routes | 2 |
| **Advanced** | Feature Flags, Memory, Probability | 2 |

---

## Task 1: CSS Tab System + HTML Shell

**Files:**
- Modify: `public/settings.html` (lines 1-78 styles, lines 80-100 topbar, lines 101-377 content)

- [ ] **Step 1: Add tab CSS after existing styles**

Add before `</style>`:

```css
/* Tabs */
.tabs{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:20px;flex-shrink:0}
.tab{padding:10px 20px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--text-disabled);cursor:pointer;border-bottom:2px solid transparent;transition:all var(--dur-fast);background:transparent;border-top:none;border-left:none;border-right:none}
.tab:hover{color:var(--text-secondary)}
.tab--active{color:var(--text-display);border-bottom-color:var(--accent)}
.tab-panel{display:none}
.tab-panel--active{display:block}
```

- [ ] **Step 2: Add tab bar HTML after topbar**

Insert after the topbar div, before `<div class="content">`:

```html
<div class="tabs" id="tabs">
  <button class="tab tab--active" data-tab="general">General</button>
  <button class="tab" data-tab="llm">LLM</button>
  <button class="tab" data-tab="world">World</button>
  <button class="tab" data-tab="agents">Agents</button>
  <button class="tab" data-tab="plugins">Plugins</button>
  <button class="tab" data-tab="advanced">Advanced</button>
</div>
```

- [ ] **Step 3: Wrap existing sections in tab panels**

Move each existing `<div class="section">` into the correct tab panel:

```
<div class="tab-panel tab-panel--active" id="panel-general">
  <!-- Language, Server, Auth, MAX Serve sections -->
</div>
<div class="tab-panel" id="panel-llm">
  <!-- LLM Config, Embeddings, Local Model Compute, Local Model Sampling, LLM Server Control -->
</div>
<div class="tab-panel" id="panel-world">
  <!-- World, Cross-World (new) -->
</div>
<div class="tab-panel" id="panel-agents">
  <!-- Agent Registry (new) -->
</div>
<div class="tab-panel" id="panel-plugins">
  <!-- Plugins (new) -->
</div>
<div class="tab-panel" id="panel-advanced">
  <!-- Feature Flags (new), Memory, Probability -->
</div>
```

- [ ] **Step 4: Add tab switching JS**

Add to the `<script>` block:

```javascript
document.getElementById('tabs').addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('tab-panel--active'));
  tab.classList.add('tab--active');
  document.getElementById('panel-' + tab.dataset.tab).classList.add('tab-panel--active');
});
```

- [ ] **Step 5: Verify tab switching works**

Open settings.html in browser. Click each tab. Only the correct panel should be visible.

---

## Task 2: Cross-World Bus Tab

**Files:**
- Modify: `public/settings.html` (add to panel-world)

- [ ] **Step 1: Add Cross-World HTML section**

Insert into `panel-world` after the World section:

```html
<!-- Cross-World Bus -->
<div class="section">
  <div class="section__title">Cross-World Bus</div>
  <div class="grid">
    <div class="field">
      <label class="field__label">Status</label>
      <span id="crossWorldStatus" style="font-size:11px;color:var(--text-disabled)">Loading...</span>
    </div>
    <div class="field">
      <label class="field__label">Enable Cross-World</label>
      <div class="toggle" id="crossWorldToggle" onclick="toggleCrossWorld()">
        <div class="toggle__track"></div>
        <span class="toggle__label">Disabled</span>
      </div>
    </div>
    <div class="field">
      <label class="field__label">Allow Portals</label>
      <div class="toggle" id="portalsToggle" onclick="this.classList.toggle('toggle--on')">
        <div class="toggle__track"></div>
        <span class="toggle__label">Disabled</span>
      </div>
    </div>
    <div class="field">
      <label class="field__label">Isolation Level</label>
      <select class="field__input" id="isolationLevel">
        <option value="full">Full — No cross-world data</option>
        <option value="portals_only">Portals Only</option>
        <option value="read_only">Read Only</option>
        <option value="disabled">Disabled</option>
      </select>
    </div>
  </div>
</div>

<!-- Portals -->
<div class="section">
  <div class="section__title">Portals</div>
  <div id="portalList" style="font-size:11px;color:var(--text-disabled)">No portals</div>
  <div class="grid" style="margin-top:8px">
    <div class="field">
      <label class="field__label">Source World</label>
      <input class="field__input" id="portalSrc" placeholder="world-a">
    </div>
    <div class="field">
      <label class="field__label">Target World</label>
      <input class="field__input" id="portalTgt" placeholder="world-b">
    </div>
  </div>
  <button class="btn" onclick="createPortal()" style="margin-top:8px">Create Portal</button>
</div>

<!-- Cross-World Events -->
<div class="section">
  <div class="section__title">Cross-World Events</div>
  <div id="crossWorldEvents" style="font-size:11px;color:var(--text-disabled)">No events</div>
  <button class="btn" onclick="loadCrossWorldEvents()" style="margin-top:8px">Refresh</button>
</div>
```

- [ ] **Step 2: Add Cross-World JS functions**

```javascript
async function loadCrossWorld() {
  try {
    const res = await fetch(API + '/cross-world/status', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('crossWorldStatus').textContent =
      data.enabled ? `Enabled — ${data.portalCount || 0} portals` : 'Disabled';
    const toggle = document.getElementById('crossWorldToggle');
    if (data.enabled) { toggle.classList.add('toggle--on'); toggle.querySelector('.toggle__label').textContent = 'Enabled'; }
    if (data.isolationLevel) document.getElementById('isolationLevel').value = data.isolationLevel;
  } catch {}
}

async function toggleCrossWorld() {
  const toggle = document.getElementById('crossWorldToggle');
  const enabling = !toggle.classList.contains('toggle--on');
  try {
    await fetch(API + '/cross-world/' + (enabling ? 'enable' : 'disable'), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isolationLevel: document.getElementById('isolationLevel').value,
        allowPortals: document.getElementById('portalsToggle').classList.contains('toggle--on'),
      }),
    });
    loadCrossWorld();
  } catch (e) { toast('Failed: ' + e.message, false); }
}

async function loadPortals() {
  try {
    const res = await fetch(API + '/cross-world/portals', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const el = document.getElementById('portalList');
    if (!data.portals?.length) { el.textContent = 'No portals'; return; }
    el.innerHTML = data.portals.map(p =>
      `<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span>${esc(p.source)} → ${esc(p.target)}</span>
        <button class="btn" style="padding:2px 8px;font-size:9px" onclick="deletePortal('${p.id}')">✕</button>
      </div>`
    ).join('');
  } catch {}
}

async function createPortal() {
  const src = document.getElementById('portalSrc').value.trim();
  const tgt = document.getElementById('portalTgt').value.trim();
  if (!src || !tgt) { toast('Source and target required', false); return; }
  try {
    await fetch(API + '/cross-world/portals', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: src, target: tgt }),
    });
    document.getElementById('portalSrc').value = '';
    document.getElementById('portalTgt').value = '';
    loadPortals();
  } catch (e) { toast('Failed: ' + e.message, false); }
}

async function deletePortal(id) {
  try {
    await fetch(API + '/cross-world/portals/' + id, { method: 'DELETE', credentials: 'include' });
    loadPortals();
  } catch {}
}

async function loadCrossWorldEvents() {
  try {
    const res = await fetch(API + '/cross-world/events', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const el = document.getElementById('crossWorldEvents');
    if (!data.events?.length) { el.textContent = 'No events'; return; }
    el.innerHTML = data.events.slice(-20).reverse().map(e =>
      `<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="color:var(--text-disabled)">${esc(e.time || '')}</span> ${esc(e.type)}: ${esc(e.message || e.source + '→' + e.target)}
      </div>`
    ).join('');
  } catch {}
}
```

- [ ] **Step 3: Call `loadCrossWorld()` and `loadPortals()` from `loadSettings()`**

Add to the end of `loadSettings()`:

```javascript
loadCrossWorld();
loadPortals();
```

---

## Task 3: Agent Registry Tab

**Files:**
- Modify: `public/settings.html` (add to panel-agents)

- [ ] **Step 1: Add Agent Registry HTML**

Insert into `panel-agents`:

```html
<!-- Agent Registry -->
<div class="section">
  <div class="section__title">Agent Registry</div>
  <div id="registryStats" style="font-size:11px;color:var(--text-disabled);margin-bottom:8px">Loading...</div>
  <div id="registryList"></div>
</div>
```

- [ ] **Step 2: Add Agent Registry JS**

```javascript
async function loadRegistry() {
  try {
    const [listRes, statsRes] = await Promise.all([
      fetch(API + '/agents/registry', { credentials: 'include' }),
      fetch(API + '/agents/registry/stats', { credentials: 'include' }),
    ]);
    if (statsRes.ok) {
      const stats = await statsRes.json();
      document.getElementById('registryStats').textContent =
        `Total: ${stats.total} | Builtin: ${stats.builtin} | Config: ${stats.config} | API: ${stats.api} | Plugin: ${stats.plugin}`;
    }
    if (!listRes.ok) return;
    const data = await listRes.json();
    const el = document.getElementById('registryList');
    if (!data.agents?.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text-disabled)">No registered agents</div>'; return; }
    el.innerHTML = data.agents.map(a =>
      `<div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-size:12px;color:var(--text-primary)">${esc(a.id)}</span>
          <span style="font-size:10px;color:var(--text-disabled);margin-left:8px">${esc(a.source)} | priority: ${a.priority ?? '—'}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="font-size:10px;color:${a.enabled !== false ? 'var(--success)' : 'var(--accent)'}">${a.enabled !== false ? 'ON' : 'OFF'}</span>
          <button class="btn" style="padding:2px 8px;font-size:9px" onclick="toggleAgent('${a.id}', ${a.enabled === false})">${a.enabled === false ? 'Enable' : 'Disable'}</button>
        </div>
      </div>`
    ).join('');
  } catch {}
}

async function toggleAgent(id, enable) {
  try {
    await fetch(API + '/agents/registry/' + id + '/' + (enable ? 'enable' : 'disable'), {
      method: 'POST', credentials: 'include',
    });
    loadRegistry();
  } catch (e) { toast('Failed: ' + e.message, false); }
}
```

- [ ] **Step 3: Call `loadRegistry()` from `loadSettings()`**

---

## Task 4: Plugins Tab

**Files:**
- Modify: `public/settings.html` (add to panel-plugins)

- [ ] **Step 1: Add Plugins HTML**

```html
<div class="section">
  <div class="section__title">Plugins</div>
  <div id="pluginList" style="font-size:11px;color:var(--text-disabled)">Loading...</div>
</div>
<div class="section">
  <div class="section__title">Plugin Agents</div>
  <div id="pluginAgents" style="font-size:11px;color:var(--text-disabled)">Loading...</div>
</div>
<div class="section">
  <div class="section__title">Plugin Routes</div>
  <div id="pluginRoutes" style="font-size:11px;color:var(--text-disabled)">Loading...</div>
</div>
```

- [ ] **Step 2: Add Plugins JS**

```javascript
async function loadPlugins() {
  try {
    const res = await fetch(API + '/plugins/', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const el = document.getElementById('pluginList');
    if (!data.plugins?.length) { el.textContent = 'No plugins installed'; return; }
    el.innerHTML = data.plugins.map(p =>
      `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between">
          <span style="font-size:12px;color:var(--text-primary)">${esc(p.id)}</span>
          <span style="font-size:10px;color:var(--text-disabled)">${esc(p.version || '—')}</span>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(p.description || '')}</div>
      </div>`
    ).join('');
  } catch {}

  try {
    const res = await fetch(API + '/plugins/agents/all', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const el = document.getElementById('pluginAgents');
      if (!data.agents?.length) { el.textContent = 'No plugin agents'; return; }
      el.innerHTML = data.agents.map(a =>
        `<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">
          <span style="color:var(--text-primary)">${esc(a.id)}</span>
          <span style="color:var(--text-disabled);margin-left:8px">${esc(a.plugin || '')}</span>
        </div>`
      ).join('');
    }
  } catch {}

  try {
    const res = await fetch(API + '/plugins/routes/all', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const el = document.getElementById('pluginRoutes');
      if (!data.routes?.length) { el.textContent = 'No plugin routes'; return; }
      el.innerHTML = data.routes.map(r =>
        `<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">
          <span style="color:var(--interactive)">${esc(r.method)} ${esc(r.path)}</span>
          <span style="color:var(--text-disabled);margin-left:8px">${esc(r.plugin || '')}</span>
        </div>`
      ).join('');
    }
  } catch {}
}
```

- [ ] **Step 3: Call `loadPlugins()` from `loadSettings()`**

---

## Task 5: Feature Flags Tab

**Files:**
- Modify: `public/settings.html` (add to panel-advanced)

- [ ] **Step 1: Add Feature Flags HTML**

```html
<!-- Feature Flags -->
<div class="section">
  <div class="section__title">Feature Flags</div>
  <div id="flagList" style="font-size:11px;color:var(--text-disabled)">Loading...</div>
  <div class="grid" style="margin-top:8px">
    <div class="field">
      <label class="field__label">Flag ID</label>
      <input class="field__input" id="flagId" placeholder="my-feature">
    </div>
    <div class="field">
      <label class="field__label">Rollout %</label>
      <input class="field__input" id="flagRollout" type="number" min="0" max="100" value="0">
    </div>
  </div>
  <div style="display:flex;gap:8px;margin-top:8px">
    <button class="btn btn--primary" onclick="createFlag()">Create Flag</button>
  </div>
</div>
```

- [ ] **Step 2: Add Feature Flags JS**

```javascript
async function loadFlags() {
  try {
    const res = await fetch(API + '/feature-flags', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const el = document.getElementById('flagList');
    if (!data.flags?.length) { el.textContent = 'No feature flags'; return; }
    el.innerHTML = data.flags.map(f =>
      `<div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-size:12px;color:var(--text-primary)">${esc(f.id)}</span>
          <span style="font-size:10px;color:var(--text-disabled);margin-left:8px">rollout: ${f.rollout ?? 0}%</span>
          <span style="font-size:10px;color:${f.enabled ? 'var(--success)' : 'var(--accent)'};margin-left:8px">${f.enabled ? 'ON' : 'OFF'}</span>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn" style="padding:2px 8px;font-size:9px" onclick="deleteFlag('${f.id}')">Delete</button>
        </div>
      </div>`
    ).join('');
  } catch {}
}

async function createFlag() {
  const id = document.getElementById('flagId').value.trim();
  const rollout = Number(document.getElementById('flagRollout').value);
  if (!id) { toast('Flag ID required', false); return; }
  try {
    await fetch(API + '/feature-flags', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, rollout, enabled: true }),
    });
    document.getElementById('flagId').value = '';
    loadFlags();
  } catch (e) { toast('Failed: ' + e.message, false); }
}

async function deleteFlag(id) {
  try {
    await fetch(API + '/feature-flags/' + id, { method: 'DELETE', credentials: 'include' });
    loadFlags();
  } catch {}
}
```

- [ ] **Step 3: Call `loadFlags()` from `loadSettings()`**

---

## Task 6: Rules API Connection

**Files:**
- Modify: `public/settings.html` (add to panel-world)

- [ ] **Step 1: Add Rules preview section to panel-world**

```html
<!-- Rules Preview -->
<div class="section">
  <div class="section__title">Rules Engine</div>
  <div class="grid">
    <div class="field">
      <label class="field__label">Available Social Rules</label>
      <div id="socialRulesList" style="font-size:11px;color:var(--text-disabled)">Loading...</div>
    </div>
    <div class="field">
      <label class="field__label">Available Economy Rules</label>
      <div id="economyRulesList" style="font-size:11px;color:var(--text-disabled)">Loading...</div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add Rules JS**

```javascript
async function loadRulesList() {
  try {
    const res = await fetch(API + '/rules', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('socialRulesList').innerHTML =
      (data.social || []).map(r => `<div style="padding:3px 0;font-size:11px">• ${esc(r)}</div>`).join('') || 'None';
    document.getElementById('economyRulesList').innerHTML =
      (data.economy || []).map(r => `<div style="padding:3px 0;font-size:11px">• ${esc(r)}</div>`).join('') || 'None';
  } catch {}
}
```

- [ ] **Step 3: Call `loadRulesList()` from `loadSettings()`**

---

## Task 7: i18n for New Tabs

**Files:**
- Modify: `public/settings.html` (EN, RU, DE, FR, ES, JA, ZH lang objects)

- [ ] **Step 1: Add tab label translations**

Add to each language object:

```javascript
// EN
uiTabGeneral:"GENERAL",uiTabLlm:"LLM",uiTabWorld:"WORLD",uiTabAgents:"AGENTS",uiTabPlugins:"PLUGINS",uiTabAdvanced:"ADVANCED",
uiCrossWorld:"Cross-World Bus",uiPortals:"Portals",uiAgentRegistry:"Agent Registry",uiPlugins:"Plugins",uiFeatureFlags:"Feature Flags",uiRulesEngine:"Rules Engine",

// RU
uiTabGeneral:"ОБЩИЕ",uiTabLlm:"LLM",uiTabWorld:"МИР",uiTabAgents:"АГЕНТЫ",uiTabPlugins:"ПЛАГИНЫ",uiTabAdvanced:"ДОПОЛНИТЕЛЬНЫЕ",
uiCrossWorld:"Межмировая шина",uiPortals:"Порталы",uiAgentRegistry:"Реестр агентов",uiPlugins:"Плагины",uiFeatureFlags:"Флаги фич",uiRulesEngine:"Движок правил",
```

- [ ] **Step 2: Add `data-i18n` attributes to tab buttons**

Update tab buttons:

```html
<button class="tab tab--active" data-tab="general" data-i18n="uiTabGeneral">General</button>
<button class="tab" data-tab="llm" data-i18n="uiTabLlm">LLM</button>
<button class="tab" data-tab="world" data-i18n="uiTabWorld">World</button>
<button class="tab" data-tab="agents" data-i18n="uiTabAgents">Agents</button>
<button class="tab" data-tab="plugins" data-i18n="uiTabPlugins">Plugins</button>
<button class="tab" data-tab="advanced" data-i18n="uiTabAdvanced">Advanced</button>
```

- [ ] **Step 3: Add `data-i18n` to section titles**

Add `data-i18n` attributes to all new section titles (Cross-World Bus, Portals, Agent Registry, Plugins, Feature Flags, Rules Engine).

---

## Task 8: Move Password Field to Auth Section

**Files:**
- Modify: `public/settings.html`

- [ ] **Step 1: Verify password field is in Auth section**

The password field (line 266-271) is already in the Auth section which is in panel-general. No change needed — just verify it renders correctly under the General tab.

---

## Task 9: Final Verification

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Visual verification**

Open `http://localhost:8000/settings` and verify:
1. All 6 tabs visible and clickable
2. Each tab shows correct sections
3. Cross-World toggle works
4. Portal list loads
5. Agent Registry loads with stats
6. Plugin list loads
7. Feature Flags list loads
8. Rules list loads
9. Language switching works on all tabs
10. Save Settings button still works

- [ ] **Step 3: Recompile standalone binary**

Run: `./build.sh compile linux-arm64`
