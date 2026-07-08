# TrueNeverStory v0.22.2

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
| **Echtzeit-Streaming** | WebSocket + SSE für Live-Erzählung |
| **i18n (7 Sprachen)** | EN, RU, DE, FR, ES, JA, ZH |
| **Passwort-Auth** | Sitzungsbasiert mit HttpOnly Cookies, CSRF-Schutz |
| **SQLite-Speicher** | Entitäten, Embeddings, Erinnerungen, Prompts, Übersetzungen |

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
chmod +x startgame.sh
./startgame.sh          # Standard: --remote

# Windows PowerShell
tar xzf tns-windows-x64.zip
cd tns-windows-x64
.\startgame.ps1         # Standard: --remote
```

Startoptionen:
- `--local` — mit lokaler Ollama-Instanz verbinden
- `--remote` — Remote-LLM-API verwenden (Standard)

#### Aus dem Quellcode

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

Öffne **http://localhost:8000**

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
│   ├── lib/              # LLM-Client, SQLite Store, Vektoroperationen
│   ├── memory/           # WorldMemory, kognitiver Pipeline
│   ├── middleware/        # Auth, Rate Limiter, Sicherheitsheader
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── routes/           # API-Routen (chat, entities, agents, settings)
│   ├── services/         # 52 Dienste (Rollenspiel-Engine, Agenten, Ökonomie)
│   ├── intelligence/     # Graph-Analyse, Duplikaterkennung
│   ├── i18n/             # Sprachpakete (7 Sprachen)
│   ├── store/            # EntityStore mit O(1) NameIndex
│   └── utils/            # Logger, Hash, Sanitizer, Template-Resolver
├── mojo/kernels/         # C FFI Compute-Kernels (compiliert via Zig)
├── public/               # Web-UI (Terminal-Stil)
├── worlds/               # Weltdaten (SQLite DB, Entitäten, Sitzungen)
├── conf/                 # Konfiguration
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

### v0.15.0 — Sicherheitsverbesserungen

- SQLite-gestützte Sitzungen
- WebSocket-Token-Validierung
- Path-Traversal-Schutz
 CSRF-Schutz beim Login
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
