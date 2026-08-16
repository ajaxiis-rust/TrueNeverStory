# TrueNeverStory — Architekturdokument

> Eine Domain-Driven-Design-Analyse der TrueNeverStory-Narrative-RPG-Engine.
> Aktualisiert für v0.32.5 — RoleplayEngine refaktoriert mit SessionState, CommandHandler, PipelineRunner, Prosa-Strategien.

---

## [A1] Architekturmuster

**Geschichtete Onion-Architektur mit ereignisgesteuerten Erweiterungen + State-First-Pipeline**

TrueNeverStory folgt im Kern einer **geschichteten Onion- (hexagonalen) Architektur**, umhüllt von einer **ereignisgesteuerten Orchestrierungsschicht** für asynchrone Erzählverarbeitung. Seit v0.32.5 verwendet die Engine eine **State-First-Pipeline**, bei der die deterministische Simulation vor der Prosagenerierung stattfindet.

Das Muster passt, weil:

1. **Domänenmodelle sind isoliert** — `src/models/` enthält reine Datenstrukturen ohne Infrastrukturabhängigkeiten. `EntityNode`, `Quest`, `StoryContext`, `NPCProfile`, `ProbabilityModifier`, `Intent`, `SimulationResult` sind alle frameworkunabhängig.
2. **Services orchestrieren die Domänenlogik** — `src/services/` enthält Anwendungsservices (`RoleplayEngine`, `StoryEngine`) und Domänenservices (`ProbabilityEngine`, `SocialSimulator`, `RomanceEngine`, `SimulationEngine`).
3. **Infrastruktur wird an die Ränder verschoben** — `src/lib/` enthält Persistenz (`SQLiteStore`, `AtomicIO`), externe Integrationen (`LLMClient`, `ProviderManager`) und Transport (`WebSocketManager`).
4. **Routen sind dünne Adapter** — `src/routes/` mappt HTTP auf Service-Aufrufe mit minimaler Logik.
5. **MCP-Integration** — `src/mcp/` stellt externe Wissensquellen (Bibel, Gutenberg, Wikipedia) über das Model Context Protocol bereit.

Der **Event-Bus** (`EventBus` in `src/lib/event-bus.ts`) fügt eine asynchrone Entkopplungsschicht zwischen begrenzten Kontexten hinzu, wodurch der Director Loop Erzählereignisse orchestrieren kann, ohne direkt an NPC-, Sozial- oder Quest-Subsysteme gekoppelt zu sein.

### State-First-Pipeline (v0.32.5)

Die Pipeline ist nun als zusammensetzbare Stufen strukturiert, die von `PipelineRunner` verwaltet werden:

```
Player Input (any language)
  │
  ▼
PipelineRunner.buildContext() — snapshot engine state
  │
  ▼
PipelineRunner.translateAndClassify() — IntentParser + TranslationService
  │ translated text + intent
  ▼
CommandHandler.handle() — early exit for commands
  │
  ▼
PipelineRunner.runSimulation() — SimulationEngine (deterministic)
  │ outcome, probability, stateChanges
  ▼
StateMutator.applyChanges() — apply to EntityStore
  │
  ▼
PipelineRunner.buildGameContext() — ContextBuilder
  │
  ▼
Prose Generators:
  ├─ LiteraryV2Generator (feature-flag gated) → Stylist
  └─ LegacyIntentGenerator → MovementHandler | DialogueHandler | ObservationHandler | ActionHandler
  │
  ▼
TranslationService.translate() — if non-English target language
  │
  ▼
Response to User

Total: 2-3 LLM calls
```

### Gutenberg-Verarbeitungspipeline (v0.32.5)

Eine zweiphasige Pipeline konvertiert rohe Gutenberg-.txt-Dateien in agentenverwertbare Datenbanken:

**Phase A (V1 — regelbasiert, kein LLM):**
```
classics.db → GutenbergParser → gutenberg-normalized.db (styles + FTS)
         └→ 4-pass compiler → classics-compiled.db (quest templates)
              DramaturgicPass → StylisticPass → EmotionalPass → MetadataPass → Linter
```

**Phase B (V2 — LLM-angereichert):**
```
classics-compiled.db → AnalyzePass → narrative_extractor → literary.db (scene_templates + style_patterns)
```

**Neue Tabellen in classics-compiled.db:**
- `narrative_arcs` — Plot-Arc-Archetypen und Spannungspunkte pro Buch
- `thematic_motifs` — symbolische Motive mit Evolutionsverfolgung
- `quality_calibration` — Qualitätswerte der LLM-Antworten

**PlayerProfileStore** — eigenständige, agentenübergreifende Spieler-Stilprofile (14 Metriken), gespeichert in `data/player-profiles.db`.

### Dual-Modell-Architektur (v0.32.5)

Die Engine unterstützt zwei LLM-Modelle pro Agent:

| Modell | Zweck | Beispiele |
|--------|-------|-----------|
| **Hauptmodell** | Erzählgenerierung, NPC-Dialog, Story-Planung | llama-3.1-8b, qwen2.5-14b |
| **Übersetzungsmodell** | Übersetzung, Intent-Klassifikation (schnell, klein) | phi-3-mini, gemma-2-2b, qwen2.5-3b |

**Konfiguration** (pro Agent in `conf/agents.json`):
```json
{
  "agentId": "translation",
  "providerId": "ollama",
  "modelId": "qwen2.5:14b",
  "translationProviderId": "ollama",
  "translationModelId": "phi3:mini"
}
```

**LLMClient** löst das Modell über das Flag `useTranslationModel` auf:
- `LLMQueue.getAgentClient("translation", { useTranslationModel: true })` → verwendet `translationModelId`
- `LLMQueue.getAgentClient("stylist")` → verwendet `modelId`

```
┌─────────────────────────────────────────────────┐
│                   Routes (HTTP/WS)               │  ← Adapter Layer
├─────────────────────────────────────────────────┤
│              Application Services                │  ← Use Cases
│  RoleplayEngine │ NarrativeService │ StoryEngine │
├─────────────────────────────────────────────────┤
│               Domain Services                    │  ← Domain Logic
│  ProbabilityEngine │ SocialSimulator │ NPCRuntime │
├─────────────────────────────────────────────────┤
│               Domain Models                      │  ← Core Entities
│  EntityNode │ Quest │ NPCProfile │ StoryArc      │
├─────────────────────────────────────────────────┤
│              Infrastructure                      │  ← Persistence/External
│  SQLiteStore │ LLMClient │ EventBus │ AtomicIO   │
└─────────────────────────────────────────────────┘
```

---

## [A2] Begrenzte Kontexte

### BC1: Weltverwaltung

**Zweck:** Multi-World-Lebenszyklus — Erstellung, Konfiguration, Umschalten und Persistenz des Weltzustands.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | `World`, `WorldFrame` |
| **Schlüsselentitäten** | `EntityNode` (Charakter, Fraktion, Ort, Gegenstand, Ereignis, Rasse, Weltregel) |
| **Wertobjekte** | `WorldCreateParams`, `WorldSummary`, `LayeredProfile` (Ebenen L1/L2/L3) |
| **Domänenereignisse** | `WORLD_CREATED`, `WORLD_FRAME_LOADED`, `WORLD_EVOLVED` |
| **Persistenz** | `worlds/{name}/world_frame.json`, `worlds/{name}/entities.json` |

**Schlüsseldateien:**
- `src/services/world-manager.ts` — CRUD-Operationen, Weltumschaltung
- `src/services/world-builder.ts` — LLM-gesteuerte geschichtete Weltkonstruktion
- `src/services/world-validator.ts` — Integritätsprüfungen
- `src/services/world-evolver.ts` — Fügt im Laufe der Zeit NPCs/Orte/Gegenstände hinzu
- `src/routes/worlds.ts` — HTTP-Adapter

**Domänenregeln:**
- Weltnamen werden slugifiziert und sind eindeutig
- Jede Welt hat ihr eigenes isoliertes Datenverzeichnis unter `worlds/`
- `WorldFrame` definiert die kanonische Struktur (Kalender, Magiesystem, Rassen, Fraktionen, Orte, Gegenstände, historische Ereignisse, Weltregeln)
- Entitätsprofile verwenden ein 3-Ebenen-System: L1 (Identität), L2 (dynamischer Zustand), L3 (verborgen/geheim)

---

### BC2: Entität & Graph

**Zweck:** In-Memory-Graphdarstellung von Weltentitäten und ihren Beziehungen. Bietet O(1)-Nachschläge und Graphtraversierung.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | `GraphStore` (Aggregatwurzel für den Weltgraphen) |
| **Schlüsselentitäten** | `EntityNode`, `GraphEdge` |
| **Wertobjekte** | `Relationship`, `LayeredProfile`, `GraphSummary` |
| **Domänenereignisse** | `ENTITY_ADDED`, `ENTITY_UPDATED`, `ENTITY_REMOVED`, `RELATIONSHIP_ADDED`, `RELATIONSHIP_BROKEN`, `GRAPH_CHANGED` |
| **Persistenz** | `worlds/{name}/entities.json` (über `UnifiedEntityStore`), `worlds/{name}/branches.json` |

**Schlüsseldateien:**
- `src/store/entity-store.ts` — `UnifiedEntityStore` mit `NameIndex` für O(1)-Name→UID-Auflösung
- `src/services/graph-store.ts` — Adjazenzlisten-Graph mit Vorwärts-/Rückwärtskanten
- `src/services/branch-manager.ts` — Git-artiges Branching für Story-Graphen
- `src/intelligence/` — Graphanalyse, Validierung, Beziehungsreparatur

**Domänenregeln:**
- Entitäten haben eine eindeutige `uid` und werden per Name, Token oder Typpräfix aufgelöst
- `NameIndex` unterstützt Fuzzy-Auflösung (case-insensitiv, tokenbasiert, typbereinigt)
- `BranchManager` unterstützt Parent→Child-Branching mit Hinzufügungen/Löschungen pro Branch
- Graphkanten sind bidirektional (Vorwärts- + Rückwärtsmaps)

---

### BC3: Erzählung & Story

**Zweck:** Kern-Erzählgenerierung — der Storyteller, Szenenübergänge, Story-Beats und dramatische Orchestrierung.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | `StoryContext`, `StoryArc`, `DirectorTask`, `ChapterData`, `BeatData` |
| **Schlüsselentitäten** | `StoryBeat`, `ArcPhase`, `ArcTimelineEvent` |
| **Wertobjekte** | `NarratorOutput`, `NPCDialogue`, `SceneTransition` |
| **Domänenereignisse** | `STORY_EVENT`, `STORY_BEAT`, `VILLAIN_PROGRESS` |
| **Persistenz** | `worlds/{name}/director_state.json`, `worlds/{name}/story_arcs.json`, `worlds/{name}/planner_state.json` |

**Schlüsseldateien:**
- `src/services/narrative-service.ts` — **Composition Root** / DI-Container für alle Erzählservices
- `src/services/roleplay-engine.ts` — Haupt-Rollenspielverarbeitung, Agenten-Dispatch
- `src/services/agents/stylist.ts` — LLM-gesteuerte Prosagenerierung (der einzige Prosa-Generator)
- `src/services/agents/dramaturg.ts` — Erzählmusterauswahl aus Bibel-Archetypen
- `src/services/agents/validator.ts` — Faktenprüfung über Wikipedia-MCP
- `src/services/director-loop.ts` — Hintergrund-Orchestrator (Uhr→sozial→Schurke→Zufall→Beats)
- `src/services/story-engine.ts` — Ereignisgenerierung aus Story-Beats + Effektanwendung
- `src/services/story-planner.ts` — LLM-gesteuerte Kapitel-/Beat-Planung
- `src/services/story-arc-manager.ts` — CRUD für Story-Arcs mit Phasen
- `src/models/story.ts` — `StoryContext`, `NarratorOutput`, `NPCDialogue`, `SceneTransition`
- `src/models/director.ts` — `DirectorTask`, `StoryArc`, `StoryBeat`, `TaskPriority`

**Domänenregeln:**
- `DirectorLoop` läuft in einem konfigurierbaren Tick-Intervall (Standard 30 Minuten)
- Große Story-Beats haben eine Abklingzeit (Standard 6 Stunden)
- `StoryPlanner` verwendet zweiphasige Planung: Kapitelumriss → Beat-Generierung
- Das Enum `TaskPriority` steuert die LLM-Warteschlangen-Reihenfolge (CRITICAL > HIGH > NORMAL > LOW)
- Agenten-Prompts werden zuerst aus SQLite, dann als JSON-Fallback, dann aus hartkodierten Standardwerten aufgelöst

---

### BC4: NPC & Dialog

**Zweck:** Nicht-Spieler-Charakter-Zustandsverwaltung, episodisches Gedächtnis, Dialogsitzungen und NPC-Generierung.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | `NPCProfile` (Aggregatwurzel pro NPC) |
| **Schlüsselentitäten** | `EpisodicMemory`, `DialogueSession`, `DialogueMessage` |
| **Wertobjekte** | `NPCSkills`, `NPCDialogue`, `DialogueChoice`, `GreetingTemplate` |
| **Domänenereignisse** | `ENTITY_ADDED` (für generierte NPCs), `MEMORY_ADDED`, `MEMORY_CONSOLIDATED` |
| **Persistenz** | `worlds/{name}/npc_profiles.json`, `worlds/{name}/npc_profiles/{name}.json` |

**Schlüsseldateien:**
- `src/services/npc-runtime.ts` — `NPCRuntime`: Zustandsspeicher mit Kurz-/Langzeitgedächtnis
- `src/services/npc-generator.ts` — LLM-gesteuerte NPC-Erstellung
- `src/services/agents/actor.ts` — NPC-Dialog- und Interaktionsgenerierung
- `src/services/npc-economy.ts` — NPC-Wohlstand, Steuern, Schatzkammer, Nahrungsproduktion
- `src/services/dialogue-manager.ts` — Gesprächssitzungen, Themen, Auswahlmöglichkeiten
- `src/services/dialogue-context.ts` — Kontextbezogener Dialogzustand
- `src/models/npc-state.ts` — `NPCProfile`, `EpisodicMemory`, `NPCSkills`

**Domänenregeln:**
- NPC-Profile haben Kurzzeitgedächtnis (begrenzt auf 20) und episodisches Langzeitgedächtnis
- Gedächtniskonsolidierung findet statt, wenn das Kurzzeitgedächtnis `_importanceThreshold` (0.4) überschreitet
- NPCs werden beim Start aus dem Entity-Store synchronisiert — fehlende Profile werden automatisch erstellt
- Dialogsitzungen folgen einer Zustandsmaschine: `greeting → active → farewell → idle`
- Das Enum `TopicCategory` begrenzt gültige Gesprächsthemen

---

### BC5: Soziales & Beziehungen

**Zweck:** Zwischencharakterliche Beziehungen, Fraktionsdynamik, Allianzen, feudale Hierarchien und romantische Beziehungen.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | `SocialGraph` (Aggregatwurzel für den gesamten Sozialzustand) |
| **Schlüsselentitäten** | `Relationship`, `Faction`, `Alliance`, `FeudalRelationship` |
| **Wertobjekte** | `FactionSummary`, `FeudalSummary`, `RomanceStatus`, `RomanceProgression` |
| **Domänenereignisse** | `RELATIONSHIP_ADDED`, `RELATIONSHIP_REPAIRED`, `RELATIONSHIP_BROKEN` |
| **Persistenz** | Verzeichnis `worlds/{name}/social/` (JSON-Dateien pro Subsystem) |

**Schlüsseldateien:**
- `src/services/social-graph.ts` — `SocialGraph`: Beziehungen, Fraktionen, Allianzen, feudal
- `src/services/social-simulator.ts` — Paarauswahl, Interaktionsgenerierung
- `src/services/romance-engine.ts` — Romantische Beziehungsentwicklung
- `src/services/romance-profiles.ts` — Wahrscheinlichkeitsprofile für romantische Ereignisse
- `src/models/romance.ts` — `RelationshipMemory`, `RomanceStatus`, `RomanceProgression`

**Domänenregeln:**
- `SocialSimulator` wählt Paare basierend auf Ortsnähe und Fraktionsausrichtung
- Interaktionstypen werden nach Kontext gewichtet: gleicher Ort vs. gleiche Fraktion vs. unterschiedliche Fraktion
- Romantik verwendet `ProbabilityEngine` für deterministische Ergebnisauflösung
- Feudale Beziehungen verfolgen Loyalität, Steuerbeitrag, Militärverpflichtung
- Allianzen können verraten werden; Verrat hat Konsequenzen

---

### BC6: Quests

**Zweck:** Quest-Lebenszyklusverwaltung — Generierung, Ziele, Belohnungen, Ketten und Dialogintegration.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | `Quest`, `QuestDefinition` |
| **Schlüsselentitäten** | `QuestObjective`, `QuestObjectiveDef` |
| **Wertobjekte** | `QuestReward`, `QuestPrerequisite` |
| **Domänenereignisse** | `QUEST_ADDED`, `QUEST_UPDATED` |
| **Persistenz** | `worlds/{name}/quests.json` |

**Schlüsseldateien:**
- `src/services/quest-manager.ts` — Grundlegendes Quest-CRUD
- `src/services/quest-system.ts` — Vollständiger Lebenszyklus mit Ketten, Voraussetzungen, Zeitlimits
- `src/models/quest.ts` — `Quest`, `QuestObjective`, `QuestData`

**Domänenregeln:**
- Quest-Typen: `main`, `side`, `daily`, `faction`, `chain`
- Quest-Zustände: `available → active → completed | failed | abandoned`
- `QuestSystem` erzwingt Voraussetzungen (Mindeststufe, Fraktion, abgeschlossene Quests, Beziehung)
- `Quest.progress` ist ein berechneter Wert (abgeschlossene Ziele / Gesamtziele)
- Ketten-Quests verknüpfen sich über das Feld `chainNext`

---

### BC7: Gedächtnis & Wissen

**Zweck:** Weltgedächtnis, Agentengedächtnis, semantische Suche, embedding-basierter Abruf und Gedächtnis-Lebenszyklusverwaltung.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | `WorldMemory` (Aggregatwurzel), `AgentMemoryStore` (pro Agent) |
| **Schlüsselentitäten** | `WorldMemoryEntry`, `AgentMemoryEntry` |
| **Wertobjekte** | `MemoryConfig`, `ScoringWeights`, `MemoryMetadata`, `RankedItem` |
| **Domänenereignisse** | `MEMORY_ADDED`, `MEMORY_CONSOLIDATED`, `MEMORY_FORGOTTEN` |
| **Persistenz** | `tns.db` (SQLite), `worlds/{name}/memory/` (Partitionen), FAISS-Index |

**Schlüsseldateien:**
- `src/memory/world-memory.ts` — `WorldMemory`: Bewertung, Partitionierung, Embedding, Clustering
- `src/lib/agent-memory-store.ts` — `AgentMemoryStore`: RAG pro Agent mit Hybridsuche
- `src/lib/sqlite-store.ts` — `SQLiteStore`: FTS5 + Vektorsuche + RRF-Fusion
- `src/lib/vector-ops.ts` — Kosinus-Ähnlichkeit, L2-Distanz, Skalarprodukt
- `src/services/memory-engine.ts` — `MemoryEngine`: semantische Suche über episodische NPC-Erinnerungen
- `src/services/memory-manager.ts` — `MemoryManager`: Gesprächshistorie
- `src/memory/` — Bewertung, Clustering, Schreibpuffer, Embedding-Warteschlange, kognitive Pipeline

**Domänenregeln:**
- Gedächtnisbewertung verwendet gewichtete Formel: Wichtigkeit (0.35) + Aktualität (0.25) + Zugriff (0.15) + Emotion (0.10) + Relevanz (0.15)
- Gedächtnisse unter `minKeepScore` (0.15) und älter als `minKeepDays` (30) werden entfernt
- Agentengedächtnis ist über die Spalte `role` (Agenten-ID) in SQLite isoliert
- Hybridsuche: FTS5-Schlüsselwort + dichter Vektor → Reciprocal Rank Fusion (RRF)
- Der FAISS-Index wird neu aufgebaut, wenn die Fragmentierung den Schwellenwert überschreitet (200 neue Einträge)
- Der Schreibpuffer bündelt die Embedding-Generierung für Effizienz

---

### BC8: LLM-Integration

**Zweck:** Multi-Provider-LLM-Verwaltung, Anforderungswarteschlange, Ratenbegrenzung, Modellzuweisung pro Agent und Prompt-Konstruktion.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | `ProviderManager` (Singleton), `LLMQueue` |
| **Schlüsselentitäten** | `AgentModelAssignment`, `LLMProvider` |
| **Wertobjekte** | `AgentConfig`, `AgentPromptConfig`, `LLMClientOptions` |
| **Domänenereignisse** | Keine (Infrastrukturschicht) |
| **Persistenz** | `conf/providers.json`, `conf/agents.json`, `tns.db` (Tabelle agent_prompts) |

**Schlüsseldateien:**
- `src/lib/llm-client.ts` — `LLMClient`: LRU-Cache pro Agent, Provider-Dispatch
- `src/lib/llm-queue.ts` — `LLMQueue`: Prioritätswarteschlange, Nebenläufigkeitssteuerung, Ratenbegrenzung
- `src/lib/providers/provider-manager.ts` — `ProviderManager`: Multi-Provider, Multi-Key-Unterstützung
- `src/lib/providers/` — OpenAI-, Anthropic-, Google-, Ollama-, LlamaCpp-Provider
- `src/services/agent-config.ts` — Agentenkonfiguration (globale + weltweite Prompts)
- `src/services/prompt-builder.ts` — Statische Prompt-Templates für alle Agenten
- `src/services/model-manager.ts` — Modellverwaltung

**Domänenregeln:**
- `LLMQueue` erzwingt maximale Nebenläufigkeit (Standard 3) und Warteschlangenlimit (Standard 50)
- Prioritätsverdrängung: Aufgaben mit niedrigster Priorität werden verworfen, wenn die Warteschlange voll ist
- Ratenbegrenzung über `RateLimiter` (RPM-basiert mit automatischem Nachfüllen)
- Jeder Agent kann seinen eigenen Provider, sein Modell, seine Temperatur und seine maximale Token-Anzahl haben
- Prompt-Auflösung: SQLite (`agent_prompts`) → JSON-Fallback → hartkodierte Standardwerte
- `LLMClient` verwendet einen LRU-Cache (256 Einträge, 5-Minuten-TTL) für wiederholte Anfragen

---

### BC9: Wahrscheinlichkeit & Kampf

**Zweck:** Deterministische Wahrscheinlichkeitsberechnungen für alle Spielmechaniken — Kampf, soziale Aktionen, Handwerk, Romantik.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | `ProbabilityEngine` |
| **Schlüsselentitäten** | `ProbabilityModifier`, `ProbabilityProfile` |
| **Wertobjekte** | `ProbabilityParameter`, `ProbabilityResult`, `OutcomeQuality` |
| **Domänenereignisse** | Keine (reine Berechnung) |
| **Persistenz** | Keine (im Speicher, abgeleitet aus dem NPC-Zustand) |

**Schlüsseldateien:**
- `src/services/probability-engine.ts` — Kern-Wahrscheinlichkeitsberechnungen
- `src/services/probability-resolver.ts` — Kontextauflösung (Ort, Beziehungen, Weltzustand)
- `src/services/probability-expression.ts` — Ausdrucksparser für dynamische Modifikatoren
- `src/services/probability-profiles.ts` — Vordefinierte Wahrscheinlichkeitsprofile
- `src/models/probability.ts` — `ProbabilityModifier`, `ProbabilityProfile`, `OutcomeQuality`

**Domänenregeln:**
- Modifikatoren haben Typen: `ADD`, `MULTIPLY`, `REPLACE`
- Stapelregeln: `STACK`, `TAKE_HIGHEST`, `TAKE_LOWEST`, `OVERRIDE`
- Modifikatoren können ablaufen (zeitbasierte Dauer)
- `OutcomeQuality` reicht von `CRITICAL_FAILURE` bis `CRITICAL_SUCCESS`
- Der Kontext-Resolver injiziert dynamische Modifikatoren basierend auf Ort, Beziehungen, Weltzustand
- Mojo-FFI-Kernels (`probability_ffi.mojo`) beschleunigen Stapelberechnungen

---

### BC10: Schurkenverwaltung

**Zweck:** Antagonisten-Lebenszyklusverwaltung mit LLM-gesteuerter strategischer Planung und Zustandsmaschinen-Phasen.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | `VillainAgendaData` |
| **Schlüsselentitäten** | `VillainMemoryData` |
| **Wertobjekte** | Phase (`plotting → preparing → executing → climax`) |
| **Domänenereignisse** | `VILLAIN_PROGRESS` |
| **Persistenz** | `worlds/{name}/villain_state.json` |

**Schlüsseldateien:**
- `src/services/villain-manager.ts` — `VillainManager`: Phasenübergänge, strategische Planung

**Domänenregeln:**
- Der Schurke folgt einer 4-Phasen-Zustandsmaschine: `plotting → preparing → executing → climax`
- Jeder Phasenübergang erfordert den Abschluss einer Reihe von Aktionen
- Das LLM generiert kontextbewusste Schurkenaktionen (Sabotage, Gerücht, Spionageinfiltration usw.)
- Schurkenaktionen haben Erfolgs-/Fehlschlagskonsequenzen, die den Weltzustand beeinflussen
- Schergen können beauftragt werden, Schurkenpläne auszuführen

---

### BC11: Intelligenz & Analyse

**Zweck:** Graphanalyse, Validierung, Deduplizierung und Empfehlungs-Engine.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | Keine (Serviceschicht) |
| **Schlüsselentitäten** | Keine |
| **Wertobjekte** | Validierungsergebnisse, Empfehlungen |
| **Domänenereignisse** | Keine |
| **Persistenz** | Liest aus dem Entity-Store, schreibt Validierungsergebnisse |

**Schlüsseldateien:**
- `src/intelligence/graph-analyzer.ts` — Graphmetriken, Zentralität, Cluster
- `src/intelligence/graph-validator.ts` — Integritätsprüfungen
- `src/intelligence/duplicate-detector.ts` — Entitäts-Deduplizierung
- `src/intelligence/relationship-repairer.ts` — Reparatur unterbrochener Beziehungen
- `src/intelligence/recommender.ts` — Inhaltsempfehlungen
- `src/intelligence/scene-generator.ts` — Prozedurale Szenengenerierung
- `src/intelligence/rule-checker.ts` — Durchsetzung von Weltregeln
- `src/intelligence/subgraph-expander.ts` — Subgraph-Erweiterung

---

### BC12: Literary Compiler v2 (v0.32.5)

**Zweck:** Offline-Erzählextraktion aus literarischen Quellen und hybrider Laufzeitabruf für eingeschränkte Prosagenerierung. Ersetzt die LLM-lastige v1-Pipeline durch ein deterministisches Template- + Stilmuster-System.

| Aspekt | Detail |
|--------|--------|
| **Schlüsselaggregate** | `LiteraryCompilerDB` (Aggregatwurzel für alle v2-Tabellen) |
| **Schlüsselentitäten** | `SceneTemplate`, `StylePattern`, `ChunkIndex`, `TemplateStyleLink` |
| **Wertobjekte** | `RetrievalKeys`, `RankedTemplate`, `ExtractResult`, `PreScoreResult`, `TurnMetrics` |
| **Domänenereignisse** | Keine (Offline-Pipeline + Laufzeitabruf) |
| **Persistenz** | `literary.db` (SQLite mit FTS5-Indizes) |

**Schlüsseldateien:**
- `src/mcp/literary-compiler/schema.ts` — `LiteraryCompilerDB`: 6 v2-Tabellen, FTS5, CRUD-Methoden
- `src/mcp/literary-compiler/archetypes.ts` — 12 kanonische Archetypen + Schlüsselwortmengen + Variablen + Positionen
- `src/mcp/literary-compiler/chunker.ts` — Satzbasierte Textaufteilung (200-400 Tokens, 40-80 Überlappung)
- `src/mcp/literary-compiler/pre-score.ts` — Wörterbuch-Schlüsselwortbewertung + Erzähldichte (Dialog/Aktion/Konflikt)
- `src/mcp/literary-compiler/extractor.ts` — LLM-JSON-Extraktor mit Zod-artiger Validierung
- `src/mcp/literary-compiler/retrieval.ts` — Zusammengesetzte Bewertung: Archetyp (0.40) + Stimmung (0.15) + Domäne (0.15) + Qualität (0.10) + Frische (0.05) + Tags (0.15)
- `src/mcp/literary-compiler/fill-template.ts` — Deterministische `[placeholder]`-Ersetzung
- `src/mcp/literary-compiler/linter.ts` — V2-Validierung: Moraliserungserkennung, Token-Limits, Archetyp-Gültigkeit
- `src/mcp/literary-compiler/runtime-metrics.ts` — Latenzverfolgung pro Zug
- `src/services/agents/stylist.ts` — `buildMicroPrompt()` für eingeschränkte v2-Generierung
- `src/lib/feature-flags.ts` — Flags `literary-compiler-v2`, `literary-v2-retrieval`, `literary-v2-stylist`
- `scripts/migrate-v1-to-v2.ts` — Archetyp-Namensmigration (escape → escape_liberation usw.)

**Domänenregeln:**
- Alle Templates verwenden Englisch (Interlingua) zur RAG-Optimierung
- Templates sind anonymisiert (keine Charakternamen aus der Quelle)
- Anti-Moralisierungs-Beschränkung wird auf Linter- und Prompt-Ebene erzwungen
- Jedes Template hat ein ≤ 120 Token-Skelett
- Der Abruf gibt das Top-1-Template zurück (Top-2 bei Beinahe-Gleichstand)
- Hartes Budget: 1-2 LLM-Aufrufe pro Zug (von 4-5 in v1)
- Feature-flagged für schrittweise Einführung

**Offline-Pipeline:**
```
Source text
  → A. Chunker (pure code, 200-400 tokens, overlap 40-80)
  → B. BGE-M3 embed + store
  → C. Dictionary/heuristic candidate pass
  → D. Cluster / near-dup collapse (vectors)
  → E. Select representatives
  → F. Small local LLM JSON extract (Qwen3-8B, temp=0.1)
  → G. Role consistency map
  → H. Linter / quality gate
  → I. Write scene_templates + style_patterns + links
  → J. Emit metrics report
```

**Laufzeitablauf:**
```
Player input
  → Intent + Simulation + State mutation (0 LLM)
  → Build retrieval keys (position, archetype, mood, domain)
  → FTS + dictionary hybrid retrieval → top-1 template
  → Get linked style_pattern
  → fillTemplate (deterministic)
  → Stylist micro-prompt → 1 LLM call → 2-3 paragraphs
  → Rule-based Censor
```

---

## [A3] Aggregate & Entitäten

### BC1: Weltverwaltung

| Komponente | Typ | Invarianten |
|------------|-----|-------------|
| `World` | Aggregatwurzel | Muss eindeutigen slugifizierten Namen haben; muss gültiges `WorldFrame` haben |
| `WorldFrame` | Wertobjekt | Muss `world_name` definieren; `world_rules` muss für gültige Welten nicht leer sein |
| `LayeredProfile` | Wertobjekt | L1 muss `name` und `type` haben; Ebenen sind L1/L2/L3 |
| `EntityNode` | Entität | Muss eindeutige `uid` haben; `entityType` muss gültiges `EntityTypeValue` sein |
| `EntityType` | Wertobjekt (Enum) | `CHARACTER`, `FACTION`, `LOCATION`, `ITEM`, `EVENT`, `WORLD_RULE`, `RACE`, `UNKNOWN` |

### BC2: Entität & Graph

| Komponente | Typ | Invarianten |
|------------|-----|-------------|
| `GraphStore` | Aggregatwurzel | Muss vor der Traversierung gebootet sein; Kanten verweisen auf gültige UIDs |
| `GraphEdge` | Entität | `source` und `target` müssen gültige Entitäts-UIDs sein |
| `Relationship` | Wertobjekt | `sourceUid` und `targetUid` müssen existieren; `strength` ist 0-1 |
| `BranchManager` | Entität | Branchnamen müssen eindeutig sein; Parent muss existieren |

### BC3: Erzählung & Story

| Komponente | Typ | Invarianten |
|------------|-----|-------------|
| `StoryContext` | Wertobjekt | Muss `worldName`, `currentTime`, `location` haben |
| `StoryArc` | Aggregatwurzel | Muss eindeutige `id` haben; `beats`-Array nach Timing geordnet |
| `DirectorTask` | Entität | Muss eindeutige `id` haben; `priority` im `TaskPriority`-Bereich |
| `BeatData` | Entität | Muss zu einer gültigen `chapter_id` gehören; `triggered` ist boolesch |
| `ChapterData` | Wertobjekt | Muss eindeutige `id` haben; `beats`-Array nicht null |

### BC4: NPC & Dialog

| Komponente | Typ | Invarianten |
|------------|-----|-------------|
| `NPCProfile` | Aggregatwurzel (pro NPC) | Muss eindeutige `name` und `uid` haben; `health` 0-100; `skills`-Werte 0-1 |
| `EpisodicMemory` | Entität | Muss eindeutige `id` haben; `importance` 0-1; `emotion` nicht leer |
| `DialogueSession` | Entität | Muss eindeutige `id` haben; `state` im gültigen Enum-Bereich |
| `NPCSkills` | Wertobjekt | Alle Skill-Werte müssen 0-1 sein |
| `DialogueMessage` | Wertobjekt | `role` muss `player` oder `npc` sein |

### BC5: Soziales & Beziehungen

| Komponente | Typ | Invarianten |
|------------|-----|-------------|
| `SocialGraph` | Aggregatwurzel | Muss gültigen Zustandspfad haben; Beziehungen verweisen auf gültige Entitäten |
| `Relationship` | Entität | `type` im gültigen Enum; `strength` 0-1; `source` ≠ `target` |
| `Faction` | Wertobjekt | Muss eindeutige `name` haben; Mitglieder sind eindeutig |
| `Alliance` | Wertobjekt | `faction1` ≠ `faction2`; `strength` 0-1 |
| `FeudalRelationship` | Wertobjekt | `vassal` ≠ `liege`; `loyalty` 0-1 |

### BC6: Quests

| Komponente | Typ | Invarianten |
|------------|-----|-------------|
| `Quest` | Aggregatwurzel | Muss eindeutige `id` haben; `status` im gültigen Enum; `progress` berechnet |
| `QuestDefinition` | Aggregatwurzel | Muss eindeutige `id` haben; `objectives` nicht leer |
| `QuestObjective` | Entität | `completed` ist boolesch |
| `QuestReward` | Wertobjekt | `gold`, `experience` ≥ 0 |
| `QuestPrerequisite` | Wertobjekt | Mindestens eine Voraussetzung muss gesetzt sein |

### BC7: Gedächtnis & Wissen

| Komponente | Typ | Invarianten |
|------------|-----|-------------|
| `WorldMemory` | Aggregatwurzel | Muss gültigen Speicherpfad haben; Einträge nach gewichteter Formel bewertet |
| `WorldMemoryEntry` | Entität | Muss eindeutige `id` haben; `importance` 0-1; `content` nicht leer |
| `AgentMemoryStore` | Aggregatwurzel | Isoliert per `agentId`; verwendet hybride FTS5 + Vektorsuche |
| `MemoryConfig` | Wertobjekt | Alle Gewichte ≥ 0; `halfLifeDays` > 0 |
| `ScoringWeights` | Wertobjekt | Gewichte summieren sich zu 1.0 |

---

## [A4] Domänenservices

Querschnittliche Services, die zu keinem einzelnen Aggregat gehören:

| Service | Datei | Zweck |
|---------|-------|-------|
| `NarrativeService` | `src/services/narrative-service.ts` | **Composition Root** — instanziiert und verdrahtet alle Erzähl-Subsysteme |
| `RoleplayEngine` | `src/services/roleplay-engine.ts` | Haupteinstiegspunkt: orchestriert PipelineRunner → CommandHandler → Prosa-Generatoren. SessionState extrahiert nach `roleplay/session-state.ts`, Handler in `roleplay/handlers/` |
| `StoryEngine` | `src/services/story-engine.ts` | Ereignisgenerierung aus Beats + Effektanwendung (NPC-Bewegungen, Beziehungsänderungen, Quest-Erstellung) |
| `DirectorLoop` | `src/services/director-loop.ts` | Hintergrund-Orchestrator: Uhrtick → Sozialsim → Schurke → Zufallsereignisse → Story-Beats |
| `SocialSimulator` | `src/services/social-simulator.ts` | NPC-Paarauswahl + Interaktionsgenerierung |
| `ProbabilityEngine` | `src/services/probability-engine.ts` | Deterministische Ergebnisauflösung mit Modifikator-Stapelung |
| `MemoryEngine` | `src/services/memory-engine.ts` | Semantische Suche über episodische NPC-Erinnerungen |
| `WorldValidator` | `src/services/world-validator.ts` | Weltintegritätsvalidierung |
| `AgentCoordinator` | `src/services/agent-coordinator.ts` | Prioritätswarteschlange für Director-Task-Ausführung |
| `StartResolver` | `src/services/start-resolver.ts` | Löst den anfänglichen Story-Kontext aus dem Weltzustand auf |
| `WorldIsolator` | `src/services/world-isolator.ts` | Multi-World-Isolation mit Ressourcenüberwachung (Speicher, CPU, Tokens) |
| `CrossWorldBus` | `src/services/cross-world-bus.ts` | Weltübergreifende Ereigniskommunikation mit Portalen |
| `PluginManager` | `src/plugins/plugin-manager.ts` | Plugin-Lebenszyklusverwaltung (Registrieren, Abmelden, Fähigkeiten) |

---

## [A5] Domänenereignisse

Alle Ereignisse sind im Enum `EventTopic` (`src/lib/event-bus.ts`) definiert:

| Ereignis | Publisher | Konsumenten | Beschreibung |
|----------|-----------|-------------|--------------|
| `ENTITY_ADDED` | `WorldBuilder`, `NPCGenerator` | `GraphStore`, `WorldMemory` | Neue Entität erstellt |
| `ENTITY_UPDATED` | Verschiedene Services | `GraphStore`, `WorldMemory` | Entitätsprofil geändert |
| `ENTITY_REMOVED` | `GraphStore` | `WorldMemory` | Entität gelöscht |
| `ENTITY_LAYER_COMPLETED` | `WorldBuilder` | `GraphStore` | L1/L2/L3-Aufbauphase abgeschlossen |
| `RELATIONSHIP_ADDED` | `SocialSimulator` | `GraphStore` | Neue Beziehung entstanden |
| `RELATIONSHIP_REPAIRED` | `SocialSimulator` | `GraphStore` | Unterbrochene Beziehung repariert |
| `RELATIONSHIP_BROKEN` | `SocialSimulator` | `GraphStore` | Beziehung getrennt |
| `WORLD_CREATED` | `WorldManager` | Alle Services | Neue Welt initialisiert |
| `WORLD_FRAME_LOADED` | `WorldBuilder` | Alle Services | Weltrahmen von der Platte geladen |
| `WORLD_EVOLVED` | `WorldEvolver` | `Chronicler`, `WebSocketManager` | Weltzustand geändert |
| `STORY_EVENT` | `StoryEngine` | `Chronicler`, `WebSocketManager` | Story-Ereignis generiert |
| `STORY_BEAT` | `DirectorLoop` | `Chronicler`, `WebSocketManager` | Story-Beat injiziert |
| `VILLAIN_PROGRESS` | `VillainManager` | `Chronicler`, `WebSocketManager` | Schurkenaktion ausgeführt |
| `QUEST_ADDED` | `QuestSystem` | `WebSocketManager` | Neue Quest erstellt |
| `QUEST_UPDATED` | `QuestSystem` | `WebSocketManager` | Quest-Zustand geändert |
| `MEMORY_ADDED` | `WorldMemory` | `AgentMemoryStore` | Neues Gedächtnis gespeichert |
| `MEMORY_CONSOLIDATED` | `WorldMemory` | — | Kurz-→Langzeit-Beförderung |
| `MEMORY_FORGOTTEN` | `WorldMemory` | — | Gedächtnis entfernt |
| `MAINTENANCE_START` | System | Alle Services | Wartungszyklus beginnt |
| `MAINTENANCE_DONE` | System | Alle Services | Wartungszyklus abgeschlossen |
| `GRAPH_CHANGED` | `GraphStore` | `Intelligence` | Graphtopologie geändert |
| `ERROR` | Verschiedene | Logging | Fehler aufgetreten |

**Event-Bus-Mechanik:**
- Handler werden nach `priority` sortiert (höher = früher ausgeführt)
- Replay-Puffer (Standard 100 Ereignisse) für späte Abonnenten
- Asynchrone Veröffentlichung mit `await` — kein Fire-and-Forget

---

## [A6] Anwendungsschicht

### Use-Case-Ablauf: Spielernachricht → Stylist-Antwort

```
1. HTTP POST /chat/message
   └─→ routes/chat.ts: Zod validation, input sanitization

2. RoleplayEngine.processInput(sanitizedMessage)
   ├─→ SessionState (activeCharacter, currentLocation, currentTime)
   ├─→ PipelineRunner.translateAndClassify() → IntentParser
   ├─→ CommandHandler.handle() for commands
   ├─→ PipelineRunner.runSimulation() → SimulationEngine
   ├─→ Prose generation: LiteraryV2Generator or LegacyIntentGenerator
   └─→ Returns narrative string

3. Stylist.process(intent, simulation, context, pattern)
   ├─→ loadAgentConfig("stylist") → SQLite prompts → JSON fallback → defaults
   ├─→ resolveTemplate(template, vars) with StoryContext fields
   └─→ LLMQueue.generateText(prompt, priority, temperature, agentId)

4. LLMQueue
   ├─→ RateLimiter.check() → concurrency control
   ├─→ ProviderManager.getProvider(agentId) → provider/model
   ├─→ LLMClient.generate() → LRU cache check → HTTP to LLM
   └─→ Return response

5. RoleplayEngine
   ├─→ MemoryManager.addEntry(user, response)
   ├─→ Chronicler.logEvent(...) → WorldMemory.addEvent(...)
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Return { narrative, location, storyTime, activeCharacter }

6. WebSocketManager.broadcast({ type: "narrative", ... })
```

### Use-Case-Ablauf: Director-Tick → Story-Beat

```
1. DirectorLoop (background setInterval, default 30min)
   ├─→ WorldClock.tick(minutes)
   ├─→ SocialSimulator.simulateInteraction()
   ├─→ VillainManager.tick() → phase transitions
   ├─→ ProbabilityEngine.roll() → chance events
   └─→ StoryPlanner.shouldGenerateBeat() → StoryEngine.generateEvent()

2. StoryEngine.generateEvent()
   ├─→ LLMQueue.generateJson(EVENT_PROMPT, ...) → structured event
   ├─→ Apply effects: NPC moves, relationship changes, quest creation
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Chronicler.logEvent(...)

3. DirectorLoop
   ├─→ StoryEngine.generateBeat() → LLM generates narrative beat
   ├─→ RoleplayEngine.injectBeat(beat) → prepend to next response
   └─→ Save director_state.json
```

### Use-Case-Ablauf: Welterstellung

```
1. HTTP POST /api/worlds
   └─→ routes/worlds.ts → world-manager.createWorld(params)

2. WorldManager.createWorld()
   ├─→ mkdir worlds/{slugified-name}/
   ├─→ Write world_frame.json
   ├─→ EventBus.publish(WORLD_CREATED)
   └─→ NarrativeService.reset(dbPath, worldFrame)

3. WorldBuilder (on /api/launch)
   ├─→ createWorld() → LLM generates WorldFrame
   ├─→ buildL1() → identity layer for all entities
   ├─→ buildL2() → dynamic state layer
   ├─→ buildL3() → hidden/secret layer
   ├─→ buildRelationships() → entity relationships
   └─→ EventBus.publish(ENTITY_ADDED) for each entity

4. WebSocketManager.broadcast({ type: "world_created", ... })
```

### Use-Case-Ablauf: Agentengedächtnis

```
1. Stylist generates narrative prose
   └─→ EventBus.publish(MEMORY_ADDED, { content, source: "stylist" })

2. WorldMemory.addEvent()
   ├─→ Create WorldMemoryEntry with scoring metadata
   ├─→ EmbeddingQueue.enqueue(entry) → batch embedding via BGE-M3
   ├─→ VectorIndex.add(embedding, entryId)
   ├─→ WriteBehindBuffer.add(entry)
   └─→ Periodic flush to SQLite + FAISS rebuild

3. AgentMemoryStore.search(agentId, query)
   ├─→ getEmbedding(query) → BGE-M3 endpoint
   ├─→ SQLiteStore.searchMemoriesFTS(query) → keyword matches
   ├─→ SQLiteStore.searchMemoriesDense(vector) → cosine similarity
   ├─→ ReciprocalRankFusion(ftsResults, denseResults)
   └─→ Return top-K results filtered by agentId
```

---

## [A7] Infrastruktur

### LLM-Integration

```
ProviderManager (singleton)
├── OpenAIProvider    (conf/providers.json)
├── AnthropicProvider
├── GoogleProvider
├── OllamaProvider
└── LlamaCppProvider  (local, port 5002 for embeddings)

LLMClient (per-agent)
├── ProviderManager.getProvider(agentId) → provider/model
├── LRU Cache (256 entries, 5-min TTL)
├── parseJsonWithRetry() for structured output
└── Per-agent config: temperature, maxTokens, model

LLMQueue (global)
├── Priority queue (CRITICAL > HIGH > NORMAL > LOW)
├── RateLimiter (RPM-based, auto-refill)
├── Max concurrency (default 3)
├── Queue cap (default 50) with priority eviction
└── Per-agent LLMClient instances
```

**Datei:** `src/lib/llm-client.ts`, `src/lib/llm-queue.ts`, `src/lib/providers/provider-manager.ts`

### Persistenz

| Speicher | Technologie | Pfad | Zweck |
|----------|-------------|------|-------|
| `UnifiedEntityStore` | JSON-Dateien | `worlds/{name}/entities.json` | Entitäts-CRUD mit O(1)-Namensauflösung |
| `SQLiteStore` | `bun:sqlite` | `worlds/{name}/tns.db` | FTS5-Suche, Vektor-Embeddings, Agenten-Prompts, Übersetzungen |
| `GraphStore` | In-Memory-Adjazenzliste | `worlds/{name}/entities.json` | Graphtraversierung, Branching |
| `SessionStore` | `bun:sqlite` | `worlds/_sessions/sessions.db` | Auth-Sitzungstokens |
| `Chronicler` | JSONL-Dateien | `worlds/{name}/timeline.jsonl` | Ereigniszeitachse mit Rotation |
| `WorldClock` | JSON-Datei | `worlds/{name}/clock_state.json` | Spielzeit, geplante Ereignisse |
| `NPCRuntime` | JSON-Dateien | `worlds/{name}/npc_profiles.json` | NPC-Zustand + episodisches Gedächtnis |
| `SocialGraph` | JSON-Dateien | `worlds/{name}/social/*.json` | Beziehungen, Fraktionen, Allianzen |
| `StoryPlanner` | JSON-Datei | `worlds/{name}/planner_state.json` | Kapitel, Beats |
| `DirectorLoop` | JSON-Datei | `worlds/{name}/director_state.json` | Regisseur-Zustand |
| `VillainManager` | JSON-Datei | `worlds/{name}/villain_state.json` | Schurken-Agenden |
| `WorldMemory` | SQLite + FAISS | `worlds/{name}/memory/` | Semantisches Gedächtnis mit Embeddings |
| `AgentMemoryStore` | SQLite | `tns.db` | RAG pro Agent |
| `settings.json` | JSON-Datei | `conf/settings.json` | App-weite Einstellungen |
| `providers.json` | JSON-Datei | `conf/providers.json` | LLM-Provider-Konfigurationen |
| `agents.json` | JSON-Datei | `conf/agents.json` | Agenten-Modellzuweisungen |

**Persistenzmuster:** Alle JSON-Schreibvorgänge verwenden `atomicWriteJson()` (Schreiben in temporäre Datei + Umbenennen) für Absturzsicherheit. SQLite verwendet den WAL-Modus mit `PRAGMA synchronous = NORMAL`.

### WebSocket-Echtzeit

**Datei:** `src/services/websocket-manager.ts`

- `WebSocketManager` verwaltet verbundene Clients mit eindeutigen IDs
- `broadcast(message)` sendet an alle verbundenen Clients (Bereinigung toter Verbindungen)
- `sendTo(id, message)` für gezielte Zustellung
- Ereignisse vom `EventBus` werden an WebSocket-Clients weitergeleitet

### Authentifizierung

**Datei:** `src/middleware/auth.ts`, `src/lib/session-store.ts`

- Token-basierte Sitzungsauthentifizierung (32-Byte Zufalls-Hex)
- Sitzungen in SQLite gespeichert (`worlds/_sessions/sessions.db`)
- 24-Stunden-TTL mit stündlicher Bereinigung
- `authMiddleware` schützt alle `/api/*`-Routen außer `/login`
- Anmelden/Abmelden über POST-Endpunkte

---

## [A8] Datenflussdiagramme

### 1. Benutzernachricht → Stylist-Antwort

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│  Browser  │────▶│ routes/chat  │────▶│  RoleplayEngine  │
│           │◀────│   (Hono)     │◀────│                  │
└──────────┘     └──────────────┘     └────────┬─────────┘
                                               │
                    ┌──────────────────────────┤
                    ▼                          ▼
          ┌─────────────────┐      ┌──────────────────┐
          │    Stylist       │      │  MemoryManager   │
          │  (LLM prompt)    │      │  (history save)  │
          └────────┬─────────┘      └──────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │    LLMQueue      │
          │  (priority, rate │
          │   limit, cache)  │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐
          │  ProviderManager │
          │  (OpenAI/Anth/   │
          │   Google/Ollama) │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐     ┌──────────────────┐
          │   External LLM   │────▶│  Chronicler.log   │
          │   API            │     │  EventBus.publish │
          └─────────────────┘     └──────────────────┘
```

### 2. Director-Tick → Story-Beat-Generierung

```
┌─────────────────┐
│  DirectorLoop    │  (setInterval, every 30min)
│  ┌─────────────┐│
│  │ WorldClock  ││──▶ tick(minutes) → advance time → fire scheduled events
│  └─────────────┘│
│  ┌─────────────┐│
│  │SocialSim    ││──▶ simulateInteraction() → pair selection → event generation
│  └─────────────┘│
│  ┌─────────────┐│
│  │VillainMgr   ││──▶ tick() → phase transition → LLM strategic action
│  └─────────────┘│
│  ┌─────────────┐│
│  │ProbEngine   ││──▶ roll() → chance events (weather, accidents, discoveries)
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryPlanner ││──▶ shouldGenerateBeat() → generateNextBeat() → LLM
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryEngine  ││──▶ generateEvent() → LLM → apply effects → publish event
│  └─────────────┘│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  EventBus        │────▶│  WebSocketManager │
│  (STORY_BEAT)    │     │  (broadcast)      │
└─────────────────┘     └──────────────────┘
```

### 3. Welterstellungsablauf

```
┌──────────┐     ┌──────────────────┐     ┌────────────────┐
│  Browser  │────▶│  POST /worlds     │────▶│  WorldManager   │
│           │     │  (routes/worlds)  │     │  createWorld()  │
└──────────┘     └──────────────────┘     └───────┬────────┘
                                                   │
                    ┌──────────────────────────────┤
                    ▼                              ▼
          ┌─────────────────┐            ┌────────────────┐
          │  mkdir worlds/   │            │ EventBus.publish│
          │  {name}/         │            │ (WORLD_CREATED) │
          └─────────────────┘            └────────────────┘
                                                   │
                                                   ▼
                                          ┌────────────────┐
                                          │NarrativeService │
                                          │    .reset()     │
                                          └────────────────┘

POST /api/launch:
┌─────────────────┐
│  WorldBuilder    │
│  ├─ createWorld()│──▶ LLM → WorldFrame JSON
│  ├─ buildL1()    │──▶ LLM → L1 identity for each entity
│  ├─ buildL2()    │──▶ LLM → L2 dynamic state
│  ├─ buildL3()    │──▶ LLM → L3 hidden/secret
│  └─ buildRels()  │──▶ LLM → relationships
└─────────────────┘
          │
          ▼
┌─────────────────┐
│ EventBus.publish │
│ (ENTITY_ADDED    │
│  × N entities)   │
└─────────────────┘
```

### 4. Agentengedächtnis-Ablauf

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│    Stylist       │────▶│ EventBus.publish  │────▶│  WorldMemory    │
│  (generates      │     │ (MEMORY_ADDED)    │     │  .addEvent()    │
│   narrative)     │     └──────────────────┘     └───────┬────────┘
└─────────────────┘                                       │
                                                    ┌─────┴──────┐
                                                    ▼            ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │EmbeddingQueue │ │ WriteBehind  │
                                            │ (batch BGE-M3)│ │   Buffer     │
                                            └──────┬───────┘ └──────┬───────┘
                                                   │                │
                                                   ▼                ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │ VectorIndex   │ │ SQLiteStore  │
                                            │ (FAISS)       │ │ (tns.db)     │
                                            └──────────────┘ └──────────────┘

Query flow:
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│ AgentMemory   │────▶│ SQLiteStore       │────▶│ FTS5 (keyword)  │
│ .search()     │     │ .searchMemories   │     │ + Dense vectors │
│               │     │                   │     │ → RRF fusion    │
└──────────────┘     └──────────────────┘     └────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │ ReciprocalRank    │
                    │ Fusion (RRF)      │
                    └──────────────────┘
```

---

## [A9] Kontextübergreifende Abhängigkeiten

```
                    ┌─────────────────────┐
                    │  World Management    │
                    │  (BC1)               │
                    └──────────┬──────────┘
                               │ creates/loads
                               ▼
┌──────────────┐    ┌─────────────────────┐    ┌──────────────┐
│ Entity &     │◀──▶│  Narrative & Story   │◀──▶│  NPC &       │
│ Graph (BC2)  │    │  (BC3)               │    │  Dialogue    │
└──────┬───────┘    └──────────┬──────────┘    │  (BC4)       │
       │                       │                └──────┬───────┘
       │                       │                       │
       │                       ▼                       │
       │              ┌─────────────────────┐          │
       │              │  LLM Integration     │          │
       │              │  (BC8)               │◀─────────┘
       │              └──────────┬──────────┘
       │                         │
       │    ┌────────────────────┼────────────────────┐
       │    ▼                    ▼                    ▼
       │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │ │  Social &     │ │  Quests      │ │  Villain     │
       │ │  Relationships│ │  (BC6)       │ │  (BC10)      │
       │ │  (BC5)        │ └──────┬───────┘ └──────────────┘
       │ └──────┬───────┘        │
       │        │                │
       │        ▼                ▼
       │ ┌─────────────────────────────┐
       │ │  Probability & Combat       │
       │ │  (BC9)                      │
       │ └─────────────────────────────┘
       │
       ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Memory & Knowledge  │◀──▶│  Intelligence        │
│  (BC7)               │    │  (BC11)              │
└─────────────────────┘    └─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Literary Compiler   │  (BC12, v0.32.5)
│  v2                  │
└─────────────────────┘
```

**Schlüsselabhängigkeiten:**

| Quell-BC | Ziel-BC | Kopplungsmechanismus |
|----------|---------|----------------------|
| BC1 (Welt) | BC2 (Entität) | Gemeinsame `UnifiedEntityStore`-Instanz |
| BC1 (Welt) | BC3 (Erzählung) | `NarrativeService.reset()` |
| BC3 (Erzählung) | BC4 (NPC) | `NPCRuntime` in `RoleplayEngine` injiziert |
| BC3 (Erzählung) | BC5 (Sozial) | `SocialSimulator` in `DirectorLoop` injiziert |
| BC3 (Erzählung) | BC6 (Quest) | `QuestManager` in `StoryEngine` injiziert |
| BC3 (Erzählung) | BC10 (Schurke) | `VillainManager` in `DirectorLoop` injiziert |
| BC3 (Erzählung) | BC9 (Wahrscheinlichkeit) | `ProbabilityEngine` in `RoleplayEngine` |
| BC3 (Erzählung) | BC12 (LitCompiler) | `RoleplayEngine` ruft `searchTemplates` + `fillTemplate` auf |
| BC4 (NPC) | BC7 (Gedächtnis) | `NPCRuntime` verwendet `EpisodicMemory` |
| BC5 (Sozial) | BC2 (Entität) | `SocialGraph` liest aus `UnifiedEntityStore` |
| BC8 (LLM) | Alle BCs | `LLMQueue` wird von allen Agenten geteilt |
| BC8 (LLM) | BC12 (LitCompiler) | Offline-Extraktor verwendet `LLMClient` für strukturierte Extraktion |
| BC7 (Gedächtnis) | BC8 (LLM) | `EmbeddingQueue` ruft `LLMClient` für Embeddings auf |
| BC11 (Intelligenz) | BC2 (Entität) | Graphanalyse liest `GraphStore` |

---

## [A10] Zentrale Designentscheidungen

### D1: Composition-Root-Muster

**Entscheidung:** `NarrativeService` (`src/services/narrative-service.ts`) fungiert als Composition Root, instanziiert alle Services und verdrahtet Abhängigkeiten manuell.

**Abwägung:** Explizite DI ohne Framework. Alle Abhängigkeiten sind in einem Konstruktor sichtbar, was das System debugbar, aber wortreich macht. Die Alternative (IoC-Container) würde Laufzeitmagie hinzufügen.

### D2: JSON-Dateien als Primärspeicher (mit SQLite für die Suche)

**Entscheidung:** Entitätszustand, NPC-Profile und soziale Beziehungen werden als JSON-Dateien gespeichert. SQLite wird nur für die Suche (FTS5), Embeddings (Vektor), Sitzungen und Agenten-Prompts verwendet.

**Abwägung:** Einfache Lese-/Schreibvorgänge mit atomaren Dateioperationen, aber keine transaktionalen Garantien über Entitäten hinweg. Das Muster `atomicWriteJson()` (Schreiben in temporäre Datei + Umbenennen) bietet Absturzsicherheit für einzelne Schreibvorgänge, aber keine Multi-Datei-Konsistenz. SQLite bietet vollständige ACID für Suche und Embeddings.

### D3: Event-Bus für kontextübergreifende Kommunikation

**Entscheidung:** `EventBus` mit prioritätssortierten Handlern und Replay-Puffer verbindet begrenzte Kontexte asynchron.

**Abwägung:** Entkoppelt Kontexte (NPC kennt Memory nicht, Memory kennt NPC nicht), fügt aber Indirektion hinzu. Der Replay-Puffer (100 Ereignisse) stellt sicher, dass späte Abonnenten keine jüngsten Ereignisse verpassen, auf Kosten des Speichers.

### D4: Modellzuweisung pro Agent

**Entscheidung:** Jeder Agent (`stylist`, `director`, `researcher`, `translation` usw.) kann seinen eigenen LLM-Provider, sein Modell, seine Temperatur und seine maximale Token-Anzahl haben.

**Abwägung:** Maximale Flexibilität (günstige Modelle für den Chronicler, leistungsstarke Modelle für den Stylist), erfordert aber Konfigurationsverwaltung. ProviderManager übernimmt dies mit `conf/providers.json` und `conf/agents.json`.

### D5: Drei-Ebenen-Entitätsprofil (L1/L2/L3)

**Entscheidung:** Entitätsprofile verwenden drei Ebenen: L1 (Identität/Name), L2 (dynamischer Zustand/Ort), L3 (verborgen/geheim).

**Abwägung:** Ermöglicht progressive Offenbarung und DM-gesteuerte Geheimnisse. L1 ist immer sichtbar, L2 aktualisiert sich während des Spiels, L3 ist vor Spielern verborgen. Die Kosten sind zusätzliche Komplexität bei der Profilauflösung.

### D6: Hintergrund-Director-Loop

**Entscheidung:** `DirectorLoop` läuft als Hintergrundintervall und orchestriert Uhrtakte, soziale Simulation, Schurkenaktionen und Story-Beats unabhängig von der Spielereingabe.

**Abwägung:** Erschafft eine lebendige Welt, die sich auch entwickelt, wenn Spieler offline sind. Die Abwägung ist Komplexität im Zustandsmanagement (pausierte/laufende Zustände, Abklingzeiten großer Beats) und das Potenzial für Ereignisse, die Spieler verpassen.

### D7: Hybridsuche (FTS5 + Vektor + RRF)

**Entscheidung:** Die Gedächtnissuche verwendet sowohl Schlüsselwort- (FTS5) als auch semantische (dichter Vektor) Suche, kombiniert über Reciprocal Rank Fusion.

**Abwägung:** Das Beste aus beiden Welten — exakte Schlüsselworttreffer und semantische Ähnlichkeit. Die Kosten sind die Pflege beider Indizes und der Embedding-Pipeline (BGE-M3 über llama.cpp-Server auf Port 5002).

### D8: Git-artiges Branching für Story-Graphen

**Entscheidung:** `BranchManager` unterstützt das Branching des Entitätsgraphen und ermöglicht alternative Story-Pfade.

**Abwägung:** Ermöglicht „Was-wäre-wenn"-Szenarien und parallele Zeitlinien, ohne den gesamten Weltzustand zu duplizieren. Jeder Branch speichert nur Hinzufügungen und Löschungen relativ zum Parent.

### D9: Template-basierte Agenten-Prompts mit SQLite-Fallback

**Entscheidung:** Agenten-Prompts werden in SQLite (`agent_prompts`) mit welt- und sprachbezogener Isolation gespeichert, mit Fallback auf JSON-Dateien und dann auf hartkodierte Standardwerte.

**Abwägung:** Unterstützt i18n und weltweite Anpassung ohne Codeänderungen. Der dreistufige Fallback stellt sicher, dass das System auch ohne Datenbank funktioniert.

### D10: Mojo FFI für leistungskritische Berechnungen

**Entscheidung:** Wahrscheinlichkeitsberechnungen und Vektoroperationen können Mojo-FFI-Kernels (`probability_ffi.mojo`, `vector_ffi.mojo`) mit TypeScript-Fallbacks verwenden.

**Abwägung:** Deutliche Leistungssteigerungen für Stapeloperationen (Wahrscheinlichkeitswürfe, Kosinus-Ähnlichkeit), aber zusätzliche Build-Komplexität und Plattformabhängigkeit. TypeScript-Fallbacks stellen die Portabilität sicher.

---

## Anhang: Dateireferenz

| Verzeichnis | Dateien | Zweck |
|-------------|---------|-------|
| `src/models/` | 12 Dateien | Domänenmodelle (Entität, Quest, Story, Regisseur, NPC, Romantik, Wahrscheinlichkeit, Gedächtnis, Gegenstand, Rang, Archetyp) |
| `src/services/` | 45+ Dateien | Anwendungs- + Domänenservices |
| `src/routes/` | 18 Dateien | HTTP-Adapter (Hono-Router) |
| `src/lib/` | 15+ Dateien | Infrastruktur (LLM, SQLite, EventBus, Vektoroperationen, Provider) |
| `src/memory/` | 12 Dateien | Gedächtnis-Subsystem (Bewertung, Clustering, Embedding, kognitive Pipeline) |
| `src/intelligence/` | 10 Dateien | Graphanalyse und Validierung |
| `src/store/` | 1 Datei | Einheitlicher Entity-Store mit NameIndex |
| `src/config/` | env.ts | Umgebungskonfiguration |
| `src/i18n/` | Internationalisierung | Mehrsprachige Unterstützung (7 Sprachen) |
| `src/middleware/` | auth, rate-limiter usw. | HTTP-Middleware |
| `src/utils/` | logger, sanitize usw. | Gemeinsame Hilfsfunktionen |
