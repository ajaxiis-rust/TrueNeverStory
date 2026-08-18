# TrueNeverStory v0.33.0 — Kompilierungsanleitung

## Schnellstart

```bash
# Current platform
./build.sh compile

# Specific target
./build.sh compile linux-x64
./build.sh compile linux-arm64
./build.sh compile macos-arm64
./build.sh compile windows-x64

# Interactive selection
./build.sh select

# All platforms
./build.sh cross
```

## Unterstützte Plattformen

| Plattform | TypeScript | Mojo (.so) | MCP | Backend | Anmerkungen |
|-----------|:----------:|:----------:|:---:|:-------:|---------|
| linux-x64 | ✅ | ✅ | ✅ | mojo | Volle Unterstützung |
| linux-arm64 | ✅ | ✅ | ✅ | mojo | Volle Unterstützung |
| macos-arm64 | ✅ | ✅ | ✅ | mojo | Apple Silicon |
| macos-x64 | ✅ | ✅ | ✅ | mojo | Intel Mac |
| windows-x64 | ✅ | ❌ | ✅ | typescript | TypeScript-Fallback |

## MCP — Model Context Protocol

Das MCP stellt LLM-Agenten Werkzeuge zum Abfragen externer Datenquellen bereit:

| Werkzeug | Datenquelle | Beschreibung |
|------------|----------------|----------|
| `search_verses` | Bible SQLite | Verse nach Text, Buch oder Referenz durchsuchen |
| `get_pattern` | Bible SQLite | Erzählmuster nach Archetyp/Stimmung |
| `get_archetype` | Bible SQLite | Archetyp-Details nach Name |
| `get_cross_refs` | Bible SQLite | Querverweise zwischen Versen |
| `get_style_pattern` | Gutenberg SQLite | Stilmuster nach Stimmung/Tags |
| `apply_style` | Gutenberg SQLite | Einen Stil auf Text anwenden |
| `verify_fact` | Wikipedia API | Faktenbehauptungen überprüfen |
| `get_context` | Wikipedia API | Wikipedia-Kontext nach Thema |
| `get_quest_templates` | Literary Compiler | Quest-Vorlagen nach Archetyp |
| `search_quest_templates` | Literary Compiler | Quests nach Text durchsuchen |
| `get_economic_phase` | Economic DB | Aktuelle Phase des Wirtschaftszyklus |
| `calculate_price` | Economic DB | Preisberechnung unter Berücksichtigung der Phase |
| `generate_dilemma` | Economic DB | Ein Fraktions-Dilemma generieren |
| `check_jubilee` | Economic DB | Den Jubiläumszyklus prüfen |

### Kompilieren der MCP-Datenbanken

Der MCP-Server benötigt kompilierte SQLite-Datenbanken:

```bash
# Bible: BSB, LEB, NHEBME + cross-references
bun run scripts/run-bsb-compiler.ts

# Full pipeline (Bible + Literary Compiler)
bun run scripts/run-full-compiler-pipeline.ts

# Bible only
bun run scripts/run-full-bible-compiler.ts

# Cached pipeline (incremental)
bun run scripts/run-cached-pipeline.ts
```

### MCP-Datenstruktur

```
worlds/{active}/
├── bible.db              # BSB + LEB + NHEBME + cross-refs
├── gutenberg.db          # Styles from Project Gutenberg
├── mcp/
│   ├── bible/            # Bible parser cache
│   └── gutenberg/        # Gutenberg parser cache
└── economic.db           # Economic data
```

### MCP ausführen

Der MCP-Server startet automatisch, wenn `bible.db` oder `gutenberg.db` gefunden werden:

```bash
# Automatic start
./bun run src/index.ts

# Check MCP
curl http://localhost:8000/health  # → "status": "ok"
```

### Gutenberg-Webkatalog

Über die MCP-Konsole (`/mcp.html`) können Sie Ihre Lieblingsautoren von Project Gutenberg herunterladen, um den Schreibstil zu verbessern:

1. Öffnen Sie den Tab „Katalog"
2. Geben Sie Autorennamen oder ein Thema ein
3. Durchsuchen, filtern und wählen Sie Bücher aus
4. Herunterladen — die Stile werden automatisch für den Stil-Agenten extrahiert

Siehe den **[MCP-Konsolen-Leitfaden](MCP-HELP.md)** (7 Sprachen) für Details.

## Automatischer Fallback

Der Server erkennt die Mojo-Verfügbarkeit automatisch:

```
.so files present  → Backend: mojo       (fast, ~10-50x for vectors)
.so files absent   → Backend: typescript  (works, slower)
```

Aktuelles Backend prüfen:
```bash
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
```

### Was ohne Mojo funktioniert

| Komponente | Mojo-Backend | TypeScript-Fallback | Unterschied |
|-----------|:------------:|:-------------------:|---------|
| Wahrscheinlichkeit (Kampf, Romanze) | Mojo FFI | TypeScript | ~2-5x |
| Vektor-Ähnlichkeit | Mojo FFI | TypeScript | ~10-50x |
| Skalarprodukt | Mojo FFI | TypeScript | ~5-10x |
| Chat / Rollenspiel | TypeScript | TypeScript | 0% |
| Speichersystem | TypeScript + Mojo | Nur TypeScript | Langsamere Suche |
| Quests / Director | TypeScript | TypeScript | 0% |
| MCP Bible/Gutenberg | TypeScript | TypeScript | 0% |
| MCP Wikipedia | HTTP | HTTP | 0% |

**Fazit:** Der Windows-Build ist voll funktionsfähig. Der einzige Unterschied ist die Rechenleistung.

## Build-Struktur

```
dist/
├── linux-arm64/
│   ├── tns-server              # Standalone binary
│   ├── libtns_kernels.so       # Mojo: probabilities
│   ├── libtns_vectors.so       # Mojo: vector operations
│   ├── libtns_vector_full.so   # Mojo: volldimensionale Vektoroperationen
│   ├── libtns_graph_ops.so     # Mojo: graph operations
│   ├── libtns_batch_ops.so     # Mojo: batch operations
│   └── .env                      # Configuration
├── linux-x64/
│   └── ...
├── macos-arm64/
│   └── ...
├── macos-x64/
│   └── ...
└── windows-x64/
    ├── tns-server.exe          # TypeScript only (fallback)
    └── .env
```

## Was der Benutzer benötigt

1. Laden Sie den Ordner für Ihre Plattform herunter
2. Konfigurieren Sie `.env` (LLM-Endpunkt, Passwort)
3. Kopieren Sie `conf/` aus dem Projektstamm (oder erstellen Sie es manuell)
4. Ausführen:

```bash
# Linux/macOS
./tns-server

# Windows
tns-server.exe
```

**Nicht erforderlich:** Bun, Node.js, Python, Mojo, Compiler.

Damit MCP funktioniert, müssen Sie zusätzlich die Datenbanken kompilieren (siehe MCP-Abschnitt oben).

## Embedding-Modelle (Lokaler Server)

Für Vektorsuche und semantische Ähnlichkeit können Sie einen separaten llama-server mit einem Embedding-Modell ausführen:

```bash
# BGE M3 — multilingual (100+ languages, 8192 tokens)
./llama-server -m local-models/bge-m3-Q8_0.gguf --embedding --pooling mean --port 5002

# Qwen3 Embedding 0.6B — compact and fast
./llama-server -m local-models/Qwen3-Embedding-0.6B-Q8_0.gguf --embedding --pooling mean --port 5002

# KaLM Embedding Gemma3 12B — maximum quality
./llama-server -m local-models/KaLM-Embedding-Gemma3-12B-2511.Q4_K_M.gguf --embedding --pooling mean --port 5002
```

Geben Sie in `.env` Folgendes an:
```ini
WORLD_EMBEDDING_MODEL=bge-m3
WORLD_EMBEDDING_BASE_URL=http://localhost:5002
```

> **Wichtig:** Die Flags `--embedding` und `--pooling mean` sind erforderlich, damit Embedding-Modelle korrekt funktionieren. Ohne sie läuft der llama-server als normales LLM und erzeugt Text statt Vektoren.

| Modell | Größe | Sprachen | Kontext | Empfehlung |
|--------|--------|-------|----------|--------------|
| BGE M3 (Q8_0) | ~635 MB | 100+ | 8192 | Beste Sprachabdeckung |
| BGE M3 (Q4_K_M) | ~438 MB | 100+ | 8192 | Balance aus Größe/Qualität |
| Qwen3 Embedding 0.6B | ~639 MB | Multi | — | Am schnellsten |
| Embedding Gemma 300M | ~329 MB | EN+ | — | Minimale Größe |
| KaLM Gemma3 12B (Q4_K_M) | ~7.3 GB | Multi | — | Maximale Qualität |

## Plattform-Anforderungen

| Betriebssystem | Mindestversion | Architektur | Mojo | MCP |
|----|-------------------|-------------|:----:|:---:|
| Linux | glibc 2.34+ (Ubuntu 22.04+, Debian 12+, RHEL 9+) | x86_64, ARM64 | ✅ | ✅ |
| macOS | 11 Big Sur+ | x86_64, ARM64 (Apple Silicon) | ✅ | ✅ |
| Windows | 10+ (64-bit) | x86_64 | ❌ | ✅ |

## Windows — Details

Der Windows-Build läuft über den **TypeScript-Fallback**:

- `tns-server.exe` — eigenständige Binärdatei, läuft ohne Installation
- Mojo-`.so` werden nicht kompiliert (Mojo unterstützt Windows/MSVC nicht)
- Alle Berechnungen laufen auf TypeScript — langsamer, aber funktional identisch
- MCP funktioniert vollständig (TypeScript)
- WSL2 ist nicht erforderlich — native Windows-Ausführung

### Windows-Leistung

Für die meisten Szenarien ist der Unterschied vernachlässigbar:
- Chat und Rollenspiel — identisch (TypeScript)
- Wahrscheinlichkeit — vernachlässigbarer Unterschied (<1ms)
- Vektorsuche — langsamer bei großen Datenmengen (>10K Erinnerungen)
- MCP — identisch (TypeScript + HTTP)

Für maximale Leistung unter Windows:
1. **Externer Server** unter Linux
2. **Typische Szenarien** — der Unterschied ist vernachlässigbar

## Manuelle Kompilierung

### TypeScript (Bun)

```bash
# Current platform
bun build --compile --outfile dist/tns-server src/index.ts

# Windows (from Linux via cross-compilation)
bun build --compile \
  --compile-executable-path dist/.bun-cache/bun-windows-x64 \
  --outfile dist/windows-x64/tns-server.exe \
  src/index.ts
```

### Mojo (.so für FFI)

```bash
# Linux/macOS only (not Windows!)
mojo build --emit shared-lib -O3 \
  -o dist/libtns_kernels.so \
  mojo/kernels/probability_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_vectors.so \
  mojo/kernels/vector_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_vector_full.so \
  mojo/kernels/vector_full.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_batch_ops.so \
  mojo/kernels/batch_ops.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_graph_ops.so \
  mojo/kernels/graph_ops.mojo
```

### Cross-Kompilierung

Mojo-`.so`-Dateien können nicht zuverlässig cross-kompiliert werden. Es wird empfohlen, **auf der Zielplattform zu bauen**.

### Windows von Linux aus bauen

```bash
# TypeScript + .env (no Mojo)
./build.sh compile windows-x64

# Result: dist/windows-x64/
#   tns-server.exe   — standalone binary
#   .env               — configuration
```

## Fehlerbehebung

```bash
# Check the backend
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
# → "mojo" or "typescript"

# Check that the binary works
./dist/linux-arm64/tns-server --help

# Check .so symbols
nm -D dist/linux-arm64/libtns_kernels.so | grep tns

# Check FFI from TypeScript
bun run -e "
  import { computeSuccessChance } from './src/lib/mojo-ffi';
  console.log(computeSuccessChance(0.8, 0.3, 0.5, 0.1));
"

# Check the binary's platform
file dist/linux-arm64/tns-server

# Check MCP (databases required)
bun run scripts/run-bsb-compiler.ts
curl http://localhost:8000/health
```

## Gutenberg-Pipeline

### Voraussetzungen
- Heruntergeladene .txt-Dateien in `data/gutenberg/texts/`
- (Optional) `data/mcp/gutenberg-catalog.db` für die Metadaten-Anreicherung

### Texte importieren
```bash
bun run scripts/import-gutenberg-texts.ts
```
Erstellt `data/gutenberg/classics.db` aus .txt-Dateien + Katalog.

### Verarbeitungs-Pipeline
```bash
# Phase A only (rule-based, no LLM)
bun run scripts/process-gutenberg.ts --phase v1

# Phase B only (LLM-enriched)
bun run scripts/process-gutenberg.ts --phase v2

# Both phases
bun run scripts/process-gutenberg.ts --phase all
```

### Korpus erweitern
```bash
bun run scripts/expand-corpus.ts --authors "Dickens,Tolstoy" --target 3
bun run scripts/expand-corpus.ts --authors "Hemingway" --dry-run
```
