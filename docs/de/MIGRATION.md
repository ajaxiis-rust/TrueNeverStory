# Migrationsleitfaden: JSON zu SQLite

Dieser Leitfaden behandelt die Migration von Weltdaten von JSON-Dateien zu SQLite sowie das von TrueNeverStory verwendete Speicherlayout.

## Überblick

TrueNeverStory speichert Weltdaten in **SQLite** über die Klasse `WorldStore` (`src/store/world-store.ts`). Die Datenbankdatei ist `tns.db` und wird im Weltverzeichnis (`<worldPath>/tns.db`) mit aktiviertem WAL-Journal-Modus erstellt.

Die ursprünglichen JSON-Dateien bleiben im Weltverzeichnis als Migrationsquelle bestehen und werden nie gelöscht — sie dienen als Fallback und historische Aufzeichnung.

## v0.33.4-Migration: Literary Compiler & Ökonomische Modelle

Die Version v0.33.4 ergänzt den Literary Compiler und die Ökonomischen Modelle. Keine Migration erforderlich — dies sind additive Funktionen, die die bestehende State-First-Pipeline erweitern.

## v0.33.4-Migration: State-First-Pipeline

### Was sich geändert hat

Die Version v0.33.4 führt eine State-First-Pipeline-Architektur ein. Zwei Agentensysteme existieren nun parallel:

1. **Die Big Six (AgentV2)** — die erzählende Prosa-Pipeline (`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`), registriert in `AgentRegistryV2`.
2. **Konfigurierte Agenten (`DEFAULT_AGENTS`)** — die konfigurationsgesteuerten Agenten in `src/services/agent-config.ts` (`director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation`), die die Einstellungen-/Anbieter-UI und einige Subsysteme stützen.

**Alte Pipeline:**
```
User Intent → Agent Selection → Agent Execution → Response
```

**Neue Pipeline:**
```
User Intent → Simulation → Pattern Selection (Dramaturg) → Fact Check (Validator) → Style Render (Stylist) → NPC Dialogue (Actor) → Linting (Censor) → Memory Update (Chronicler)
```

**Entfernte Agenten:**

| Entfernt | Ersetzt durch |
|----------|---------------|
| `narrator`, `scene` | `stylist` (Prosagenerierung) |
| `historian` | `validator` (Faktenprüfung) |
| `cartographer`, `lorekeeper`, `merchant`, `quest-giver` | (entfallen) |
| `npc` | `actor` (NPC-Dialog) |

`villain`, `social-sim`, `researcher` und `director` bleiben als konfigurierte Agenten verfügbar. `crafter` bleibt als Handwerks-Subsystem bestehen.

**Abwärtskompatibilität:** Die entfernten Agenten-IDs (`@narrator`, `@npc`, `@scene`, `@director`) existieren nicht mehr und werden nicht aufgelöst. Chat-`@mentions` leiten nur an die konfigurierten Handler weiter (`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`).

### MCP-Integration

v0.33.4 führt Model Context Protocol (MCP)-Tools für externen Wissenszugriff ein:

| MCP-Server | Tools | Zweck |
|------------|-------|-------|
| Bible Parser | `search_verses`, `get_pattern`, `get_archetype` | Erzählmuster aus biblischen Texten |
| Gutenberg Parser | `get_style_pattern`, `apply_style` | Stilmuster aus Literatur |
| Wikipedia Tools | `verify_fact`, `get_context` | Historische Faktenprüfung |

**Konfiguration:**

```typescript
// In conf/settings.json
{
  "mcpServers": {
    "bible": { "enabled": true, "dbPath": "./data/bible.db" },
    "gutenberg": { "enabled": true, "dbPath": "./data/styles.db" },
    "wikipedia": { "enabled": true }
  }
}
```

### Neue Abhängigkeiten

| Abhängigkeit | Status | Zweck |
|--------------|--------|-------|
| Zod | Bereits im Projekt | Schema-Validierung |
| Mojo FFI | Bereits im Projekt | Compute-Kernels |
| TranslationService | Keine externen Abhängigkeiten | UI-Übersetzungen |

### Breaking Changes

- **Interner Ablauf von `RoleplayEngine` neu geschrieben** — Die Pipeline folgt nun Simulation → Muster → Stil → Dialog → Lint → Gedächtnis
- **`AgentV2.process()` ersetzt `generateResponse()`** — Neue Signatur: `process(intent, simulation, context, pattern?)`
- **`createRoleplayEngine()` benötigt neue Abhängigkeiten** — MCP-Server-Referenzen, AgentRegistryV2, EventBus
- **`getLanguageInstruction()` entfernt** — Sprachanpassung in `TranslationService` an der Ausgabegrenze verschoben

---

## Speicherlayout

### SQLite-Datenbank

Der `WorldStore`-Konstruktor öffnet (und erstellt bei Bedarf) eine `tns.db`-Datei im Weltverzeichnis:

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");
// Opens worlds/my-world/tns.db with:
//   PRAGMA journal_mode = WAL
//   PRAGMA synchronous = NORMAL
```

**Beim Init erstellte Tabellen (`CREATE TABLE IF NOT EXISTS`):**

| Tabelle | Zweck |
|---------|-------|
| `quests` | Quest-Daten (`id`, `title`, `description`, `giver`, `objectives`, `status`, Zeitstempel) |
| `npc_memories` | Kurz- und Langzeitgedächtnis der NPCs, indiziert nach `npc_uid` + `memory_type` |
| `story_arcs` | Story-Planner-Arc-Daten (ein JSON-Blob pro Zeile) |
| `world_frame` | Weltrahmen-Schlüssel/Wert-Paare |
| `director_state` | Regisseur-Zustands-Schlüssel/Wert-Paare |
| `villains` | Schurken-Daten (JSON-Blob pro Zeile) |

### JSON-Dateien (Migrationsquelle)

Die ursprünglichen JSON-Dateien liegen im selben Weltverzeichnis und werden als Migrationsquelle gelesen. Sie werden nach der Migration nie gelöscht:

| JSON-Datei | Migriert in Tabelle |
|------------|---------------------|
| `worlds/{name}/quests.json` | `quests` |
| `worlds/{name}/npc_profiles.json` | `npc_memories` |
| `worlds/{name}/world_frame.json` | `world_frame` |
| `worlds/{name}/story_planner.json` | `story_arcs` |
| `worlds/{name}/director_state.json` | `director_state` |
| `worlds/{name}/villains.json` | `villains` |

## Migrationsprozess

### Migration auslösen

Die Migration wird bei Bedarf über den HTTP-Endpunkt ausgeführt (es gibt keine automatische Migration beim Start):

```typescript
const store = new WorldStore("worlds/my-world");

const result = await store.migrate();
// result = { migrated: ["quests", "npc_profiles", ...], errors: [] }

store.close();
```

Die Methode `migrate()` migriert jede Datenquelle unabhängig in ihrem eigenen `try/catch`, sodass ein Fehler in einer Quelle die anderen nicht abbricht. Jede erfolgreich migrierte Quelle wird an `migrated` angehängt; jeder Fehler wird in `errors` erfasst.

**Migrierte Quellen (in Reihenfolge):** `quests`, `npc_profiles`, `world_frame`, `story_planner`, `director_state`, `villains`.

Wenn eine JSON-Quelldatei fehlt oder nicht analysierbar ist, wird diese Quelle stillschweigend übersprungen (der Lese-Helper gibt `null` zurück).

### Migration von Legacy-Pfaden

Beim Start (`src/index.ts`): Falls das Verzeichnis `WORLDS_ROOT` nicht existiert, wird es erstellt und ein Legacy-`WORLD_DB_PATH`-Verzeichnis (z. B. `world_db/`) in `worlds/default/` umbenannt:

```
world_db/  →  worlds/default/
```

## WorldStore-API

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");

// Migration
const result = await store.migrate();           // { migrated: string[], errors: string[] }

// Quest CRUD
const quests = store.getQuests();               // QuestData[]
const quest = store.getQuest(id);               // QuestData | null
store.upsertQuest(quest);                       // insert or replace
const removed = store.deleteQuest(id);          // boolean

// NPC memories
const memories = store.getNPCMemories(npcUid);              // all memory types
const short = store.getNPCMemories(npcUid, "short_term");   // filtered by type
store.addNPCMemory(npcUid, memory);                         // default type "short_term"

// World frame
const frame = store.getWorldFrame();            // Record<string, string>
store.setWorldFrame(key, value);

// Stats
const stats = store.getStats();                 // { quests, memories, worldFrame }

store.close();
```

## API-Endpunkte

Der Router (`src/routes/world-store.ts`) ist unter `/api` eingehängt. Jeder Endpunkt akzeptiert einen optionalen Query-Parameter `?world=`, um eine bestimmte Welt anzusprechen (standardmäßig die aktive Welt):

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `POST` | `/api/world-store/migrate` | Migriert JSON-Dateien zu SQLite; gibt `{ status, world, migrated, errors }` zurück |
| `GET` | `/api/world-store/stats` | Gibt `{ world, stats }` zurück (Anzahl Quests, Gedächtnisse, Weltrahmen-Schlüssel) |
| `GET` | `/api/world-store/quests` | Listet Quests aus SQLite |
| `GET` | `/api/world-store/npc-memories/:uid` | NPC-Gedächtnisse (`?type=short_term\|long_term_episodic`) |
| `GET` | `/api/world-store/frame` | Weltrahmen-Schlüssel/Wert-Paare |

## Rollback

Falls die Migration fehlschlägt oder Sie einen Rollback benötigen:

1. SQLite-Daten sind in `worlds/{name}/tns.db` isoliert
2. Die ursprünglichen JSON-Dateien bleiben in `worlds/{name}/`
3. Löschen Sie `worlds/{name}/tns.db`, um in einen reinen JSON-Zustand zurückzusetzen
4. Führen Sie `POST /api/world-store/migrate` erneut aus, um erneut aus JSON zu migrieren

## Fehlerbehebung

### Fehler „Table already exists"

Dies ist normal — Tabellen werden mit `IF NOT EXISTS` erstellt.

### Fehlende Daten nach der Migration

Prüfen Sie, ob die JSON-Quelldatei im Weltverzeichnis existiert und gültiges JSON ist. Nicht analysierbare Dateien werden stillschweigend übersprungen und nur gemeldet, wenn das Parsen eine Ausnahme auslöst — prüfen Sie das `errors`-Array im Migrationsergebnis für Details.

### Leistung

- Der SQLite-WAL-Modus ist standardmäßig in `WorldStore` aktiviert
- `PRAGMA synchronous = NORMAL` ist für ein Gleichgewicht aus Haltbarkeit und Geschwindigkeit gesetzt
- Führen Sie `PRAGMA optimize` regelmäßig auf großen Datenbanken aus
