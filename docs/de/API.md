# TrueNeverStory API-Referenz

REST-API für die TrueNeverStory-Weltenbau- und Rollenspielplattform. Alle Endpunkte geben JSON zurück, sofern nicht anders angegeben.

**Basis-URL:** `http://localhost:8000`

---

## Inhaltsverzeichnis

- [Gesundheit](#gesundheit)
- [Chat & Rollenspiel](#chat--rollenspiel)
- [Welten](#welten)
- [Entitäten & Graf](#entitäten--graf)
- [Sitzungen](#sitzungen)
- [Äste](#äste)
- [Wahrscheinlichkeit](#wahrscheinlichkeit)
- [Romanze](#romanze)
- [Quests](#quests)
- [Feedback](#feedback)
- [Regel-Engine](#regel-engine)
- [Feature-Flags](#feature-flags)
- [API-Versionierung](#api-versionierung)
- [Gedächtnis](#gedächtnis)
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

---

## Gesundheit

### `GET /health`
Gesundheitsprüfung.

**Antwort:** `{ status: "ok", engine_ready: boolean, uptime: number }`

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
Spieler-Nachricht senden, narrative Antwort erhalten.

**Anfrage:** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**Antwort:** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
SSE-Streaming für progressive Narrativ-Lieferung. Gleicher Request-Body wie `/chat/message`.

**Antwort:** Server-Sent Events-Stream:
- `event: start` — Sitzungsstatus
- `event: chunk` — Narrativ-Text-Chunk
- `event: agent` — Agent-Antwort (bei `@agent`-Erwähnung)
- `event: done` — Endstatus
- `event: error` — Fehlermeldung
- `data: [DONE]` — Stream-Ende-Sentinel

### `POST /chat/agent`
Private Nachricht an einen bestimmten Agenten senden.

**Anfrage:** `{ agentId: string, message: string }`

**Antwort:** `{ narrative, agent_id, agent_name, location, story_time, active_character, success, error? }`

### `GET /chat/session`
Aktuellen Sitzungsstatus abrufen.

**Antwort:** `{ active_character, current_location, current_time, session_id }`

### `GET /chat/history?limit=20`
Letzte Gesprächshistorie abrufen.

**Antwort:** Array von `{ user: string, assistant: string, timestamp: string }`

---

## Welten

### `GET /worlds`
Alle verfügbaren Welten auflisten.

**Antwort:** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
Aktuellen Weltname abrufen (Leichtgewicht).

**Antwort:** `{ active: string }`

### `POST /worlds`
Neue Welt erstellen.

**Anfrage:** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

**Antwort:** `{ status: "created", world }`

### `GET /worlds/:name`
Weltdetails und Frame-Daten abrufen.

### `PUT /worlds/:name`
World-Frame-Felder aktualisieren.

### `DELETE /worlds/:name`
Welt löschen.

### `POST /worlds/:name/switch`
Aktive Welt wechseln.

### `POST /worlds/:name/chapters/generate`
Literarisches Kapitel aus Sitzungsdaten generieren.

**Anfrage:** `{ sessionId?: string, prompt?: string }`

### `GET /worlds/:name/chapters`
Generierte Kapitel auflisten.

### `GET /worlds/:name/chapters/:filename`
Kapitelinhalt abrufen.

### `GET /worlds/:name/detail`
Vollständige Weltstatistiken für das Statistik-Modal.

**Antwort:**
```json
{
  "name": "default",
  "title": "Meine Welt",
  "description": "...",
  "genre": "fantasy",
  "language": "de",
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

## Entitäten & Graf

### `GET /entity/:uid?layers=l1,l2,l3`
Entitätsdetails per UID abrufen.

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
Nachbarn der Entität mit Graftraversierung. Richtung: `out`, `in` oder `both`.

### `GET /path?source=Character:Kaelen&target=Location:Village`
Kürzesten Pfad zwischen zwei Entitäten finden.

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
Entitäten nach Name oder semantischer Ähnlichkeit suchen.

**Antwort:** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
Grafstatistik (Knoten-/Kantenanzahl, Ast-Information).

### `GET /graph/d3?mode=relationships`
Grafdaten für d3-force-Visualisierung. Modus: `relationships` oder `crafting`.

**Antwort:** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## Sitzungen

### `GET /sessions`
Alle Sitzungshistorien auflisten.

### `GET /sessions/list`
Verfügbare Spielsitzungen auflisten.

**Antwort:** `{ sessions: array, count: number }`

### `GET /sessions/:sessionId/history`
Gesprächshistorie einer Sitzung abrufen.

### `GET /sessions/:sessionId/summarize`
Sitzung zusammenfassen.

### `POST /sessions/export`
Sitzung in Markdown exportieren.

**Anfrage:** `{ session_id?: string, messages: [{role, content, timestamp?}] }`

### `GET /sessions/exports`
Exportierte Markdown-Dateien auflisten.

### `GET /sessions/exports/:filename`
Exportierte Datei laden.

---

## Äste

### `POST /branch/create?name=my-branch&from_branch=main`
Neuen Weltast erstellen (Git-ähnliche Snapshots).

### `POST /branch/switch?name=my-branch`
Aktiven Ast wechseln.

### `POST /branch/merge?name=my-branch`
Ast in main zusammenführen.

### `GET /branch/list`
Alle Äste auflisten.

---

## Wahrscheinlichkeit

### `GET /probability/:character/:profile?target=optional`
Erfolgswahrscheinlichkeit einer Charakteraktion abrufen.

Profile: `combat`, `persuasion`, `stealth`, `intimidation`, `deception`, `athletics`, `investigation`, `romance`, `generic`.

**Antwort:** `{ character, profile, probability: number }`

### `POST /probability/modifier`
Temporären Wahrscheinlichkeitsmodifikator anwenden.

**Anfrage:** `{ entity: string, parameter: string, value: number, duration_seconds?: number }`

### `GET /probability/modifiers/:entity`
Aktive Modifikatoren einer Entität auflisten.

---

## Romanze

### `GET /romance/:character1/:character2`
Status der romantischen Beziehung abrufen.

**Antwort:** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
Romantische Aktion versuchen. Aktionen: `attraction`, `confess`, `date`, `kiss`, `propose`, `breakup`.

**Anfrage:** `{ character, target, location?, message? }`

**Antwort:** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
Alle romantischen Beziehungen eines Charakters abrufen.

---

## Quests

### `GET /quests`
Alle Quests mit Fortschritt auflisten.

### `GET /quest/:questId`
Einzelne Quest-Details abrufen.

---

## Feedback

### `POST /feedback`
Eine Reaktion „Gefällt mir"/„Gefällt mir nicht"/„Neutral" für den letzten Erzählzug aufzeichnen.

**Anfrage:** `{ turnId: number, reaction: 'like'|'dislike'|'neutral', techniques: string[] }`

Bei `dislike` generiert die Engine den letzten Zug neu und gibt `{ ok, regenerated }` zurück. Andernfalls `{ ok: true }`.

---

## Regel-Engine

### `GET /rules`
Soziale/ökonomische Regeln der Welt auflisten.

### `GET /rules/:id`
Regeldetails per ID abrufen.

### `POST /rules/preview`
Zusammengeführte Regeln mit Modifikatoren in der Vorschau anzeigen. Body: `RulesConfig`.

### `POST /rules/check`
Prüfen, ob eine Aktion erlaubt ist. Body: `{ config, action, superiorClass?, subordinateClass? }`.

---

## Feature-Flags

### `GET /feature-flags`
Alle Feature-Flags und Exposures auflisten.

### `GET /feature-flags/:id`
Ein einzelnes Flag abrufen.

### `POST /feature-flags`
Neues Flag erstellen.

### `PUT /feature-flags/:id`
Flag aktualisieren.

### `DELETE /feature-flags/:id`
Flag löschen.

### `POST /feature-flags/:id/check`
Prüfen, ob ein Flag für einen Kontext (Benutzer usw.) aktiviert ist.

---

## API-Versionierung

TrueNeverStory unterstützt zwei API-Versionen:

- **v1** — Legacy-Wrapper für Abwärtskompatibilität
- **v2** — Erweiterte Version mit Integration der Agenten-Registry

Alle v2-Antworten enthalten Deprecation-Header, wenn Legacy-Verhalten verwendet wird:

- `X-API-Version: v2`
- `X-Deprecated: true` (bei Rückgabe des Legacy-Formats)
- `Sunset: <date>` (wenn ein v1-Endpunkt zur Entfernung vorgesehen ist)

## Gedächtnis

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
Erinnereintrag aktualisieren.

**Anfrage:** `{ content: string }`

### `GET /memory/stats`
Statistik des Gedächtnissystems.

### `POST /memory/rebuild`
FAISS-Vektorindex neu aufbauen.

### `GET /memory/retrieve?q=keyword&top_k=10`
Semantische Suche über Erinnerungen.

---

## Wartung

### `POST /maintenance/run?full=true`
Gedächtnis-Wartung ausführen (Bereinigung, Clustering, Archivierung).

### `GET /maintenance/status`
Gedächtnis- und Wartungsstatistik.

### `POST /maintenance/rebuild-index`
Vektorindex neu aufbauen.

### `POST /maintenance/clean-orphans`
Verwaiste Embeddings bereinigen.

---

## System

### `POST /system/pause`
Die Rollenspiel-Engine pausieren. Akzeptiert keine Parameter.

### `POST /system/resume`
Die Rollenspiel-Engine fortsetzen. Akzeptiert keine Parameter.

---

## Agenten

### `GET /agents`
Alle konfigurierten Agenten auflisten.

Abfrageparameter: `world` — optional, Filterung nach bestimmter Welt

### `GET /agents/:id`
Einzelne Agentenkonfiguration abrufen.

Abfrageparameter: `world` — optional, Laden aus bestimmter Welt

### `PUT /agents/:id`
Agentenkonfiguration aktualisieren (Modell, Temperatur, Prompts usw.). Rate-Limit: 30/Min/IP.

Abfrageparameter: `world` — optional, Speichern in bestimmter Welt

### `PUT /agents/:id/prompts`
Nur Prompts des Agenten aktualisieren.

Abfrageparameter: `world` — optional, Speichern in bestimmter Welt

### `POST /agents/:id/reset`
Agenten auf Standardwerte zurücksetzen.

### `GET /agents/providers/options`
Verfügbare Anbieter/Modell-Optionen für Agentenzuweisung.

---

## Anbieter & Modelle

### `GET /providers`
Alle LLM-Anbieter auflisten.

### `POST /providers`
Neuen Anbieter hinzufügen.

### `GET /providers/models`
Alle Modelle über Anbieter auflisten.

### `POST /providers/health`
Gesundheitsprüfung aller Anbieter auslösen.

### `POST /providers/assign`
Anbieter+Modell einem Agenten zuweisen.

**Anfrage:** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `DELETE /providers/assign/:agentId`
Anbieter-Zuweisung vom Agenten entfernen.

### `GET /providers/:id`
Anbieterdetails und verfügbare Modelle abrufen.

### `PUT /providers/:id`
Anbieterkonfiguration aktualisieren.

### `DELETE /providers/:id`
Anbieter entfernen.

### `POST /providers/:id/default`
Anbieter als Standard festlegen.

### `POST /providers/:id/keys`
API-Schlüssel hinzufügen.

### `DELETE /providers/:id/keys/:keyId`
API-Schlüssel entfernen.

### `GET /models`
Alle installierten und verfügbaren Modelle auflisten.

### `POST /models/install`
Modell installieren.

**Anfrage:** `{ source: "ollama"|"gguf_url", name: string, backend: "ollama"|"llamacpp" }`

### `DELETE /models/:id`
Modell entfernen.

### `POST /models/import`
Lokale Modelldatei importieren.

### `POST /models/apply`
Modell auf Einstellungen anwenden.

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

---

## Start

### `POST /launch`
Neue Spielsitzung mit Charaktergenerierung erstellen.

**Anfrage:** `{ name?: string, hints?: string, isekai?: boolean, starting_age?: number }`

`name` — expliziter Charaktername (optional). Wenn angegeben, wird die LLM-Namensgenerierung übersprungen. Unterstützt nicht-lateinische Zeichen.

**Antwort:** `{ status: "success", session_id, character_name, opening_narrative, url }`

### `POST /continue`
Bestehende Sitzung fortsetzen.

**Anfrage:** `{ session_id: string }`

**Antwort:** `{ status: "success", session_id, character_name, url }`

---

## WebSocket

### `GET /ws/roleplay/:sessionId`
WebSocket-Endpunkt für Echtzeit-Rollenspiel. Nachrichten in JSON:

**Client → Server:** `{ type: "message", content: string }`
**Server → Client:** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## Authentifizierung

Bei aktivierter Passwort-Authentifizierung verwenden Sitzungen HttpOnly-Cookies. Fügen Sie `credentials: "include"` in Fetch-Aufrufen ein.

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
Portal zwischen zwei Welten erstellen.

**Anfrage:** `{ world1: string, world2: string }`

**Antwort:** `{ id, world1, world2, createdAt, active }`

### `DELETE /api/cross-world/portals/:id`
Portal zerstören.

**Antwort:** `{ deleted: true }`

### `GET /api/cross-world/events?limit=50`
Ereignisprotokoll der weltenübergreifenden Kommunikation abrufen.

**Antwort:** Array von `{ type, data, source, timestamp }`

---

## Plugins

### `GET /api/plugins`
Alle registrierten Plugins auflisten.

**Antwort:** Array von `{ id, name, version, description, agents, routes, hooks }`

### `GET /api/plugins/:id`
Plugin-Details abrufen.

**Antwort:** Plugin-Objekt mit vollständigen Details.

### `GET /api/plugins/:id/capabilities`
Plugin-Fähigkeiten abrufen (Anzahl der Agenten, Routen, Hooks).

**Antwort:** `{ agents: number, routes: number, hooks: number }`

### `GET /api/plugins/agents/all`
Alle von Plugins registrierten Agenten abrufen.

**Antwort:** Array von `{ id, name, description, config }`

### `GET /api/plugins/routes/all`
Alle von Plugins registrierten Routen abrufen.

**Antwort:** Array von `{ path, method, handler }`

---

*Generiert: 2026-06-27 | TrueNeverStory v0.32.5*
