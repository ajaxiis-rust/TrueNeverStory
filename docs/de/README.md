# TrueNeverStory v0.28.0

### Schreibe dein Buch, indem du einfach spielst.

TrueNeverStory ist eine KI-gestuetzte interaktive Narrativ-Engine mit **State-First-Architektur**. Jeder NPC erinnert sich, jede Handlung hat ein deterministisches Ergebnis, und die Geschichte hoert nie auf. Spiele eine Figur, erkunde eine lebendige Welt und beobachte, wie deine Entscheidungen die Handlung formen — oder lass die Welt sich selbst entwickeln.

Gebaut auf TypeScript (Bun + Hono) mit C FFI Compute-Kernels fuer leistungskritische Operationen.

**[English](../../README.md) | [Русский](../ru/README.md) | [Français](../fr/README.md) | [Español](../es/README.md) | [日本語](../ja/README.md) | [中文](../zh/README.md)**

---

## Was ist neu in v0.28.0

### Bibel-DB-Optimierung
- **FTS5-Suche** — Ersetzt `LIKE '%query%'` durch FTS5 `MATCH` fuer O(1) Volltextanfragen (mit Fallback auf LIKE)
- **Batch-Graph-Traversierung** — `getRelatedVerses()` verwendet jetzt Batch-Abfragen `IN (...)` statt N einzelner Abfragen (N+1 → 1)
- **Verse-Indizes** — `idx_verses_book_chapter` hinzugefuegt zum Beschleunigen gefilterter Abfragen
- **Charakter-System** — Neues `CharacterDB` mit 3 Tabellen: `bible_characters`, `bible_character_edges`, `bible_character_mentions`
- **Namenlexikon** — 40+ biblische Charaktere mit mehrsprachigen Varianten (EN/RU/HE/EL)
- **MCP-Tools fuer Charaktere** — `searchCharacters`, `getCharacter`, `getCharacterEdges`, `getVerseCharacters`
- **Git-Bereinigung** — 177MB Quelldateien + 59MB kompilierte DB aus dem Tracking entfernt
- **Build-Skripte** — `download-sources.sh` + `bootstrap-bible-db.ts` fuer die Client-Einrichtung

## Was ist neu in v0.28.0

### State-First-Pipeline
Die Engine verarbeitet Aktionen nun **deterministisch, bevor Text generiert wird**:
1. **Intent-Parser** — Zod-validierte strukturierte Intents ersetzen Regex-Routing
2. **Simulations-Engine** — Mojo FFI berechnet Ergebnisse vor der Prosa-Generierung
3. **State-Mutator** — EntityStore wird sofort nach der Logik aktualisiert
4. **Context-Builder** — Gemeinsamer Spielkontext fuer alle Agenten
5. **Prosa-Generierung** — LLM generiert Text, der durch Simulationsergebnisse eingeschraenkt ist

### MCP-Integration (Literatur-als-Code)
- **Bible als stdlib** — Biblische Muster als narrative Archetypen (SQLite + MCP)
- **Gutenberg als Style CSS** — Delexifizierte stilistische Muster fuer Prosa-Rendering
- **Wikipedia als Validator** — Historische Faktenpruefung ueber externes Wissen

### Die Sechs Großen Agenten
14 Agenten zu 6 spezialisierten Rollen zusammengefasst:

| Agent | Rolle | Beschreibung |
|-------|-------|-------------|
| **Dramaturg** | Der Architekt | Waehlt narrative Muster aus Bible-Archetypen |
| **Validator** | Der Faktenpruefer | Verifiziert Fakten ueber Wikipedia MCP |
| **Stylist** | Der Erzaehler | Rendert Prosa mit Gutenberg-Stilmustern |
| **Actor** | NPC-Ensemble | Verwaltet NPC-Dialoge mit L3-versteckten Motivationen |
| **Censor** | Linter | Entfernt KI-Klischees und erzwingt Stilkonsistenz |
| **Chronicler** | Welt-Gedaechtnis | Aktualisiert Timeline und Weltzustand |

### System-Heartbeat
Echtzeit-Fortschrittsanzeigen in der Chat-UI:
- "Eingabe wird verstanden..."
- "Wuerfel werden geworfen..."
- "Ergebnis: Erfolg (73%)"
- "Erzaehlung wird geweben..."
- "Abgeschlossen"

### Interlingua (Englisch als interne Sprache)
Alle Agent-zu-Agent- und Agent-zu-MCP-Operationen verwenden Englisch fuer Token-Effizienz und Genauigkeit. Die Uebersetzung erfolgt an der Ausgabegrenze.

---

## Funktionen

| Funktion | Beschreibung |
|----------|-------------|
| **State-First-Pipeline** | Deterministische Simulation -> State-Mutation -> eingeschraenkte Prosa-Generierung |
| **6 KI-Agenten** | Dramaturg, Validator, Stylist, Actor, Censor, Chronicler |
| **MCP-Integration** | Bible-Muster, Gutenberg-Stile, Wikipedia-Validierung |
| **Lebendige Welt** | Charaktere, Orte, Gegenstaende, Fraktionen — alles in einem Wissensgraphen mit O(1) Zugriff |
| **Gedaechtnis & RAG** | Vektorbasierte Suche (BGE-M3 + SQLite Hybrid FTS5/dicht/RRF) |
| **Wahrscheinlichkeitssystem** | Deterministische Ergebnisse fuer Kampf, Ueberredung, Heimlichkeit, Romantik |
| **Romanze & Soziales** | Beziehungsmanagement, Fraktionen, Allianzen, feudale Hierarchie, NPC-Dialoge |
| **Quest-System** | Dynamische Quest-Generierung, Ziele, Belohnungen, Ketten, Zeitlimits |
| **Inventar & Handel** | Gegenstaende mit Seltenheit, Statistiken, Ausruestung, Gold, NPC-Handel |
| **NPC-Oekonomie** | Feudale Hierarchie (10 Raenge), Steuern, Nahrungsproduktion, Familiensystem, 34 Archetypen |
| **Regel-Engine** | 14 vordefinierte soziale/okonomische Systeme (Feudalismus, Demokratie, Anarchie usw.) mit Synergie-Matrix |
| **Multi-Welten** | Isolierte Weltenausfuhrung mit Ressourcen-Monitoring (Speicher, CPU, Token) |
| **Cross-Welt** | Event-Kommunikation zwischen Welten mit Portalen und geteilter Erinnerung |
| **Plugin-System** | Erweiterbare Architektur mit Plugin-Manager, Lifecycle-Hooks und API |
| **Feature-Flags** | A/B-Testing, schrittweiser Rollout, Hash-basiertes Targeting |
| **API-Versionierung** | v1/v2 Endpunkte mit Deprecation-Headern |
| **Echtzeit-Streaming** | WebSocket + SSE fuer Live-Erzahlung mit Heartbeat-Fortschritt |
| **i18n (7 Sprachen)** | EN, RU, DE, FR, ES, JA, ZH — UI, Prompts, Agenten-Namen |
| **Passwort-Auth** | Sitzungsbasiert mit HttpOnly Cookies, CSRF-Schutz, SQLite-gestuetzte Sitzungen |
| **SQLite-Speicher** | Entitaeten, Embeddings, Erinnerungen, Prompts, Uebersetzungen |
| **Circuit Breaker** | Automatischer LLM-Provider-Failover mit Fallback-Kette |
| **Strukturiertes Logging** | Trace-IDs, Correlation-IDs, Metriken fuer Multi-Agent-Workflows |

---

## Unterstuetzte Plattformen

| Plattform | Status | Hinweise |
|-----------|:------:|---------|
| Linux x86_64 | ✅ | Volle Unterstuetzung, FFI-Kernels |
| Linux ARM64 | ✅ | Volle Unterstuetzung, FFI-Kernels |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

Der Server erkennt FFI-Kernels automatisch — fallback auf reines TypeScript, wenn nicht verfuegbar.

---

## Schnellstart

**Kein Bun, Node.js oder andere Laufzeitumgebung noetig.** Einfach herunterladen und starten.

### 1. Herunterladen

Das neueste Release fuer deine Plattform von [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Plattform | Datei |
|-----------|-------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Starten

Der Launcher erkennt automatisch deinen LLM-Provider (Ollama, LM Studio, OpenAI, llama.cpp), konfiguriert `.env` und startet den Server.

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x startgame.sh
./startgame.sh

# Windows (PowerShell)
# tns-windows-x64.zip entpacken, dann:
.\startgame.ps1
```

**Startoptionen:**
```bash
./startgame.sh --local    # CORS=localhost only (sicher fuer Entwicklung)
./startgame.sh --remote   # CORS=* (Standard, erlaubt externen Zugriff)
```

**Aus Quellcode (benötigt Bun):**
```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
./startgame.sh            # Linux/macOS
.\startgame.ps1           # Windows PowerShell
```

### 3. Oeffnen

**http://localhost:8000** oeffnen — Passwort: **`changeme`**

Passwort nach dem ersten Login in den Einstellungen aendern.

Das war's. Keine Datenbank-Installation, keine Pakete, keine Konfigurationsdateien.

---

## LLM konfigurieren

Einstellungsseite oeffnen oder `.env` bearbeiten:

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
│   ├── lib/              # LLM-Client, SQLite Store, Vektoroperationen, Session Store, Circuit Breaker, Feature-Flags
│   ├── memory/           # WorldMemory, kognitive Pipeline, Entitaeten-Extraktion
│   ├── middleware/        # Auth, Rate Limiter, Sicherheitsheader, CORS, Logger
│   ├── models/           # Entity, chat, probability, romance, quest, item, intent, simulation, heartbeat
│   ├── mcp/              # MCP-Server, Bible/Gutenberg-Parser, Wikipedia-Tools
│   ├── plugins/          # Plugin-Schnittstelle und Manager
│   ├── routes/           # API-Routen (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # Regel-Engine (14 Regeln, Synergie-Matrix, Technologie-Abhaengigkeiten)
│   ├── services/         # 60+ Dienste (Rollenspiel-Engine, Agenten, Oekonomie, Welt-Isolierung, Cross-Welt-Bus)
│   │   ├── agents/       # v0.28.0 neue Agenten (Dramaturg, Validator, Stylist, Actor, Censor, Chronicler)
│   │   └── ...
│   ├── intelligence/     # Graph-Analyse, Duplikaterkennung, Empfehlungssystem
│   ├── i18n/             # Sprachpakete (7 Sprachen)
│   ├── store/            # EntityStore mit O(1) NameIndex, WorldStore
│   └── utils/            # Logger, Hash, Sanitizer, Template-Resolver
├── mojo/kernels/         # C FFI Compute-Kernels (compiliert via Zig)
├── public/               # Web-UI (Terminal-Stil mit Heartbeat-Fortschritt)
├── worlds/               # Weltdaten (SQLite DB, Entitaeten, Sitzungen)
├── conf/                 # Konfiguration (Einstellungen, Agenten, Provider, Registry)
└── tests/                # Test-Suite
```

---

## Architektur: State-First-Pipeline

```
Spieler-Eingabe
  │
  ▼
Intent-Parser (Zod-Validierung)
  │
  ▼
Simulations-Engine (Mojo FFI)
  │ Ergebnis, Wahrscheinlichkeit, State-Aenderungen
  ▼
State-Mutator (EntityStore L1-L3)
  │
  ▼
Context-Builder (gemeinsamer Spielzustand)
  │
  ▼
Dramaturg (Bible-Muster-Auswahl via MCP)
  │
  ▼
Stylist (Gutenberg-Stil-Rendering via MCP)
  │
  ▼
Censor (KI-Klischee-Entfernung)
  │
  ▼
Uebersetzungsdienst (Englisch -> Benutzersprache)
  │
  ▼
Antwort an den Benutzer
```

---

## API

### Authentifizierung

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/login` | Login-Seite |
| POST | `/login` | Authentifizierung (`password=...`) |
| POST | `/logout` | Sitzung beenden |

### Chat & Rollenspiel

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| POST | `/api/chat/setup` | Sitzung initialisieren (Charakter, Ort, Rolle) |
| POST | `/api/chat/message` | Nachricht senden, Erzaehlung erhalten |
| POST | `/api/chat/stream` | SSE-Streaming mit Heartbeat |
| GET | `/api/chat/session` | Aktueller Sitzungsstatus |
| GET | `/api/chat/history` | Gespraechsverlauf |

### Entitaeten & Graph

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/api/entity/:uid` | Entitaetsdetails |
| GET | `/api/neighbors/:uid` | Nachbarn mit Tiefen-Traversal |
| GET | `/api/path?source=&target=` | Kuerzester Weg zwischen Entitaeten |
| GET | `/api/search?q=` | Suche nach Name oder Semantik |
| GET | `/api/graph/summary` | Graph-Statistiken |

### Agenten & i18n

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/api/agents` | Agenten-Konfigurationen |
| PUT | `/api/agents/:id` | Agent aktualisieren |
| PUT | `/api/agents/:id/prompts/:lang` | Prompts pro Sprache |
| GET | `/api/i18n/translations/:lang/:page` | Uebersetzungen |
| PUT | `/api/i18n/translations` | Uebersetzungen einfuegen/aktualisieren |

### Regel-Engine

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/api/rules` | Verfuegbare Regeln |
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
| DELETE | `/api/cross-world/portals/:id` | Portal loeschen |
| GET | `/api/cross-world/events` | Event-Log |

### Plugins

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/api/plugins` | Registrierte Plugins |
| GET | `/api/plugins/:id` | Plugin-Details |
| GET | `/api/plugins/:id/capabilities` | Plugin-Faehigkeiten |

### Feature-Flags

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| GET | `/api/feature-flags` | Feature-Flags |
| PUT | `/api/feature-flags/:id` | Feature-Flag aktualisieren |

### System

| Methode | Endpunkt | Beschreibung |
|---------|----------|-------------|
| POST | `/api/system/pause` | Hintergrundverarbeitung pausieren |
| POST | `/api/system/resume` | Hintergrundverarbeitung fortsetzen |
| GET | `/api/health` | Gesundheitscheck |

### WebSocket

| Endpunkt | Beschreibung |
|----------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Echtzeit-Rollenspiel-Streaming mit Heartbeat |

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

# Entitaeten suchen
curl -b cookies.txt "http://localhost:8000/api/search?q=dragon"

# Verfuegbare Regeln
curl -b cookies.txt "http://localhost:8000/api/rules"

# Cross-Welt-Portal erstellen
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

### SSE-Streaming mit Heartbeat

```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: 'Ich erforsche die alten Ruinen' }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));
    
    if (event.type === 'heartbeat') {
      console.log(`Fortschritt: ${event.message} (${event.progress * 100}%)`);
    } else if (event.type === 'chunk') {
      process.stdout.write(event.content);
    }
  }
}
```

---

## Fuer Entwickler

Vollstaendige Architektur-Dokumentation, DI-Container-Referenz und Contributing-Guide: [DEV.README.md](DEV.README.md)

### Voraussetzungen

- [Bun](https://bun.sh) v1.0+

### Einrichtung

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

http://localhost:8000 oeffnen

### Befehle

| Befehl | Beschreibung |
|--------|-------------|
| `bun run dev` | Entwicklung mit Hot Reload |
| `bun run start` | Produktionsmodus |
| `bun run lint` | Typprufung |
| `bun test` | Test-Suite ausfuehren |
| `bun run build` | Bundle erstellen |

---

## Binary-Builds

Cross-Kompilierung via Zig fuer alle Plattformen:

```bash
cd mojo/kernels
./build.sh native           # Aktuelle Plattform
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # Alle Targets
```

Server-Binary kompilieren:

```bash
bun build --compile --outfile tns-server src/index.ts
```

Siehe [COMPILE.md](../COMPILE.md). GitHub Actions baut alle Plattformen automatisch bei Tag-Push.

---

## Letzte Aenderungen

### v0.28.0 — Bibel-DB-Optimierung

**Leistung:**
- FTS5-Suche mit Fallback auf LIKE — O(n) → O(1) Volltextanfragen
- Batch-Graph-Traversierung — N+1 → 1 SQL-Abfragen fuer Verse-Beziehungen
- Verse-Indizes + VACUUM-Methode fuer DB-Kompaktierung

**Funktionen:**
- Charakter-System (CharacterDB mit 3 SQLite-Tabellen)
- Lexikon biblischer Namen (40+ Charaktere, Varianten EN/RU/HE/EL)
- MCP-Tools: Suche, Abruf, Beziehungen, Erwaehnungen, Verse-Charaktere
- gzip-Unterstuetzung fuer Quelldateien der Bibel
- Download-Skripte und Bootstrap fuer Client-Einrichtung

**Wartung:**
- 177MB Quellen + 59MB kompilierte DB aus Git entfernt
- .gitignore fuer Quellen und kompilierte DB hinzugefuegt

### v0.28.0 — Literary Compiler & Oekonomische Modelle

**Literary Compiler (Phasen 0-6):**
- 4 Offline-Analyse-Durchgaenge: Dramaturgisch, Stilistisch, Emotionale, Metadaten
- SQL-Schema mit FTS5 fuer Quest-Template-Suche
- Linter fuer Validierung, Deduplizierung und Klischee-Erkennung
- Anti-Moralizing-Prompt fuer Stylist-Agent

**Oekonomische Modelle:**
- JubileeManager — Schuldenreset alle 50 Jahre, Landrueckgabe, Loyalitaets-Boost
- FactionTaxDilemma — automatisch generierte Steuerstreitigkeiten zwischen Fraktionen
- FactionLaborRules — per-Fraktion feste/propotionale Loehne, Loyalitaetskonflikte
- EconomicCycles — Joseph-Modell mit Ueberfluss/UEbergang/Hungersnot-Zyklen

**Oekonomische Integration:**
- EconomicService Fassade fuer alle 4 oekonomischen Modelle
- DirectorLoop-Integration: Zyklus-Uebergaenge, Jubilaeums-Events, Dilemma-Generierung
- NPC-Economy Lohnregeln-Integration mit Lohnberechnung
- 7 neue MCP-Werkzeuge: get_economic_phase, get_price_modifier, calculate_price, get_wage, generate_dilemma, check_jubilee, get_jubilee_info

**Bugfixes:**
- Ungenutzte Abhaengigkeit `better-sqlite3` entfernt (Projekt nutzt `bun:sqlite`)
- Hardcodierte Fraktionsnamen in Dilemma-Optionen behoben — nutzt jetzt echte Namen
- Hardcoded-Fraktionsliste in DirectorLoop behoben — liest jetzt aus World-Konfig
- Jahresapproximation Drift behoben — nutzt `getFullYear()` statt manueller Berechnung

### v0.28.0 — State-First-Architektur

**Kern-Engine-Refactoring:**
- Intent-Parser mit Zod-Schemas (6 Intent-Typen: Bewegung, Dialog, Aktion, Befehl, Beobachtung, Meta)
- Simulations-Engine mit Mojo FFI deterministischen Ergebnissen
- State-Mutator fuer sofortige EntityStore-Aktualisierungen
- Context-Builder fuer gemeinsamen Spielzustand
- Refactored RoleplayEngine als dünner Orchestrator

**MCP-Integration:**
- TNS MCP-Server mit Bible-, Gutenberg- und Wikipedia-Tools
- Bible-Parser fuer externe SQLite-Datenbanken mit FTS-Suche
- Gutenberg-Parser mit Stil-Extraktion und Delexifizierung
- Wikipedia-Validator fuer historische Faktenpruefung

**Agenten-Konsolidierung:**
- 14 Agenten -> 6 spezialisierte Rollen (Dramaturg, Validator, Stylist, Actor, Censor, Chronicler)
- AgentRegistryV2 fuer Lifecycle-Management
- MCP-Tools-Integration fuer jeden Agenten

**System-Heartbeat:**
- Echtzeit-Fortschrittsanzeigen ueber SSE
- HeartbeatUI Frontend-Komponente
- Fortschrittsbalken mit Stufenmeldungen

**Interlingua:**
- Englisch als interne Sprache fuer alle Operationen
- TranslationService an der Ausgabegrenze

**Bugfixes:**
- Alle TypeScript-Fehler behoben (0 Fehler)
- SQLite-Abfrage-Parametertypen korrigiert
- LLMQueue-Signatur-Fehler behoben

### v0.22.2 — Theme Builder

- Eigenstaendige Theme-Builder-Seite unter `/theme-builder`
- 8 Preset-Themes: Dracula, Nord, Monokai, Solarized, Gruvbox, Tokyo Night, One Dark, Catppuccin
- Farbauswahl-Kontrollen fuer 14 CSS-Variablen (Hintergraende, Raender, Text, Akzente)
- Schriftarten-Auswahl fuer Mono-, Body- und Display-Schriftarten
- Live-Vorschaupanel mit allen UI-Komponenten
- Themes als JSON-Dateien exportieren/importieren
- Navigationslink von der Einstellungsseite

### v0.22.2 — Theme-System-Fix

- Korrigiert `theme-custom.css` — CSS-Variablensyntax korrigiert (verwendete `var()` statt `--name: value`)
- Fehlende Variablen `--accent-subtle`, `--success-subtle`, `--warning-subtle`, `--interactive-subtle` zum benutzerdefinierten Theme hinzugefuegt
- Alle 5 Themes (Dunkel, Hell, Terminal, Cyberpunk, Benutzerdefiniert) funktionieren jetzt korrekt ueber die Selektor-Buttons

### v0.20.4 — World-Graph-Fix + Statistik-Modal + Sprachinjektion + Themes

- Behoben: Totes `buildRelationships()` — heuristische Beziehungen werden beim Start automatisch aufgebaut
- Neuer Endpunkt `GET /api/worlds/:name/detail` fuer Weltstatistiken
- Neues Statistik-Modal mit Entitaetslisten, Regeln und Charakterdetails
- Sprach-Injektion — LLM-Antworten entsprechen der UI-Sprache (7 Sprachen)
- Theme-System — 5 integrierte Themes (Dunkel, Hell, Terminal, Cyberpunk, Benutzerdefiniert) + Konstruktor

### v0.20.1 — Regel-Engine Binary Fix

- Behoben: `/api/rules` Absturz im kompilierten Bun-Binary
- `import.meta.dir` durch `process.cwd()` fuer die Verzeichnisauflösung ersetzt
- Behebt ENOENT-Fehler (`/$bunfs/root/../rules/social`) im kompilierten Binary

### v0.20.0 — Architekturverbesserungen

Komplette architektonische Ueberarbeitung in 5 Etappen:

**Etappe 1-2:**
- NarrativeService Aufteilung (Bootstrapper + Facade + Service)
- Einheitliches Agenten-Modell mit Schnittstelle und Basisklasse
- Event Sourcing mit Domänen-Events und Snapshots
- Circuit Breaker fuer LLM mit automatischem Failover
- Agenten-Registry mit 4 Quelltypen (builtin, config, api, plugin)
- Strukturiertes Logging mit Trace- und Correlation-IDs

**Etappe 3:**
- Regel-Engine — 14 vordefinierte Systeme (Feudalismus, Demokratie, Anarchie usw.)
- Synergie-Matrix, Technologie-Abhaengigkeiten, Glueck-Modifikatoren
- Regel-Validator und kulturelle Drift-Modellierung
- Feature-Flags mit A/B-Testing und schrittweisem Rollout
- API-Versionierung (v1/v2) mit Deprecation-Headern
- WorldStore — SQLite-Migration fuer Weltdaten

**Etappe 4:**
- Multi-Welten-Isolierung mit Ressourcen-Monitoring
- Cross-Welt-Kommunikation mit Portalen und Events
- Plugin-System mit Manager und Lifecycle-Hooks

**Etappe 5:**
- Dokumentationsaktualisierungen (ARCHITECTURE, API, PLUGIN-GUIDE, MIGRATION)

→ [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | [MIGRATION.md](docs/MIGRATION.md)

### v0.15.0 — Sicherheitsverbesserungen

- SQLite-gestuetzte Sitzungen
- WebSocket-Token-Validierung
- Path-Traversal-Schutz
- CSRF-Schutz beim Login
- Secure Cookie-Flag, hartes CSP
- Fehlermeldungen sanitisiert

→ [security-audit.md](../security-audit.md) | [SECURITY-log.md](../../SECURITY-log.md)

### v0.14.1 — C FFI-Kernels & Cross-Kompilierung

- 5 Compute-Kernels von Mojo zu reinem C portiert
- Zig Cross-Kompilierung fuer 10 Plattformen
- Pause/Resume Hintergrundverarbeitung

---

## Lizenz

---

**Projekt:** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
