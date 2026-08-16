# Agenten-Referenz (v0.32.5)

TrueNeverStory besitzt **zwei Agentensysteme**, die parallel existieren:

1. **Die Big Six (AgentV2)** — die erzählende Prosa-Pipeline. Registriert in `AgentRegistryV2` und instanziiert in `RoleplayEngine`.
2. **Konfigurierte Agenten (`DEFAULT_AGENTS`)** — die älteren, konfigurationsgesteuerten Agenten, gelistet in `src/services/agent-config.ts`. Diese stützen die Einstellungen-/Anbieter-UI und einige Subsysteme (Leerlauf-Recherche, Chat-`@mentions`).

Die Big Six sind: `dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`. Die konfigurierten Agenten sind: `director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation`.

`stylist` ist der einzige Prosa-Generator. Die entfernten Agenten (`narrator`, `npc`, `scene`, `historian`, `cartographer`, `lorekeeper`, `merchant`, `quest-giver`) existieren nirgendwo mehr im Code.

---

## Die Big Six (AgentV2)

Diese übernehmen die deterministische Prosa-Pipeline: Intent → Simulation → Kontext → Prosa.

### 1. Dramaturg (Der Architekt)

**ID:** `dramaturg`
**Rolle:** Wählt Erzählmuster aus Bibel-Archetypen
**MCP-Tools:** `search_verses`, `get_pattern`, `get_archetype`

| Aspekt | Detail |
|--------|--------|
| **Zweck** | Analysiert die aktuelle Situation und wählt passende Story-Strukturen aus biblischen Mustern |
| **Eingabe** | Intent, SimulationResult, GameContext |
| **Ausgabe** | NarrativePattern (Archetyp, Name, Beschreibung, Verse, Stimmung) |
| **Abhängigkeiten** | TNSServer (MCP), LLMQueue |

**Ablauf:**
1. Leitet die Stimmung aus Intent-Typ und Simulationsergebnis ab
2. Fragt das Bible-MCP nach passenden Archetypen
3. Fällt auf LLM-generierte Muster zurück, falls MCP nicht verfügbar ist

### 2. Validator (Der Faktenprüfer)

**ID:** `validator`
**Rolle:** Prüft Fakten über das Wikipedia-MCP
**MCP-Tools:** `verify_fact`, `get_context`

| Aspekt | Detail |
|--------|--------|
| **Zweck** | Stellt Weltkonsistenz und historische Genauigkeit sicher |
| **Eingabe** | Intent, SimulationResult, GameContext |
| **Ausgabe** | Prüfergebnisse (bestätigt, Konfidenz, Belege, Quellen) |
| **Abhängigkeiten** | TNSServer (MCP) |

**Ablauf:**
1. Extrahiert faktische Behauptungen aus der Situation
2. Fragt das Wikipedia-MCP zur Prüfung
3. Gibt Prüfergebnisse mit Konfidenzstufen zurück

### 3. Stylist (Der Erzähler)

**ID:** `stylist`
**Rolle:** Rendert Prosa mit Gutenberg-Stilmustern — der einzige Prosa-Generator
**MCP-Tools:** `get_style_pattern`, `apply_style`

| Aspekt | Detail |
|--------|--------|
| **Zweck** | Kern-Textgenerierungs-Agent, der erzählende Prosa erzeugt |
| **Eingabe** | Intent, SimulationResult, GameContext, NarrativePattern |
| **Ausgabe** | Prosa-Text |
| **Abhängigkeiten** | TNSServer (MCP), LLMQueue |

**Ablauf:**
1. Holt den Stil passend zur Stimmung aus dem Gutenberg-MCP
2. Baut einen eingeschränkten Prompt mit Simulationsergebnissen und Stil
3. Erzeugt Prosa über das LLM
4. Gibt den gerenderten Text zurück

### 4. Actor (NPC-Ensemble)

**ID:** `actor`
**Rolle:** Verwaltet NPC-Interaktionen und Dialoge
**MCP-Tools:** Keine

| Aspekt | Detail |
|--------|--------|
| **Zweck** | Behandelt alle NPC-Dialoge, Handel, Handwerk, soziale Dynamik |
| **Eingabe** | Intent, SimulationResult, GameContext |
| **Ausgabe** | NPC-Dialogtext, Zustandsänderungen |
| **Abhängigkeiten** | UnifiedEntityStore, LLMQueue |

**Ablauf:**
1. Leitet je nach Intent-Typ an den passenden Sub-Handler weiter
2. Holt die verborgenen Motivationen des NPC aus dem L3-Profil
3. Erzeugt die NPC-Antwort per LLM
4. Berechnet Beziehungs-Zustandsänderungen

### 5. Censor (Der Linter)

**ID:** `censor`
**Rolle:** Entfernt KI-Klischees und erzwingt Stilkonsistenz
**MCP-Tools:** Keine

| Aspekt | Detail |
|--------|--------|
| **Zweck** | Bereinigt Prosa, indem KI-generierte Klischees und Anachronismen entfernt werden |
| **Eingabe** | Prosa-Text, GameContext |
| **Ausgabe** | Bereinigter Prosa-Text |
| **Abhängigkeiten** | LLMQueue |

**Ablauf:**
1. Entfernt KI-Klischees über Regex-Muster
2. Behebt Anachronismen anhand des Weltkontexts
3. LLM-basiertes Polishing für komplexe Fälle
4. Gibt bereinigten Text zurück

**Häufig entfernte KI-Klischees:**
- "delved", "tapestry", "rich tapestry", "palpable", "visceral"
- "it's worth noting", "it goes without saying"
- "the very fabric of", "on a deeper level"

### 6. Chronicler

**ID:** `chronicler`
**Rolle:** Aktualisiert das Weltgedächtnis und pflegt die Zeitachse
**MCP-Tools:** Keine

| Aspekt | Detail |
|--------|--------|
| **Zweck** | Protokolliert alle bedeutsamen Ereignisse und hält die Welt konsistent |
| **Eingabe** | Intent, SimulationResult, GameContext |
| **Ausgabe** | Zustandsänderungen (NPC-Gedächtnis-Updates) |
| **Abhängigkeiten** | UnifiedEntityStore, EventBus |

**Ablauf:**
1. Erstellt eine Ereignisbeschreibung aus Intent und Ergebnis
2. Veröffentlicht sie im EventBus für andere Systeme
3. Aktualisiert die NPC-Erinnerungen naher Charaktere
4. Protokolliert in der Zeitachse

---

## Konfigurierte Agenten (`DEFAULT_AGENTS`)

Diese liegen in `src/services/agent-config.ts` und stützen die Einstellungen-/Anbieter-UI, `LLMQueue`/`LLMClient` und einige Subsysteme. `chronicler` wird mit den Big Six geteilt. Ihre Temperatur- und Token-Limits stammen aus globalen Standardwerten (0.7 / 2048), sofern nicht in `conf/agents.json` überschrieben.

| ID | Name | Priorität | Verwendet von |
|----|------|-----------|---------------|
| `director` | Regisseur | 8 | Story-Beat-Injektion |
| `chronicler` | Chronist | 5 | Zeitachsen-Zusammenfassung (auch `@mention`) |
| `story-planner` | Story-Planer | 6 | Story-Arc-Vorschläge (`@mention`) |
| `social-sim` | Sozial-Simulator | 4 | NPC-Sozialdynamik (`@mention`) |
| `villain` | Schurken-Manager | 6 | Antagonisten-Pläne (`@mention`) |
| `researcher` | Forscher | 3 | `IdleResearchScheduler`, Item-Bewertung (`@mention`) |
| `translation` | Übersetzung | 2 | Englisch ↔ Nutzersprache an der Ausgabegrenze |

**Prompt-Templates (Template-Variablen → wofür sie aufgelöst werden):**

- **director** — `{narrative}`, `{beat}`. Integriert einen Story-Beat in die laufende Erzählung.
- **chronicler** — `{events}`, `{timeline}`. Fasst neue Ereignisse chronologisch zusammen.
- **story-planner** — `{world_state}`, `{characters}`, `{events}`, `{quests}`. Ausgabe: `{"arc": ..., "quests": [{"title", "description", "objectives"}], "hooks": [...]}`.
- **social-sim** — `{characters}`, `{relationships}`, `{context}`. Beschreibt Beziehungsänderungen und Fraktions-Implikationen.
- **villain** — `{villain}`, `{world_state}`, `{recent_actions}`. Plant den nächsten Zug des Antagonisten.
- **researcher** — `{task}`, `{world_context}`. Ausgabe: `{"verdict": "plausible|questionable|unrealistic", "confidence", "issues", "suggestions", "enrichedDetails"}`.
- **translation** — `{source_lang}`, `{target_lang}`, `{text}`. Gibt nur den übersetzten Text zurück.

---

## Dialogsystem (v0.32.5)

Neues `DialogueManager` + `DialogueContext` für strukturierte NPC-Gespräche:

| Funktion | Beschreibung |
|----------|--------------|
| **Sitzungsverwaltung** | Begrüßung → Aktiv → Verabschiedung |
| **Beziehungsbewusstsein** | Begrüßungen und Themenverfügbarkeit für Freunde/Neutrale/Feinde |
| **Feudalhierarchie** | Besondere Begrüßungen für Lehnsherr/Vasallen |
| **Themenbasierte Auswahl** | persönlich, Fraktion, Quest, Handel, Kampf, Handwerk, Gerücht, Klatsch usw. |
| **Gedächtnisaufzeichnung** | Dialogzusammenfassungen im Langzeitgedächtnis der NPC gespeichert |

Zugriff über `engine.dialogueManager` (erfordert verfügbares `npcRuntime`).

**Hinweis:** Chat-`@mentions` leiten an die konfigurierten Handler weiter (`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`), nicht an die Big Six. `@narrator`, `@director`, `@scene` und `@npc` existieren nicht mehr.

---

## Agent Registry v2

Die Big Six sind in `AgentRegistryV2` (`src/services/agent-registry-v2.ts`) registriert:

```typescript
import { getAgentRegistryV2 } from './agent-registry-v2';

const registry = getAgentRegistryV2();

// Register agents
registry.register(dramaturgAgent);
registry.register(validatorAgent);
registry.register(stylistAgent);
registry.register(actorAgent);
registry.register(censorAgent);
registry.register(chroniclerAgent);

// Get agent by ID
const dramaturg = registry.get('dramaturg');

// Get agents with specific MCP tool
const withSearch = registry.getAgentsWithTool('search_verses');
```

---

## Agentenschnittstelle (v0.32.5)

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

interface AgentOutput {
  text?: string;
  stateChanges?: StateChange[];
  metadata?: Record<string, unknown>;
}
```

---

## Globale Variablen

Diese Variablen stehen Agenten über den Spielkontext zur Verfügung:

| Variable | Beschreibung |
|----------|--------------|
| `{world_name}` | Name der aktuellen Welt (aus world_frame.json) |
| `{time}` | Aktuelle Story-Zeit (ISO-String) |
| `{location}` | Aktueller Charakter-Standort |
| `{character}` | Name des aktiven Charakters |
| `{role}` | Rolle des Nutzers (Protagonist, Beobachter usw.) |
| `{rules}` | Weltregeln (Magiegesetze, soziale Normen usw.) |
| `{timeline}` | Jüngste Weltereignisse (letzte 5 vom Chronicler) |
| `{memories}` | Jüngste Rollenspiel-Erinnerungen |
| `{facts}` | Etablierte Weltfakten |
| `{npcs}` | Namen naher NPCs |
| `{history}` | Jüngste Gesprächshistorie (letzte 3 Austausche) |
| `{events}` | Jüngste Ereignisse (kontextabhängig, letzte 3–5) |
| `{world_state}` | Zusammenfassung des aktuellen Weltzustands |
| `{world_context}` | Weltkontext für Recherche |
| `{genre}` | Weltgenre (Fantasy, Sci-Fi, Horror usw.) |
| `{magic_system}` | Beschreibung des Magiesystems |
| `{language}` | Primäre Weltsprache (en, ru usw.) |
| `{world_description}` | Weltbeschreibung/Pitch |

---

## Temperatur-Leitfaden

Konfigurierte Agenten verwenden globale Standardwerte (Temperatur 0.7, maximale Tokens 2048), sofern nicht in `conf/agents.json` überschrieben.

| Wert | Effekt | Verwenden für |
|------|--------|---------------|
| 0.1 - 0.3 | Fokussiert, deterministisch | Recherche, Faktenprüfung, Intent-Parsing |
| 0.4 - 0.6 | Ausgewogen | Chronicler, soziale Simulation |
| 0.7 - 0.8 | Kreativ | Erzählung, NPC-Dialog, Schurken-Pläne |

---

## @agent im Chat verwenden

Sende eine private Nachricht an einen Agenten aus dem Chat. Chat-`@mentions` leiten an die konfigurierten Handler, nicht an die Big Six:

```
@chronicler summarize the last hour
@story-planner suggest the next story beat
@researcher is this medieval sword historically accurate?
@social-sim how do the villagers react?
@villain what does the antagonist do next?
```

Antworten sind mit blauem linken Rand und Agentennamen in Klammern markiert.

Die Big Six (`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`) sind in `AgentRegistryV2` registriert, aber **nicht** per `@mention` erreichbar.

---

## RAG-System (Embeddings + Langzeitgedächtnis)

Alle Agenten haben volle Embedding-Unterstützung mit Langzeitgedächtnis über RAG:

- **llama.cpp Embedding Server** — BGE-M3-Modell auf Port 5002 für Vektorgenerierung
- **SQLite Hybrid-Suche** — FTS5-Schlüsselwortsuche + dichte Vektorsuche + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — Speicherisolation pro Agent und Sitzung über `role`-Spalte
- **Weltweit begrenztes Gedächtnis** — Speicher ist pro Welt isoliert, um weltübergreifende Halluzinationen zu verhindern
- **Mojo Compute Kernels** — 5 Mojo-Kernels über FFI mit TypeScript-Fallbacks:
  - `probability_ffi.mojo` — Erfolgschance, Wurfergebnisse, Stapelwahrscheinlichkeit
  - `vector_ffi.mojo` — 4-dimensionale Vektoroperationen (Kosinus, L2, Skalarprodukt)
  - `vector_full.mojo` — Volldimensionale Vektoroperationen (768-dim BGE-M3)
  - `batch_ops.mojo` — Stapel-NPC-Operationen (Altersverfall, Laster, Steuer, Loyalität)
  - `graph_ops.mojo` — Graphtraversierung, RRF-Fusion, Reputationsberechnung

**Gedächtnisfluss:**
```
Agent Request → AgentMemoryStore → SQLite (hybrid search)
                                      ↓
                              ┌───────┴───────┐
                              │ FTS5 (LIKE)   │ Dense Vectors (BGE-M3)
                              │ Keyword Match │ Cosine Similarity
                              └───────┬───────┘
                                      ↓
                              Reciprocal Rank Fusion (RRF)
                                      ↓
                              Context for LLM Prompt
```

---

## MCP-Integration (v0.32.5)

### Bibel-Muster

Bibeltexte in SQLite mit Vers-Granularität gespeichert. Jeder Vers ist ein atomarer Zeiger, auf den Agenten verweisen können.

**Tools:**
- `search_verses` — Suche nach Text, Buch oder Referenz
- `get_pattern` — Erzählmuster nach Archetyp, Stimmung oder Funktion
- `get_archetype` — Archetyp-Details nach Name

### Gutenberg-Stile

Stilmuster aus Gutenberg-Project-Texten extrahiert. Delexifizierte Beschreibungen bewahren die Struktur ohne Charakternamen.

**Tools:**
- `get_style_pattern` — Stile nach Stimmung, Tags oder Beschreibung suchen
- `apply_style` — Stil auf Text anwenden (delexifizieren und Vorschläge zurückgeben)

### Wikipedia-Validierung

Historische Faktenprüfung über die Wikipedia-API.

**Tools:**
- `verify_fact` — Eine faktische Behauptung prüfen
- `get_context` — Wikipedia-Kontext für ein Thema abrufen

---

## Template-System

### Wie userTemplate funktioniert

Jeder Agent speichert ein `userTemplate` in SQLite (`agent_prompts`-Tabelle) mit JSON-Datei-Fallback. Das Template enthält `{var}`-Platzhalter, die zur Laufzeit durch `resolveTemplate()` (`src/utils/template-resolver.ts`) durch echte Werte ersetzt werden.

**Ablauf:**
1. Agent lädt Konfiguration: `loadAgentConfig(agentId, world?, lang?)`
2. Liest `prompts.userTemplate` zuerst aus SQLite, dann JSON-Fallback
3. Ruft `resolveTemplate(template, vars)` mit Kontextdaten auf
4. Sendet den aufgelösten Prompt an das LLM

**Wenn kein userTemplate existiert** → Fallback auf `PromptBuilder` (hartkodierte TypeScript-Templates).

---

## Spieler-Stilprofile (v0.32.5)

`PlayerProfileStore` (`src/lib/player-profile-store.ts`) liefert agentenübergreifende Spieler-Stilprofile, geteilt zwischen Stylist und LiteraryV2Generator.

**Verfolgte Metriken:**
| Metrik | Beschreibung |
|--------|--------------|
| `avg_sentence_len` | Durchschnittliche Satzlänge in Wörtern |
| `sensory_bias` | Präferenz für sensorische Details (0–1) |
| `register_score` | Formelles/informelles Register (0–1) |
| `dialogue_ratio` | Dialoganteil im Text |
| `narrative_distance` | Nahe vs. entfernte Erzählung (0–1) |
| `action_orientation` | Präferenz Aktion vs. Reflexion (0–1) |
| `emotional_expressiveness` | Grad emotionaler Details (0–1) |
| `preferred_pace` | langsam / mittel / schnell |
| `literary_sophistication` | Wortschatz-/Strukturkomplexität (0–1) |
| `preferred_motifs` | Bevorzugte Erzählmotive |
| `anti_patterns` | Vermiedene Muster |
| `sample_snippets` | Repräsentative Textausschnitte |
| `confidence` | Profil-Konfidenz (0–1) |

**Speicherung:** `data/player-profiles.db` (SQLite, WAL-Modus)

---

## Speicherarchitektur

### SQLite-Datenbank

Das Projekt nutzt SQLite über Buns eingebautes `bun:sqlite`-Modul. Die Datenbankdatei ist `tns.db` im konfigurierten `dbPath` (Standard `./worlds/{active}`).

**Tabellen:**
- `entities` — Weltentitäten mit FTS5-Volltextsuche
- `embeddings` — Vektor-Embeddings für semantische Suche
- `memories` — Rollenspiel-Erinnerungen mit FTS5
- `agent_prompts` — Agenten-Prompts pro Welt + Sprache
- `ui_translations` — UI-Übersetzungsstrings pro Sprache + Seite

### JSON-Dateispeicher (Fallback)

JSON-Dateien bleiben während der Migration als Fallback bestehen:

```
conf/
  settings.json          — App-weite Einstellungen (LLM, Server, Sprache usw.)
  agents.json            — Globale Agenten-Modell/Provider-Zuweisungen
worlds/{active}/
  agents/{agentId}.json  — Weltweite Agenten-Prompts (Fallback)
```
