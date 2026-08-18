# TrueNeverStory — Entwicklerhandbuch

Technische Dokumentation für Contributors und Entwickler.

---

## Architektur-Überblick

TrueNeverStory ist eine Multi-Agent-KI-Rollenspiel-Engine mit State-First-Architektur. Ein Spieler sendet Nachrichten, die durch eine deterministische Pipeline verarbeitet werden: Intent-Parsing, Simulation, Zustandsmutation, Kontextaufbau und spezialisiertes Agenten-Rendering.

```
Spieler-Eingabe
    ↓
Intent Parser → Simulation Engine → State Mutator → Context Builder
    ↓
Dramaturg (MCP) → Stylist (MCP) → Censor → Translation Service
    ↓
Erzähl-Antwort
```

---

## Tech-Stack

| Schicht | Technologie |
|---------|-----------|
| Laufzeit | Bun (nicht Node.js) |
| Web-Framework | Hono |
| Datenbank | SQLite via `bun:sqlite` (WAL-Modus) |
| Validierung | Zod |
| Logging | Pino |
| LLM | OpenAI-kompatibles API (via HTTP) |
| WebSocket | `@hono/node-ws` |
| Compute-Kernels | C FFI (compiliert via Zig) + TypeScript-Fallback |

---

## Projektstruktur

```
src/
├── index.ts                    # Server-Einstiegspunkt (Bun.serve)
├── app.ts                      # Hono-App — Middleware-Kette + Route-Mounting
│
├── config/
│   ├── env.ts                  # Zod-validierte Env-Konfiguration (.env + process.env)
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # LLM-HTTP-Client mit LRU-Cache
│   ├── llm-queue.ts            # Parallele Anfrage-Warteschlange mit Pause/Resume
│   ├── llm-types.ts            # LLM-Typdefinitionen
│   ├── sqlite-store.ts         # SQLite (FTS5 + Vektoren + Agent-Prompts + Übersetzungen)
│   ├── vector-ops.ts           # Kosinus, L2, Skalarprodukt
│   ├── mojo-ffi.ts             # FFI-Bindings (C/Mojo) + TS-Fallbacks
│   ├── session-store.ts        # SQLite-gestützter Sitzungsspeicher
│   ├── event-bus.ts            # Pub/Sub-Ereignissystem
│   ├── history-manager.ts      # Persistenz des Gesprächsverlaufs
│   ├── atomic-io.ts            # Sichere JSON-Lese-/Schreibvorgänge (atomares Rename)
│   └── providers/
│       ├── index.ts            # Provider-Registrierung
│       ├── llm-provider.ts     # Abstrakte Provider-Schnittstelle
│       ├── provider-manager.ts # Multi-Provider-Routing
│       ├── openai-provider.ts
│       ├── ollama-provider.ts
│       ├── anthropic-provider.ts
│       ├── google-provider.ts
│       └── llamacpp-provider.ts
│
├── middleware/
│   ├── auth.ts                 # Cookie-basierte Authentifizierung (PBKDF2, CSRF, Rate-Limiting)
│   ├── rate-limiter.ts         # Token-Bucket pro IP
│   ├── security-headers.ts     # CSP, X-Frame-Options usw.
│   ├── error-handler.ts        # Globaler Fehlerhandler
│   └── logger.ts               # Request-Logging
│
├── models/                     # Datenmodelle (25 Dateien)
│   ├── entity.ts               # Kern-Entity (uid, name, Profil mit L1/L2/L3-Ebenen)
│   ├── chat.ts                 # ChatMessageSchema, SessionSetupSchema (Zod)
│   ├── director.ts             # DirectorTask, TaskPriority
│   ├── intent.ts               # Intent, IntentType
│   ├── simulation.ts           # SimulationResult, SimulationState
│   ├── heartbeat.ts            # HeartbeatPayload
│   ├── memory.ts               # MemoryEntry
│   ├── probability.ts          # ProbabilityProfile, Modifier
│   ├── romance.ts              # RomanceState
│   ├── story.ts                # StoryContext
│   ├── quest.ts                # Quest, Objective, Reward
│   ├── item.ts                 # Item, ItemBoost
│   ├── rank.ts                 # Feudale Hierarchie (10 Ränge)
│   ├── archetype.ts            # 34 NPC-Archetypen
│   ├── npc-state.ts            # NPC-Laufzeitzustand
│   └── npc-stats.ts            # NPCStats, Vices, FamilyExpenses
│
├── routes/                     # API-Routen (18 Module)
│   ├── index.ts                # Routen-Aggregator — mountet alle Module unter /api
│   ├── chat.ts                 # POST /chat/setup, /message, /stream (SSE), /agent
│   ├── entities.ts             # GET /entity/:uid, /neighbors, /path, /search, /graph/*
│   ├── agents.ts               # CRUD Agent-Konfigs + Prompts pro Sprache
│   ├── i18n.ts                 # Übersetzungs-CRUD (7 Sprachen)
│   ├── settings.ts             # GET/PUT Einstellungen, LLM-Server-Verwaltung
│   ├── worlds.ts               # Multi-World-CRUD, Wechsel, Kapitel-Generierung
│   ├── memory.ts               # Gedächtnis-Endpunkte
│   ├── branches.ts             # Story-Branch-Verwaltung
│   ├── probability.ts          # Wahrscheinlichkeits-Abfragen
│   ├── romance.ts              # Romance-System-Endpunkte
│   ├── quests.ts               # Quest-Endpunkte
│   ├── sessions.ts             # Sitzungshistorie
│   ├── maintenance.ts          # Graph-Wartung
│   ├── launch.ts               # Neues Spiel / Fortsetzen
│   ├── health.ts               # Health-Check
│   ├── models.ts               # Modellkatalog
│   ├── providers.ts            # LLM-Provider-Verwaltung
│   └── system.ts               # Pause/Resume der Hintergrundverarbeitung
│
├── services/                   # Business-Logik (60+ Dienste)
│   │
│   │  ── Kern-Engine ──
│   ├── narrative-service.ts    # DI-Container — instantiiert ALLE Dienste
│   ├── roleplay-engine.ts      # Hauptverarbeitungs-Pipeline (processInput)
│   ├── story-engine.ts         # Story-Ereignis-Generierung
│   ├── director-loop.ts        # Hintergrund-Story-Fortschritt (setInterval)
│   ├── agent-coordinator.ts    # Prioritäts-Aufgabenwarteschlange für den Regisseur
│   │
│   │  ── Agenten (Big Six) ──
│   ├── agents/
│   │   ├── dramaturg.ts       # Auswahl der Erzählmuster (MCP)
│   │   ├── validator.ts       # Faktenprüfung via Wikipedia (MCP)
│   │   ├── stylist.ts         # Prosa-Rendering (MCP)
│   │   ├── actor.ts           # NPC-Dialoge + Interaktionen
│   │   ├── censor.ts          # Entfernen von KI-Klischees
│   │   └── chronicler.ts      # Zeitachsen- + Gedächtnis-Updates
│   ├── agent-registry-v2.ts   # Agenten-Registrierung + Lookup
│   └── agent-v2.ts            # AgentV2-Schnittstelle + Basisklasse
│
│   │  ── Zustands-Pipeline ──
│   ├── intent-parser.ts       # Klassifikation der Nutzerabsicht
│   ├── simulation-engine.ts   # Deterministische Weltsimulation
│   ├── state-mutator.ts       # Weltzustands-Updates
│   ├── context-builder.ts     # Prompt-Kontext-Zusammenstellung
│   ├── heartbeat.ts           # Hintergrund-Weltheartbeat
│   └── translation-service.ts # Mehrsprachige Antwort-Übersetzung
│   │
│   │  ── Weltsysteme ──
│   ├── story-planner.ts        # LLM-gesteuerte Arc-Planung
│   ├── story-arc-manager.ts    # Arc-Lebenszyklus
│   ├── branch-manager.ts       # Story-Branches
│   ├── world-builder.ts        # Erstellung von Welt-Entities
│   ├── world-clock.ts          # In-World-Zeit
│   ├── world-evolver.ts        # Auto-Hinzufügen von NPCs/Orten/Items
│   ├── world-manager.ts        # Multi-World-CRUD
│   ├── world-validator.ts      # World-Frame-Validierung
│   ├── birth.ts                # Charakter-Erstellungs-Assistent
│   ├── start-resolver.ts       # Spielstart-Auflösung
│   │
│   │  ── NPC-Systeme ──
│   ├── npc-runtime.ts          # NPC-Zustandsverwaltung
│   ├── npc-generator.ts        # Intelligente NPC-Erstellung
│   ├── npc-economy.ts          # Kern der feudalen Ökonomie
│   ├── npc-economy-runtime.ts  # Rundenbasierte Simulation
│   ├── slave-economy.ts        # Sklavenhandels-Mechaniken
│   ├── memory-engine.ts        # Episodisches NPC-Gedächtnis
│   ├── memory-manager.ts       # Gedächtnissuche + Kontext
│   ├── behavior-engine.ts      # Autonome NPC-Aktionen
│   ├── dialogue-manager.ts     # NPC-Gesprächssitzungen
│   ├── dialogue-context.ts     # Angereicherte NPC-Prompts
│   ├── social-graph.ts         # Beziehungen, Fraktionen, Allianzen
│   │
│   │  ── Spielmechaniken ──
│   ├── probability-engine.ts   # Deterministische Ergebnisse
│   ├── probability-profiles.ts # Profildefinitionen
│   ├── probability-expression.ts # Sicherer Math-Evaluator (rekursiver Abstieg)
│   ├── probability-resolver.ts # Kontext-Auflösung
│   ├── romance-engine.ts       # Romantische Beziehungen
│   ├── romance-profiles.ts     # Definitionen romantischer Aktionen
│   ├── quest-system.ts         # Quest-Lebenszyklus, Ziele, Ketten
│   ├── quest-manager.ts        # Quest-Persistenz
│   ├── inventory-manager.ts    # Items, Ausrüstung, Handel
│   ├── item-evaluation.ts      # Item-Einzigartigkeit + Boost-Bewertung
│   ├── navigator.ts            # Graph-Pfadfinding (BFS)
│   │
│   │  ── Infrastruktur ──
│   ├── agent-config.ts         # Agent-Konfig (SQLite-first + JSON-Fallback)
│   ├── prompt-builder.ts       # Prompt-Konstruktion
│   ├── model-manager.ts        # Modellkatalog + Downloads
│   ├── settings.ts             # Einstellungs-Persistenz
│   └── websocket-manager.ts    # WebSocket-Verbindungspool
│
├── intelligence/               # Graph-Intelligenz
│   ├── graph-analyzer.ts       # Graph-Statistiken
│   ├── graph-validator.ts      # Self-Healing Graph-Reparaturen
│   ├── duplicate-detector.ts   # Entity-Deduplizierung
│   ├── recommender.ts          # Beziehungs-Vorschläge
│   ├── relationship-repairer.ts
│   ├── rule-checker.ts         # Weltregel-Validierung
│   ├── scene-generator.ts      # Szenenbeschreibungen
│   ├── subgraph-expander.ts    # Kontext-Erweiterung
│   └── pipeline.ts             # Orchestrierung der Intelligenz-Pipeline
│
├── memory/                     # Gedächtnis-Subsystem
│   ├── world-memory.ts         # Hauptgedächtnis-Klasse
│   ├── cognitive-pipeline.ts   # Entity-Extraktion → Widersprüche → Pain-Signale
│   ├── entity-extractor.ts     # Entities aus Text extrahieren
│   ├── contradiction-detector.ts
│   ├── pain-signals.ts         # Erkennung wichtiger Momente
│   ├── scoring.ts              # Gedächtnis-Wichtigkeit-Scoring
│   ├── clustering.ts           # Gedächtnis-Clustering
│   ├── partition.ts            # Gedächtnis-Partitionierung
│   ├── faiss-index.ts          # Vektorindex (FAISS-kompatibel)
│   ├── embedding-queue.ts      # Asynchrone Embedding-Generierung
│   ├── optimizer.ts            # Gedächtnis-Optimierung
│   └── write-buffer.ts         # Batch-Schreibpuffer
│
├── mcp/                        # MCP-Server — Bibel-/Gutenberg-Parser, Wikipedia-Tools
│
├── i18n/                       # Internationalisierung (7 Sprachen)
│   ├── types.ts                # LanguagePack-Schnittstelle
│   ├── index.ts                # Registrierung, getLanguagePack(), setLanguage()
│   ├── en.ts                   # Englisch (Basis)
│   ├── ru.ts                   # Russisch
│   ├── de.ts                   # Deutsch
│   ├── fr.ts                   # Französisch
│   ├── es.ts                   # Spanisch
│   ├── ja.ts                   # Japanisch
│   └── zh.ts                   # Chinesisch
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — O(1)-Zugriff + NameIndex
│
└── utils/
    ├── logger.ts               # Pino-Logger
    ├── hash.ts                 # SHA-256-Hilfsfunktionen
    ├── time.ts                 # Zeitformatierung
    ├── sanitize.ts             # Prompt-Injection-Verteidigung
    └── template-resolver.ts    # Auflösung von Agent-Template {variable}

mojo/
├── kernels/                    # C FFI Compute-Kernels
│   ├── c/
│   │   ├── probability_ffi.c   # Erfolgschance, Wurf, Batch-Wahrscheinlichkeit
│   │   ├── vector_ffi.c        # 4-dim Vektoroperationen (Kosinus, L2, Skalarprodukt)
│   │   ├── vector_full.c       # 768-dim Batch-Kosinus (BGE-M3)
│   │   ├── batch_ops.c         # Batch-NPC-Operationen (Altersverfall, Laster, Steuer)
│   │   └── graph_ops.c         # Graph-Traversierung, RRF, Reputation
│   ├── build.sh                # Cross-Kompilierung via Zig
│   └── dist/                   # Compilierte .so/.dylib/.dll
└── src/                        # 81 Mojo-Quelldateien (optionales Perf-Backend)

public/                         # Frontend (statisches HTML)
├── index.html                  # Haupt-Chat/Rollenspiel-UI
├── agents.html                 # Agent-Konfiguration (i18n)
├── graph.html                  # Wissensgraph-Visualisierung (D3.js)
├── models.html                 # Modellverwaltung
├── providers.html              # LLM-Provider-Einstellungen
├── settings.html               # Globale Einstellungen (i18n)
├── worlds.html                 # World-Management + Geburts-Assistent
└── static/
    ├── fonts/                  # Benutzerdefinierte Schriften
    └── vendor/                 # d3.v7.min.js, purify.min.js

conf/                           # Laufzeitkonfiguration (gitignored)
├── settings.json               # App-Einstellungen (LLM, Auth, Server)
├── agents.json                 # Globale Agenten-Modellzuweisungen
├── providers.json              # Provider-Registrierung
└── llm-config.json             # LLM-Provider-Konfiguration

worlds/                         # Weltdaten (gitignored)
└── default/
    ├── tns.db                  # SQLite (Entities, Embeddings, Gedächtnisse, Prompts, Übersetzungen)
    ├── entities.json           # Entity-Graph (JSON)
    ├── world_frame.json        # Weltdefinition
    ├── session_history/        # Gesprächsprotokolle pro Sitzung
    ├── chapters/               # Generierte literarische Kapitel
    ├── npc_profiles/           # NPC-Zustandsdateien
    ├── timeline.jsonl          # Ereignis-Zeitachse
    ├── story_planner.json      # Story-Planner-Zustand
    ├── villains.json           # Schurken-Zustand
    └── world_clock.json        # In-World-Zeit

worlds/_sessions/
    └── sessions.db             # SQLite-Sitzungsspeicher
```

---

## Dependency Injection — NarrativeService

`NarrativeService` (`src/services/narrative-service.ts`) ist der zentrale DI-Container. Er instantiiert alle 30+ Dienste und verdrahtet deren Abhängigkeiten.

```
NarrativeService
├── entityStore (UnifiedEntityStore) — O(1)-Entity-Zugriff
├── graphStore (GraphStore) — Adjazenz-Map + Pfadfinding
├── eventBus (EventBus) — Pub/Sub-Ereignisse
├── historyMgr (HistoryManager) — Gesprächs-Persistenz
├── llm (LLMClient) — HTTP-Client für LLM-APIs
├── llmQueue (LLMQueue) — parallele Anfrage-Warteschlange (max 3)
├── sqliteStore (SQLiteStore) — FTS5 + Vektoren + agent_prompts + Übersetzungen
├── chronicler (Chronicler) — timeline.jsonl-Schreiber
├── validator (WorldValidator) — World-Frame-Validierung
├── questMgr (QuestManager) — Quest-Persistenz
├── clock (WorldClock) — In-World-Zeit
├── probEngine (ProbabilityEngine) — deterministische Ergebnisse
├── probResolver (ProbabilityContextResolver) — Kontext für Wahrscheinlichkeit
├── storyPlanner (StoryPlanner) — LLM-gesteuerte Arc-Planung
├── villainManager (VillainManager) — Antagonisten-Aktionen
├── socialSim (SocialSimulator) — NPC-Sozialdynamik
├── npcRuntime (NPCRuntime) — NPC-Zustandsverwaltung
├── storyEngine (StoryEngine) — Story-Ereignis-Generierung
├── director (DirectorLoop) — Hintergrund-Story-Fortschritt
├── worldBuilder (WorldBuilder) — Entity-Erstellung
├── agentCoordinator (AgentCoordinator) — Prioritäts-Aufgabenwarteschlange
├── storyArcManager (StoryArcManager) — Arc-Lebenszyklus
├── userAgent (UserAgent) — Gruppe + Kampf
├── npcGenerator (NPCGenerator) — intelligente NPC-Erstellung
├── worldEvolver (WorldEvolver) — automatische Welt-Erweiterung
├── graphValidator (GraphValidator) — Self-Healing Graph
├── intentParser (IntentParser) — Klassifikation der Nutzerabsicht
├── simEngine (SimulationEngine) — deterministische Weltsimulation
├── stateMutator (StateMutator) — Weltzustands-Updates
├── contextBuilder (ContextBuilder) — Prompt-Kontext-Zusammenstellung
├── heartbeatService (HeartbeatService) — Hintergrund-Weltheartbeat
├── tnsServer (TNSServer) — MCP-Server (Bibel/Gutenberg/Wikipedia)
├── translationService (TranslationService) — mehrsprachige Übersetzung
└── agentRegistry (AgentRegistryV2) — Agenten-Registrierung + Lookup
```

**Lebenszyklus:**
1. `new NarrativeService({dbPath, worldFrame})` — der Konstruktor verdrahtet alles
2. `start()` — startet die LLM-Warteschlange, synchronisiert Entities in SQLite, baut automatisch heuristische Beziehungen auf (falls Entities existieren, aber keine Verbindungen haben), startet die Director-Schleife
3. `stop()` — stoppt Director + LLM-Warteschlange
4. `pause()` / `resume()` — für den Fall, dass der Nutzer die Chat-Ansicht verlässt
5. `reset(newDbPath, worldFrame)` — Hot-Swap zu einer anderen Welt
6. `shutdown()` — sauberes Herunterfahren

---

## Ablauf eines Requests

### REST API (POST /api/chat/message)

```
1. Hono-Middleware-Kette:
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. Routen-Handler (chat.ts):
   - Zod-Validierung (ChatMessageSchema)
   - sanitizeInput() — Prompt-Injection-Muster entfernen
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput():
   - Intent Parser → Nutzerabsicht klassifizieren
   - Simulation Engine → deterministische Weltsimulation
   - State Mutator → Weltzustand aktualisieren
   - Context Builder → Prompt-Kontext zusammenstellen
   - Dramaturg (MCP) → Erzählmuster auswählen
   - Stylist (MCP) → Prosa rendern
   - Censor → KI-Klischees entfernen
   - Translation Service → mehrsprachige Antwort
   - Erzähl-String zurückgeben

4. Antwort: JSON { narrative, location, story_time, ... }
```

### SSE-Streaming (POST /api/chat/stream)

Wie bei REST, aber `engine.processInputStream()` wird in einen `ReadableStream` mit Keepalive-Pings verpackt.

### WebSocket (ws://host/ws/...)

```
1. Upgrade: Session-Cookie prüfen (bring_session)
2. Bei Nachricht: JSON parsen → an die Engine weiterleiten
3. Bei Antwort: JSON stringify → ws.send()
```

---

## Agent-System

Jeder Agent implementiert die `AgentV2`-Schnittstelle mit einer `process()`-Methode, die Intent, Simulationsergebnisse und Spielkontext erhält.

### Die Big Six

| Agent | Rolle | MCP-Tools |
|-------|-------|-----------|
| Dramaturg | Auswahl der Erzählmuster | search_verses, get_pattern, get_archetype |
| Validator | Faktenprüfung via Wikipedia | verify_fact, get_context |
| Stylist | Prosa-Rendering | get_style_pattern, apply_style |
| Actor | NPC-Dialoge + Interaktionen | — |
| Censor | Entfernen von KI-Klischees | — |
| Chronicler | Zeitachsen- + Gedächtnis-Updates | — |

### AgentV2-Schnittstelle

```typescript
interface AgentV2 {
  readonly id: AgentId;
  readonly name: string;
  readonly description: string;
  readonly mcpTools: string[];
  process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput>;
}
```

**Hinweis:** Das alte 14-Agenten-System ist veraltet, funktioniert aber aus Gründen der Abwärtskompatibilität weiterhin. Alte Agent-IDs (`@narrator`, `@director` usw.) werden intern an die neuen Agenten weitergeleitet.

### Prompt-Auflösung

Agenten-Prompts werden in dieser Reihenfolge aufgelöst:
1. SQLite-Tabelle `agent_prompts` (pro Welt + Sprache)
2. JSON-Fallback (`worlds/{world}/agents/{agentId}.json`)
3. Hartkodierte Standardwerte (`DEFAULT_PROMPTS` in `agent-config.ts`)

Templates verwenden `{variable}`-Platzhalter, die von `resolveTemplate()` aufgelöst werden.

---

## MCP-Integration (v0.33.0)

TNSServer (`src/mcp/tns-server.ts`) stellt MCP-Tools für den Zugriff auf externe Daten bereit.

| Tool | Quelle | Beschreibung |
|------|--------|--------------|
| search_verses | Bibel | Biblische Verse nach Text, Buch oder Referenz suchen |
| get_pattern | Bibel | Erzählmuster nach Archetyp, Stimmung oder Funktion abrufen |
| get_archetype | Bibel | Archetyp-Details nach Name abrufen |
| get_style_pattern | Gutenberg | Stile nach Stimmung, Tags oder Beschreibung suchen |
| apply_style | Gutenberg | Stil auf Text anwenden (delexifizieren und Vorschläge zurückgeben) |
| verify_fact | Wikipedia | Eine faktische Behauptung prüfen |
| get_context | Wikipedia | Wikipedia-Kontext für ein Thema abrufen |
| get_economic_phase | Wirtschafts-DB | Aktuelle Phase des Wirtschaftszyklus |
| calculate_price | Wirtschafts-DB | Preis mit Phasenmodifikator |
| generate_dilemma | Wirtschafts-DB | Fraktions-Steuerdilemma |
| check_jubilee | Wirtschafts-DB | Jubiläumszyklus-Prüfung |

### MCP-Konsole (v0.33.0)

Webbasierte Datenbankverwaltungskonsole für alle Projekt-Datenbanken.

**Start:** `./startgame.sh --mcp` (startet nur den DB-Verwaltungsserver auf Port 8000, kein Spiel)

**Web-UI:** `http://localhost:8000` — Tabs für Bible, Gutenberg, Wikipedia, LiteraryCompiler, Economics, System

**API:** Alle Endpunkte unter `/mcp/*` — vollständige Liste in `src/routes/mcp.ts`. SSE-Fortschritt unter `/mcp/stream/:jobId`.

**Selektiver Gutenberg-Download:** Katalogbasierter Download mit Genre-/Autoren-Filterung. TypeScript-basierte Download-Skripte mit SSE-Fortschrittsverfolgung.

---

## Daten-Schicht

### EntityStore (JSON)

- `entities.json` — Adjazenz-Map aller Entities
- O(1)-Zugriff per UID via `Map<string, EntityNode>`
- O(1)-Namenssuche via `NameIndex` (case-insensitive)
- Mutations-Tracking via `onMutation()`-Callback → synchronisiert in SQLite

### SQLiteStore

Tabellen:
- `entities` — FTS5-Volltextsuche
- `embeddings` — Vektor-Blobs (BGE-M3, 1024-dim)
- `memories` — Rollenspiel-Gedächtnisse mit FTS5
- `agent_prompts` — Prompt-Speicherung pro Welt + Sprache
- `ui_translations` — UI-Strings pro Sprache + Seite

Hybrid-Suche: FTS5-Keyword + dichter Vektor + Reciprocal Rank Fusion.

### FFI-Kernels

5 C-Kernels, kompiliert via Zig für plattformübergreifende Verteilung:

| Kernel | Funktionen | Fallback |
|--------|-----------|----------|
| `probability_ffi` | success_chance, roll, batch | Reines TS |
| `vector_ffi` | cosine_4d, l2_4d, dot_4d | Reines TS |
| `vector_full` | batch_cosine_768d | Reines TS |
| `batch_ops` | age_decay, vice_decay, tax, loyalty | Reines TS |
| `graph_ops` | rrf_fusion, reputation | Reines TS |

Erkennung: `dlopen()` in `mojo-ffi.ts`, Fallback bei Fehler.

---

## Konfiguration

### Umgebungsvariablen (.env)

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `WORLD_LLM_BASE_URL` | – | OpenAI-kompatibler Endpunkt |
| `WORLD_LLM_API_KEY` | – | API-Schlüssel |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Modellname |
| `WORLD_LLM_TIMEOUT` | `300` | Request-Timeout (Sekunden) |
| `WORLD_LLM_MAX_TOKENS` | `4096` | Maximale Tokens pro Antwort |
| `WORLD_LLM_TEMPERATURE` | `0.7` | Sampling-Temperatur |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | Maximale parallele LLM-Anfragen |
| `WORLD_DB_PATH` | `./world_db` | Datenbankverzeichnis (veraltet) |
| `WORLDS_ROOT` | `./worlds` | Stammverzeichnis der Welten |
| `WORLD_SERVER_HOST` | `127.0.0.1` | Listen-Adresse |
| `WORLD_SERVER_PORT` | `8000` | Listen-Port |
| `AUTH_PASSWORD` | – | Login-Passwort (leer = keine Authentifizierung) |
| `AUTH_PASSWORD_HASH` | – | PBKDF2-Hash (salt:hash) |

### Einstellungen (conf/settings.json)

Geladen via `loadSettings()`. Priorität: settings.json > .env > Standardwerte.

Enthält: LLM-Parameter, Embedding-Konfiguration, Server-Konfiguration, Auth-Passwort, Gedächtnis-Einstellungen, Wahrscheinlichkeits-Glück, Weltauswahl, Sprache.

---

## Middleware-Kette

Die Reihenfolge ist wichtig — angewendet in `app.ts`:

```
1. errorHandler     — Catch-All-Fehlerhandler
2. requestLogger    — Pino-Request-Logging
3. rateLimiter      — 100 req/min pro IP
4. securityHeaders  — CSP, X-Frame-Options usw.
5. CORS             — localhost:8000-Origins
6. authMiddleware   — Session-Cookie-Validierung (schützt /api/*, /ws/*)
```

---

## Testen

```bash
bun test                              # Alle Tests ausführen
bun test tests/entity-store.test.ts   # Entity-Store-Tests
bun test tests/probability-engine.test.ts  # Wahrscheinlichkeits-Tests
bun test tests/integration/server.test.ts  # Integrationstests (erfordern laufenden Server)
```

Testdateien verwenden die `*.test.ts`-Konvention neben den Quelldateien.

---

## Einen neuen Agenten hinzufügen

1. `src/services/my-agent.ts` erstellen:
```typescript
export class MyAgent {
  constructor(deps: { llmQueue: LLMQueue; entityStore: UnifiedEntityStore }) {}
  
  async generateResponse(ctx: AgentContext): Promise<string> {
    const prompt = buildPrompt(ctx);
    return await this.deps.llmQueue.enqueue({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4o-mini",
    });
  }
}
```

2. Im Konstruktor von `roleplay-engine.ts` registrieren
3. Routing-Logik in `processInput()` hinzufügen
4. System-Prompt in `agent-config.ts` oder in der SQLite-Tabelle `agent_prompts` hinzufügen

---

## Eine neue Route hinzufügen

1. `src/routes/my-route.ts` erstellen:
```typescript
import { Hono } from "hono";
const myRoute = new Hono();
myRoute.get("/my-endpoint", async (c) => c.json({ ok: true }));
export { myRoute as myRouteRouter };
```

2. In `src/routes/index.ts` mounten:
```typescript
import { myRouteRouter } from "./my-route";
routes.route("/", myRouteRouter);
```

---

## World-Management

Mehrere isolierte Welten unter `worlds/`:

```
worlds/
├── default/           # Aktive Welt
│   ├── tns.db         # SQLite-Datenbank
│   ├── entities.json  # Entity-Graph
│   └── ...
├── levant/            # Eine weitere Welt
└── _sessions/         # Globaler Sitzungsspeicher
```

Welten wechseln via `POST /api/worlds/:name/switch`. Tauscht den DI-Container im laufenden Betrieb aus.

Weltstatistiken verfügbar via `GET /api/worlds/:name/detail` — liefert Entity-Anzahlen nach Typ, Charakter-/Orts-/Fraktions-/Item-Listen, Sitzungs-/Ereignis-/Kapitel-/Schurken-Anzahlen und Weltregeln.

---

## Key Patterns

- **Dual-write**: Einstellungen werden sowohl in SQLite als auch in JSON geschrieben (Abwärtskompatibilität)
- **Template-Auflösung**: Agenten-Prompts verwenden `{variable}`-Platzhalter, die zur Laufzeit aufgelöst werden
- **Sichere Ausdrucksauswertung**: Wahrscheinlichkeitsformeln verwenden einen Parser mit rekursivem Abstieg (kein eval)
- **Prompt-Injection-Verteidigung**: `sanitizeInput()` entfernt gängige Injection-Muster vor dem LLM
- **Atomare JSON-Schreibvorgänge**: `atomicWriteJson()` verwendet Temp-Datei + Rename für Crash-Sicherheit
- **Event-gesteuert**: `EventBus` entkoppelt Dienste (Entity-Erstellung, Gedächtnis-Ereignisse usw.)
- **Sprachinstruktions-Injektion**: Sprachdirektiven werden bei der Welterschaffung via `seedWorldAgents()` in die Agenten-Prompts eingebrannt und zur Laufzeit zusätzlich durch `getLanguageInstruction()` für dynamische NPC-Dialoge angehängt
