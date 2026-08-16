# TrueNeverStory

### Schreibe dein Buch, indem du einfach spielst.

TrueNeverStory ist eine KI-gestützte interaktive Erzähl-Engine mit **State-First-Architektur**. Jeder NPC erinnert sich, jede Handlung hat ein deterministisches Ergebnis, und die Geschichte hört nie auf. Spiele eine Figur, erkunde eine lebendige Welt und beobachte, wie deine Entscheidungen die Erzählung formen — oder lass die Welt sich selbst entwickeln.

Gebaut auf TypeScript (Bun + Hono) mit C-FFI-Compute-Kernels für leistungskritische Operationen.

**[English](../../README.md) | [Русский](../ru/README.md) | [Français](../fr/README.md) | [Español](../es/README.md) | [日本語](../ja/README.md) | [中文](../zh/README.md)**

---

## Was es ist

Du spielst eine Figur in einer dauerhaft lebendigen Welt. Jede deiner Handlungen wird in eine strukturierte Absicht zerlegt, deterministisch simuliert und von einer Pipeline spezialisierter KI-Agenten als Prosa zurückgegeben. Die interne Sprache der Engine ist Englisch; die Übersetzung geschieht an der Ausgabegrenze, sodass die Geschichte immer deine Sprache spricht.

- **State-First** — die Simulation läuft vor dem Text, daher sind Ergebnisse deterministisch und reproduzierbar.
- **Sechs Agenten, ein Erzähler** — Dramaturg (Archetypen), Validator (Fakten), Stylist (Prosa), Actor (NPCs), Censor (Stil), Chronicler (Gedächtnis).
- **Literatur als Code** — die Bibel als Erzähl-Archetypen, Gutenberg als Prosa-Stile, Wikipedia als Faktenprüfung, angebunden über MCP-Tools.

## Funktionen

| Bereich | Beschreibung |
|---------|--------------|
| **State-First-Pipeline** | Deterministische Simulation → Zustandsänderung → gebundene Prosa |
| **Lebendige Welt** | Figuren, Orte, Fraktionen in einem Wissensgraphen mit O(1)-Lookups |
| **Gedächtnis & RAG** | Vektor-Gedächtnis mit hybrider FTS5 + Dense + RRF-Suche (BGE-M3) |
| **Wahrscheinlichkeitssystem** | Deterministische Ergebnisse für Kampf, Überredung, Heimlichkeit, Romantik |
| **NPC-Ökonomie** | Feudalhierarchie (10 Ränge), Steuern, Nahrungsproduktion, Familiensystem |
| **Regel-Engine** | 14 soziale/ökonomische Systeme mit Synergie-Matrix |
| **Multi-World** | Isolierte Welten mit weltübergreifenden Ereignissen und Portalen |
| **Echtzeit-Streaming** | WebSocket + SSE mit Heartbeat-Fortschritt |
| **i18n** | EN, RU, DE, FR, ES, JA, ZH |
| **Plugin-System** | Lifecycle-Hooks und API |
| **Feature Flags** | Schrittweise Ausrollung, prozentuales Targeting |

## Schnellstart

**Kein Bun, kein Node.js, keine Laufzeit nötig.** Einfach herunterladen und starten.

### 1. Herunterladen

Hole die neueste Version für deine Plattform von [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Plattform | Datei |
|-----------|-------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Starten

Der Launcher erkennt deinen LLM-Anbieter automatisch (Ollama, LM Studio, OpenAI, llama.cpp), konfiguriert `.env` und startet den Server.

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

### 3. Öffnen

Gehe zu **http://localhost:8000** — Passwort: **`changeme`** (nach dem ersten Login in den Einstellungen ändern).

Das ist alles. Keine Datenbankeinrichtung, keine Paketinstallation, keine zu bearbeitenden Konfigurationsdateien.

## LLM konfigurieren

Öffne die **Einstellungen** oder bearbeite `.env`. Funktioniert mit Ollama, LM Studio, vLLM, OpenAI, Anthropic, Google und jeder OpenAI-kompatiblen API. Siehe [HARDWARE.md](HARDWARE.md) und [PROVIDER-RATE-LIMITING.md](../en/PROVIDER-RATE-LIMITING.md).

## Dokumentation

| Dokument | Inhalt |
|----------|--------|
| [ARCHITECTURE.md](../en/ARCHITECTURE.md) | Systemdesign, Pipeline, Dienste |
| [API.md](API.md) | HTTP- und WebSocket-Endpunkte |
| [AGENTS.md](AGENTS.md) | Agenten-Referenz (die Big Six) |
| [DEV.README.md](DEV.README.md) | Entwicklerhandbuch — Setup, Befehle, DI |
| [COMPILE.md](../en/COMPILE.md) | Binär-Builds und Cross-Compilation |
| [CHANGELOG.md](../en/CHANGELOG.md) | Versionshistorie |
| [about.md](about.md) | Weltregeln und Ökonomie |
| [MIGRATION.md](../en/MIGRATION.md) | Hinweise zur Versionsmigration |
| [security-audit.md](../en/security-audit.md) | Ergebnisse des Sicherheitsaudits |

## Aus dem Quellcode bauen

Erfordert [Bun](https://bun.sh) v1.0+.

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev        # http://localhost:8000
```

Befehle: `bun run dev` (Hot Reload), `bun run start` (Produktion), `bun run lint` (Typprüfung), `bun test` (Testsuite). Siehe [COMPILE.md](../en/COMPILE.md) zu Binär-Releases.

## Lizenz

MIT
