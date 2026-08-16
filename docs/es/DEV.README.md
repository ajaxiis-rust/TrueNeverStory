# TrueNeverStory — Guía del Desarrollador

Documentación técnica para contribuidores y desarrolladores.

---

## Visión general de la arquitectura

TrueNeverStory es un motor de juego de rol IA multi-agente con arquitectura State-First. Un jugador envía mensajes que se procesan a través de un pipeline determinista: análisis de intención, simulación, mutación de estado, construcción de contexto y renderizado por agentes especializados.

```
Entrada del jugador
    ↓
Parser de intención → Motor de simulación → Mutador de estado → Constructor de contexto
    ↓
Dramaturg (MCP) → Stylist (MCP) → Censor → Servicio de traducción
    ↓
Respuesta narrativa
```

---

## Stack técnico

| Capa | Tecnología |
|-------|-----------|
| Runtime | Bun (no Node.js) |
| Framework web | Hono |
| Base de datos | SQLite vía `bun:sqlite` (modo WAL) |
| Validación | Zod |
| Logging | Pino |
| LLM | API compatible con OpenAI (vía HTTP) |
| WebSocket | `@hono/node-ws` |
| Núcleos de cómputo | C FFI (compilado vía Zig) + fallback TypeScript |

---

## Estructura del proyecto

```
src/
├── index.ts                    # Punto de entrada del servidor (Bun.serve)
├── app.ts                      # App Hono — cadena de middleware + montaje de rutas
│
├── config/
│   ├── env.ts                  # Config de entorno validada con Zod (.env + process.env)
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # Cliente HTTP LLM con caché LRU
│   ├── llm-queue.ts            # Cola de peticiones concurrentes con pause/resume
│   ├── llm-types.ts            # Definiciones de tipos LLM
│   ├── sqlite-store.ts         # SQLite (FTS5 + vectores + prompts de agentes + traducciones)
│   ├── vector-ops.ts           # Coseno, L2, producto punto
│   ├── mojo-ffi.ts             # Bindings FFI (C/Mojo) + fallbacks TS
│   ├── session-store.ts        # Almacenamiento de sesiones respaldado en SQLite
│   ├── event-bus.ts            # Sistema de eventos pub/sub
│   ├── history-manager.ts      # Persistencia del historial de conversación
│   ├── atomic-io.ts            # Lectura/escritura JSON segura (renombrado atómico)
│   └── providers/
│       ├── index.ts            # Registro de proveedores
│       ├── llm-provider.ts     # Interfaz abstracta de proveedor
│       ├── provider-manager.ts # Enrutamiento multi-proveedor
│       ├── openai-provider.ts
│       ├── ollama-provider.ts
│       ├── anthropic-provider.ts
│       ├── google-provider.ts
│       └── llamacpp-provider.ts
│
├── middleware/
│   ├── auth.ts                 # Auth basada en cookies (PBKDF2, CSRF, rate limiting)
│   ├── rate-limiter.ts         # Token bucket por IP
│   ├── security-headers.ts     # CSP, X-Frame-Options, etc.
│   ├── error-handler.ts        # Manejador de errores global
│   └── logger.ts               # Registro de peticiones
│
├── models/                     # Modelos de datos (25 archivos)
│   ├── entity.ts               # Entidad núcleo (uid, name, perfil con capas L1/L2/L3)
│   ├── chat.ts                 # ChatMessageSchema, SessionSetupSchema (Zod)
│   ├── director.ts             # DirectorTask, TaskPriority
│   ├── intent.ts               # Intent, IntentType
│   ├── simulation.ts           # SimulationResult, SimulationState
│   ├── heartbeat.ts            # HeartbeatPayload
│   ├── memory.ts               # MemoryEntry
│   ├── probability.ts          # ProbabilityProfile, Modifier
│   ├── romance.ts              # RomanceState
│   ├── story.ts                # StoryContext
│   ├── quest.ts                # Quest, Objective, Reward
│   ├── item.ts                 # Item, ItemBoost
│   ├── rank.ts                 # Jerarquía feudal (10 rangos)
│   ├── archetype.ts            # 34 arquetipos de NPC
│   ├── npc-state.ts            # Estado en tiempo de ejecución de NPC
│   └── npc-stats.ts            # NPCStats, Vices, FamilyExpenses
│
├── routes/                     # Rutas API (18 módulos)
│   ├── index.ts                # Agregador de rutas — monta todos los módulos bajo /api
│   ├── chat.ts                 # POST /chat/setup, /message, /stream (SSE), /agent
│   ├── entities.ts             # GET /entity/:uid, /neighbors, /path, /search, /graph/*
│   ├── agents.ts               # CRUD de configs de agentes + prompts por idioma
│   ├── i18n.ts                 # CRUD de traducciones (7 idiomas)
│   ├── settings.ts             # GET/PUT de ajustes, gestión del servidor LLM
│   ├── worlds.ts               # CRUD multi-mundo, cambio, generación de capítulos
│   ├── memory.ts               # Endpoints de memoria
│   ├── branches.ts             # Gestión de ramas narrativas
│   ├── probability.ts          # Consultas de probabilidad
│   ├── romance.ts              # Endpoints del sistema de romance
│   ├── quests.ts               # Endpoints de misiones
│   ├── sessions.ts             # Historial de sesiones
│   ├── maintenance.ts          # Mantenimiento del grafo
│   ├── launch.ts               # Nueva partida / reanudar
│   ├── health.ts               # Comprobación de salud
│   ├── models.ts               # Catálogo de modelos
│   ├── providers.ts            # Gestión de proveedores LLM
│   └── system.ts               # Pausa/reanudación del procesamiento en segundo plano
│
├── services/                   # Lógica de negocio (60+ servicios)
│   │
│   │  ── Motor principal ──
│   ├── narrative-service.ts    # Contenedor DI — instancia TODOS los servicios
│   ├── roleplay-engine.ts      # Pipeline de procesamiento principal (processInput)
│   ├── story-engine.ts         # Generación de eventos narrativos
│   ├── director-loop.ts        # Progresión narrativa en segundo plano (setInterval)
│   ├── agent-coordinator.ts    # Cola de tareas con prioridad para el director
│   │
│   │  ── Agentes (Big Six) ──
│   ├── agents/
│   │   ├── dramaturg.ts       # Selección de patrones narrativos (MCP)
│   │   ├── validator.ts       # Verificación de hechos vía Wikipedia (MCP)
│   │   ├── stylist.ts         # Renderizado de prosa (MCP)
│   │   ├── actor.ts           # Diálogos + interacciones de NPC
│   │   ├── censor.ts          # Eliminación de clichés de IA
│   │   └── chronicler.ts      # Actualizaciones de línea de tiempo + memoria
│   ├── agent-registry-v2.ts   # Registro + búsqueda de agentes
│   └── agent-v2.ts            # Interfaz AgentV2 + clase base
│
│   │  ── Pipeline de estado ──
│   ├── intent-parser.ts       # Clasificación de la intención del usuario
│   ├── simulation-engine.ts   # Simulación determinista del mundo
│   ├── state-mutator.ts       # Actualizaciones del estado del mundo
│   ├── context-builder.ts     # Ensamblaje del contexto del prompt
│   ├── heartbeat.ts           # Latido del mundo en segundo plano
│   └── translation-service.ts # Traducción de respuestas multilingüe
│   │
│   │  ── Sistemas del mundo ──
│   ├── story-planner.ts        # Planificación de arcos impulsada por LLM
│   ├── story-arc-manager.ts    # Ciclo de vida del arco
│   ├── branch-manager.ts       # Ramas narrativas
│   ├── world-builder.ts        # Creación de entidades del mundo
│   ├── world-clock.ts          # Tiempo en el mundo
│   ├── world-evolver.ts        # Auto-añadir NPCs/lugares/objetos
│   ├── world-manager.ts        # CRUD multi-mundo
│   ├── world-validator.ts      # Validación del marco del mundo
│   ├── birth.ts                # Asistente de creación de personaje
│   ├── start-resolver.ts       # Resolución del inicio de partida
│   │
│   │  ── Sistemas NPC ──
│   ├── npc-runtime.ts          # Gestión de estado de NPC
│   ├── npc-generator.ts        # Creación inteligente de NPC
│   ├── npc-economy.ts          # Núcleo de la economía feudal
│   ├── npc-economy-runtime.ts  # Simulación por turnos
│   ├── slave-economy.ts        # Mecánicas del comercio de esclavos
│   ├── memory-engine.ts        # Memoria episódica de NPC
│   ├── memory-manager.ts       # Búsqueda de memoria + contexto
│   ├── behavior-engine.ts      # Acciones autónomas de NPC
│   ├── dialogue-manager.ts     # Sesiones de conversación de NPC
│   ├── dialogue-context.ts     # Prompts enriquecidos de NPC
│   ├── social-graph.ts         # Relaciones, facciones, alianzas
│   │
│   │  ── Mecánicas de juego ──
│   ├── probability-engine.ts   # Resultados deterministas
│   ├── probability-profiles.ts # Definiciones de perfiles
│   ├── probability-expression.ts # Evaluador matemático seguro (descenso recursivo)
│   ├── probability-resolver.ts # Resolución de contexto
│   ├── romance-engine.ts       # Relaciones románticas
│   ├── romance-profiles.ts     # Definiciones de acciones de romance
│   ├── quest-system.ts         # Ciclo de vida de misiones, objetivos, cadenas
│   ├── quest-manager.ts        # Persistencia de misiones
│   ├── inventory-manager.ts    # Objetos, equipamiento, comercio
│   ├── item-evaluation.ts      # Unicidad de objetos + evaluación de boosts
│   ├── navigator.ts            # Pathfinding en grafo (BFS)
│   │
│   │  ── Infraestructura ──
│   ├── agent-config.ts         # Config de agentes (SQLite-first + fallback JSON)
│   ├── prompt-builder.ts       # Construcción de prompts
│   ├── model-manager.ts        # Catálogo de modelos + descargas
│   ├── settings.ts             # Persistencia de ajustes
│   └── websocket-manager.ts    # Pool de conexiones WebSocket
│
├── intelligence/               # Inteligencia de grafo
│   ├── graph-analyzer.ts       # Estadísticas del grafo
│   ├── graph-validator.ts      # Reparaciones auto-regenerativas del grafo
│   ├── duplicate-detector.ts   # Deduplicación de entidades
│   ├── recommender.ts          # Sugerencias de relaciones
│   ├── relationship-repairer.ts
│   ├── rule-checker.ts         # Validación de reglas del mundo
│   ├── scene-generator.ts      # Descripciones de escenas
│   ├── subgraph-expander.ts    # Expansión de contexto
│   └── pipeline.ts             # Orquestación del pipeline de inteligencia
│
├── memory/                     # Subsistema de memoria
│   ├── world-memory.ts         # Clase principal de memoria
│   ├── cognitive-pipeline.ts   # Extracción de entidades → contradicción → señales de dolor
│   ├── entity-extractor.ts     # Extraer entidades de texto
│   ├── contradiction-detector.ts
│   ├── pain-signals.ts         # Detección de momentos importantes
│   ├── scoring.ts              # Puntuación de importancia de memoria
│   ├── clustering.ts           # Agrupación de memoria
│   ├── partition.ts            # Particionado de memoria
│   ├── faiss-index.ts          # Índice vectorial (compatible con FAISS)
│   ├── embedding-queue.ts      # Generación asíncrona de embeddings
│   ├── optimizer.ts            # Optimización de memoria
│   └── write-buffer.ts         # Buffer de escritura por lotes
│
├── mcp/                        # Servidor MCP — parsers de Biblia/Gutenberg, herramientas de Wikipedia
│
├── i18n/                       # Internacionalización (7 idiomas)
│   ├── types.ts                # Interfaz LanguagePack
│   ├── index.ts                # Registro, getLanguagePack(), setLanguage()
│   ├── en.ts                   # Inglés (base)
│   ├── ru.ts                   # Ruso
│   ├── de.ts                   # Alemán
│   ├── fr.ts                   # Francés
│   ├── es.ts                   # Español
│   ├── ja.ts                   # Japonés
│   └── zh.ts                   # Chino
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — acceso O(1) + NameIndex
│
└── utils/
    ├── logger.ts               # Logger Pino
    ├── hash.ts                 # Utilidades SHA-256
    ├── time.ts                 # Formateo de tiempo
    ├── sanitize.ts             # Defensa contra inyección de prompt
    └── template-resolver.ts    # Resolución de {variable} en plantillas de agentes

mojo/
├── kernels/                    # Núcleos de cómputo C FFI
│   ├── c/
│   │   ├── probability_ffi.c   # Probabilidad de éxito, tirada, probabilidad por lotes
│   │   ├── vector_ffi.c        # Operaciones vectoriales 4-dim (coseno, L2, producto punto)
│   │   ├── vector_full.c       # Coseno por lotes 768-dim (BGE-M3)
│   │   ├── batch_ops.c         # Operaciones NPC por lotes (decaimiento de edad, vicio, impuesto)
│   │   └── graph_ops.c         # Recorrido de grafos, RRF, reputación
│   ├── build.sh                # Compilación cruzada vía Zig
│   └── dist/                   # .so/.dylib/.dll compilados
└── src/                        # 81 archivos fuente Mojo (backend de rendimiento opcional)

public/                         # Frontend (HTML estático)
├── index.html                  # UI principal de chat/juego de rol
├── agents.html                 # Configuración de agentes (i18n)
├── graph.html                  # Visor del grafo de conocimiento (D3.js)
├── models.html                 # Gestión de modelos
├── providers.html              # Ajustes de proveedores LLM
├── settings.html               # Ajustes globales (i18n)
├── worlds.html                 # Gestión de mundos + asistente de nacimiento
└── static/
    ├── fonts/                  # Fuentes personalizadas
    └── vendor/                 # d3.v7.min.js, purify.min.js

conf/                           # Configuración en tiempo de ejecución (gitignored)
├── settings.json               # Ajustes de la app (LLM, auth, servidor)
├── agents.json                 # Asignaciones globales de modelos de agentes
├── providers.json              # Registro de proveedores
└── llm-config.json             # Configuración de proveedores LLM

worlds/                         # Datos del mundo (gitignored)
└── default/
    ├── tns.db                  # SQLite (entidades, embeddings, recuerdos, prompts, traducciones)
    ├── entities.json           # Grafo de entidades (JSON)
    ├── world_frame.json        # Definición del mundo
    ├── session_history/        # Registros de conversación por sesión
    ├── chapters/               # Capítulos literarios generados
    ├── npc_profiles/           # Archivos de estado de NPC
    ├── timeline.jsonl          # Línea de tiempo de eventos
    ├── story_planner.json      # Estado del planificador de historias
    ├── villains.json           # Estado del villano
    └── world_clock.json        # Tiempo en el mundo

worlds/_sessions/
    └── sessions.db             # Almacenamiento de sesiones SQLite
```

---

## Inyección de dependencias — NarrativeService

`NarrativeService` (`src/services/narrative-service.ts`) es el contenedor DI central. Instancia todos los servicios (más de 30) y conecta sus dependencias.

```
NarrativeService
├── entityStore (UnifiedEntityStore) — acceso O(1) a entidades
├── graphStore (GraphStore) — mapa de adyacencia + pathfinding
├── eventBus (EventBus) — eventos pub/sub
├── historyMgr (HistoryManager) — persistencia de conversación
├── llm (LLMClient) — cliente HTTP para APIs LLM
├── llmQueue (LLMQueue) — cola de peticiones concurrentes (máx. 3)
├── sqliteStore (SQLiteStore) — FTS5 + vectores + agent_prompts + traducciones
├── chronicler (Chronicler) — escritor de timeline.jsonl
├── validator (WorldValidator) — validación del marco del mundo
├── questMgr (QuestManager) — persistencia de misiones
├── clock (WorldClock) — tiempo en el mundo
├── probEngine (ProbabilityEngine) — resultados deterministas
├── probResolver (ProbabilityContextResolver) — contexto para probabilidad
├── storyPlanner (StoryPlanner) — planificación de arcos impulsada por LLM
├── villainManager (VillainManager) — acciones del antagonista
├── socialSim (SocialSimulator) — dinámica social de NPC
├── npcRuntime (NPCRuntime) — gestión de estado de NPC
├── storyEngine (StoryEngine) — generación de eventos narrativos
├── director (DirectorLoop) — progresión narrativa en segundo plano
├── worldBuilder (WorldBuilder) — creación de entidades
├── agentCoordinator (AgentCoordinator) — cola de tareas con prioridad
├── storyArcManager (StoryArcManager) — ciclo de vida del arco
├── userAgent (UserAgent) — grupo + combate
├── npcGenerator (NPCGenerator) — creación inteligente de NPC
├── worldEvolver (WorldEvolver) — expansión automática del mundo
├── graphValidator (GraphValidator) — grafo auto-regenerativo
├── intentParser (IntentParser) — clasificación de la intención del usuario
├── simEngine (SimulationEngine) — simulación determinista del mundo
├── stateMutator (StateMutator) — actualizaciones del estado del mundo
├── contextBuilder (ContextBuilder) — ensamblaje del contexto del prompt
├── heartbeatService (HeartbeatService) — latido del mundo en segundo plano
├── tnsServer (TNSServer) — servidor MCP (Biblia/Gutenberg/Wikipedia)
├── translationService (TranslationService) — traducción multilingüe
└── agentRegistry (AgentRegistryV2) — registro + búsqueda de agentes
```

**Ciclo de vida:**
1. `new NarrativeService({dbPath, worldFrame})` — el constructor conecta todo
2. `start()` — inicia la cola LLM, sincroniza entidades a SQLite, construye relaciones heurísticas automáticamente (si hay entidades sin conexiones), inicia el bucle del director
3. `stop()` — detiene el director + la cola LLM
4. `pause()` / `resume()` — para cuando el usuario sale de la vista de chat
5. `reset(newDbPath, worldFrame)` — cambio en caliente a un mundo diferente
6. `shutdown()` — apagado limpio

---

## Ciclo de vida de una petición

### REST API (POST /api/chat/message)

```
1. Cadena de middleware Hono:
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. Manejador de ruta (chat.ts):
   - Validación Zod (ChatMessageSchema)
   - sanitizeInput() — eliminar patrones de inyección de prompt
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput():
   - Parser de intención → clasificar la intención del usuario
   - Motor de simulación → simulación determinista del mundo
   - Mutador de estado → actualizar el estado del mundo
   - Constructor de contexto → ensamblar el contexto del prompt
   - Dramaturg (MCP) → seleccionar patrón narrativo
   - Stylist (MCP) → renderizar prosa
   - Censor → eliminar clichés de IA
   - Servicio de traducción → respuesta multilingüe
   - Devolver la cadena narrativa

4. Respuesta: JSON { narrative, location, story_time, ... }
```

### Streaming SSE (POST /api/chat/stream)

Igual que REST, pero envuelve `engine.processInputStream()` en un `ReadableStream` con pings keepalive.

### WebSocket (ws://host/ws/...)

```
1. Upgrade: comprobar cookie de sesión (bring_session)
2. Al recibir mensaje: JSON parse → enrutar al motor
3. Al responder: JSON stringify → ws.send()
```

---

## Sistema de agentes

Cada agente implementa la interfaz `AgentV2` con un método `process()` que recibe la intención, los resultados de la simulación y el contexto del juego.

### Los Big Six

| Agente | Rol | Herramientas MCP |
|--------|-----|------------------|
| Dramaturg | Selección de patrones narrativos | search_verses, get_pattern, get_archetype |
| Validator | Verificación de hechos vía Wikipedia | verify_fact, get_context |
| Stylist | Renderizado de prosa | get_style_pattern, apply_style |
| Actor | Diálogos + interacciones de NPC | — |
| Censor | Eliminación de clichés de IA | — |
| Chronicler | Actualizaciones de línea de tiempo + memoria | — |

### Interfaz AgentV2

```typescript
interface AgentV2 {
  readonly id: AgentId;
  readonly name: string;
  readonly description: string;
  readonly mcpTools: string[];
  process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput>;
}
```

**Nota:** El sistema heredado de 14 agentes está obsoleto pero sigue funcionando por compatibilidad con versiones anteriores. Los IDs de agentes antiguos (`@narrator`, `@director`, etc.) se enrutan internamente a los nuevos agentes.

### Resolución de prompts

Los prompts de los agentes se resuelven en este orden:
1. Tabla `agent_prompts` de SQLite (por mundo + idioma)
2. Respaldo JSON (`worlds/{world}/agents/{agentId}.json`)
3. Valores por defecto codificados (`DEFAULT_PROMPTS` en `agent-config.ts`)

Las plantillas usan marcadores `{variable}` resueltos por `resolveTemplate()`.

---

## Integración MCP (v0.32.5)

TNSServer (`src/mcp/tns-server.ts`) proporciona herramientas MCP para acceder a datos externos.

| Herramienta | Fuente | Descripción |
|-------------|--------|-------------|
| search_verses | Biblia | Buscar versículos bíblicos por texto, libro o referencia |
| get_pattern | Biblia | Obtener patrones narrativos por arquetipo, tono o función |
| get_archetype | Biblia | Obtener detalles del arquetipo por nombre |
| get_style_pattern | Gutenberg | Buscar estilos por tono, etiquetas o descripción |
| apply_style | Gutenberg | Aplicar estilo al texto (deslexificar y devolver sugerencias) |
| verify_fact | Wikipedia | Verificar una afirmación factual |
| get_context | Wikipedia | Obtener el contexto de Wikipedia de un tema |
| get_economic_phase | Base de datos económica | Fase actual del ciclo económico |
| calculate_price | Base de datos económica | Precio con modificador de fase |
| generate_dilemma | Base de datos económica | Dilema fiscal de facción |
| check_jubilee | Base de datos económica | Comprobación del ciclo de jubileo |

### Consola MCP (v0.32.5)

Consola web de gestión de bases de datos para todas las bases de datos del proyecto.

**Lanzamiento:** `./startgame.sh --mcp` (inicia únicamente el servidor de gestión de BD en el puerto 8000, sin el juego)

**UI web:** `http://localhost:8000` — pestañas para Bible, Gutenberg, Wikipedia, LiteraryCompiler, Economics, System

**API:** Todos los endpoints bajo `/mcp/*` — consulta `src/routes/mcp.ts` para la lista completa. Progreso SSE en `/mcp/stream/:jobId`.

**Descarga selectiva de Gutenberg:** Descarga basada en catálogo con filtrado por género/autor. Scripts de descarga basados en TypeScript con seguimiento de progreso vía SSE.

---

## Capa de datos

### EntityStore (JSON)

- `entities.json` — mapa de adyacencia de todas las entidades
- Acceso O(1) por UID vía `Map<string, EntityNode>`
- Búsqueda de nombres O(1) vía `NameIndex` (sin distinguir mayúsculas)
- Seguimiento de mutaciones vía el callback `onMutation()` → sincroniza con SQLite

### SQLiteStore

Tablas:
- `entities` — búsqueda de texto completo FTS5
- `embeddings` — blobs vectoriales (BGE-M3, 1024 dims)
- `memories` — recuerdos del juego de rol con FTS5
- `agent_prompts` — almacenamiento de prompts por mundo + idioma
- `ui_translations` — cadenas de UI por idioma + página

Búsqueda híbrida: palabra clave FTS5 + vector denso + Reciprocal Rank Fusion.

### Núcleos FFI

5 núcleos C compilados vía Zig para distribución multiplataforma:

| Núcleo | Funciones | Fallback |
|--------|-----------|----------|
| `probability_ffi` | success_chance, roll, batch | TS puro |
| `vector_ffi` | cosine_4d, l2_4d, dot_4d | TS puro |
| `vector_full` | batch_cosine_768d | TS puro |
| `batch_ops` | age_decay, vice_decay, tax, loyalty | TS puro |
| `graph_ops` | rrf_fusion, reputation | TS puro |

Detección: `dlopen()` en `mojo-ffi.ts`, con fallback en caso de fallo.

---

## Configuración

### Variables de entorno (.env)

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `WORLD_LLM_BASE_URL` | – | Endpoint compatible con OpenAI |
| `WORLD_LLM_API_KEY` | – | Clave API |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Nombre del modelo |
| `WORLD_LLM_TIMEOUT` | `300` | Timeout de petición (segundos) |
| `WORLD_LLM_MAX_TOKENS` | `4096` | Máximo de tokens por respuesta |
| `WORLD_LLM_TEMPERATURE` | `0.7` | Temperatura de muestreo |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | Máximo de peticiones LLM concurrentes |
| `WORLD_DB_PATH` | `./world_db` | Directorio de la base de datos (heredado) |
| `WORLDS_ROOT` | `./worlds` | Directorio raíz de mundos |
| `WORLD_SERVER_HOST` | `127.0.0.1` | Dirección de escucha |
| `WORLD_SERVER_PORT` | `8000` | Puerto de escucha |
| `AUTH_PASSWORD` | – | Contraseña de login (vacía = sin auth) |
| `AUTH_PASSWORD_HASH` | – | Hash PBKDF2 (salt:hash) |

### Ajustes (conf/settings.json)

Se cargan vía `loadSettings()`. Prioridad: settings.json > .env > valores por defecto.

Contiene: parámetros LLM, configuración de embeddings, configuración del servidor, contraseña de auth, ajustes de memoria, suerte de probabilidad, selección de mundo, idioma.

---

## Cadena de middleware

El orden importa — se aplican en `app.ts`:

```
1. errorHandler     — manejador de errores global
2. requestLogger    — registro de peticiones Pino
3. rateLimiter      — 100 req/min por IP
4. securityHeaders  — CSP, X-Frame-Options, etc.
5. CORS             — orígenes localhost:8000
6. authMiddleware   — validación de cookie de sesión (protege /api/*, /ws/*)
```

---

## Tests

```bash
bun test                              # Ejecutar todos los tests
bun test tests/entity-store.test.ts   # Tests del entity store
bun test tests/probability-engine.test.ts  # Tests de probabilidad
bun test tests/integration/server.test.ts  # Tests de integración (requiere servidor en marcha)
```

Los archivos de test usan la convención `*.test.ts` junto a los archivos fuente.

---

## Agregar un nuevo agente

1. Crear `src/services/my-agent.ts`:
```typescript
export class MyAgent {
  constructor(deps: { llmQueue: LLMQueue; entityStore: UnifiedEntityStore }) {}

  async generateResponse(ctx: AgentContext): Promise<string> {
    const prompt = buildPrompt(ctx);
    return await this.deps.llmQueue.enqueue({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4o-mini",
    });
  }
}
```

2. Registrar en el constructor de `roleplay-engine.ts`
3. Añadir lógica de enrutamiento en `processInput()`
4. Añadir el prompt de sistema en `agent-config.ts` o en la tabla `agent_prompts` de SQLite

---

## Agregar una nueva ruta

1. Crear `src/routes/my-route.ts`:
```typescript
import { Hono } from "hono";
const myRoute = new Hono();
myRoute.get("/my-endpoint", async (c) => c.json({ ok: true }));
export { myRoute as myRouteRouter };
```

2. Montar en `src/routes/index.ts`:
```typescript
import { myRouteRouter } from "./my-route";
routes.route("/", myRouteRouter);
```

---

## Gestión de mundos

Múltiples mundos aislados bajo `worlds/`:

```
worlds/
├── default/           # Mundo activo
│   ├── tns.db         # Base de datos SQLite
│   ├── entities.json  # Grafo de entidades
│   └── ...
├── levant/            # Otro mundo
└── _sessions/         # Almacén de sesiones global
```

Cambiar de mundo vía `POST /api/worlds/:name/switch`. Intercambia en caliente el contenedor DI.

Las estadísticas del mundo están disponibles vía `GET /api/worlds/:name/detail` — devuelve recuentos de entidades por tipo, listas de personajes/lugares/facciones/objetos, recuentos de sesiones/eventos/capítulos/villanos y las reglas del mundo.

---

## Patrones clave

- **Escritura dual**: los ajustes se escriben tanto en SQLite como en JSON (compatibilidad con versiones anteriores)
- **Resolución de plantillas**: los prompts de los agentes usan marcadores `{variable}` resueltos en tiempo de ejecución
- **Evaluación segura de expresiones**: las fórmulas de probabilidad usan un parser de descenso recursivo (sin eval)
- **Defensa contra inyección de prompt**: `sanitizeInput()` elimina patrones de inyección comunes antes del LLM
- **Escritura JSON atómica**: `atomicWriteJson()` usa archivo temporal + rename para seguridad ante fallos
- **Basado en eventos**: `EventBus` desacopla los servicios (creación de entidades, eventos de memoria, etc.)
- **Inyección de instrucciones de idioma**: las directivas de idioma se incrustan en los prompts de los agentes al crear el mundo vía `seedWorldAgents()`, y también se añaden en tiempo de ejecución mediante `getLanguageInstruction()` para diálogos de NPC dinámicos
