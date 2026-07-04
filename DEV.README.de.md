# TrueNeverStory — Entwicklerhandbuch

Technische Dokumentation für Contributors und Entwickler.

---

## Architektur-Überblick

TrueNeverStory ist eine Multi-Agent KI-Rollenspiel-Engine. Ein Spieler sendet Nachrichten, die durch einen Pipeline aus 14 spezialisierten KI-Agenten verarbeitet werden, die jeweils einen bestimmten Aspekt der Erzählung behandeln (Erzählung, NPC-Dialoge, Szenenwechsel, Handlungsplanung usw.).

```
Spieler-Eingabe
    ↓
RoleplayEngine.processInput()
    ↓
┌─────────────────────────────────┐
│  Mustererkennung                │
│  - Bewegung → SceneAgent        │
│  - NPC ansprechen → NPCAgent    │
│  - @agent Erwähnung → Agent     │
│  - Standard → NarratorAgent     │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│  Agent-Pipeline                 │
│  1. Kontext aufbauen (Gedächtnis│
│     Beziehungen, Weltzustand)   │
│  2. Prompt generieren           │
│  3. LLM über Warteschlange      │
│  4. Antwort parsen              │
│  5. Weltzustand aktualisieren   │
└─────────────┬───────────────────┘
              ↓
         Erzähl-Antwort
```

---

## Tech-Stack

| Schicht | Technologie |
|---------|-----------|
| Runtime | Bun (nicht Node.js) |
| Web-Framework | Hono |
| Datenbank | SQLite via `bun:sqlite` (WAL-Modus) |
| Validierung | Zod |
| Logging | Pino |
| LLM | OpenAI-kompatibles API (via HTTP) |
| WebSocket | `@hono/node-ws` |
| Compute-Kernels | C FFI (compiliert via Zig) + TypeScript Fallback |

---

## Projektstruktur

```
src/
├── index.ts                    # Server-Einstiegspunkt (Bun.serve)
├── app.ts                      # Hono App — Middleware-Kette + Route-Mounting
│
├── config/
│   ├── env.ts                  # Zod-validierte Env-Konfiguration
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # LLM HTTP-Client mit LRU-Cache
│   ├── llm-queue.ts            # Parallele Warteschlange mit pause/resume
│   ├── llm-types.ts            # LLM-Typdefinitionen
│   ├── sqlite-store.ts         # SQLite (FTS5 + Vektoren + Agent-Prompts + Übersetzungen)
│   ├── vector-ops.ts           # Kosinus, L2, Skalarprodukt
│   ├── mojo-ffi.ts             # FFI-Bindings (C/Mojo) + TS-Fallbacks
│   ├── session-store.ts        # SQLite-gestützter Sitzungsspeicher
│   ├── event-bus.ts            # Pub/Sub-Ereignissystem
│   ├── history-manager.ts      # Gesprächsverlauf Persistent
│   ├── atomic-io.ts            # Sichere JSON-Lesung/Schreibung
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
│   ├── auth.ts                 # Cookie-Auth (PBKDF2, CSRF, Rate-Limiting)
│   ├── rate-limiter.ts         # Token-Bucket pro IP
│   ├── security-headers.ts     # CSP, X-Frame-Options usw.
│   ├── error-handler.ts        # Globaler Fehlerhandler
│   └── logger.ts               # Request-Logging
│
├── models/                     # Datenmodelle (22 Dateien)
│   ├── entity.ts               # Core Entity (uid, name, Profil L1/L2/L3)
│   ├── chat.ts                 # ChatMessageSchema, SessionSetupSchema (Zod)
│   ├── director.ts             # DirectorTask, TaskPriority
│   ├── probability.ts          # ProbabilityProfile, Modifier
│   ├── quest.ts                # Quest, Objective, Reward
│   ├── item.ts                 # Item, ItemBoost
│   ├── rank.ts                 # Feudale Hierarchie (10 Ränge)
│   ├── archetype.ts            # 34 NPC-Archetypen
│   └── npc-stats.ts            # NPCStats, Vices, FamilyExpenses
│
├── routes/                     # API-Routen (18 Module)
│   ├── index.ts                # Route-Aggregator — mountet alle Module unter /api
│   ├── chat.ts                 # POST /chat/setup, /message, /stream (SSE), /agent
│   ├── entities.ts             # GET /entity/:uid, /neighbors, /path, /search, /graph/*
│   ├── agents.ts               # CRUD Agent-Konfigs + Prompts pro Sprache
│   ├── i18n.ts                 # Übersetzungs-CRUD (7 Sprachen)
│   ├── settings.ts             # GET/PUT Einstellungen
│   ├── worlds.ts               # Multi-World CRUD, Kapitel-Generierung
│   └── system.ts               # Pause/Resume Hintergrundverarbeitung
│
├── services/                   # Business-Logik (52+ Dienste)
│   │
│   │  ── Kern ──
│   ├── narrative-service.ts    # DI-Container — instantiiert ALLE Dienste
│   ├── roleplay-engine.ts      # Hauptverarbeitungs-Pipeline (processInput)
│   ├── story-engine.ts         # Handlungsereignis-Generierung
│   ├── director-loop.ts        # Hintergrund-Handlungsfortschritt
│   ├── agent-coordinator.ts    # Prioritäts-Warteschlange für Regisseur
│   │
│   │  ── Agenten (14) ──
│   ├── narrator-agent.ts       # Haupt-Erzähler
│   ├── director-agent.ts       # Handlungsbeat-Injektion
│   ├── scene-agent.ts          # Szenenwechsel
│   ├── npc-agent.ts            # NPC-Dialoge + Reaktionen
│   ├── researcher-agent.ts     # Faktenprüfung, Realismusvalidierung
│   ├── historian-agent.ts      # Historische Ereignisse
│   ├── cartographer-agent.ts   # Geographie, Entfernungen
│   ├── merchant-agent.ts       # Handel, Preisgestaltung
│   ├── quest-giver-agent.ts    # Quest-Generierung
│   ├── lorekeeper-agent.ts     # Weltenfakten, Magieregeln
│   ├── chronicler.ts           # Timeline-Verwaltung
│   ├── villain-manager.ts      # Antagonisten-Aktionen
│   ├── social-simulator.ts     # NPC-Soziale Dynamik
│   │
│   │  ── Weltsysteme ──
│   ├── story-planner.ts        # LLM-gesteuerte Arc-Planung
│   ├── story-arc-manager.ts    # Arc-Lebenszyklus
│   ├── world-builder.ts        # Welten-Entity-Erstellung
│   ├── world-clock.ts          # In-World-Zeit
│   ├── world-evolver.ts        # Auto-Hinzufügen von NPCs/Orten/Items
│   ├── world-manager.ts        # Multi-World-Verwaltung
│   ├── birth.ts                # Charakter-Erstellungs-Assistent
│   │
│   │  ── NPC-Systeme ──
│   ├── npc-runtime.ts          # NPC-Zustandsverwaltung
│   ├── npc-generator.ts        # Intelligente NPC-Erstellung
│   ├── npc-economy.ts          # Feudale Ökonomie
│   ├── npc-economy-runtime.ts  # Rundenbasierte Simulation
│   ├── memory-engine.ts        # Episodisches NPC-Gedächtnis
│   ├── memory-manager.ts       # Gedächtnissuche + Kontext
│   ├── behavior-engine.ts      # Autonome NPC-Aktionen
│   ├── dialogue-manager.ts     # NPC-Gesprächssitzungen
│   ├── dialogue-context.ts     # Angereicherte NPC-Prompts
│   ├── social-graph.ts         # Beziehungen, Fraktionen, Allianzen
│   │
│   │  ── Spielmechaniken ──
│   ├── probability-engine.ts   # Deterministische Ergebnisse
│   ├── probability-expression.ts # Sicherer Math-Evaluator (rekursiver Abstieg)
│   ├── romance-engine.ts       # Romantische Beziehungen
│   ├── quest-system.ts         # Quest-Lebenszyklus, Ziele, Ketten
│   ├── inventory-manager.ts    # Items, Ausrüstung, Handel
│   ├── navigator.ts            # Graph-Pfadfinding (BFS)
│   │
│   │  ── Infrastruktur ──
│   ├── agent-config.ts         # Agent-Konfig (SQLite-first + JSON-Fallback)
│   ├── prompt-builder.ts       # Prompt-Konstruktion
│   ├── model-manager.ts        # Modellkatalog + Downloads
│   ├── settings.ts             # Einstellungen Persistent
│   └── websocket-manager.ts    # WebSocket-Verbindungspool
│
├── intelligence/               # Graph-Intelligenz
│   ├── graph-analyzer.ts       # Graph-Statistiken
│   ├── graph-validator.ts      # Self-Healing Graph-Reparatur
│   ├── duplicate-detector.ts   # Entity-Deduplizierung
│   ├── recommender.ts          # Beziehungs-Vorschläge
│   └── pipeline.ts             # Intelligenz-Pipeline-Orchestrierung
│
├── memory/                     # Gedächtnis-Subsystem
│   ├── world-memory.ts         # Hauptgedächtnis-Klasse
│   ├── cognitive-pipeline.ts   # Entity-Extraktion → Widersprüche → Pain Signals
│   ├── entity-extractor.ts     # Entity-Extraktion aus Text
│   ├── scoring.ts              # Gedächtnis-Wichtigkeit-Scoring
│   └── write-buffer.ts         # Batch-Schreibpuffer
│
├── i18n/                       # Internationalisierung (7 Sprachen)
│   ├── types.ts                # LanguagePack-Schnittstelle
│   ├── index.ts                # Registrierung, getLanguagePack()
│   └── [en|ru|de|fr|es|ja|zh].ts
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — O(1) Zugriff + NameIndex
│
└── utils/
    ├── logger.ts               # Pino-Logger
    ├── hash.ts                 # SHA-256-Hilfsfunktionen
    ├── sanitize.ts             # Prompt-Injection-Verteidigung
    └── template-resolver.ts    # Agent-Template {variable} Auflösung

mojo/kernels/                   # C FFI Compute-Kernels
├── c/
│   ├── probability_ffi.c       # Erfolgswahrscheinlichkeit, Wurf, Batch
│   ├── vector_ffi.c            # 4-dim Vektoroperationen
│   ├── vector_full.c           # 768-dim Batch-Kosinus (BGE-M3)
│   ├── batch_ops.c             # Batch-NPC-Operationen
│   └── graph_ops.c             # Graph-Traversierung, RRF, Reputation
├── build.sh                    # Cross-Kompilierung via Zig
└── dist/                       # Compilierte .so/.dylib/.dll

public/                         # Frontend (statisches HTML)
├── index.html                  # Haupt-Chat/Rollenspiel-UI
├── agents.html                 # Agent-Konfiguration (i18n)
├── graph.html                  # Wissensgraph-Visualisierung (D3.js)
├── settings.html               # Globale Einstellungen (i18n)
└── worlds.html                 # World-Management + Geburts-Assistent
```

---

## DI-Container — NarrativeService

`NarrativeService` (`src/services/narrative-service.ts`) ist der zentrale DI-Container. Er instantiiert alle 30+ Dienste und verdrahtet deren Abhängigkeiten.

```
NarrativeService
├── entityStore     — O(1) Entity-Zugriff
├── graphStore      — Adjazenz-Map + Pfadsuche
├── eventBus        — Pub/Sub-Ereignisse
├── historyMgr      — Gesprächsverlauf-Persistenz
├── llm             — HTTP-Client für LLM-APIs
├── llmQueue        — Parallele Warteschlange (max 3)
├── sqliteStore     — FTS5 + Vektoren + Prompts + Übersetzungen
├── chronicler      — timeline.jsonl Writer
├── validator       — World-Frame-Validierung
├── probEngine      — Deterministische Ergebnisse
├── storyPlanner    — LLM-gesteuerte Arc-Planung
├── villainManager  — Antagonisten-Aktionen
├── socialSim       — NPC-Soziale Dynamik
├── npcRuntime      — NPC-Zustandsverwaltung
├── storyEngine     — Handlungsereignis-Generierung
├── director        — Hintergrund-Handlungsfortschritt
├── worldBuilder    — Entity-Erstellung
├── npcGenerator    — Intelligente NPC-Erstellung
└── graphValidator  — Self-Healing Graph
```

**Lebenszyklus:**
1. `new NarrativeService({dbPath, worldFrame})` — alles verdrahten
2. `start()` — LLM-Warteschlange starten, Entities synchen, Director starten
3. `stop()` — Director + LLM stoppen
4. `pause()` / `resume()` — wenn der Nutzer den Chat verlässt
5. `reset(newDbPath, worldFrame)` — Wechsel zu anderem Dungeon
6. `shutdown()` — sauberes Herunterfahren

---

## Ablauf eines Requests

### REST API (POST /api/chat/message)

```
1. Hono Middleware-Kette:
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. Route-Handler (chat.ts):
   - Zod-Validierung (ChatMessageSchema)
   - sanitizeInput() — Prompt-Injection-Muster entfernen
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput():
   - Mustererkennung: Bewegung, Gespräch, @agent, oder allgemein
   - Routing zum passenden Agenten
   - Kontext aufbauen (Gedächtnis, Beziehungen, Weltzustand)
   - Prompt generieren
   - LLM über Warteschlange aufrufen
   - Antwort parsen
   - Weltzustand aktualisieren
   - Erzähl-String zurückgeben

4. Antwort: JSON { narrative, location, story_time, ... }
```

### SSE-Streaming (POST /api/chat/stream)

Gleiches wie REST, aber mit `ReadableStream` + Keepalive-Pings.

---

## Agent-System

Jeder Agent ist eine Klasse mit `generateResponse()`, die:
1. Ein Kontext-Objekt empfängt
2. Einen Prompt baut (System + User-Template + Output-Format)
3. LLM über die Warteschlange aufruft
4. Die Antwort zurückgibt

### Agent-Priorität (höher = zuerst verarbeitet)

| Priorität | Agent |
|-----------|-------|
| 10 | Narrator |
| 9 | NPC |
| 8 | Director |
| 7 | Scene, Quest Giver |
| 6 | Story Planner, Villain, Historian, Lorekeeper |
| 5 | Chronicler, Merchant |
| 4 | Social Sim, Cartographer |
| 3 | Researcher |

---

## Daten-Schicht

### EntityStore (JSON)
- O(1) Zugriff per UID via `Map<string, EntityNode>`
- O(1) Namenssuche via `NameIndex` (case-insensitive)

### SQLiteStore
Tabellen: `entities` (FTS5), `embeddings` (Vektoren), `memories`, `agent_prompts`, `ui_translations`

Hybrid-Suche: FTS5 + dichte Vektoren + Reciprocal Rank Fusion.

### FFI-Kernels
5 C-Kernels via Zig: probability_ffi, vector_ffi, vector_full, batch_ops, graph_ops.

---

## Konfiguration

### Umgebungsvariablen (.env)

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `WORLD_LLM_BASE_URL` | – | OpenAI-kompatibler Endpoint |
| `WORLD_LLM_API_KEY` | – | API-Schlüssel |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Modellname |
| `WORLD_LLM_TIMEOUT` | `300` | Request-Timeout (Sekunden) |
| `WORLD_SERVER_HOST` | `127.0.0.1` | Listener-Adresse |
| `WORLD_SERVER_PORT` | `8000` | Listener-Port |
| `AUTH_PASSWORD` | – | Login-Passwort |

---

## Middleware-Kette

```
1. errorHandler     — Globaler Fehlerhandler
2. requestLogger    — Pino Request-Logging
3. rateLimiter      — 100 req/min pro IP
4. securityHeaders  — CSP, X-Frame-Options usw.
5. CORS             — localhost:8000 Origins
6. authMiddleware   — Session-Cookie-Validierung
```

---

## Testen

```bash
bun test                              # Alle Tests
bun test tests/entity-store.test.ts   # Entity-Store-Tests
bun test tests/probability-engine.test.ts  # Wahrscheinlichkeits-Tests
```

---

## Neuen Agent hinzufügen

1. `src/services/my-agent.ts` erstellen
2. In `roleplay-engine.ts` registrieren
3. Routing-Logik in `processInput()` hinzufügen
4. System-Prompt in `agent-config.ts` oder SQLite `agent_prompts` hinzufügen

---

## Key Patterns

- **Dual-write**: Settings schreiben in SQLite + JSON
- **Template-Auflösung**: Agent-Prompts mit `{variable}` Platzhaltern
- **Sicherer Eval**: Formeln via rekursivem Abstieg (kein eval)
- **Prompt-Injection-Verteidigung**: `sanitizeInput()` vor LLM
- **Atomare JSON-Schreibvorgänge**: via Temp-File + Rename
