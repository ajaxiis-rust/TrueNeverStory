# TrueNeverStory v0.10.3 – Plattform für interaktive narratives Spielen

**TrueNeverStory v0.10.3** ist eine moderne Neuimplementierung der [BRING](https://github.com/Eva-E1/BRING) Fantasy-Welt-Plattform, migriert von Python zu einem leistungsstarken Hybrid-Stack:

- **TypeScript (Bun + Hono)** – Webserver, API, WebSocket, Routing, Auth, Streaming, Geschäftslogik
- **Mojo FFI** – Compute-Kerne für Wahrscheinlichkeitsberechnungen und Vektoroperationen (optional, mit TypeScript-Fallback)

> *"Von einem einzigen Prompt zu einer lebendigen, atmenden Welt – in der sich jeder NPC erinnert, jede Handlung eine Chance hat und die Geschichte nie aufhört."*

---

## Funktionen

| Funktion | Beschreibung |
|----------|--------------|
| **Geschichtete Welterstellung** | Jede Entität (Charakter, Ort, Item, Fraktion) hat drei Schichten: L1 (Klassifikation), L2 (Details), L3 (Geheimnisse) |
| **Graph-basiertes Wissen** | Alle Beziehungen in einem gerichteten Graphen mit O(1) Suchen, BFS-Traversierung, Branch-Management |
| **Selbstoptimierender Speicher** | Vektor-beschleunigter Speicher mit kognitiver Pipeline (Entitäts extraktion, Widerspruchserkennung, Schmerzsignale) |
| **RAG für alle Agenten** | Vollständige Embedding-Unterstützung über llama.cpp (BGE-M3) + SQLite Hybrid-Suche (FTS5 + dichte Vektoren + RRF) |
| **Wahrscheinlichkeitssystem** | Deterministische Ergebnisse für Kampf, Überredung, Heimlichkeit, Romanze mit dynamischen Modifikatoren |
| **Romanzesystem** | Vollständige romantische Beziehungsverwaltung mit wahrscheinlichkeitsbasierten Aktionen |
| **Lebender Regisseur** | Hintergrund-Agent entwickelt Handlungsstränge, Schurkenpläne, NPC-Interaktionen |
| **Immersives Rollenspiel** | Ich-Erzähler, NPC-Dialoge, Szenenübergänge – LLM spricht nie für deinen Charakter |
| **Quest-System** | Dynamische Quest-Generierung und Zielverfolgung |
| **Researcher-Agent** | Faktencheck, Realismusvalidierung, historische Genauigkeit für Rezepte, Charaktere und Szenen |
| **NPC-Intelligenz** | Speicher Suche, autonomes Verhalten, soziale Beziehungen, angereicherter Dialog-Kontext |
| **NPC-Wirtschaft** | Feudale Hierarchie (10 Ränge), Steuern, Bestechung, Nahrungsmittelproduktion, Familiensystem, Lastern, 34 Archetypen |
| **Item-System** | Einzigartige Items mit dauerhaften Attributs-Boosts (1-10%), bewertet von Historiker/Forscher-Agenten |
| **14 spezialisierte Agenten** | Erzähler, Regisseur, Szene, NPC, Chronist, Story-Planer, Soz. Sim, Schurke, Forscher, Historiker, Kartograph, Kaufmann, Quest-Geber, Wissenshüter |
| **WebSocket in Echtzeit** | Live-Rollenspiel-Streaming und Speicher-Ereignisse |
| **SSE Streaming** | Progressive Narrativlieferung über Server-Sent Events |
| **i18n (7 Sprachen)** | Vollständige Lokalisierung: EN, RU, DE, FR, ES, JA, ZH – UI, Prompts, Agent-Namen |
| **SQLite-Speicher** | Agent-Prompts und UI-Strings werden in SQLite pro Welt + Sprache gespeichert |
| **Passwort-Auth** | Sitzungsbasierte Authentifizierung mit HttpOnly Cookies |
| **Terminal-UI** | Wunderschöne dunkle Terminal-Stil Weboberfläche |

---

## Architektur

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Terminal UI)                 │
│              WebSocket + REST + SSE                      │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────▼─────────────────────────────────┐
│              TypeScript (Bun + Hono)                     │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ HTTP API │ │WebSocket │ │SSE Stream│ │   Auth     │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬──────┘  │
│       └─────────────┼───────────┼─────────────┘         │
│  ┌──────────────────▼───────────▼─────────────────────┐  │
│  │              Dienstschicht                          │  │
│  │  RoleplayEngine │ ProbabilityEngine │ RomanceEngine│  │
│  │  QuestManager   │ WorldClock        │ Director     │  │
│  │  StoryPlanner   │ VillainManager    │ SocialSim    │  │
│  │  ResearcherAgent│ CrafterAgent      │ Chronicler   │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           Speichersystem (WorldMemory)               │  │
│  │  VectorIndex │ CognitivePipeline │ EntityExtractor │  │
│  │  Scoring     │ Partitions        │ WriteBuffer     │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           Datenschicht (EntityStore + JSON)          │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │      Mojo FFI (optional, automatisch erkannt)      │  │
│  │  Wahrscheinlichkeitskerne │ Vektoroperationen      │  │
│  │  .so/.dylib → dlopen() oder TypeScript-Fallback     │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP (OpenAI-kompatibel)
┌───────────────────────▼─────────────────────────────────┐
│              Externe LLM API (Ollama, OpenAI, etc.)      │
└─────────────────────────────────────────────────────────┘
```

---

## Plattformkompatibilität

| Plattform | Status | Mojo FFI | Start | Hinweise |
|-----------|:------:|:--------:|-------|---------|
| Linux x86_64 | ✅ Full | ✅ | `./tns-server` | Vollständige Unterstützung |
| Linux ARM64 | ✅ Full | ✅ | `./tns-server` | Vollständige Unterstützung |
| macOS ARM64 | ✅ Full | ✅ | `./tns-server` | Apple Silicon |
| macOS x86_64 | ✅ Full | ✅ | `./tns-server` | Intel Mac |
| Windows x86_64 | ✅ Fallback | ❌ | `tns-server.exe` | TypeScript-Fallback |

---

## Schnellstart

### Voraussetzungen

- [Bun](https://bun.sh) v1.0+ (für Entwicklung)
- Eine OpenAI-kompatible LLM API (OpenAI, Ollama, vLLM, LM Studio usw.)

Für die kompilierte Binary — nichts nötig, einfach starten.

### 1. Installation

```bash
cd TNS
bun install
```

### 2. LLM konfigurieren

Öffnen Sie `http://localhost:8000/settings` und konfigurieren Sie Ihren LLM-Provider:

- **Ollama** (lokal): `http://localhost:11434/v1`, Modell: `llama3`
- **OpenAI**: `https://api.openai.com/v1`, Modell: `gpt-4o-mini`
- **vLLM** (lokal): `http://localhost:8000/v1`
- **LM Studio**: `http://localhost:1234/v1`

Oder bearbeiten Sie `conf/settings.json` direkt.

### 3. Starten

```bash
bun run dev
```

Öffnen Sie `http://localhost:8000` und melden Sie sich mit Passwort an: **`changeme`**

Ändern Sie das Passwort in den Einstellungen nach dem ersten Login.

### Binary (keine Abhängigkeiten)

```bash
# Von GitHub Releases herunterladen, dann:
chmod +x tns-server
./tns-server
# Login: http://localhost:8000 — Passwort: changeme
```

---

## Verwendungsbeispiele

### Aus der Binary starten (keine Abhängigkeiten)

Laden Sie die neueste Version für Ihre Plattform herunter und starten Sie direkt:

```bash
# Linux / macOS
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

Kein Bun, Node.js oder andere Laufzeitumgebung erforderlich. Konfigurieren Sie `.env` und starten Sie.

### Aus dem Quellcode starten (Entwicklung)

```bash
# Hot-Reload-Entwicklungsmodus
bun run dev

# Produktionsmodus (kein Hot Reload)
bun run start

# Bundle erstellen (ohne Binary)
bun run build
```

### Start mit lokalem LLM (Ollama)

```bash
# 1. Ollama mit Modell starten
ollama pull llama3
ollama serve

# 2. TNS für Ollama konfigurieren
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

# 3. Server starten
./tns-server
```

### Start mit OpenAI API

```bash
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

./tns-server
```

### API-Beispiele

```bash
# Anmeldung
curl -c cookies.txt -X POST http://localhost:8000/login \
  -d "password=mypassword"

# Neues Spiel starten
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# Nachricht senden und Narrativ erhalten
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Ich ziehe mein Schwert und stelle mich dem Drachen"}'

# Streaming-Antwort (SSE)
curl -b cookies.txt -N http://localhost:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Erzähle mir von diesem alten Wald"}'

# Entitäten suchen
curl -b cookies.txt "http://localhost:8000/api/search?q=drache"

# Entitätsdetails abrufen
curl -b cookies.txt http://localhost:8000/api/entity/uid-character-aragorn

# Graph-Nachbarn abrufen
curl -b cookies.txt "http://localhost:8000/api/neighbors/uid-location-rivendell?depth=2"

# Wahrscheinlichkeit prüfen
curl -b cookies.txt http://localhost:8000/api/probability/aragorn/combat

# Quests auflisten
curl -b cookies.txt http://localhost:8000/api/quests
```

### WebSocket für Echtzeit-Rollenspiel

```javascript
// WebSocket-Verbindung herstellen
const ws = new WebSocket('ws://localhost:8000/ws/roleplay/session-id');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'message',
    content: 'Ich betrete die Taverne und sehe mich um'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.narrative); // Echtzeit-Narrativ-Stream
};
```

### Aus Quellcode kompilieren

```bash
# Mojo installieren (optional, für Performance-Kernel)
curl https://get.modular.com | sh
modular install mojo

# Für aktuelle Plattform kompilieren
./build.sh compile

# Für bestimmte Plattform kompilieren
./build.sh compile linux-x64
./build.sh compile macos-arm64

# Cross-Kompilierung für alle Plattformen
./build.sh cross

# Details in COMPILE.md
```

---

## API-Endpunkte

### Authentifizierung

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/login` | Anmeldeseite |
| POST | `/login` | Authentifizierung (Formular: `password=...`) |
| POST | `/logout` | Sitzung löschen |

### Chat

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| POST | `/api/chat/setup` | Rollenspiel-Sitzung initialisieren |
| POST | `/api/chat/message` | Nachricht senden, Narrativ erhalten |
| POST | `/api/chat/stream` | SSE-Streaming-Antwort |
| GET | `/api/chat/session` | Aktueller Sitzungsstatus |
| GET | `/api/chat/history` | Gesprächsverlauf |

### Entitäten & Graph

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/entity/:uid` | Entitätsdetails |
| GET | `/api/neighbors/:uid` | Nachbarn mit Tiefe |
| GET | `/api/path` | Kürzesten Pfad finden |
| GET | `/api/search` | Nach Name oder semantisch suchen |
| GET | `/api/graph/summary` | Graph-Statistiken |

### Äste

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| POST | `/api/branch/create` | Ast erstellen |
| POST | `/api/branch/switch` | Aktiven Ast wechseln |
| POST | `/api/branch/merge` | In main zusammenführen |
| GET | `/api/branch/list` | Alle Äste auflisten |

### Wahrscheinlichkeiten

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/probability/:character/:profile` | Erfolgswahrscheinlichkeit |
| POST | `/api/probability/modifier` | Modifikator anwenden |
| GET | `/api/probability/modifiers/:entity` | Aktive Modifikatoren |

### Romanze

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/romance/:c1/:c2` | Beziehungsstatus |
| POST | `/api/romance/attempt/:action` | Romantische Aktion versuchen |
| GET | `/api/romance/characters/:char` | Charakter-Romanzen auflisten |

### Quests

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/quests` | Alle Quests auflisten |
| GET | `/api/quest/:id` | Quest-Details |

### Sitzungen & Wartung

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/sessions` | Sitzungsverläufe |
| POST | `/api/maintenance/run` | Wartung starten |
| GET | `/api/maintenance/status` | Wartungsstatistiken |
| POST | `/api/launch` | Neues Spiel starten |
| POST | `/api/continue` | Spiel fortsetzen |
| GET | `/api/health` | Gesundheitsprüfung |

### Agenten

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/agents` | Alle Agenten-Konfigurationen |
| GET | `/api/agents/:id` | Einzelne Agenten-Konfiguration |
| PUT | `/api/agents/:id` | Agenten-Konfiguration aktualisieren |
| PUT | `/api/agents/:id/prompts` | Agenten-Prompts aktualisieren |
| POST | `/api/agents/:id/reset` | Auf Standard zurücksetzen |
| GET | `/api/agents/providers/options` | Anbieter/Modell-Optionen |

### WebSocket

| Endpunkt | Beschreibung |
|----------|--------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Rollenspiel in Echtzeit |
| `ws://host:8000/ws/memory` | Speicher-Ereignis-Feed |

---

## Projektstruktur

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod-validierte Umgebungskonfiguration
│   ├── lib/              # LLM-Client, Queue, Event Bus, Historie, Atomic I/O
│   ├── memory/           # WorldMemory, FAISS-Index, kognitive Pipeline, Scoring
│   ├── middleware/        # Auth, CORS, Fehlerbehandlung, Logger, Rate Limiter
│   ├── models/           # Entity, chat, probability, romance, quest, story, memory
│   ├── routes/           # 13 Routenmodule (chat, entities, agents usw.)
│   ├── services/         # 23 Dienste (roleplay engine, agenten, wahrscheinlichkeiten usw.)
│   ├── intelligence/     # Graph-Analyse, Duplikate, Empfehlungen, Szenen-Generator
│   ├── i18n/             # Sprachpakete (EN, RU, DE, FR, ES, JA, ZH)
│   ├── store/            # EntityStore mit O(1) NameIndex
│   ├── utils/            # Logger, Hash, Zeitutils
│   ├── app.ts            # Hono-App mit Middleware-Kette
│   └── index.ts          # Server-Einstiegspunkt
├── mojo/
│   ├── kernels/          # FFI Wahrscheinlichkeits- und Vektorkerne
│   └── src/              # 81 Mojo-Quelldateien (optionales Performance-Backend)
├── public/
│   ├── index.html        # Terminal-Style Web-UI
│   ├── agents.html       # Agenten-Konfiguration (i18n-fähig)
│   ├── providers.html    # LLM-Anbieter-Einstellungen
│   ├── models.html       # Modellverwaltung
│   └── settings.html     # Globale Einstellungen
├── worlds/
│   ├── default/          # Active world
│   │   ├── world_frame.json
│   │   ├── entities.json
│   │   ├── agents/       # Per-agent JSON configs
│   │   ├── session_history/
│   │   ├── chapters/
│   │   ├── timeline.jsonl
│   │   └── settings.json
├── local-models/         # GGUF models (downloaded locally)
├── tests/
│   ├── entity-store.test.ts
│   ├── probability-engine.test.ts
│   └── integration/
│       └── server.test.ts
├── .env                  # Konfiguration (git-ignoriert)
├── .env.example          # Konfigurationsvorlage
├── startgame.sh          # Server + llama-server Starter (mit PID-Bereinigung)
├── package.json
├── tsconfig.json
└── plan.md               # Migrationsplan
```

---

## Konfiguration

Gesamte Konfiguration über Umgebungsvariablen (`.env`-Datei):

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `WORLD_LLM_BASE_URL` | – | OpenAI-kompatibler LLM-Endpunkt |
| `WORLD_LLM_API_KEY` | – | API-Schlüssel |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Modellname |
| `WORLD_LLM_TIMEOUT` | `120` | Anfrage-Timeout (Sekunden) |
| `WORLD_LLM_MAX_TOKENS` | `4096` | Max. Token pro Antwort |
| `WORLD_LLM_TEMPERATURE` | `0.7` | Sampling-Temperatur |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | Max. gleichzeitige LLM-Anfragen |
| `WORLD_DB_PATH` | `./worlds/default` | Datenbankverzeichnis |
| `LOCAL_MODELS_PATH` | `./local-models` | Lokale GGUF-Modelle Verzeichnis |
| `WORLD_SERVER_HOST` | `0.0.0.0` | Listener-Adresse |
| `WORLD_SERVER_PORT` | `8000` | Listener-Port |
| `AUTH_PASSWORD` | – | Anmeldepasswort (leer = keine Auth) |
| `MAX_SERVE_URL` | `http://localhost:8000` | Mojo MAX Serve-Endpunkt |

---

## Entwicklung

```bash
# Entwicklung mit Hot Reload
bun run dev

# Typprüfung
npx tsc --noEmit

# Alle Tests ausführen
bun test

# Bestimmte Tests ausführen
bun test tests/entity-store.test.ts
bun test tests/probability-engine.test.ts
bun test tests/integration/server.test.ts

# Für Produktion bauen
bun run build
```

---

## Letzte Änderungen

### NPC-Wirtschaftssystem (v0.10.3)

Vollständige feudale Wirtschaftssimulation mit lebendigen NPCs:

| Funktion | Beschreibung |
|----------|--------------|
| **Feudale Hierarchie** | 10 Ränge: Sklave → Bürger → Baronet → Baron → Viscount → Graf → Marquis → Herzog → König → Kaiser |
| **NPC-Attribute** | 6 Attribute: Wohlstand, Macht, Beliebtheit, Gesundheit, Erfahrung, Intrige |
| **Steuersystem** | Hierarchische Steuern: 0% (Kaiser) → 90% (Bürger), reduziert durch Macht/Beliebtheit |
| **Bestechungsmechanik** | Risikobasierte Bestechung: 10% Basis + Betrag/Zeugen, Verratsschwelle |
| **Nahrungsmittelwirtschaft** | Sklaven produzieren 300-1000 Nahrung/Monat, alle konsumieren nach Rang |
| **Familiensystem** | 50% Einkommen an Ehefrau, 10% an Kinder, Vererbung beim Tod |
| **Lastern & Degradierung** | 8 Laster die Attribute beeinflussen, altersbedingter Gesundheitsverfall |
| **34 Archetypen** | 22 Standard + 12 einzigartige, gewichtete Zufallsauswahl, Kontextgruppen |
| **Machtverlust** | Rebellion → Tod/Sklaverei, Krieg → Lösegeld/Sklaverei, Bankrott → Sklaverei |
| **Item-Boosts** | Einzigartige Items geben dauerhafte Attributs-Boosts (1-10%), bewertet von Historiker/Forscher |

### SQLite-Speicher für Prompts & Übersetzungen (v0.10.3)
Agent-Prompts und UI-Strings werden jetzt in SQLite pro Welt + Sprache gespeichert:

- **`agent_prompts` Tabelle** — speichert `systemPrompt`, `userTemplate`, `outputFormat` pro Welt + Sprache
- **`ui_translations` Tabelle** — speichert UI-Strings pro Sprache + Seite (agents, settings, agent_names, agent_descs)
- **Dual-write Strategie** — Schreibvorgänge erfolgen sowohl in SQLite als auch in JSON-Dateien für Abwärtskompatibilität
- **Sprachbezogene Prompts** — jede Welt kann ihre eigene Sprache haben, die bestimmt, welche Prompts geladen werden
- **Automatisches Befüllen** — beim ersten Start werden alle 7 Sprachen in `ui_translations` befüllt

**Speicherhierarchie:**
1. **SQLite** (`tns.db`) — primärer Speicher, pro Welt + Sprache
2. **JSON-Dateien** (`worlds/{world}/agents/{agentId}.json`) — Fallback während der Migration
3. **Hardcoded-Defaults** (`DEFAULT_PROMPTS` in `src/services/agent-config.ts`)

### i18n API-Endpunkte
Neue REST-API für Übersetzungsverwaltung:

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/i18n/translations/:lang/:page` | Übersetzungen für Sprache + Seite abrufen |
| GET | `/api/i18n/translations/:lang` | Alle Übersetzungen für eine Sprache abrufen |
| PUT | `/api/i18n/translations` | Batch-Übersetzungen aktualisieren |
| DELETE | `/api/i18n/translations/:lang/:page/:key` | Übersetzungsschlüssel löschen |

**Beispielanfrage (PUT):**
```json
{
  "language": "de",
  "page": "agents",
  "entries": {
    "title": "Agenten-Konfiguration",
    "savePrompts": "Prompts speichern"
  }
}
```

### Sprachbezogene Agent-Prompts
Agent-Prompts unterstützen jetzt die Speicherung pro Welt und Sprache:

```sql
CREATE TABLE agent_prompts (
  world TEXT NOT NULL DEFAULT 'default',
  agent_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  system_prompt TEXT NOT NULL DEFAULT '',
  user_template TEXT NOT NULL DEFAULT '',
  output_format TEXT NOT NULL DEFAULT '',
  UNIQUE(world, agent_id, language)
);
```

**API-Endpunkte für sprachbezogene Prompts:**
- `GET /api/agents/:id/prompts/:lang` — Prompts für bestimmte Sprache abrufen
- `PUT /api/agents/:id/prompts/:lang` — Prompts für bestimmte Sprache aktualisieren

### Frontend-i18n-Integration
Frontend-Seiten laden Übersetzungen jetzt aus SQLite über die API:

```javascript
// agents.html
async function loadTranslations(langCode) {
  const res = await fetch(`/api/i18n/translations/${langCode}/agents`);
  const data = await res.json();
  remoteTranslations = data.translations || {};
}

function t(key) {
  if (remoteTranslations[key] !== undefined) return remoteTranslations[key];
  return I18N[lang]?.[key] ?? I18N.en[key] ?? key;
}
```

### Neue spezialisierte Agenten (v0.10.3)
Fünf neue Agenten für Weltanreicherung und Spielerinteraktion:

- **Historiker** — erinnert und erzählt historische Ereignisse, Lore und Chronologie
- **Kartograph** — liefert Informationen über Orte, Entfernungen, Wege und Geographie
- **Kaufmann** — handelt mit Handel, Preisgestaltung und NPC-Inventarverwaltung
- **Quest-Geber** — generiert kontextbezogene Quests basierend auf dem Weltzustand mit Zielen und Belohnungen
- **Wissenshüter** — pflegt Weltfakten, Magieregeln, Rasseninformationen und etabliertes Kanon

Jeder Agent hat eigene System-Prompts, Benutzervorlagen und Ausgabeformate in `src/services/agent-config.ts`.

### RAG-System für alle Agenten (v0.10.3)
Vollständige Embedding-Unterstützung mit Langzeitgedächtnis für jeden Agenten:

- **llama.cpp Embedding Server** — dediziertes BGE-M3-Modell auf Port 5002 für Vektorgenerierung
- **SQLite Hybrid-Suche** — FTS5-Schlüsselwortsuche + dichte Vektorsuche + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — pro-Agent-, pro-Sessions-Isolierung über `role`-Spalte
- **Welten-isoliertes Gedächtnis** — Gedächtnis ist pro Welt isoliert, um Halluzinationen aus anderen Welten zu verhindern
- **Mojo Graph-Operationen** — Vektoroperationen über Mojo FFI für Performance (Kosinusähnlichkeit, L2-Abstand)

**Architektur:**
```
Agent-Anfrage → AgentMemoryStore → SQLite (Hybrid-Suche)
                                      ↓
                              ┌───────┴───────┐
                              │ FTS5 (LIKE)   │ Dichte Vektoren (BGE-M3)
                              │ Schlüsselwort │ Kosinusähnlichkeit
                              └───────┬───────┘
                                      ↓
                              Reciprocal Rank Fusion (RRF)
                                      ↓
                              Kontext für LLM-Prompt
```

**Schlüsseldateien:**
- `src/lib/agent-memory-store.ts` — AgentMemoryStore mit Embedding-Integration
- `src/lib/sqlite-store.ts` — SQLiteStore mit FTS5 + Vektorsuche + RRF
- `src/lib/vector-ops.ts` — Vektoroperationen (Kosinus, L2, Skalarprodukt)

### NPC-System Überarbeitung (v0.10.3)
Vier neue Dienste für intelligentes NPC-Verhalten:

- **MemoryEngine** — semantische Suche, Emotions-/Ortsfilterung, Speicherclustering über episodische NPC-Gedächtnisse
- **BehaviorEngine** — autonome Aktionen, Zielbewertung, Tagesroutinen, Stimmungsanpassung, Entscheidungsfindung
- **SocialGraph** — Beziehungsverfolgung, Reputationsscores, gemeinsame Freunde, Fraktionszugehörigkeit und Konflikte
- **DialogueContext** — angereicherte NPC-Prompts, die Beziehungen, Gedächtnis, Stimmung, Standort, Fraktion, Ziele und Inventar kombinieren

**Architektur:** Zwei parallele Tracks — Track 1 (Gedächtnis + Verhalten) baut die Grundlage, Track 2 (Soziale Verbindungen + Dialog) fügt benutzerfreundliche Funktionen hinzu.

**Integration:** `NPCAgent.initialize(runtime, statePath)` erstellt alle vier Komponenten. Fallback auf Template/PromptBuilder wenn DialogueContext nicht initialisiert.

### Researcher-Agent (v0.10.3)
Neuer Agent für Faktencheck und Realismusvalidierung:
- **`verifyRecipe()`** – validiert Crafter-Rezepte auf Plausibilität
- **`researchTopic()`** – historische/kulturelle Forschung für Weltbau
- **`validateCharacter()`** – prüft Kleidung, Essen, Alltag der Charaktere
- **`enrichScene()`** – fügt realistische Sinnesdetails zu Szenen hinzu
- **`factCheck()`** – allgemeine Faktenprüfung

### i18n-System
Vollständige Lokalisierung für 7 Sprachen (EN, RU, DE, FR, ES, JA, ZH):
- Alle Agenten-Prompts und UI-Strings
- Agent-Namen und Beschreibungen
- Einstellungsseiten (Agenten, Anbieter, Modelle)
- Server-Start/-Stop-Meldungen

**Struktur** — jede Sprache hat eine eigene Datei unter `src/i18n/`:

```
src/i18n/
├── types.ts    # LanguagePack-Schnittstelle + Language-Typ
├── en.ts       # Englisch (Basispaket – alle Schlüssel hier definiert)
├── ru.ts       # Russisch (erbt EN, überschreibt Übersetzungen)
├── de.ts       # Deutsch
├── fr.ts       # Französisch
├── es.ts       # Spanisch
├── ja.ts       # Japanisch
├── zh.ts       # Chinesisch
└── index.ts    # Barrel-Export, Registrierung, getLanguagePack()
```

**Neue Sprache hinzufügen** (z.B. Koreanisch):

1. `src/i18n/ko.ts` erstellen:
```ts
import { EN } from "./en";
import type { LanguagePack } from "./types";

export const KO: LanguagePack = {
  ...EN,
  code: "ko",
  name: "Korean",
  nativeName: "한국어",
  systemPrompt: "한국어로만 답변하세요.",
  uiSettings: "설정",
  // ... andere Schlüssel überschreiben
};
```

2. In `src/i18n/index.ts` registrieren:
```ts
import { KO } from "./ko";
// zum Language-Typ hinzufügen: "ko"
// zu PACKS hinzufügen: ko: KO
// zum LANGUAGES-Array hinzufügen
```

3. `"ko"` zur `Language`-Union in `src/i18n/types.ts` hinzufügen.

### Server-Verbesserungen
- **PID-Datei-Tracking** (`.server.pid`) – verhindert verwaiste Prozesse
- **Bereinigung beim Start** – tötet automatisch alte Prozesse
- **Graceful Shutdown** – 5-Sekunden SIGTERM-Timeout, dann SIGKILL-Fallback

---

## Migration von Python

Dieses Projekt ist ein TypeScript + Mojo Port von [BRING](https://github.com/Eva-E1/BRING) — einer Python AI-Fantasy-Welt-Plattform. Wichtige Änderungen:

| Komponente | Python | TypeScript |
|------------|--------|------------|
| Web-Framework | FastAPI | Hono (Bun) |
| Runtime | Python asyncio | Bun native async |
| Validierung | Pydantic | Zod |
| Logging | Python logging | Lightweight Logger (Pino-Ersatz) |
| Graph | NetworkX | Benutzerdefinierte Adjazenzmap |
| Vektorsuche | FAISS (Python) | Mojo FFI + lokaler Cosine-Fallback |
| WebSocket | FastAPI WebSocket | Bun native WebSocket |
| Auth | Keine | Cookie-basierte Sitzungen |
| Streaming | SSE (starlette) | ReadableStream + SSE |

---

## Haftungsausschluss

Dieses Projekt wurde mit **Vibe Coding** entwickelt – einem KI-gestützten Entwicklungsansatz, der von [MiMo Code](https://github.com/XiaomiMiMo/MiMo) unterstützt wird. Die Codebasis wurde durch die Zusammenarbeit von Mensch und KI erstellt, was bedeutet:

- Der Code ist **funktional und getestet** – alle Funktionen wie beschrieben
- Einige Bereiche können **suboptimale Muster** enthalten oder von Refactoring profitieren
- Es können **geringe Unterschiede** im Codestil zwischen verschiedenen Modulen auftreten
- Architektur und Logik wurden **vom Menschen überprüft und validiert**

Beiträge zur Verbesserung sind willkommen.

---

## Lizenz

Apache 2.0
