# TrueNeverStory v0.33.4 — Guía de compilación

## Inicio rápido

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

## Plataformas compatibles

| Plataforma | TypeScript | Mojo (.so) | MCP | Backend | Notas |
|-----------|:----------:|:----------:|:---:|:-------:|---------|
| linux-x64 | ✅ | ✅ | ✅ | mojo | Soporte completo |
| linux-arm64 | ✅ | ✅ | ✅ | mojo | Soporte completo |
| macos-arm64 | ✅ | ✅ | ✅ | mojo | Apple Silicon |
| macos-x64 | ✅ | ✅ | ✅ | mojo | Mac Intel |
| windows-x64 | ✅ | ❌ | ✅ | typescript | Respaldo TypeScript |

## MCP — Model Context Protocol

El MCP proporciona herramientas a los agentes LLM para consultar fuentes de datos externas:

| Herramienta | Fuente de datos | Descripción |
|------------|----------------|----------|
| `search_verses` | SQLite Biblia | Buscar versículos por texto, libro o referencia |
| `get_pattern` | SQLite Biblia | Patrones narrativos por arquetipo/estado de ánimo |
| `get_archetype` | SQLite Biblia | Detalles del arquetipo por nombre |
| `get_cross_refs` | SQLite Biblia | Referencias cruzadas entre versículos |
| `get_style_pattern` | SQLite Gutenberg | Patrones estilísticos por estado de ánimo/etiquetas |
| `apply_style` | SQLite Gutenberg | Aplicar un estilo al texto |
| `verify_fact` | API de Wikipedia | Verificar afirmaciones factuales |
| `get_context` | API de Wikipedia | Contexto de Wikipedia por tema |
| `get_quest_templates` | Compilador Literario | Plantillas de misiones por arquetipo |
| `search_quest_templates` | Compilador Literario | Buscar misiones por texto |
| `get_economic_phase` | BD Económica | Fase actual del ciclo económico |
| `calculate_price` | BD Económica | Cálculo de precios considerando la fase |
| `generate_dilemma` | BD Económica | Generar un dilema de facción |
| `check_jubilee` | BD Económica | Comprobar el ciclo del jubileo |

### Compilar las bases de datos MCP

El servidor MCP requiere bases de datos SQLite compiladas:

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

### Estructura de datos MCP

```
worlds/{active}/
├── bible.db              # BSB + LEB + NHEBME + cross-refs
├── gutenberg.db          # Styles from Project Gutenberg
├── mcp/
│   ├── bible/            # Bible parser cache
│   └── gutenberg/        # Gutenberg parser cache
└── economic.db           # Economic data
```

### Ejecutar MCP

El servidor MCP se inicia automáticamente cuando se encuentran `bible.db` o `gutenberg.db`:

```bash
# Automatic start
./bun run src/index.ts

# Check MCP
curl http://localhost:8000/health  # → "status": "ok"
```

### Catálogo web de Gutenberg

A través de la Consola MCP (`/mcp.html`) puedes descargar tus autores favoritos de Project Gutenberg para mejorar el estilo de escritura:

1. Abre la pestaña «Catálogo»
2. Introduce nombres de autores o un tema
3. Explora, filtra y selecciona libros
4. Descarga: los estilos se extraen automáticamente para el agente estilista

Consulta la **[Guía de la Consola MCP](MCP-HELP.md)** (7 idiomas) para más detalles.

## Respaldo automático

El servidor detecta automáticamente la disponibilidad de Mojo:

```
.so files present  → Backend: mojo       (fast, ~10-50x for vectors)
.so files absent   → Backend: typescript  (works, slower)
```

Comprueba el backend actual:
```bash
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
```

### Qué funciona sin Mojo

| Componente | Backend Mojo | Respaldo TypeScript | Diferencia |
|-----------|:------------:|:-------------------:|---------|
| Probabilidad (combate, romance) | Mojo FFI | TypeScript | ~2-5x |
| Similitud de vectores | Mojo FFI | TypeScript | ~10-50x |
| Producto escalar | Mojo FFI | TypeScript | ~5-10x |
| Chat / Juego de rol | TypeScript | TypeScript | 0% |
| Sistema de memoria | TypeScript + Mojo | Solo TypeScript | Búsqueda más lenta |
| Misiones / Director | TypeScript | TypeScript | 0% |
| MCP Biblia/Gutenberg | TypeScript | TypeScript | 0% |
| MCP Wikipedia | HTTP | HTTP | 0% |

**Conclusión:** la compilación de Windows es totalmente funcional. La única diferencia es el rendimiento de cómputo.

## Estructura de la compilación

```
dist/
├── linux-arm64/
│   ├── tns-server              # Standalone binary
│   ├── libtns_kernels.so       # Mojo: probabilities
│   ├── libtns_vectors.so       # Mojo: vector operations
│   ├── libtns_vector_full.so   # Mojo: operaciones vectoriales de dimensión completa
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

## Qué necesita el usuario

1. Descarga la carpeta de tu plataforma
2. Configura `.env` (endpoint LLM, contraseña)
3. Copia `conf/` desde la raíz del proyecto (o créala manualmente)
4. Ejecuta:

```bash
# Linux/macOS
./tns-server

# Windows
tns-server.exe
```

**No es necesario:** Bun, Node.js, Python, Mojo, compiladores.

Para que MCP funcione, además necesitas compilar las bases de datos (consulta la sección MCP más arriba).

## Modelos de embedding (servidor local)

Para la búsqueda vectorial y la similitud semántica puedes ejecutar un llama-server independiente con un modelo de embedding:

```bash
# BGE M3 — multilingual (100+ languages, 8192 tokens)
./llama-server -m local-models/bge-m3-Q8_0.gguf --embedding --pooling mean --port 5002

# Qwen3 Embedding 0.6B — compact and fast
./llama-server -m local-models/Qwen3-Embedding-0.6B-Q8_0.gguf --embedding --pooling mean --port 5002

# KaLM Embedding Gemma3 12B — maximum quality
./llama-server -m local-models/KaLM-Embedding-Gemma3-12B-2511.Q4_K_M.gguf --embedding --pooling mean --port 5002
```

En `.env` especifica:
```ini
WORLD_EMBEDDING_MODEL=bge-m3
WORLD_EMBEDDING_BASE_URL=http://localhost:5002
```

> **Importante:** las opciones `--embedding` y `--pooling mean` son obligatorias para que los modelos de embedding funcionen correctamente. Sin ellas, llama-server se ejecuta como un LLM normal y produce texto en lugar de vectores.

| Modelo | Tamaño | Idiomas | Contexto | Recomendación |
|--------|--------|-------|----------|--------------|
| BGE M3 (Q8_0) | ~635 MB | 100+ | 8192 | Mejor cobertura de idiomas |
| BGE M3 (Q4_K_M) | ~438 MB | 100+ | 8192 | Equilibrio tamaño/calidad |
| Qwen3 Embedding 0.6B | ~639 MB | Multi | — | Más rápido |
| Embedding Gemma 300M | ~329 MB | EN+ | — | Tamaño mínimo |
| KaLM Gemma3 12B (Q4_K_M) | ~7.3 GB | Multi | — | Máxima calidad |

## Requisitos de plataforma

| SO | Versión mínima | Arquitectura | Mojo | MCP |
|----|-------------------|-------------|:----:|:---:|
| Linux | glibc 2.34+ (Ubuntu 22.04+, Debian 12+, RHEL 9+) | x86_64, ARM64 | ✅ | ✅ |
| macOS | 11 Big Sur+ | x86_64, ARM64 (Apple Silicon) | ✅ | ✅ |
| Windows | 10+ (64 bits) | x86_64 | ❌ | ✅ |

## Windows — Detalles

La compilación de Windows se ejecuta mediante el **respaldo TypeScript**:

- `tns-server.exe` — binario independiente, se ejecuta sin instalación
- Los `.so` de Mojo no se compilan (Mojo no es compatible con Windows/MSVC)
- Todos los cálculos se ejecutan en TypeScript: más lento, pero funcionalmente idéntico
- MCP funciona por completo (TypeScript)
- WSL2 no es necesario: ejecución nativa de Windows

### Rendimiento en Windows

En la mayoría de los escenarios la diferencia es insignificante:
- Chat y juego de rol: idénticos (TypeScript)
- Probabilidad: diferencia insignificante (<1ms)
- Búsqueda vectorial: más lenta con grandes volúmenes de datos (>10K recuerdos)
- MCP: idéntico (TypeScript + HTTP)

Para el máximo rendimiento en Windows:
1. **Servidor externo** en Linux
2. **Escenarios típicos**: la diferencia es insignificante

## Compilación manual

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

### Mojo (.so para FFI)

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

### Compilación cruzada

Los archivos `.so` de Mojo no se pueden compilar de forma cruzada de manera fiable. Se recomienda **compilar en la plataforma de destino**.

### Compilar Windows desde Linux

```bash
# TypeScript + .env (no Mojo)
./build.sh compile windows-x64

# Result: dist/windows-x64/
#   tns-server.exe   — standalone binary
#   .env               — configuration
```

## Depuración

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

## Pipeline de Gutenberg

### Requisitos previos
- Archivos .txt descargados en `data/gutenberg/texts/`
- (Opcional) `data/mcp/gutenberg-catalog.db` para el enriquecimiento de metadatos

### Importar textos
```bash
bun run scripts/import-gutenberg-texts.ts
```
Crea `data/gutenberg/classics.db` a partir de archivos .txt + catálogo.

### Pipeline de procesamiento
```bash
# Phase A only (rule-based, no LLM)
bun run scripts/process-gutenberg.ts --phase v1

# Phase B only (LLM-enriched)
bun run scripts/process-gutenberg.ts --phase v2

# Both phases
bun run scripts/process-gutenberg.ts --phase all
```

### Ampliar el corpus
```bash
bun run scripts/expand-corpus.ts --authors "Dickens,Tolstoy" --target 3
bun run scripts/expand-corpus.ts --authors "Hemingway" --dry-run
```
