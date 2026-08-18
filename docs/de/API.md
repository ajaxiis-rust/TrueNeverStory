# TrueNeverStory API-Referenz

REST-API für die TrueNeverStory Plattform für Weltgestaltung und Rollenspiel. Alle Endpunkte geben JSON zurück, sofern nicht anders angegeben.

**Basis-URL:** `http://localhost:8000`

---

## Inhaltsverzeichnis

- [Gesundheit](#gesundheit)
- [Chat & Rollenspiel](#chat--rollenspiel)
- [Welten](#welten)
- [Entitäten & Graph](#entitäten--graph)
- [Sitzungen](#sitzungen)
- [Verzweigungen](#verzweigungen)
- [Wahrscheinlichkeit](#wahrscheinlichkeit)
- [Romantik](#romantik)
- [Quests](#quests)
- [Feedback](#feedback)
- [Regelwerk](#regelwerk)
- [Feature-Flags](#feature-flags)
- [API-Versionierung](#api-versionierung)
- [Speicher](#speicher)
- [Wartung](#wartung)
- [System](#system)
- [Agenten](#agenten)
- [Anbieter & Modelle](#anbieter--modelle)
- [Einstellungen](#einstellungen)
- [Start](#start)
- [WebSocket](#websocket)
- [Authentifizierung](#authentifizierung)
- [Weltenübergreifend](#weltenübergreifend)
- [Plugins](#plugins)
- [Überwachung](#überwachung)
- [I18n](#i18n)
- [Weltspeicher](#weltspeicher)
- [Wiki-Recherche](#wiki-recherche)

---

## Gesundheit

### `GET /health`
Gesundheitsprüfung.

**Antwort:** `{ status: "ok", engine_ready: boolean, uptime: number, version: string }`

### `GET /system-check`
Systemstatus mit Node-Version und Plattforminformationen.

**Antwort:** `{ ok: boolean, message: string, node_version: string, platform: string }`

---

## Chat & Rollenspiel

### `POST /chat/setup`
Aktive Rollenspielsitzung initialisieren oder aktualisieren.

**Anfrage:**
```json
{
  "character": "Kaelen",
  "location": "Silverwood",
  "story_time": "2025-06-01T12:00:00Z",
  "role": "protagonist",
  "session_id": "default"
}
```

**Antwort:** `{ active_character, current_location, current_time, session_id }`

### `POST /chat/message`
Spieler-Nachricht senden und eine Erzählantwort erhalten.

**Anfrage:** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**Antwort:** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
SSE-Endpunkt für progressive Erzähllieferung. Gleicher Anfragekörper wie `/chat/message`.

**Antwort:** Server-Sent Events-Stream:
- `event: start` — Sitzungsstatus
- `event: chunk` — Erzähltext-Abschnitt
- `event: agent` — Agentenantwort (für `@agent`-Erwähnungen)
- `event: heartbeat` — Keepalive-Kommentar (`: keepalive`)
- `event: done` — Endstatus
- `event: error` — Fehlermeldung
- `data: [DONE]` — Stream-Endmarker

### `POST /chat/agent`
Private Nachricht an einen bestimmten Agenten senden.

**Anfrage:** `{ agentId: string, message: string }`

**Antwort:** `{ narrative, agent_id, agent_name, location, story_time, active_character, success, error? }`

### `GET /chat/session`
Aktuellen Sitzungsstatus abrufen.

**Antwort:** `{ active_character, current_location, current_time, session_id }`

### `GET /chat/history?limit=20`
Letzte Konversationshistorie abrufen.

**Antwort:** Array von `{ user: string, assistant: string, timestamp: string }`

---

## Welten

### `GET /worlds`
Alle verfügbaren Welten auflisten.

**Antwort:** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
Aktiven Weltnamen abrufen (leichtgewichtig).

**Antwort:** `{ active: string }`

### `POST /worlds`
Eine neue Welt erstellen.

**Anfrage:** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

**Antwort:** `{ status: "created", world }`

### `GET /worlds/:name`
Weltdetails und Framedaten abrufen.

### `PUT /worlds/:name`
Weltframe-Felder aktualisieren.

### `DELETE /worlds/:name`
Eine Welt löschen.

### `POST /worlds/:name/switch`
Aktive Welt wechseln.

### `POST /worlds/:name/chapters/generate`
Ein literarisches Kapitel aus Sitzungsdaten generieren.

**Anfrage:** `{ sessionId?: string, prompt?: string }`

### `GET /worlds/:name/chapters`
Generierte Kapitel auflisten.

### `GET /worlds/:name/chapters/:filename`
Kapitelinhalt abrufen.

### `GET /worlds/:name/detail`
Vollständige Weltstatistik für das Statistik-Modal.

**Antwort:**
```json
{
  "name": "default",
  "title": "My World",
  "description": "...",
  "genre": "fantasy",
  "language": "en",
  "worldRules": [{ "name": "...", "description": "..." }],
  "magicSystem": "...",
  "entityCounts": { "Character": 5, "Location": 3, "Faction": 2, "Item": 8 },
  "totalEntities": 18,
  "characters": [{ "name": "...", "summary": "...", "tags": [], "relationships": [] }],
  "locations": [{ "name": "...", "summary": "..." }],
  "factions": [{ "name": "...", "summary": "..." }],
  "items": [{ "name": "...", "summary": "..." }],
  "sessionCount": 4,
  "eventCount": 42,
  "chapterCount": 3,
  "villainCount": 1,
  "hasFrame": true
}
```

---

## Entitäten & Graph

### `GET /entity/:uid?layers=l1,l2,l3`
Entitätsdetails nach UID abrufen.

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
Entitätsnachbarn mit Graphdurchlauf abrufen. Richtung: `out`, `in` oder `both`.

### `GET /path?source=Character:Kaelen&target=Location:Village`
Kürzesten Pfad zwischen zwei Entitäten finden.

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
Entitäten nach Name oder semantischer Ähnlichkeit suchen.

**Antwort:** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
Graphstatistik (Knoten-/Kantenzahlen, Verzweigungsinformationen).

### `GET /graph/d3?mode=relationships`
Graphdaten für d3-force-Visualisierung formatiert. Modus: `relationships` oder `crafting`.

**Antwort:** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## Sitzungen

### `GET /sessions`
Alle Sitzungshistorien auflisten.

### `GET /sessions/list`
Verfügbare Spielsitzungen auflisten.

**Antwort:** `{ sessions: array, count: number }`

### `GET /sessions/:sessionId/history`
Konversationshistorie für eine Sitzung abrufen.

### `GET /sessions/:sessionId/summarize`
Eine Sitzung zusammenfassen.

### `POST /sessions/export`
Sitzung nach Markdown exportieren.

**Anfrage:** `{ session_id?: string, messages: [{role, content, timestamp?}] }`

### `GET /sessions/exports`
Exportierte Markdown-Dateien auflisten.

### `GET /sessions/exports/:filename`
Eine exportierte Datei laden.

---

## Verzweigungen

### `POST /branch/create?name=my-branch&from_branch=main`
Eine neue Weltverzweigung erstellen (Git-ähnliche Snapshots).

### `POST /branch/switch?name=my-branch`
Aktive Verzweigung wechseln.

### `POST /branch/merge?name=my-branch`
Eine Verzweigung in main zusammenführen.

### `GET /branch/list`
Alle Verzweigungen auflisten.

---

## Wahrscheinlichkeit

### `GET /probability/:character/:profile?target=optional`
Erfolgswahrscheinlichkeit für eine Charakteraktion abrufen.

Profile: `combat`, `persuasion`, `stealth`, `intimidation`, `deception`, `athletics`, `investigation`, `romance`, `generic`.

**Antwort:** `{ character, profile, probability: number }`

### `POST /probability/modifier`
Einen temporären Wahrscheinlichkeitsmodifikator anwenden.

**Anfrage:** `{ entity: string, parameter: string, value: number, duration_seconds?: number }`

### `GET /probability/modifiers/:entity`
Aktive Modifikatoren für eine Entität auflisten.

---

## Romantik

### `GET /romance/:character1/:character2`
Romantischen Beziehungsstatus abrufen.

**Antwort:** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
Eine Romanzaktion versuchen. Aktionen: `attraction`, `confess`, `date`, `kiss`, `propose`, `breakup`.

**Anfrage:** `{ character, target, location?, message? }`

**Antwort:** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
Alle romantischen Beziehungen eines Charakters abrufen.

---

## Quests

### `GET /quests`
Alle Quests mit Fortschritt auflisten.

### `GET /quest/:questId`
Einzelne Questdetails abrufen.

---

## Feedback

### `POST /feedback`
Eine Like/Dislike/Neutral-Reaktion für den letzten Erzählzug aufzeichnen.

**Anfrage:** `{ turnId: number, reaction: 'like'|'dislike'|'neutral', techniques: string[] }`

Bei `dislike` regeneriert die Engine den letzten Zug und gibt `{ ok, regenerated }` zurück. Sonst `{ ok: true }`.

---

## Regelwerk

### `GET /rules`
Soziale/wirtschaftliche Regeln der Welt auflisten.

### `GET /rules/:id`
Regeldetails nach ID abrufen.

### `POST /rules/preview`
Vorschau zusammengeführter Regeln mit Modifikatoren. Body: `RulesConfig`.

### `POST /rules/check`
Prüfen, ob eine Aktion erlaubt ist. Body: `{ config, action, superiorClass?, subordinateClass? }`.

---

## Feature-Flags

### `GET /feature-flags`
Alle Feature-Flags und Exposures auflisten.

### `GET /feature-flags/:id`
Ein einzelnes Flag abrufen.

### `POST /feature-flags`
Ein neues Flag erstellen.

### `PUT /feature-flags/:id`
Ein Flag aktualisieren.

### `DELETE /feature-flags/:id`
Ein Flag löschen.

### `POST /feature-flags/:id/check`
Prüfen, ob ein Flag für einen Kontext aktiviert ist (Benutzer usw.).

---

## API-Versionierung

TrueNeverStory unterstützt zwei API-Versionen:

- **v1** — Legacy-Wrapper für Abwärtskompatibilität
- **v2** — Erweiterte Version mit Agent-Registry-Integration

Legacy-Routen (alles unter `/api/*`) enthalten Deprecation-Header:

- `X-API-Version: legacy`
- `Deprecation: true`
- `Sunset: 2026-12-31`

---

## Speicher

### `POST /memory/forget?older_than=30&min_importance=0.2`
Alte, unwichtige Erinnerungen vergessen.

### `POST /memory/summarise?tag=keyword`
Erinnerungen nach Tag oder Knoten-UID zusammenfassen.

### `GET /memory/export?fmt=json`
Alle Erinnerungen exportieren.

### `POST /memory/import`
Erinnerungen aus dem Body importieren.

**Anfrage:** `{ data: MemoryEntry[] }`

### `POST /memory/update/:entryId`
Eine Erinnerung aktualisieren.

**Anfrage:** `{ content: string }`

### `GET /memory/stats`
Speichersystemstatistik.

### `POST /memory/rebuild`
FAISS-Vektorindex neu aufbauen.

### `GET /memory/retrieve?q=keyword&top_k=10`
Semantische Suche über Erinnerungen.

---

## Wartung

### `POST /maintenance/run?full=true`
Speicherwartung ausführen (Beschneidung, Clustering, Archivierung).

### `GET /maintenance/status`
Speicher- und Wartungsstatistik.

### `POST /maintenance/rebuild-index`
Vektorindex neu aufbauen.

### `POST /maintenance/clean-orphans`
Verwaiste Embeddings bereinigen.

---

## System

### `POST /system/pause`
Rollenspiel-Engine pausieren. Keine Parameter.

### `POST /system/resume`
Rollenspiel-Engine fortsetzen. Keine Parameter.

### `GET /system/status`
Lauf-/Pausestatus der Engine abrufen.

---

## Agenten

### `GET /agents`
Alle konfigurierten Agenten auflisten.

**Abfrageparameter:** `world` — optional, Filter nach bestimmter Welt

### `GET /agents/:id`
Einzelne Agentenkonfiguration abrufen.

**Abfrageparameter:** `world` — optional, aus bestimmter Welt laden

### `PUT /agents/:id`
Agentenkonfiguration aktualisieren (Modell, Temperatur, Prompts usw.). Rate-Limit: 30/Min/IP.

**Abfrageparameter:** `world` — optional, in bestimmter Welt speichern

### `PUT /agents/:id/prompts`
Nur Prompts für einen Agenten aktualisieren.

**Abfrageparameter:** `world` — optional, in bestimmter Welt speichern

### `POST /agents/:id/reset`
Agenten auf Standardwerte zurücksetzen.

### `GET /agents/providers/options`
Verfügbare Anbieter/Modell-Optionen für Agentenzuweisung abrufen.

### `GET /agents/:id/prompts/:lang`
Agentenprompts für eine bestimmte Sprache abrufen.

### `PUT /agents/:id/prompts/:lang`
Agentenprompts für eine bestimmte Sprache aktualisieren.

### `GET /agents/registry`
Alle registrierten Agenten auflisten (AgentRegistry).

### `GET /agents/registry/stats`
Registry-Statistik abrufen.

### `GET /agents/registry/:id`
Einzelnen registrierten Agenten abrufen.

### `PUT /agents/registry/:id`
Registrierten Agenten aktualisieren.

### `POST /agents/registry/:id/enable`
Agenten aktivieren.

### `POST /agents/registry/:id/disable`
Agenten deaktivieren.

### `DELETE /agents/registry/:id`
Agenten aus der Registry entfernen.

---

## Anbieter & Modelle

### `GET /providers`
Alle LLM-Anbieter auflisten.

### `POST /providers`
Einen neuen Anbieter hinzufügen.

### `GET /providers/models`
Alle Modelle über Anbieter hinweg auflisten.

### `POST /providers/health`
Gesundheitsprüfung für alle Anbieter auslösen.

### `POST /providers/assign`
Anbieter+Modell einem Agenten zuweisen.

**Anfrage:** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `GET /providers/assignments`
Alle Anbieter-Agent-Zuweisungen auflisten.

### `GET /providers/agents`
Agenten vom Anbietermanager auflisten.

### `POST /providers/sync-from-agents`
Zuweisungen aus der Agentenkonfiguration synchronisieren.

### `GET /providers/reset`
Anbietermanager zurücksetzen.

### `DELETE /providers/assign/:agentId`
Anbieterzuweisung von einem Agenten entfernen.

### `GET /providers/:id`
Anbieterdetails und verfügbare Modelle abrufen.

### `PUT /providers/:id`
Anbieterkonfiguration aktualisieren.

### `DELETE /providers/:id`
Einen Anbieter entfernen.

### `POST /providers/:id/default`
Anbieter als Standard setzen.

### `POST /providers/:id/keys`
Einen API-Schlüssel hinzufügen.

### `DELETE /providers/:id/keys/:keyId`
Einen API-Schlüssel entfernen.

### `GET /models`
Alle installierten und verfügbaren Modelle auflisten.

### `POST /models/install`
Ein Modell installieren.

**Anfrage:** `{ source: "ollama"|"gguf_url", name: string, backend: "ollama"|"llamacpp" }`

### `DELETE /models/:id`
Ein Modell entfernen.

### `POST /models/import`
Eine lokale Modelldatei importieren.

### `POST /models/apply`
Ein Modell auf Einstellungen anwenden.

### `GET /models/browse?path=/`
Dateisystem nach Modelldateien durchsuchen.

---

## Einstellungen

### `GET /settings`
Aktuelle Einstellungen abrufen (API-Schlüssel maskiert).

### `PUT /settings`
Einstellungen aktualisieren. Passwörter werden automatisch gehasht, maskierte Schlüssel ignoriert.

### `POST /settings/reset`
Auf Standardwerte zurücksetzen.

### `GET /languages`
Verfügbare UI-Sprachen auflisten (EN, RU, DE, FR, ES, JA, ZH).

### `GET /llm-config`
LLM-Serverkonfiguration abrufen.

### `PUT /llm-config`
LLM-Serverkonfiguration aktualisieren.

### `POST /server/restart`
LLM-Server neu starten.

### `GET /server/status`
LLM-Serverstatus prüfen.

---

## Start

### `POST /launch`
Eine neue Spielsitzung mit Charaktergenerierung erstellen.

**Anfrage:** `{ hints?: string, isekai?: boolean, starting_age?: number, name?: string }`

- `name` — Expliziter Charaktername (optional). Wenn angegeben, wird die LLM-Namensgenerierung übersprungen. Unterstützt nicht-lateinische Zeichen.

**Antwort:** `{ status: "success", session_id, character_name, opening_narrative, race, social_class, birthplace, initial_location }`

### `POST /continue`
Eine bestehende Sitzung fortsetzen.

**Anfrage:** `{ session_id: string }`

**Antwort:** `{ status: "success", session_id, character_name, restored: boolean }`

### `POST /snapshot`
Aktuellen Spielstand speichern.

**Anfrage:** `{ session_id?: string }`

---

## WebSocket

### `GET /ws/*`
WebSocket-Endpunkt für Echtzeit-Rollenspiel. Der Server akzeptiert WebSocket-Upgrades auf jedem `/ws/*`-Pfad. Der Sitzungskontext wird durch den Nachrichtentyp bestimmt, nicht durch die URL.

**Client → Server:** `{ type: "message", content: string }` oder `{ type: "setup", ... }`
**Server → Client:** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## Authentifizierung

Wenn Passwort-Authentifizierung aktiviert ist, verwenden Sitzungen HttpOnly-Cookies. Verwenden Sie `credentials: "include"` in Fetch-Aufrufen.

---

## Weltenübergreifend

### `GET /api/cross-world/status`
Status der weltenübergreifenden Kommunikation abrufen.

**Antwort:** `{ enabled: boolean, portals: number, eventLog: number }`

### `POST /api/cross-world/enable`
Weltenübergreifende Kommunikation aktivieren.

**Antwort:** `{ enabled: true }`

### `POST /api/cross-world/disable`
Weltenübergreifende Kommunikation deaktivieren.

**Antwort:** `{ enabled: false }`

### `GET /api/cross-world/portals`
Aktive Portale zwischen Welten auflisten.

**Antwort:** Array von `{ id, world1, world2, createdAt, active }`

### `POST /api/cross-world/portals`
Ein Portal zwischen zwei Welten erstellen.

**Anfrage:** `{ world1: string, world2: string }`

**Antwort:** `{ id, world1, world2, createdAt, active }`

### `DELETE /api/cross-world/portals/:id`
Ein Portal zerstören.

**Antwort:** `{ deleted: true }`

### `GET /api/cross-world/events?limit=50`
Weltenübergreifendes Ereignisprotokoll abrufen.

**Antwort:** Array von `{ type, data, source, timestamp }`

---

## Plugins

### `GET /api/plugins`
Alle registrierten Plugins auflisten.

**Antwort:** Array von `{ id, name, version, description, agents, routes, hooks }`

### `GET /api/plugins/:id`
Plugindetails abrufen.

**Antwort:** Plugin-Objekt mit vollständigen Details.

### `GET /api/plugins/:id/capabilities`
Plugin-Fähigkeiten abrufen (Anzahl Agenten, Routen, Hooks).

**Antwort:** `{ agents: number, routes: number, hooks: number }`

### `GET /api/plugins/agents/all`
Alle von Plugins registrierten Agenten abrufen.

**Antwort:** Array von `{ id, name, description, config }`

### `GET /api/plugins/routes/all`
Alle von Plugins registrierten Routen abrufen.

**Antwort:** Array von `{ path, method, handler }`

---

## Überwachung

### `GET /monitoring/dashboard`
Aggregierte Überwachungs-Dashboard-Daten.

### `GET /monitoring/stats`
Leichtgewichtige Statistiken für Polling.

---

## I18n

### `GET /i18n/translations/:lang/:page`
Übersetzungen für eine bestimmte Sprache und Seite abrufen.

### `GET /i18n/translations/:lang`
Alle Übersetzungen für eine Sprache abrufen.

### `PUT /i18n/translations`
Batch-Übersetzungen einfügen/aktualisieren.

### `DELETE /i18n/translations/:lang/:page/:key`
Einen Übersetzungsschlüssel löschen.

---

## Weltspeicher

### `POST /world-store/migrate`
JSON-Daten nach SQLite migrieren.

### `GET /world-store/stats`
Migrationsstatistik abrufen.

### `GET /world-store/quests`
Quests aus SQLite abrufen.

### `GET /world-store/npc-memories/:uid`
NPC-Erinnerungen nach Entitäts-UID abrufen.

### `GET /world-store/frame`
Weltframe aus SQLite abrufen.

---

## Wiki-Recherche

### `POST /api/wiki/research/:worldId`
Wikipedia-Recherche für eine Welt starten.

### `GET /api/wiki/research/:worldId/progress`
SSE-Fortschrittsstream für laufende Recherche.

### `POST /api/wiki/research/:worldId/pause`
Laufende Recherche pausieren.

### `POST /api/wiki/research/:worldId/resume`
Pausierte Recherche fortsetzen.

### `GET /api/wiki/research/:worldId/status`
Recherche-Status abrufen.

---

*Generiert: 2026-07-31 | TrueNeverStory v0.33.0*
