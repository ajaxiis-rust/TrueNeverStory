# TrueNeverStory v0.32.5 — Compilation Guide

## Quick Start

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

## Supported Platforms

| Platform | TypeScript | Mojo (.so) | MCP | Backend | Notes |
|-----------|:----------:|:----------:|:---:|:-------:|---------|
| linux-x64 | ✅ | ✅ | ✅ | mojo | Full support |
| linux-arm64 | ✅ | ✅ | ✅ | mojo | Full support |
| macos-arm64 | ✅ | ✅ | ✅ | mojo | Apple Silicon |
| macos-x64 | ✅ | ✅ | ✅ | mojo | Intel Mac |
| windows-x64 | ✅ | ❌ | ✅ | typescript | TypeScript fallback |

## MCP — Model Context Protocol

The MCP provides tools to LLM agents for querying external data sources:

| Tool | Data source | Description |
|------------|----------------|----------|
| `search_verses` | Bible SQLite | Search verses by text, book, reference |
| `get_pattern` | Bible SQLite | Narrative patterns by archetype/mood |
| `get_archetype` | Bible SQLite | Archetype details by name |
| `get_cross_refs` | Bible SQLite | Cross-references between verses |
| `get_style_pattern` | Gutenberg SQLite | Stylistic patterns by mood/tags |
| `apply_style` | Gutenberg SQLite | Apply a style to text |
| `verify_fact` | Wikipedia API | Verify factual claims |
| `get_context` | Wikipedia API | Wikipedia context by topic |
| `get_quest_templates` | Literary Compiler | Quest templates by archetype |
| `search_quest_templates` | Literary Compiler | Search quests by text |
| `get_economic_phase` | Economic DB | Current phase of the economic cycle |
| `calculate_price` | Economic DB | Price calculation accounting for phase |
| `generate_dilemma` | Economic DB | Generate a faction dilemma |
| `check_jubilee` | Economic DB | Check the jubilee cycle |

### Compiling the MCP Databases

The MCP server requires compiled SQLite databases:

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

### MCP Data Structure

```
worlds/{active}/
├── bible.db              # BSB + LEB + NHEBME + cross-refs
├── gutenberg.db          # Styles from Project Gutenberg
├── mcp/
│   ├── bible/            # Bible parser cache
│   └── gutenberg/        # Gutenberg parser cache
└── economic.db           # Economic data
```

### Running MCP

The MCP server starts automatically when `bible.db` or `gutenberg.db` are found:

```bash
# Automatic start
./bun run src/index.ts

# Check MCP
curl http://localhost:8000/health  # → "status": "ok"
```

### Gutenberg Web Catalog

Through the MCP Console (`/mcp.html`) you can download your favorite authors from Project Gutenberg to improve writing style:

1. Open the "Catalog" tab
2. Enter author names or a topic
3. Browse, filter, and select books
4. Download — styles are extracted automatically for the stylist agent

See the **[MCP Console Guide](MCP-HELP.md)** (7 languages) for details.

## Automatic Fallback

The server automatically detects Mojo availability:

```
.so files present  → Backend: mojo       (fast, ~10-50x for vectors)
.so files absent   → Backend: typescript  (works, slower)
```

Check the current backend:
```bash
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
```

### What Works Without Mojo

| Component | Mojo backend | TypeScript fallback | Difference |
|-----------|:------------:|:-------------------:|---------|
| Probability (combat, romance) | Mojo FFI | TypeScript | ~2-5x |
| Vector similarity | Mojo FFI | TypeScript | ~10-50x |
| Dot product | Mojo FFI | TypeScript | ~5-10x |
| Chat / Roleplay | TypeScript | TypeScript | 0% |
| Memory System | TypeScript + Mojo | TypeScript only | Slower search |
| Quests / Director | TypeScript | TypeScript | 0% |
| MCP Bible/Gutenberg | TypeScript | TypeScript | 0% |
| MCP Wikipedia | HTTP | HTTP | 0% |

**Conclusion:** the Windows build is fully functional. The only difference is compute performance.

## Build Structure

```
dist/
├── linux-arm64/
│   ├── tns-server              # Standalone binary
│   ├── libtns_kernels.so       # Mojo: probabilities
│   ├── libtns_vectors.so       # Mojo: vector operations
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

## What the User Needs

1. Download the folder for your platform
2. Configure `.env` (LLM endpoint, password)
3. Copy `conf/` from the project root (or create it manually)
4. Run:

```bash
# Linux/macOS
./tns-server

# Windows
tns-server.exe
```

**Not required:** Bun, Node.js, Python, Mojo, compilers.

For MCP to work you additionally need to compile the databases (see the MCP section above).

## Embedding Models (Local Server)

For vector search and semantic similarity you can run a separate llama-server with an embedding model:

```bash
# BGE M3 — multilingual (100+ languages, 8192 tokens)
./llama-server -m local-models/bge-m3-Q8_0.gguf --embedding --pooling mean --port 8081

# Qwen3 Embedding 0.6B — compact and fast
./llama-server -m local-models/Qwen3-Embedding-0.6B-Q8_0.gguf --embedding --pooling mean --port 8081

# KaLM Embedding Gemma3 12B — maximum quality
./llama-server -m local-models/KaLM-Embedding-Gemma3-12B-2511.Q4_K_M.gguf --embedding --pooling mean --port 8081
```

In `.env` specify:
```ini
EMBED_MODEL=bge-m3-Q8_0
EMBED_SERVER_PORT=8081
```

> **Important:** the `--embedding` and `--pooling mean` flags are required for embedding models to work correctly. Without them llama-server runs as a regular LLM and produces text instead of vectors.

| Model | Size | Languages | Context | Recommendation |
|--------|--------|-------|----------|--------------|
| BGE M3 (Q8_0) | ~635 MB | 100+ | 8192 | Best language coverage |
| BGE M3 (Q4_K_M) | ~438 MB | 100+ | 8192 | Size/quality balance |
| Qwen3 Embedding 0.6B | ~639 MB | Multi | — | Fastest |
| Embedding Gemma 300M | ~329 MB | EN+ | — | Minimal size |
| KaLM Gemma3 12B (Q4_K_M) | ~7.3 GB | Multi | — | Maximum quality |

## Platform Requirements

| OS | Minimum version | Architecture | Mojo | MCP |
|----|-------------------|-------------|:----:|:---:|
| Linux | glibc 2.34+ (Ubuntu 22.04+, Debian 12+, RHEL 9+) | x86_64, ARM64 | ✅ | ✅ |
| macOS | 11 Big Sur+ | x86_64, ARM64 (Apple Silicon) | ✅ | ✅ |
| Windows | 10+ (64-bit) | x86_64 | ❌ | ✅ |

## Windows — Details

The Windows build runs through the **TypeScript fallback**:

- `tns-server.exe` — standalone binary, runs without installation
- Mojo `.so` are not compiled (Mojo does not support Windows/MSVC)
- All computations run on TypeScript — slower, but functionally identical
- MCP works fully (TypeScript)
- WSL2 is not required — native Windows execution

### Windows Performance

For most scenarios the difference is negligible:
- Chat and roleplay — identical (TypeScript)
- Probability — negligible difference (<1ms)
- Vector search — slower with large data (>10K memories)
- MCP — identical (TypeScript + HTTP)

For maximum performance on Windows:
1. **External server** on Linux
2. **Typical scenarios** — difference is negligible

## Manual Compilation

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

### Mojo (.so for FFI)

```bash
# Linux/macOS only (not Windows!)
mojo build --emit shared-lib -O3 \
  -o dist/libtns_kernels.so \
  mojo/kernels/probability_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_vectors.so \
  mojo/kernels/vector_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_graph_ops.so \
  mojo/kernels/graph_ops.c

mojo build --emit shared-lib -O3 \
  -o dist/libtns_batch_ops.so \
  mojo/kernels/batch_ops.c
```

### Cross-Compilation

Mojo `.so` files cannot be reliably cross-compiled. It is recommended to **build on the target platform**.

### Building Windows from Linux

```bash
# TypeScript + .env (no Mojo)
./build.sh compile windows-x64

# Result: dist/windows-x64/
#   tns-server.exe   — standalone binary
#   .env               — configuration
```

## Debugging

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

## Gutenberg Pipeline

### Prerequisites
- Downloaded .txt files in `data/gutenberg/texts/`
- (Optional) `data/mcp/gutenberg-catalog.db` for metadata enrichment

### Import texts
```bash
bun run scripts/import-gutenberg-texts.ts
```
Creates `data/gutenberg/classics.db` from .txt files + catalog.

### Process pipeline
```bash
# Phase A only (rule-based, no LLM)
bun run scripts/process-gutenberg.ts --phase v1

# Phase B only (LLM-enriched)
bun run scripts/process-gutenberg.ts --phase v2

# Both phases
bun run scripts/process-gutenberg.ts --phase all
```

### Expand corpus
```bash
bun run scripts/expand-corpus.ts --authors "Dickens,Tolstoy" --target 3
bun run scripts/expand-corpus.ts --authors "Hemingway" --dry-run
```
