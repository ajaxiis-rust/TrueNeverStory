# TrueNeverStory — Guía del Desarrollador

Documentación técnica para contribuidores y desarrolladores.

---

## Visión general de la arquitectura

TrueNeverStory es un motor de juego de rol IA multi-agente. Un jugador envía mensajes que se procesan a través de un pipeline de 14 agentes IA especializados, cada uno encargado de un aspecto específico de la narrativa (narración, diálogos NPC, transiciones de escenas, planificación de la trama, etc.).

```
Entrada del jugador
    ↓
RoleplayEngine.processInput()
    ↓
┌─────────────────────────────────┐
│  Detección de intención         │
│  - Movimiento → SceneAgent      │
│  - Hablar a NPC → NPCAgent      │
│  - Mención @agent → Agente      │
│  - Por defecto → NarratorAgent  │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│  Pipeline de agentes            │
│  1. Construir contexto          │
│  2. Generar prompt              │
│  3. Llamar a LLM via cola       │
│  4. Parsear respuesta           │
│  5. Actualizar estado del mundo │
└─────────────┬───────────────────┘
              ↓
         Respuesta narrativa
```

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Runtime | Bun (no Node.js) |
| Framework web | Hono |
| Base de datos | SQLite via `bun:sqlite` (modo WAL) |
| Validación | Zod |
| Logging | Pino |
| LLM | API compatible con OpenAI (via HTTP) |
| WebSocket | `@hono/node-ws` |
| Núcleos de cómputo | C FFI (compilado via Zig) + fallback TypeScript |

---

## Estructura del proyecto

```
src/
├── index.ts                    # Punto de entrada del servidor (Bun.serve)
├── app.ts                      # App Hono — cadena de middleware + rutas
│
├── config/
│   ├── env.ts                  # Config validada con Zod
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # Cliente HTTP LLM con caché LRU
│   ├── llm-queue.ts            # Cola paralela con pause/resume
│   ├── sqlite-store.ts         # SQLite (FTS5 + vectores + prompts + traducciones)
│   ├── vector-ops.ts           # Coseno, L2, producto escalar
│   ├── mojo-ffi.ts             # Bindings FFI (C/Mojo) + fallbacks TS
│   ├── session-store.ts        # Almacenamiento de sesiones SQLite
│   ├── event-bus.ts            # Sistema de eventos pub/sub
│   └── providers/
│       ├── provider-manager.ts # Enrutamiento multi-proveedor
│       ├── openai-provider.ts
│       ├── ollama-provider.ts
│       └── ...
│
├── middleware/
│   ├── auth.ts                 # Auth cookies (PBKDF2, CSRF, rate limiting)
│   ├── rate-limiter.ts         # Token bucket por IP
│   ├── security-headers.ts     # CSP, X-Frame-Options, etc.
│   └── error-handler.ts        # Manejador de errores global
│
├── models/                     # Modelos de datos (22 archivos)
│   ├── entity.ts               # Entity core (uid, name, perfil L1/L2/L3)
│   ├── chat.ts                 # ChatMessageSchema, SessionSetupSchema (Zod)
│   └── ...
│
├── routes/                     # Rutas API (18 módulos)
│   ├── index.ts                # Agregador de rutas
│   ├── chat.ts                 # POST /chat/setup, /message, /stream (SSE), /agent
│   ├── entities.ts             # GET /entity/:uid, /neighbors, /search, /graph/*
│   ├── agents.ts               # CRUD configs de agentes + prompts por idioma
│   ├── i18n.ts                 # CRUD traducciones (7 idiomas)
│   ├── worlds.ts               # CRUD multi-mundos, generación de capítulos
│   └── system.ts               # Pausa/reanudación de procesamiento
│
├── services/                   # Lógica de negocio (52+ servicios)
│   │
│   │  ── Núcleo ──
│   ├── narrative-service.ts    # Contenedor DI — instancia TODOS los servicios
│   ├── roleplay-engine.ts      # Pipeline principal (processInput)
│   ├── story-engine.ts         # Generación de eventos narrativos
│   ├── director-loop.ts        # Progresión narrativa en segundo plano
│   │
│   │  ── Agentes (14) ──
│   ├── narrator-agent.ts       # Narrador principal
│   ├── director-agent.ts       # Inyección de beats narrativos
│   ├── scene-agent.ts          # Transiciones de escena
│   ├── npc-agent.ts            # Diálogos y reacciones NPC
│   ├── researcher-agent.ts     # Verificación de hechos
│   ├── historian-agent.ts      # Eventos históricos
│   ├── cartographer-agent.ts   # Geografía, distancias
│   ├── merchant-agent.ts       # Comercio, precios
│   ├── quest-giver-agent.ts    # Generación de quests
│   ├── lorekeeper-agent.ts     # Hechos del mundo, reglas de magia
│   ├── chronicler.ts           # Gestión de timeline
│   ├── villain-manager.ts      # Acciones de antagonistas
│   ├── social-simulator.ts     # Dinámica social NPC
│   │
│   │  ── Sistemas del mundo ──
│   ├── story-planner.ts        # Planificación de arcos (LLM)
│   ├── world-builder.ts        # Creación de entidades
│   ├── world-clock.ts          # Tiempo en el mundo
│   ├── world-evolver.ts        # Auto-añadir NPCs/lugares/objetos
│   ├── birth.ts                # Asistente de creación de personaje
│   │
│   │  ── Sistemas NPC ──
│   ├── npc-runtime.ts          # Gestión de estado NPC
│   ├── npc-generator.ts        # Creación inteligente de NPC
│   ├── npc-economy.ts          # Economía feudal
│   ├── memory-engine.ts        # Memoria episódica NPC
│   ├── behavior-engine.ts      # Acciones autónomas NPC
│   ├── dialogue-manager.ts     # Sesiones de conversación
│   ├── social-graph.ts         # Relaciones, facciones, alianzas
│   │
│   │  ── Mecánicas de juego ──
│   ├── probability-engine.ts   # Resultados deterministas
│   ├── probability-expression.ts # Evaluador math (descenso recursivo)
│   ├── romance-engine.ts       # Relaciones románticas
│   ├── quest-system.ts         # Ciclo de vida de quests
│   ├── inventory-manager.ts    # Objetos, equipamiento, comercio
│   ├── navigator.ts            # Pathfinding en grafo (BFS)
│   │
│   │  ── Infraestructura ──
│   ├── agent-config.ts         # Config de agentes (SQLite-first + JSON)
│   ├── prompt-builder.ts       # Construcción de prompts
│   ├── model-manager.ts        # Catálogo de modelos
│   ├── settings.ts             # Persistencia de ajustes
│   └── websocket-manager.ts    # Pool de conexiones WebSocket
│
├── intelligence/               # Inteligencia de grafo
│   ├── graph-analyzer.ts       # Estadísticas del grafo
│   ├── graph-validator.ts      # Auto-reparación del grafo
│   └── pipeline.ts             # Orquestación del pipeline
│
├── memory/                     # Subsistema de memoria
│   ├── world-memory.ts         # Clase principal de memoria
│   ├── cognitive-pipeline.ts   # Extracción → contradicciones → pain signals
│   ├── entity-extractor.ts     # Extracción de entidades
│   └── write-buffer.ts         # Buffer de escritura batch
│
├── i18n/                       # Internacionalización (7 idiomas)
│   ├── types.ts                # Interfaz LanguagePack
│   ├── index.ts                # Registro, getLanguagePack()
│   └── [en|ru|de|fr|es|ja|zh].ts
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — acceso O(1) + NameIndex
│
└── utils/
    ├── sanitize.ts             # Defensa anti prompt injection
    └── template-resolver.ts    # Resolución {variable} en templates

mojo/kernels/                   # Núcleos de cómputo C FFI
├── c/
│   ├── probability_ffi.c       # Probabilidad de éxito, tirada, batch
│   ├── vector_ffi.c            # Operaciones vectoriales 4-dim
│   ├── vector_full.c           # Coseno batch 768-dim (BGE-M3)
│   ├── batch_ops.c             # Operaciones batch NPC
│   └── graph_ops.c             # Traversión de grafo, RRF, reputación
└── build.sh                    # Cross-compilación via Zig

public/                         # Frontend (HTML estático)
├── index.html                  # UI principal chat/juego de rol
├── agents.html                 # Config de agentes (i18n)
├── graph.html                  # Visualización de grafo (D3.js)
├── settings.html               # Ajustes globales (i18n)
└── worlds.html                 # Gestión de mundos + asistente de nacimiento
```

---

## Contenedor DI — NarrativeService

`NarrativeService` es el contenedor DI central. Instancia todos los servicios y conecta sus dependencias.

**Ciclo de vida:**
1. `new NarrativeService({dbPath, worldFrame})` — conectar todo
2. `start()` — iniciar cola LLM, sincronizar entidades, construir relaciones heurísticas (si entidades sin enlaces), lanzar director
3. `stop()` — detener director + LLM
4. `pause()` / `resume()` — cuando el usuario sale del chat
5. `reset(newDbPath, worldFrame)` — cambio en caliente de mundo
6. `shutdown()` — apagado limpio

---

## Ciclo de vida de una petición

### REST API (POST /api/chat/message)

```
1. Cadena middleware Hono:
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. Handler de ruta (chat.ts):
   - Validación Zod (ChatMessageSchema)
   - sanitizeInput() — eliminar patrones de inyección
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput():
   - Detección de intención
   - Enrutamiento al agente apropiado
   - Construcción de contexto
   - Generación de prompt
   - Llamada a LLM via cola
   - Parseo de respuesta
   - Actualización del estado del mundo

4. Respuesta: JSON { narrative, location, story_time, ... }
```

---

## Sistema de agentes

Cada agente es una clase con `generateResponse()`.

### Prioridad de agentes (mayor = procesado primero)

| Prioridad | Agente |
|-----------|--------|
| 10 | Narrator |
| 9 | NPC |
| 8 | Director |
| 7 | Scene, Quest Giver |
| 6 | Story Planner, Villain, Historian, Lorekeeper |
| 5 | Chronicler, Merchant |
| 4 | Social Sim, Cartographer |
| 3 | Researcher |

---

## Capa de datos

### EntityStore (JSON)
- Acceso O(1) por UID via `Map<string, EntityNode>`
- Búsqueda por nombre O(1) via `NameIndex`

### SQLiteStore
Tablas: `entities` (FTS5), `embeddings` (vectores), `memories`, `agent_prompts`, `ui_translations`

Búsqueda híbrida: FTS5 + vectores densos + Reciprocal Rank Fusion.

### Núcleos FFI
5 núcleos C via Zig: probability_ffi, vector_ffi, vector_full, batch_ops, graph_ops.

---

## Configuración

### Variables de entorno (.env)

| Variable | Defecto | Descripción |
|----------|---------|-------------|
| `WORLD_LLM_BASE_URL` | – | Endpoint compatible OpenAI |
| `WORLD_LLM_API_KEY` | – | Clave API |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Nombre del modelo |
| `WORLD_LLM_TIMEOUT` | `300` | Timeout de petición (segundos) |
| `WORLD_SERVER_HOST` | `127.0.0.1` | Dirección de escucha |
| `WORLD_SERVER_PORT` | `8000` | Puerto de escucha |
| `AUTH_PASSWORD` | – | Contraseña de login |

---

## Cadena Middleware

```
1. errorHandler     — Manejador de errores global
2. requestLogger    — Logging Pino
3. rateLimiter      — 100 req/min por IP
4. securityHeaders  — CSP, X-Frame-Options, etc.
5. CORS             — Origins localhost:8000
6. authMiddleware   — Validación de session cookie
```

---

## Tests

```bash
bun test                              # Todos los tests
bun test tests/entity-store.test.ts   # Tests de entity store
bun test tests/probability-engine.test.ts  # Tests de probabilidades
```

---

## Agregar un nuevo agente

1. Crear `src/services/my-agent.ts`
2. Registrar en `roleplay-engine.ts`
3. Agregar lógica de enrutamiento en `processInput()`
4. Agregar prompt de sistema en `agent-config.ts` o SQLite

---

## Patrones clave

- **Dual-write**: Ajustes escriben en SQLite + JSON
- **Resolución de templates**: Prompts con `{variable}`
- **Eval seguro**: Fórmulas vía descenso recursivo (sin eval)
- **Defensa anti inyección**: `sanitizeInput()` antes del LLM
- **Escritura JSON atómica**: via archivo temp + rename
- **Inyección de idioma**: `getLanguageInstruction()` agrega una directiva de idioma a los prompts de agentes para que las respuestas LLM coincidan con el idioma de la interfaz
