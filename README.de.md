# TrueNeverStory v0.21.0

### Schreibe dein Buch, indem du einfach spielst.

TrueNeverStory ist eine KI-gestützte interaktive Narrativ-Engine. Jeder NPC erinnert sich, jede Handlung hat eine Chance, und die Geschichte hört nie auf. Spiele eine Figur, erkunde eine lebendige Welt und beobachte, wie deine Entscheidungen die Handlung formen — oder lass die Welt sich selbst entwickeln.

Gebaut auf TypeScript (Bun + Hono) mit C FFI Compute-Kernels für leistungskritische Operationen.

**[English](README.md) | [Русский](README.ru.md) | [Français](README.fr.md) | [Español](README.es.md) | [日本語](README.ja.md) | [中文](README.zh.md)**

---

## Funktionen

| Funktion | Beschreibung |
|----------|-------------|
| **Lebendige Welt** | Charaktere, Orte, Gegenstände, Fraktionen — alles in einem Wissensgraphen mit O(1) Zugriff |
| **14 KI-Agenten** | Erzähler, Regisseur, NPC, Szene, Chronist, Planer, Schurke, Forscher, Historiker, Kartograph, Händler, Questgeber, Wissenshüter, Soz. Simulation |
| **Gedächtnis & RAG** | Vektorbasierte Suche (BGE-M3 + SQLite Hybrid FTS5/dicht/RRF) |
| **Wahrscheinlichkeitssystem** | Deterministische Ergebnisse für Kampf, Überredung, Heimlichkeit, Romantik |
| **Romanze & Soziales** | Beziehungsmanagement, Fraktionen, Allianzen, feudale Hierarchie, NPC-Dialoge |
| **Quest-System** | Dynamische Quest-Generierung, Ziele, Belohnungen, Ketten, Zeitlimits |
| **Inventar & Handel** | Gegenstände mit Seltenheit, Statistiken, Ausrüstung, Gold, NPC-Handel |
| **NPC-Ökonomie** | Feudale Hierarchie (10 Ränge), Steuern, Nahrungsproduktion, Familiensystem, 34 Archetypen |
| **Regel-Engine** | 14 vordefinierte soziale/ökonomische Systeme (Feudalismus, Demokratie, Anarchie usw.) mit Synergie-Matrix |
| **Multi-Welten** | Isolierte Weltenausführung mit Ressourcen-Monitoring (Speicher, CPU, Token) |
| **Cross-Welt** | Event-Kommunikation zwischen Welten mit Portalen und geteilter Erinnerung |
| **Plugin-System** | Erweiterbare Architektur mit Plugin-Manager, Lifecycle-Hooks und API |
| **Feature-Flags** | A/B-Testing, schrittweiser Rollout, Hash-basiertes Targeting |
| **API-Versionierung** | v1/v2 Endpunkte mit Deprecation-Headern |
| **Echtzeit-Streaming** | WebSocket + SSE für Live-Erzählung |
| **i18n (7 Sprachen)** | EN, RU, DE, FR, ES, JA, ZH |
| **Passwort-Auth** | Sitzungsbasiert mit HttpOnly Cookies, CSRF-Schutz, SQLite-gestützte Sitzungen |
| **SQLite-Speicher** | Entitäten, Embeddings, Erinnerungen, Prompts, Übersetzungen |
| **Circuit Breaker** | Automatischer LLM-Provider-Failover mit Fallback-Kette |
| **Strukturiertes Logging** | Trace-IDs, Correlation-IDs, Metriken für Multi-Agent-Workflows |

---

## Unterstützte Plattformen

| Plattform | Status | Hinweise |
|-----------|:------:|---------|
| Linux x86_64 | ✅ | Volle Unterstützung, FFI-Kernels |
| Linux ARM64 | ✅ | Volle Unterstützung, FFI-Kernels |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

---

## Schnellstart

**Kein Bun, Node.js oder andere Laufzeitumgebung nötig.** Einfach herunterladen und starten.

### 1. Herunterladen

Das neueste Release für deine Plattform von [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Plattform | Datei |
|-----------|-------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Starten

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

### 3. Öffnen

**http://localhost:8000** öffnen — Passwort: **`changeme`**

Passwort nach dem ersten Login in den Einstellungen ändern.

Das war's. Keine Datenbank-Installation, keine Pakete, keine Konfigurationsdateien.

---

## LLM konfigurieren

Einstellungsseite öffnen oder `.env` bearbeiten:

### Ollama (lokal, kostenlos)

```bash
ollama pull llama3
ollama serve
```

```
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
```

### OpenAI

```
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
```

### LM Studio

```
WORLD_LLM_BASE_URL=http://localhost:1234/v1
WORLD_LLM_API_KEY=lm-studio
WORLD_LLM_MODEL=your-model
```

Funktioniert auch mit vLLM, Anthropic, Google und jeder OpenAI-kompatiblen API.

---

## Projektstruktur

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod-validierte Umgebungskonfiguration
│   ├── lib/              # LLM-Client, SQLite Store, Vektoroperationen, Circuit Breaker, Feature-Flags
│   ├── memory/           # WorldMemory, kognitiver Pipeline
│   ├── middleware/        # Auth, Rate Limiter, Sicherheitsheader, Logger
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── plugins/          # Plugin-Schnittstelle und Manager
│   ├── routes/           # API-Routen (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # Regel-Engine (14 Regeln, Synergie-Matrix, Technologie-Abhängigkeiten)
│   ├── services/         # 55+ Dienste (Rollenspiel-Engine, Agenten, Ökonomie, Welt-Isolierung, Cross-Welt-Bus)
│   ├── intelligence/     # Graph-Analyse, Duplikaterkennung
│   ├── i18n/             # Sprachpakete (7 Sprachen)
│   ├── store/            # EntityStore mit O(1) NameIndex, WorldStore
│   └── utils/            # Logger, Hash, Sanitizer, Template-Resolver
├── mojo/kernels/         # C FFI Compute-Kernels (compiliert via Zig)
├── public/               # Web-UI (Terminal-Stil)
├── worlds/               # Weltdaten (SQLite DB, Entitäten, Sitzungen)
├── conf/                 # Konfiguration (Einstellungen, Agenten, Provider, Registry)
└── tests/                # Test-Suite
```

---

## API

### Authentifizierung

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/login` | Login-Seite |
| POST | `/login` | Authentifizierung |
| POST | `/logout` | Sitzung beenden |

### Chat & Rollenspiel

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| POST | `/api/chat/setup` | Sitzung initialisieren |
| POST | `/api/chat/message` | Nachricht senden |
| POST | `/api/chat/stream` | SSE-Streaming |
| GET | `/api/chat/session` | Aktueller Sitzungsstatus |
| GET | `/api/chat/history` | Gesprächsverlauf |

### Entitäten & Graph

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/api/entity/:uid` | Entitätsdetails |
| GET | `/api/neighbors/:uid` | Nachbarn mit Tiefen-Traversal |
| GET | `/api/search?q=` | Suche nach Name oder Semantik |
| GET | `/api/graph/summary` | Graph-Statistiken |

### Agenten & i18n

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/api/agents` | Agenten-Konfigurationen |
| PUT | `/api/agents/:id` | Agent aktualisieren |
| PUT | `/api/agents/:id/prompts/:lang` | Prompts pro Sprache |
| GET | `/api/i18n/translations/:lang/:page` | Übersetzungen |

### Regel-Engine

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/api/rules` | Verfügbare Regeln |
| GET | `/api/rules/:id` | Regeldetails |
| POST | `/api/rules/validate` | Regel-JSON validieren |

### Cross-Welt

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/api/cross-world/status` | Cross-Welt-Status |
| POST | `/api/cross-world/enable` | Cross-Welt aktivieren |
| POST | `/api/cross-world/disable` | Cross-Welt deaktivieren |
| GET | `/api/cross-world/portals` | Portale auflisten |
| POST | `/api/cross-world/portals` | Portal erstellen |
| DELETE | `/api/cross-world/portals/:id` | Portal löschen |
| GET | `/api/cross-world/events` | Event-Log |

### Plugins

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/api/plugins` | Registrierte Plugins |
| GET | `/api/plugins/:id` | Plugin-Details |
| GET | `/api/plugins/:id/capabilities` | Plugin-Fähigkeiten |

### Feature-Flags

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/api/feature-flags` | Feature-Flags |
| PUT | `/api/feature-flags/:id` | Feature-Flag aktualisieren |

### WebSocket

| Endpunkt | Beschreibung |
|----------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Echtzeit-Rollenspiel-Streaming |

---

## Beispiele

### API

```bash
# Login
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# Sitzung einrichten
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# Nachricht senden
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Ich ziehe mein Schwert und stelle dem Drachen entgegen"}'

# Verfügbare Regeln
curl -b cookies.txt "http://localhost:8000/api/rules"

# Cross-Welt-Portal erstellen
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

---

## Für Entwickler

Vollständige Architektur-Dokumentation, DI-Container-Referenz und Contributing-Guide: [DEV.README.de.md](docs/DEV.README.de.md)

### Voraussetzungen

- [Bun](https://bun.sh) v1.0+

### Einrichtung

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

### Befehle

| Befehl | Beschreibung |
|--------|-------------|
| `bun run dev` | Entwicklung mit Hot Reload |
| `bun run start` | Produktionsmodus |
| `bun run lint` | Typprüfung |
| `bun test` | Test-Suite ausführen |
| `bun run build` | Bundle erstellen |

---

## Binary-Builds

Cross-Kompilierung via Zig:

```bash
cd mojo/kernels
./build.sh native           # Aktuelle Plattform
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # Alle Targets
```

Siehe [COMPILE.md](docs/COMPILE.md). GitHub Actions baut alle Plattformen automatisch bei Tag-Push.

---

## Letzte Änderungen

### v0.21.0 — Theme-System-Fix

- Korrigiert `theme-custom.css` — CSS-Variablensyntax korrigiert (verwendete `var()` statt `--name: value`)
- Fehlende Variablen `--accent-subtle`, `--success-subtle`, `--warning-subtle`, `--interactive-subtle` zum benutzerdefinierten Theme hinzugefügt
- Alle 5 Themes (Dunkel, Hell, Terminal, Cyberpunk, Benutzerdefiniert) funktionieren jetzt korrekt über die Selektor-Buttons

### v0.20.4 — World-Graph-Fix + Statistik-Modal + Sprachinjektion + Themes

- Behoben: Totes `buildRelationships()` — heuristische Beziehungen werden beim Start automatisch aufgebaut
- Neuer Endpunkt `GET /worlds/:name/detail` für Weltstatistiken
- Neues Statistik-Modal mit Entitätslisten, Regeln und Charakterdetails
- Sprach-Injektion — LLM-Antworten entsprechen der UI-Sprache (7 Sprachen)
- Theme-System — 5 integrierte Themes (Dunkel, Hell, Terminal, Cyberpunk, Benutzerdefiniert) + Konstruktor

### v0.20.1 — Regel-Engine Binary Fix

- Behoben: `/api/rules` Absturz im kompilierten Bun-Binary
- `import.meta.dir` durch `process.cwd()` für die Verzeichnisauflösung ersetzt
- Behebt ENOENT-Fehler (`/$bunfs/root/../rules/social`) im kompilierten Binary
- Betroffene Dateien: `src/routes/rules.ts` und `src/rules/rules-engine.ts`

### v0.20.0 — Architekturverbesserungen

Komplette architektonische Überarbeitung in 5 Etappen:

**Etappe 1-2:**
- NarrativeService Aufteilung (Bootstrapper + Facade + Service)
- Einheitliches Agenten-Modell mit Schnittstelle und Basisklasse
- Event Sourcing mit Domänen-Events und Snapshots
- Circuit Breaker für LLM mit automatischem Failover
- Agenten-Registry mit 4 Quelltypen (builtin, config, api, plugin)
- Strukturiertes Logging mit Trace- und Correlation-IDs

**Etappe 3:**
- Regel-Engine — 14 vordefinierte Systeme (Feudalismus, Demokratie, Anarchie usw.)
- Synergie-Matrix, Technologie-Abhängigkeiten, Glück-Modifikatoren
- Regel-Validator und kulturelle Drift-Modellierung
- Feature-Flags mit A/B-Testing und schrittweisem Rollout
- API-Versionierung (v1/v2) mit Deprecation-Headern
- WorldStore — SQLite-Migration für Weltdaten

**Etappe 4:**
- Multi-Welten-Isolierung mit Ressourcen-Monitoring
- Cross-Welt-Kommunikation mit Portalen und Events
- Plugin-System mit Manager und Lifecycle-Hooks

**Etappe 5:**
- Dokumentationsaktualisierungen (ARCHITECTURE, API, PLUGIN-GUIDE, MIGRATION)

→ [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | [MIGRATION.md](docs/MIGRATION.md)

### v0.15.0 — Sicherheitsverbesserungen

- SQLite-gestützte Sitzungen
- WebSocket-Token-Validierung
- Path-Traversal-Schutz
- CSRF-Schutz beim Login
- Secure Cookie-Flag, hartes CSP
- Fehlermeldungen sanitisiert

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

### v0.14.1 — C FFI-Kernels & Cross-Kompilierung

- 5 Compute-Kernels von Mojo zu reinem C portiert
- Zig Cross-Kompilierung für 10 Plattformen
- Pause/Resume Hintergrundverarbeitung

---

## Lizenz

---

🔗 **Projekt:** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
