# TrueNeverStory

### Write your book just by playing.

TrueNeverStory is an AI-powered interactive narrative engine with **State-First architecture**. Every NPC remembers, every action has a deterministic outcome, and the story never stops. Play a character, explore a living world, and watch your choices shape the narrative — or let the world evolve on its own.

Built on TypeScript (Bun + Hono) with C FFI compute kernels for performance-critical operations.

**[Русский](docs/ru/README.md) | [Deutsch](docs/de/README.md) | [Français](docs/fr/README.md) | [Español](docs/es/README.md) | [日本語](docs/ja/README.md) | [中文](docs/zh/README.md)**

---

## What it is

You play a character in a persistent world. Each of your actions is parsed into a structured intent, simulated deterministically, and rendered back as prose by a pipeline of specialized AI agents. The engine's internal language is English; translation happens at the output boundary, so the story always speaks your language.

- **State-First** — the simulation runs before any text is written, so outcomes are deterministic and reproducible.
- **Six agents, one storyteller** — Dramaturg (archetypes), Validator (facts), Stylist (prose), Actor (NPCs), Censor (style), Chronicler (memory).
- **Literature as code** — the Bible as narrative archetypes, Gutenberg as prose styles, Wikipedia as fact-checking, wired in through MCP tools.

## Features

| Area | Description |
|------|-------------|
| **State-First pipeline** | Deterministic simulation → state mutation → constrained prose |
| **Living world** | Characters, locations, factions connected in a knowledge graph with O(1) lookups |
| **Memory & RAG** | Vector memory with hybrid FTS5 + dense + RRF search (BGE-M3) |
| **Probability system** | Deterministic combat, persuasion, stealth, and romance outcomes |
| **NPC economy** | Feudal hierarchy (10 ranks), taxes, food production, family system |
| **Rules engine** | 14 social/economic systems with a synergy matrix |
| **Multi-world** | Isolated worlds with cross-world events and portals |
| **Real-time streaming** | WebSocket + SSE with heartbeat progress |
| **i18n** | EN, RU, DE, FR, ES, JA, ZH |
| **Plugin system** | Lifecycle hooks and API |
| **Feature flags** | Gradual rollout, percentage targeting |

## Quick Start

**No Bun, Node.js, or any runtime required.** Just download and run.

### 1. Download

Get the latest release for your platform from [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Platform | File |
|----------|------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Run

The launcher auto-detects your LLM provider (Ollama, LM Studio, OpenAI, llama.cpp), configures `.env`, and starts the server.

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x startgame.sh
./startgame.sh

# Windows (PowerShell)
# Extract tns-windows-x64.zip, then:
.\startgame.ps1
```

### 3. Open

Go to **http://localhost:8000** — password: **`changeme`** (change it in Settings after first login).

That's it. No database setup, no package installation, no config files to edit.

## Configure LLM

Open the **Settings** page or edit `.env`. Works with Ollama, LM Studio, vLLM, OpenAI, Anthropic, Google, and any OpenAI-compatible API. See [HARDWARE.md](docs/en/HARDWARE.md) and [PROVIDER-RATE-LIMITING.md](docs/en/PROVIDER-RATE-LIMITING.md) for details.

## Documentation

| Doc | Covers |
|-----|--------|
| [ARCHITECTURE.md](docs/en/ARCHITECTURE.md) | System design, pipeline, services |
| [API.md](docs/en/API.md) | HTTP and WebSocket endpoints |
| [AGENTS.md](docs/en/AGENTS.md) | Agent reference (the Big Six) |
| [DEV.README.md](docs/en/DEV.README.md) | Developer guide — setup, commands, DI |
| [COMPILE.md](docs/en/COMPILE.md) | Building binaries and cross-compilation |
| [CHANGELOG.md](docs/en/CHANGELOG.md) | Release history |
| [about.md](docs/en/about.md) | World rules and economy |
| [MIGRATION.md](docs/en/MIGRATION.md) | Version migration notes |
| [security-audit.md](docs/en/security-audit.md) | Security audit findings |

## Building from source

Requires [Bun](https://bun.sh) v1.0+.

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev        # http://localhost:8000
```

Commands: `bun run dev` (hot reload), `bun run start` (production), `bun run lint` (type check), `bun test` (test suite). See [COMPILE.md](docs/en/COMPILE.md) for binary releases.

## License

MIT
