# TrueNeverStory — Documento de Arquitectura

> Un análisis de Diseño Dirigido por el Dominio del motor RPG narrativo TrueNeverStory.
> Actualizado para v0.33.4 — RoleplayEngine refactorizado con SessionState, CommandHandler, PipelineRunner, estrategias de prosa.

---

## [A1] Patrón Arquitectónico

**Arquitectura de cebolla por capas con extensiones dirigidas por eventos + pipeline State-First**

TrueNeverStory sigue una **arquitectura de cebolla (hexagonal) por capas** en su núcleo, envuelta con una **capa de orquestación dirigida por eventos** para el procesamiento narrativo asíncrono. A partir de v0.33.4, el motor utiliza un **pipeline State-First** donde la simulación determinista ocurre antes de la generación de prosa.

El patrón encaja porque:

1. **Los modelos de dominio están aislados** — `src/models/` contiene estructuras de datos puras sin dependencias de infraestructura. `EntityNode`, `Quest`, `StoryContext`, `NPCProfile`, `ProbabilityModifier`, `Intent`, `SimulationResult` son todos independientes del framework.
2. **Los servicios orquestan la lógica de dominio** — `src/services/` contiene servicios de aplicación (`RoleplayEngine`, `StoryEngine`) y servicios de dominio (`ProbabilityEngine`, `SocialSimulator`, `RomanceEngine`, `SimulationEngine`).
3. **La infraestructura se empuja a los bordes** — `src/lib/` alberga la persistencia (`SQLiteStore`, `AtomicIO`), las integraciones externas (`LLMClient`, `ProviderManager`) y el transporte (`WebSocketManager`).
4. **Las rutas son adaptadores finos** — `src/routes/` mapea HTTP a llamadas de servicio con lógica mínima.
5. **Integración MCP** — `src/mcp/` proporciona fuentes de conocimiento externas (Biblia, Gutenberg, Wikipedia) a través del Model Context Protocol.

El **bus de eventos** (`EventBus` en `src/lib/event-bus.ts`) añade una capa de desacoplamiento asíncrono entre contextos delimitados, permitiendo que el Director Loop orqueste eventos narrativos sin acoplamiento directo a los subsistemas de NPC, Social o Quest.

### Pipeline State-First (v0.33.4)

El pipeline ahora se estructura como etapas componibles gestionadas por `PipelineRunner`:

```
Entrada del Jugador (cualquier idioma)
  │
  ▼
PipelineRunner.buildContext() — instantánea del estado del motor
  │
  ▼
PipelineRunner.translateAndClassify() — IntentParser + TranslationService
  │ texto traducido + intención
  ▼
CommandHandler.handle() — salida temprana para comandos
  │
  ▼
PipelineRunner.runSimulation() — SimulationEngine (determinista)
  │ resultado, probabilidad, cambios de estado
  ▼
StateMutator.applyChanges() — aplica a EntityStore
  │
  ▼
PipelineRunner.buildGameContext() — ContextBuilder
  │
  ▼
Generadores de Prosa:
  └─ LiteraryV2Generator → Stylist
  │
  ▼
TranslationService.translate() — si el idioma objetivo no es inglés
  │
  ▼
Respuesta al Usuario

Total: 2-3 llamadas LLM
```

### Pipeline de Procesamiento de Gutenberg (v0.33.4)

Un pipeline de dos fases convierte archivos .txt crudos de Gutenberg en bases de datos consumibles por los agentes:

**Fase A (V1 — basada en reglas, sin LLM):**
```
classics.db → GutenbergParser → gutenberg-normalized.db (estilos + FTS)
         └→ compilador de 4 pasadas → classics-compiled.db (plantillas de quest)
              DramaturgicPass → StylisticPass → EmotionalPass → MetadataPass → Linter
```

**Fase B (V2 — enriquecida con LLM):**
```
classics-compiled.db → AnalyzePass → narrative_extractor → literary.db (scene_templates + style_patterns)
```

**Nuevas tablas en classics-compiled.db:**
- `narrative_arcs` — arquetipos de arco argumental y puntos de tensión por libro
- `thematic_motifs` — motivos simbólicos con seguimiento de evolución
- `quality_calibration` — puntuaciones de calidad de respuesta del LLM

**PlayerProfileStore** — perfiles de estilo de jugador entre agentes, independientes (14 métricas), almacenados en `data/player-profiles.db`.

### Arquitectura de Modelo Dual (v0.33.4)

El motor soporta dos modelos LLM por agente:

| Modelo | Propósito | Ejemplos |
|-------|---------|----------|
| **Modelo principal** | Generación narrativa, diálogo de NPC, planificación de historia | llama-3.1-8b, qwen2.5-14b |
| **Modelo de traducción** | Traducción, clasificación de intención (rápido, pequeño) | phi-3-mini, gemma-2-2b, qwen2.5-3b |

**Configuración** (por agente en `conf/agents.json`):
```json
{
  "agentId": "translation",
  "providerId": "ollama",
  "modelId": "qwen2.5:14b",
  "translationProviderId": "ollama",
  "translationModelId": "phi3:mini"
}
```

**LLMClient** resuelve el modelo mediante la bandera `useTranslationModel`:
- `LLMQueue.getAgentClient("translation", { useTranslationModel: true })` → usa `translationModelId`
- `LLMQueue.getAgentClient("stylist")` → usa `modelId`

```
┌─────────────────────────────────────────────────┐
│                  Rutas (HTTP/WS)                │  ← Capa de Adaptadores
├─────────────────────────────────────────────────┤
│            Servicios de Aplicación              │  ← Casos de Uso
│  RoleplayEngine │ NarrativeService │ StoryEngine │
├─────────────────────────────────────────────────┤
│              Servicios de Dominio               │  ← Lógica de Dominio
│  ProbabilityEngine │ SocialSimulator │ NPCRuntime │
├─────────────────────────────────────────────────┤
│              Modelos de Dominio                 │  ← Entidades Nucleares
│  EntityNode │ Quest │ NPCProfile │ StoryArc      │
├─────────────────────────────────────────────────┤
│                Infraestructura                  │  ← Persistencia/Externo
│  SQLiteStore │ LLMClient │ EventBus │ AtomicIO   │
└─────────────────────────────────────────────────┘
```

---

## [A2] Contextos Delimitados

### BC1: Gestión de Mundo

**Propósito:** Ciclo de vida multi-mundo — creación, configuración, cambio y persistencia del estado del mundo.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | `World`, `WorldFrame` |
| **Entidades clave** | `EntityNode` (Character, Faction, Location, Item, Event, Race, WorldRule) |
| **Objetos de valor** | `WorldCreateParams`, `WorldSummary`, `LayeredProfile` (capas L1/L2/L3) |
| **Eventos de dominio** | `WORLD_CREATED`, `WORLD_FRAME_LOADED`, `WORLD_EVOLVED` |
| **Persistencia** | `worlds/{name}/world_frame.json`, `worlds/{name}/entities.json` |

**Archivos clave:**
- `src/services/world-manager.ts` — operaciones CRUD, cambio de mundo
- `src/services/world-builder.ts` — construcción de mundo por capas dirigida por LLM
- `src/services/world-validator.ts` — comprobaciones de integridad
- `src/services/world-evolver.ts` — añade NPCs/ubicaciones/objetos con el tiempo
- `src/routes/worlds.ts` — adaptador HTTP

**Reglas de dominio:**
- Los nombres de mundo se convierten en slug y son únicos
- Cada mundo tiene su propio directorio de datos aislado bajo `worlds/`
- `WorldFrame` define la estructura canónica (calendario, sistema de magia, razas, facciones, ubicaciones, objetos, eventos históricos, reglas del mundo)
- Los perfiles de entidad usan un sistema de 3 capas: L1 (identidad), L2 (estado dinámico), L3 (oculta/secreta)

---

### BC2: Entidad y Grafo

**Propósito:** Representación en memoria de las entidades del mundo y sus relaciones mediante un grafo. Proporciona búsquedas O(1) y recorrido del grafo.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | `GraphStore` (raíz de agregado del grafo del mundo) |
| **Entidades clave** | `EntityNode`, `GraphEdge` |
| **Objetos de valor** | `Relationship`, `LayeredProfile`, `GraphSummary` |
| **Eventos de dominio** | `ENTITY_ADDED`, `ENTITY_UPDATED`, `ENTITY_REMOVED`, `RELATIONSHIP_ADDED`, `RELATIONSHIP_BROKEN`, `GRAPH_CHANGED` |
| **Persistencia** | `worlds/{name}/entities.json` (vía `UnifiedEntityStore`), `worlds/{name}/branches.json` |

**Archivos clave:**
- `src/store/entity-store.ts` — `UnifiedEntityStore` con `NameIndex` para resolución O(1) de nombre→UID
- `src/services/graph-store.ts` — grafo de mapa de adyacencia con aristas directas/inversas
- `src/services/branch-manager.ts` — ramificación tipo Git para grafos de historia
- `src/intelligence/` — análisis de grafo, validación, reparación de relaciones

**Reglas de dominio:**
- Las entidades tienen un `uid` único y se resuelven por nombre, token o prefijo de tipo
- `NameIndex` soporta resolución difusa (insensible a mayúsculas, basada en tokens, sin tipo)
- `BranchManager` soporta ramificación padre→hijo con adiciones/eliminaciones por rama
- Las aristas del grafo son bidireccionales (mapas directo + inverso)

---

### BC3: Narrativa e Historia

**Propósito:** Generación narrativa central — el narrador, las transiciones de escena, los beats de historia y la orquestación dramática.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | `StoryContext`, `StoryArc`, `DirectorTask`, `ChapterData`, `BeatData` |
| **Entidades clave** | `StoryBeat`, `ArcPhase`, `ArcTimelineEvent` |
| **Objetos de valor** | `NarratorOutput`, `NPCDialogue`, `SceneTransition` |
| **Eventos de dominio** | `STORY_EVENT`, `STORY_BEAT`, `VILLAIN_PROGRESS` |
| **Persistencia** | `worlds/{name}/director_state.json`, `worlds/{name}/story_arcs.json`, `worlds/{name}/planner_state.json` |

**Archivos clave:**
- `src/services/narrative-service.ts` — **Composition Root** / contenedor DI para todos los servicios narrativos
- `src/services/roleplay-engine.ts` — procesamiento principal de roleplay, despacho de agentes
- `src/services/agents/stylist.ts` — generación de prosa dirigida por LLM (el único generador de prosa)
- `src/services/agents/dramaturg.ts` — selección de patrones narrativos a partir de arquetipos bíblicos
- `src/services/agents/validator.ts` — verificación de hechos vía Wikipedia MCP
- `src/services/director-loop.ts` — orquestador en segundo plano (reloj→social→villano→azar→beats)
- `src/services/story-engine.ts` — generación de eventos a partir de beats de historia + aplicación de efectos
- `src/services/story-planner.ts` — planificación de capítulos/beats dirigida por LLM
- `src/services/story-arc-manager.ts` — CRUD de arcos de historia con fases
- `src/models/story.ts` — `StoryContext`, `NarratorOutput`, `NPCDialogue`, `SceneTransition`
- `src/models/director.ts` — `DirectorTask`, `StoryArc`, `StoryBeat`, `TaskPriority`

**Reglas de dominio:**
- `DirectorLoop` se ejecuta con un intervalo de tick configurable (por defecto 30 minutos)
- Los beats de historia mayores tienen un enfriamiento (por defecto 6 horas)
- `StoryPlanner` usa planificación en dos fases: esquema de capítulo → generación de beats
- El enum `TaskPriority` controla el orden de la cola LLM (CRITICAL > HIGH > NORMAL > LOW)
- Los prompts de los agentes se resuelven primero desde SQLite, luego desde JSON como respaldo, y por último desde valores por defecto codificados

---

### BC4: NPC y Diálogo

**Propósito:** Gestión del estado de personajes no jugadores, memoria episódica, sesiones de diálogo y generación de NPCs.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | `NPCProfile` (raíz de agregado por NPC) |
| **Entidades clave** | `EpisodicMemory`, `DialogueSession`, `DialogueMessage` |
| **Objetos de valor** | `NPCSkills`, `NPCDialogue`, `DialogueChoice`, `GreetingTemplate` |
| **Eventos de dominio** | `ENTITY_ADDED` (para NPCs generados), `MEMORY_ADDED`, `MEMORY_CONSOLIDATED` |
| **Persistencia** | `worlds/{name}/npc_profiles.json`, `worlds/{name}/npc_profiles/{name}.json` |

**Archivos clave:**
- `src/services/npc-runtime.ts` — `NPCRuntime`: almacén de estado con memoria a corto/largo plazo
- `src/services/npc-generator.ts` — creación de NPCs dirigida por LLM
- `src/services/agents/actor.ts` — generación de diálogo e interacción de NPCs
- `src/services/npc-economy.ts` — riqueza, impuestos, tesorería, producción de alimentos de NPCs
- `src/services/dialogue-manager.ts` — sesiones de conversación, temas, opciones
- `src/services/dialogue-context.ts` — estado de diálogo contextual
- `src/models/npc-state.ts` — `NPCProfile`, `EpisodicMemory`, `NPCSkills`

**Reglas de dominio:**
- Los perfiles de NPC tienen memoria a corto plazo (limitada a 20) y memoria episódica a largo plazo
- La consolidación de memoria ocurre cuando la memoria a corto plazo excede `_importanceThreshold` (0.4)
- Los NPCs se sincronizan desde el almacén de entidades al arrancar — los perfiles faltantes se crean automáticamente
- Las sesiones de diálogo siguen una máquina de estados: `greeting → active → farewell → idle`
- El enum `TopicCategory` restringe los temas de conversación válidos

---

### BC5: Social y Relaciones

**Propósito:** Relaciones entre personajes, dinámicas de facción, alianzas, jerarquías feudales y relaciones románticas.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | `SocialGraph` (raíz de agregado de todo el estado social) |
| **Entidades clave** | `Relationship`, `Faction`, `Alliance`, `FeudalRelationship` |
| **Objetos de valor** | `FactionSummary`, `FeudalSummary`, `RomanceStatus`, `RomanceProgression` |
| **Eventos de dominio** | `RELATIONSHIP_ADDED`, `RELATIONSHIP_REPAIRED`, `RELATIONSHIP_BROKEN` |
| **Persistencia** | directorio `worlds/{name}/social/` (archivos JSON por subsistema) |

**Archivos clave:**
- `src/services/social-graph.ts` — `SocialGraph`: relaciones, facciones, alianzas, feudal
- `src/services/social-simulator.ts` — selección de pares, generación de interacciones
- `src/services/romance-engine.ts` — progresión de relaciones románticas
- `src/services/romance-profiles.ts` — perfiles de probabilidad para eventos románticos
- `src/models/romance.ts` — `RelationshipMemory`, `RomanceStatus`, `RomanceProgression`

**Reglas de dominio:**
- `SocialSimulator` selecciona pares según proximidad de ubicación y alineación de facción
- Los tipos de interacción se ponderan por contexto: misma ubicación vs misma facción vs facción diferente
- El romance usa `ProbabilityEngine` para la resolución determinista de resultados
- Las relaciones feudales rastrean lealtad, contribución fiscal y obligación militar
- Las alianzas pueden traicionarse; la traición tiene consecuencias

---

### BC6: Quests

**Propósito:** Gestión del ciclo de vida de quests — generación, objetivos, recompensas, cadenas e integración con diálogo.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | `Quest`, `QuestDefinition` |
| **Entidades clave** | `QuestObjective`, `QuestObjectiveDef` |
| **Objetos de valor** | `QuestReward`, `QuestPrerequisite` |
| **Eventos de dominio** | `QUEST_ADDED`, `QUEST_UPDATED` |
| **Persistencia** | `worlds/{name}/quests.json` |

**Archivos clave:**
- `src/services/quest-manager.ts` — CRUD básico de quests
- `src/services/quest-system.ts` — ciclo de vida completo con cadenas, prerrequisitos, límites de tiempo
- `src/models/quest.ts` — `Quest`, `QuestObjective`, `QuestData`

**Reglas de dominio:**
- Tipos de quest: `main`, `side`, `daily`, `faction`, `chain`
- Estados de quest: `available → active → completed | failed | abandoned`
- `QuestSystem` impone prerrequisitos (nivel mínimo, facción, quests completadas, relación)
- `Quest.progress` es un valor calculado (objetivos completados / objetivos totales)
- Las quests en cadena se enlazan mediante el campo `chainNext`

---

### BC7: Memoria y Conocimiento

**Propósito:** Memoria del mundo, memoria de agentes, búsqueda semántica, recuperación basada en embeddings y gestión del ciclo de vida de la memoria.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | `WorldMemory` (raíz de agregado), `AgentMemoryStore` (por agente) |
| **Entidades clave** | `WorldMemoryEntry`, `AgentMemoryEntry` |
| **Objetos de valor** | `MemoryConfig`, `ScoringWeights`, `MemoryMetadata`, `RankedItem` |
| **Eventos de dominio** | `MEMORY_ADDED`, `MEMORY_CONSOLIDATED`, `MEMORY_FORGOTTEN` |
| **Persistencia** | `tns.db` (SQLite), `worlds/{name}/memory/` (particiones), índice FAISS |

**Archivos clave:**
- `src/memory/world-memory.ts` — `WorldMemory`: puntuación, particionado, embedding, agrupamiento
- `src/lib/agent-memory-store.ts` — `AgentMemoryStore`: RAG por agente con búsqueda híbrida
- `src/lib/sqlite-store.ts` — `SQLiteStore`: FTS5 + búsqueda vectorial + fusión RRF
- `src/lib/vector-ops.ts` — similitud coseno, distancia L2, producto punto
- `src/services/memory-engine.ts` — `MemoryEngine`: búsqueda semántica sobre memorias episódicas de NPCs
- `src/services/memory-manager.ts` — `MemoryManager`: historial de conversación
- `src/memory/` — puntuación, agrupamiento, buffer de escritura, cola de embeddings, pipeline cognitivo

**Reglas de dominio:**
- La puntuación de memoria usa una fórmula ponderada: importancia (0.35) + recencia (0.25) + acceso (0.15) + emoción (0.10) + relevancia (0.15)
- Las memorias por debajo de `minKeepScore` (0.15) y más antiguas que `minKeepDays` (30) se descartan
- La memoria de agentes está aislada por la columna `role` (ID de agente) en SQLite
- Búsqueda híbrida: FTS5 por palabras clave + vector denso → Reciprocal Rank Fusion (RRF)
- El índice FAISS se reconstruye cuando la fragmentación supera el umbral (200 entradas nuevas)
- El buffer de escritura agrupa la generación de embeddings por eficiencia

---

### BC8: Integración LLM

**Propósito:** Gestión multi-proveedor de LLM, encolado de solicitudes, limitación de tasa, asignación de modelos por agente y construcción de prompts.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | `ProviderManager` (singleton), `LLMQueue` |
| **Entidades clave** | `AgentModelAssignment`, `LLMProvider` |
| **Objetos de valor** | `AgentConfig`, `AgentPromptConfig`, `LLMClientOptions` |
| **Eventos de dominio** | Ninguno (capa de infraestructura) |
| **Persistencia** | `conf/providers.json`, `conf/agents.json`, `tns.db` (tabla agent_prompts) |

**Archivos clave:**
- `src/lib/llm-client.ts` — `LLMClient`: caché LRU por agente, despacho de proveedor
- `src/lib/llm-queue.ts` — `LLMQueue`: cola de prioridad, control de concurrencia, limitación de tasa
- `src/lib/providers/provider-manager.ts` — `ProviderManager`: soporte multi-proveedor, multi-clave
- `src/lib/providers/` — proveedores OpenAI, Anthropic, Google, Ollama, LlamaCpp
- `src/services/agent-config.ts` — configuración de agentes (prompts globales + por mundo)
- `src/services/prompt-builder.ts` — plantillas de prompt estáticas para todos los agentes
- `src/services/model-manager.ts` — gestión de modelos

**Reglas de dominio:**
- `LLMQueue` impone concurrencia máxima (por defecto 3) y límite de cola (por defecto 50)
- Desalojo por prioridad: las tareas de menor prioridad se descartan cuando la cola está llena
- Limitación de tasa mediante `RateLimiter` (basado en RPM con recarga automática)
- Cada agente puede tener su propio proveedor, modelo, temperatura y máximo de tokens
- Resolución de prompts: SQLite (`agent_prompts`) → respaldo JSON → valores por defecto codificados
- `LLMClient` usa caché LRU (256 entradas, TTL de 5 minutos) para solicitudes repetidas

---

### BC9: Probabilidad y Combate

**Propósito:** Cálculos de probabilidad deterministas para toda la mecánica del juego — combate, acciones sociales, artesanía, romance.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | `ProbabilityEngine` |
| **Entidades clave** | `ProbabilityModifier`, `ProbabilityProfile` |
| **Objetos de valor** | `ProbabilityParameter`, `ProbabilityResult`, `OutcomeQuality` |
| **Eventos de dominio** | Ninguno (computación pura) |
| **Persistencia** | Ninguna (en memoria, derivada del estado del NPC) |

**Archivos clave:**
- `src/services/probability-engine.ts` — cálculos de probabilidad centrales
- `src/services/probability-resolver.ts` — resolución de contexto (ubicación, relaciones, estado del mundo)
- `src/services/probability-expression.ts` — analizador de expresiones para modificadores dinámicos
- `src/services/probability-profiles.ts` — perfiles de probabilidad predefinidos
- `src/models/probability.ts` — `ProbabilityModifier`, `ProbabilityProfile`, `OutcomeQuality`

**Reglas de dominio:**
- Los modificadores tienen tipos: `ADD`, `MULTIPLY`, `REPLACE`
- Reglas de apilamiento: `STACK`, `TAKE_HIGHEST`, `TAKE_LOWEST`, `OVERRIDE`
- Los modificadores pueden expirar (duración basada en tiempo)
- `OutcomeQuality` va de `CRITICAL_FAILURE` a `CRITICAL_SUCCESS`
- El resolvedor de contexto inyecta modificadores dinámicos según ubicación, relaciones y estado del mundo
- Los kernels FFI de Mojo (`probability_ffi.mojo`) aceleran los cálculos por lotes

---

### BC10: Gestión del Villano

**Propósito:** Gestión del ciclo de vida del antagonista con planificación estratégica dirigida por LLM y fases de máquina de estados.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | `VillainAgendaData` |
| **Entidades clave** | `VillainMemoryData` |
| **Objetos de valor** | Fase (`plotting → preparing → executing → climax`) |
| **Eventos de dominio** | `VILLAIN_PROGRESS` |
| **Persistencia** | `worlds/{name}/villain_state.json` |

**Archivos clave:**
- `src/services/villain-manager.ts` — `VillainManager`: transiciones de fase, planificación estratégica

**Reglas de dominio:**
- El villano sigue una máquina de estados de 4 fases: `plotting → preparing → executing → climax`
- Cada transición de fase requiere completar un conjunto de acciones
- El LLM genera acciones de villano conscientes del contexto (sabotaje, rumor, infiltración de espías, etc.)
- Las acciones del villano tienen consecuencias de éxito/fracaso que afectan el estado del mundo
- Los esbirros pueden asignarse para ejecutar los planes del villano

---

### BC11: Inteligencia y Análisis

**Propósito:** Análisis de grafo, validación, deduplicación y motor de recomendaciones.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | Ninguno (capa de servicio) |
| **Entidades clave** | Ninguna |
| **Objetos de valor** | Resultados de validación, recomendaciones |
| **Eventos de dominio** | Ninguno |
| **Persistencia** | Lee del almacén de entidades, escribe resultados de validación |

**Archivos clave:**
- `src/intelligence/graph-analyzer.ts` — métricas de grafo, centralidad, clústeres
- `src/intelligence/graph-validator.ts` — comprobaciones de integridad
- `src/intelligence/duplicate-detector.ts` — deduplicación de entidades
- `src/intelligence/relationship-repairer.ts` — reparación de relaciones rotas
- `src/intelligence/recommender.ts` — recomendaciones de contenido
- `src/intelligence/scene-generator.ts` — generación procedural de escenas
- `src/intelligence/rule-checker.ts` — aplicación de reglas del mundo
- `src/intelligence/subgraph-expander.ts` — expansión de subgrafos

---

### BC12: Compilador Literario v2 (v0.33.4)

**Propósito:** Extracción narrativa offline de fuentes literarias y recuperación híbrida en tiempo de ejecución para generación de prosa restringida. Reemplaza el pipeline v1 intensivo en LLM por un sistema determinista de plantilla + patrones de estilo.

| Aspecto | Detalle |
|--------|--------|
| **Agregados clave** | `LiteraryCompilerDB` (raíz de agregado de todas las tablas v2) |
| **Entidades clave** | `SceneTemplate`, `StylePattern`, `ChunkIndex`, `TemplateStyleLink` |
| **Objetos de valor** | `RetrievalKeys`, `RankedTemplate`, `ExtractResult`, `PreScoreResult`, `TurnMetrics` |
| **Eventos de dominio** | Ninguno (pipeline offline + recuperación en tiempo de ejecución) |
| **Persistencia** | `literary.db` (SQLite con índices FTS5) |

**Archivos clave:**
- `src/mcp/literary-compiler/schema.ts` — `LiteraryCompilerDB`: 6 tablas v2, FTS5, métodos CRUD
- `src/mcp/literary-compiler/archetypes.ts` — 12 arquetipos canónicos + conjuntos de palabras clave + variables + posiciones
- `src/mcp/literary-compiler/chunker.ts` — división de texto por oraciones (200-400 tokens, solapamiento 40-80)
- `src/mcp/literary-compiler/pre-score.ts` — puntuación por palabras clave de diccionario + densidad narrativa (diálogo/acción/conflicto)
- `src/mcp/literary-compiler/extractor.ts` — extractor JSON de LLM con validación estilo Zod
- `src/mcp/literary-compiler/retrieval.ts` — puntuación compuesta: arquetipo (0.40) + ánimo (0.15) + dominio (0.15) + calidad (0.10) + frescura (0.05) + etiquetas (0.15)
- `src/mcp/literary-compiler/fill-template.ts` — reemplazo determinista de `[placeholder]`
- `src/mcp/literary-compiler/linter.ts` — validación V2: detección de moralización, límites de tokens, validez de arquetipo
- `src/mcp/literary-compiler/runtime-metrics.ts` — seguimiento de latencia por turno
- `src/services/agents/stylist.ts` — `buildMicroPrompt()` para generación restringida v2
- `src/lib/feature-flags.ts` — banderas `literary-compiler-v2`, `literary-v2-retrieval`, `literary-v2-stylist`
- `scripts/migrate-v1-to-v2.ts` — migración de nombres de arquetipo (escape → escape_liberation, etc.)

**Reglas de dominio:**
- Todas las plantillas usan inglés (Interlingua) para optimización de RAG
- Las plantillas se anonimizan (sin nombres de personajes de la fuente)
- Restricción anti-moralización aplicada a nivel de linter + prompt
- Cada plantilla tiene un esqueleto de ≤ 120 tokens
- La recuperación devuelve la plantilla top-1 (top-2 si hay empate cercano)
- Presupuesto estricto: 1-2 llamadas LLM por turno (frente a 4-5 en v1)
- Controlado por feature-flag para despliegue gradual

**Pipeline Offline:**
```
Texto fuente
  → A. Chunker (código puro, 200-400 tokens, solapamiento 40-80)
  → B. BGE-M3 embed + almacenar
  → C. Pasada de candidatos por diccionario/heurística
  → D. Colapso de clústeres / casi-duplicados (vectores)
  → E. Seleccionar representantes
  → F. Extracción JSON con LLM local pequeño (Qwen3-8B, temp=0.1)
  → G. Mapa de consistencia de roles
  → H. Linter / puerta de calidad
  → I. Escribir scene_templates + style_patterns + enlaces
  → J. Emitir informe de métricas
```

**Flujo en Tiempo de Ejecución:**
```
Entrada del jugador
  → Intención + Simulación + mutación de estado (0 LLM)
  → Construir claves de recuperación (posición, arquetipo, ánimo, dominio)
  → Recuperación híbrida FTS + diccionario → plantilla top-1
  → Obtener style_pattern enlazado
  → fillTemplate (determinista)
  → Micro-prompt de Stylist → 1 llamada LLM → 2-3 párrafos
  → Censor basado en reglas
```

---

## [A3] Agregados y Entidades

### BC1: Gestión de Mundo

| Componente | Tipo | Invariantes |
|-----------|------|------------|
| `World` | Raíz de agregado | Debe tener un nombre único en slug; debe tener un `WorldFrame` válido |
| `WorldFrame` | Objeto de valor | Debe definir `world_name`; `world_rules` debe ser no vacío para mundos válidos |
| `LayeredProfile` | Objeto de valor | L1 debe tener `name` y `type`; las capas son L1/L2/L3 |
| `EntityNode` | Entidad | Debe tener un `uid` único; `entityType` debe ser un `EntityTypeValue` válido |
| `EntityType` | Objeto de valor (enum) | `CHARACTER`, `FACTION`, `LOCATION`, `ITEM`, `EVENT`, `WORLD_RULE`, `RACE`, `UNKNOWN` |

### BC2: Entidad y Grafo

| Componente | Tipo | Invariantes |
|-----------|------|------------|
| `GraphStore` | Raíz de agregado | Debe iniciarse antes del recorrido; las aristas referencian UIDs válidos |
| `GraphEdge` | Entidad | `source` y `target` deben ser UIDs de entidad válidos |
| `Relationship` | Objeto de valor | `sourceUid` y `targetUid` deben existir; `strength` está entre 0 y 1 |
| `BranchManager` | Entidad | Los nombres de rama deben ser únicos; el padre debe existir |

### BC3: Narrativa e Historia

| Componente | Tipo | Invariantes |
|-----------|------|------------|
| `StoryContext` | Objeto de valor | Debe tener `worldName`, `currentTime` y `location` |
| `StoryArc` | Raíz de agregado | Debe tener un `id` único; el array `beats` ordenado por tiempo |
| `DirectorTask` | Entidad | Debe tener un `id` único; `priority` dentro del rango de `TaskPriority` |
| `BeatData` | Entidad | Debe pertenecer a un `chapter_id` válido; `triggered` es booleano |
| `ChapterData` | Objeto de valor | Debe tener un `id` único; el array `beats` no nulo |

### BC4: NPC y Diálogo

| Componente | Tipo | Invariantes |
|-----------|------|------------|
| `NPCProfile` | Raíz de agregado (por NPC) | Debe tener `name` y `uid` únicos; `health` 0-100; valores de `skills` 0-1 |
| `EpisodicMemory` | Entidad | Debe tener un `id` único; `importance` 0-1; `emotion` no vacío |
| `DialogueSession` | Entidad | Debe tener un `id` único; `state` dentro del rango válido del enum |
| `NPCSkills` | Objeto de valor | Todos los valores de habilidad deben estar entre 0 y 1 |
| `DialogueMessage` | Objeto de valor | `role` debe ser `player` o `npc` |

### BC5: Social y Relaciones

| Componente | Tipo | Invariantes |
|-----------|------|------------|
| `SocialGraph` | Raíz de agregado | Debe tener una ruta de estado válida; las relaciones referencian entidades válidas |
| `Relationship` | Entidad | `type` en el enum válido; `strength` 0-1; `source` ≠ `target` |
| `Faction` | Objeto de valor | Debe tener un `name` único; los miembros son únicos |
| `Alliance` | Objeto de valor | `faction1` ≠ `faction2`; `strength` 0-1 |
| `FeudalRelationship` | Objeto de valor | `vassal` ≠ `liege`; `loyalty` 0-1 |

### BC6: Quests

| Componente | Tipo | Invariantes |
|-----------|------|------------|
| `Quest` | Raíz de agregado | Debe tener un `id` único; `status` en el enum válido; `progress` calculado |
| `QuestDefinition` | Raíz de agregado | Debe tener un `id` único; `objectives` no vacío |
| `QuestObjective` | Entidad | `completed` es booleano |
| `QuestReward` | Objeto de valor | `gold`, `experience` ≥ 0 |
| `QuestPrerequisite` | Objeto de valor | Debe establecerse al menos un prerrequisito |

### BC7: Memoria y Conocimiento

| Componente | Tipo | Invariantes |
|-----------|------|------------|
| `WorldMemory` | Raíz de agregado | Debe tener una ruta de almacenamiento válida; las entradas se puntúan mediante fórmula ponderada |
| `WorldMemoryEntry` | Entidad | Debe tener un `id` único; `importance` 0-1; `content` no vacío |
| `AgentMemoryStore` | Raíz de agregado | Aislado por `agentId`; usa búsqueda híbrida FTS5 + vectorial |
| `MemoryConfig` | Objeto de valor | Todos los pesos ≥ 0; `halfLifeDays` > 0 |
| `ScoringWeights` | Objeto de valor | Los pesos suman 1.0 |

---

## [A4] Servicios de Dominio

Servicios transversales que no pertenecen a un solo agregado:

| Servicio | Archivo | Propósito |
|---------|------|---------|
| `NarrativeService` | `src/services/narrative-service.ts` | **Composition Root** — instancia y cablea todos los subsistemas narrativos |
| `RoleplayEngine` | `src/services/roleplay-engine.ts` | Punto de entrada principal: orquesta PipelineRunner → CommandHandler → generadores de prosa. SessionState extraído a `roleplay/session-state.ts`, gestores en `roleplay/handlers/` |
| `StoryEngine` | `src/services/story-engine.ts` | Generación de eventos a partir de beats + aplicación de efectos (movimientos de NPC, cambios de relación, creación de quests) |
| `DirectorLoop` | `src/services/director-loop.ts` | Orquestador en segundo plano: tick de reloj → simulación social → villano → eventos de azar → beats de historia |
| `SocialSimulator` | `src/services/social-simulator.ts` | Selección de pares de NPC + generación de interacciones |
| `ProbabilityEngine` | `src/services/probability-engine.ts` | Resolución determinista de resultados con apilamiento de modificadores |
| `MemoryEngine` | `src/services/memory-engine.ts` | Búsqueda semántica sobre memorias episódicas de NPCs |
| `WorldValidator` | `src/services/world-validator.ts` | Validación de integridad del mundo |
| `AgentCoordinator` | `src/services/agent-coordinator.ts` | Cola de prioridad para la ejecución de tareas del director |
| `StartResolver` | `src/services/start-resolver.ts` | Resuelve el contexto inicial de la historia a partir del estado del mundo |
| `WorldIsolator` | `src/services/world-isolator.ts` | Aislamiento multi-mundo con monitorización de recursos (memoria, CPU, tokens) |
| `CrossWorldBus` | `src/services/cross-world-bus.ts` | Comunicación de eventos entre mundos con portales |
| `PluginManager` | `src/plugins/plugin-manager.ts` | Gestión del ciclo de vida de plugins (registro, desregistro, capacidades) |

---

## [A5] Eventos de Dominio

Todos los eventos se definen en el enum `EventTopic` (`src/lib/event-bus.ts`):

| Evento | Editor | Consumidores | Descripción |
|-------|-----------|-----------|-------------|
| `ENTITY_ADDED` | `WorldBuilder`, `NPCGenerator` | `GraphStore`, `WorldMemory` | Nueva entidad creada |
| `ENTITY_UPDATED` | Varios servicios | `GraphStore`, `WorldMemory` | Perfil de entidad cambiado |
| `ENTITY_REMOVED` | `GraphStore` | `WorldMemory` | Entidad eliminada |
| `ENTITY_LAYER_COMPLETED` | `WorldBuilder` | `GraphStore` | Fase de construcción L1/L2/L3 completada |
| `RELATIONSHIP_ADDED` | `SocialSimulator` | `GraphStore` | Nueva relación formada |
| `RELATIONSHIP_REPAIRED` | `SocialSimulator` | `GraphStore` | Relación rota reparada |
| `RELATIONSHIP_BROKEN` | `SocialSimulator` | `GraphStore` | Relación cortada |
| `WORLD_CREATED` | `WorldManager` | Todos los servicios | Nuevo mundo inicializado |
| `WORLD_FRAME_LOADED` | `WorldBuilder` | Todos los servicios | World frame cargado desde disco |
| `WORLD_EVOLVED` | `WorldEvolver` | `Chronicler`, `WebSocketManager` | Estado del mundo cambiado |
| `STORY_EVENT` | `StoryEngine` | `Chronicler`, `WebSocketManager` | Evento de historia generado |
| `STORY_BEAT` | `DirectorLoop` | `Chronicler`, `WebSocketManager` | Story beat inyectado |
| `VILLAIN_PROGRESS` | `VillainManager` | `Chronicler`, `WebSocketManager` | Acción del villano ejecutada |
| `QUEST_ADDED` | `QuestSystem` | `WebSocketManager` | Nueva quest creada |
| `QUEST_UPDATED` | `QuestSystem` | `WebSocketManager` | Estado de la quest cambiado |
| `MEMORY_ADDED` | `WorldMemory` | `AgentMemoryStore` | Nueva memoria almacenada |
| `MEMORY_CONSOLIDATED` | `WorldMemory` | — | Promoción de corto→largo plazo |
| `MEMORY_FORGOTTEN` | `WorldMemory` | — | Memoria descartada |
| `MAINTENANCE_START` | Sistema | Todos los servicios | Comienza el ciclo de mantenimiento |
| `MAINTENANCE_DONE` | Sistema | Todos los servicios | Ciclo de mantenimiento completado |
| `GRAPH_CHANGED` | `GraphStore` | `Intelligence` | Topología del grafo cambiada |
| `ERROR` | Varios | Registro | Ocurrió un error |

**Mecánica del bus de eventos:**
- Los gestores se ordenan por `priority` (mayor = se ejecutan primero)
- Buffer de repetición (100 eventos por defecto) para suscriptores tardíos
- Publicación asíncrona con `await` — sin fire-and-forget

---

## [A6] Capa de Aplicación

### Flujo de caso de uso: Mensaje del jugador → Respuesta de Stylist

```
1. HTTP POST /chat/message
   └─→ routes/chat.ts: validación Zod, saneamiento de entrada

2. RoleplayEngine.processInput(sanitizedMessage)
   ├─→ SessionState (activeCharacter, currentLocation, currentTime)
   ├─→ PipelineRunner.translateAndClassify() → IntentParser
   ├─→ CommandHandler.handle() para comandos
   ├─→ PipelineRunner.runSimulation() → SimulationEngine
   ├─→ Generación de prosa: LiteraryV2Generator
   └─→ Devuelve la cadena narrativa

3. Stylist.process(intent, simulation, context, pattern)
   ├─→ loadAgentConfig("stylist") → prompts SQLite → respaldo JSON → valores por defecto
   ├─→ resolveTemplate(template, vars) con campos de StoryContext
   └─→ LLMQueue.generateText(prompt, priority, temperature, agentId)

4. LLMQueue
   ├─→ RateLimiter.check() → control de concurrencia
   ├─→ ProviderManager.getProvider(agentId) → proveedor/modelo
   ├─→ LLMClient.generate() → comprobación de caché LRU → HTTP al LLM
   └─→ Devuelve la respuesta

5. RoleplayEngine
   ├─→ MemoryManager.addEntry(user, response)
   ├─→ Chronicler.logEvent(...) → WorldMemory.addEvent(...)
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Devuelve { narrative, location, storyTime, activeCharacter }

6. WebSocketManager.broadcast({ type: "narrative", ... })
```

### Flujo de caso de uso: Tick del Director → Story Beat

```
1. DirectorLoop (setInterval en segundo plano, 30 min por defecto)
   ├─→ WorldClock.tick(minutes)
   ├─→ SocialSimulator.simulateInteraction()
   ├─→ VillainManager.tick() → transiciones de fase
   ├─→ ProbabilityEngine.roll() → eventos de azar
   └─→ StoryPlanner.shouldGenerateBeat() → StoryEngine.generateEvent()

2. StoryEngine.generateEvent()
   ├─→ LLMQueue.generateJson(EVENT_PROMPT, ...) → evento estructurado
   ├─→ Aplica efectos: movimientos de NPC, cambios de relación, creación de quests
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Chronicler.logEvent(...)

3. DirectorLoop
   ├─→ StoryEngine.generateBeat() → el LLM genera el beat narrativo
   ├─→ RoleplayEngine.injectBeat(beat) → antepone a la siguiente respuesta
   └─→ Guarda director_state.json
```

### Flujo de caso de uso: Creación de Mundo

```
1. HTTP POST /api/worlds
   └─→ routes/worlds.ts → world-manager.createWorld(params)

2. WorldManager.createWorld()
   ├─→ mkdir worlds/{slugified-name}/
   ├─→ Escribe world_frame.json
   ├─→ EventBus.publish(WORLD_CREATED)
   └─→ NarrativeService.reset(dbPath, worldFrame)

3. WorldBuilder (en /api/launch)
   ├─→ createWorld() → el LLM genera el WorldFrame
   ├─→ buildL1() → capa de identidad para todas las entidades
   ├─→ buildL2() → capa de estado dinámico
   ├─→ buildL3() → capa oculta/secreta
   ├─→ buildRelationships() → relaciones entre entidades
   └─→ EventBus.publish(ENTITY_ADDED) por cada entidad

4. WebSocketManager.broadcast({ type: "world_created", ... })
```

### Flujo de caso de uso: Memoria del Agente

```
1. Stylist genera la prosa narrativa
   └─→ EventBus.publish(MEMORY_ADDED, { content, source: "stylist" })

2. WorldMemory.addEvent()
   ├─→ Crea un WorldMemoryEntry con metadatos de puntuación
   ├─→ EmbeddingQueue.enqueue(entry) → embedding por lotes vía BGE-M3
   ├─→ VectorIndex.add(embedding, entryId)
   ├─→ WriteBehindBuffer.add(entry)
   └─→ Vaciado periódico a SQLite + reconstrucción FAISS

3. AgentMemoryStore.search(agentId, query)
   ├─→ getEmbedding(query) → endpoint BGE-M3
   ├─→ SQLiteStore.searchMemoriesFTS(query) → coincidencias por palabras clave
   ├─→ SQLiteStore.searchMemoriesDense(vector) → similitud coseno
   ├─→ ReciprocalRankFusion(ftsResults, denseResults)
   └─→ Devuelve los resultados top-K filtrados por agentId
```

---

## [A7] Infraestructura

### Integración LLM

```
ProviderManager (singleton)
├── OpenAIProvider    (conf/providers.json)
├── AnthropicProvider
├── GoogleProvider
├── OllamaProvider
└── LlamaCppProvider  (local, puerto 5002 para embeddings)

LLMClient (por agente)
├── ProviderManager.getProvider(agentId) → proveedor/modelo
├── Caché LRU (256 entradas, TTL de 5 min)
├── parseJsonWithRetry() para salida estructurada
└── Configuración por agente: temperature, maxTokens, model

LLMQueue (global)
├── Cola de prioridad (CRITICAL > HIGH > NORMAL > LOW)
├── RateLimiter (basado en RPM, recarga automática)
├── Concurrencia máxima (por defecto 3)
├── Límite de cola (por defecto 50) con desalojo por prioridad
└── Instancias LLMClient por agente
```

**Archivo:** `src/lib/llm-client.ts`, `src/lib/llm-queue.ts`, `src/lib/providers/provider-manager.ts`

### Persistencia

| Almacén | Tecnología | Ruta | Propósito |
|-------|-----------|------|---------|
| `UnifiedEntityStore` | Archivos JSON | `worlds/{name}/entities.json` | CRUD de entidades con resolución de nombre O(1) |
| `SQLiteStore` | `bun:sqlite` | `worlds/{name}/tns.db` | Búsqueda FTS5, embeddings vectoriales, prompts de agentes, traducciones |
| `GraphStore` | Mapa de adyacencia en memoria | `worlds/{name}/entities.json` | Recorrido de grafo, ramificación |
| `SessionStore` | `bun:sqlite` | `worlds/_sessions/sessions.db` | Tokens de sesión de autenticación |
| `Chronicler` | Archivos JSONL | `worlds/{name}/timeline.jsonl` | Línea de tiempo de eventos con rotación |
| `WorldClock` | Archivo JSON | `worlds/{name}/clock_state.json` | Tiempo de juego, eventos programados |
| `NPCRuntime` | Archivos JSON | `worlds/{name}/npc_profiles.json` | Estado del NPC + memoria episódica |
| `SocialGraph` | Archivos JSON | `worlds/{name}/social/*.json` | Relaciones, facciones, alianzas |
| `StoryPlanner` | Archivo JSON | `worlds/{name}/planner_state.json` | Capítulos, beats |
| `DirectorLoop` | Archivo JSON | `worlds/{name}/director_state.json` | Estado del director |
| `VillainManager` | Archivo JSON | `worlds/{name}/villain_state.json` | Agendas del villano |
| `WorldMemory` | SQLite + FAISS | `worlds/{name}/memory/` | Memoria semántica con embeddings |
| `AgentMemoryStore` | SQLite | `tns.db` | RAG por agente |
| `settings.json` | Archivo JSON | `conf/settings.json` | Ajustes globales de la aplicación |
| `providers.json` | Archivo JSON | `conf/providers.json` | Configuraciones de proveedores LLM |
| `agents.json` | Archivo JSON | `conf/agents.json` | Asignaciones de modelo de agentes |

**Patrón de persistencia:** Todas las escrituras JSON usan `atomicWriteJson()` (escribir a temporal + renombrar) para seguridad ante fallos. SQLite usa modo WAL con `PRAGMA synchronous = NORMAL`.

### WebSocket en tiempo real

**Archivo:** `src/services/websocket-manager.ts`

- `WebSocketManager` gestiona los clientes conectados con IDs únicos
- `broadcast(message)` envía a todos los clientes conectados (limpieza de conexiones muertas)
- `sendTo(id, message)` para entrega dirigida
- Los eventos del `EventBus` se reenvían a los clientes WebSocket

### Autenticación

**Archivo:** `src/middleware/auth.ts`, `src/lib/session-store.ts`

- Autenticación de sesión basada en tokens (hex aleatorio de 32 bytes)
- Sesiones almacenadas en SQLite (`worlds/_sessions/sessions.db`)
- TTL de 24 horas con limpieza cada hora
- `authMiddleware` protege todas las rutas `/api/*` excepto `/login`
- Inicio/cierre de sesión mediante endpoints POST

---

## [A8] Diagramas de Flujo de Datos

### 1. Mensaje del usuario → Respuesta de Stylist

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│ Navegador │────▶│ routes/chat  │────▶│  RoleplayEngine  │
│           │◀────│   (Hono)     │◀────│                  │
└──────────┘     └──────────────┘     └────────┬─────────┘
                                               │
                    ┌──────────────────────────┤
                    ▼                          ▼
          ┌─────────────────┐      ┌──────────────────┐
          │    Stylist       │      │  MemoryManager   │
          │  (prompt LLM)    │      │ (guardar         │
          │                  │      │  historial)      │
          └────────┬─────────┘      └──────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │    LLMQueue      │
          │  (prioridad,     │
          │   límite de tasa,│
          │   caché)         │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐
          │  ProviderManager │
          │  (OpenAI/Anth/   │
          │   Google/Ollama) │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐     ┌──────────────────┐
          │   API LLM       │────▶│  Chronicler.log   │
          │   externa       │     │  EventBus.publish │
          └─────────────────┘     └──────────────────┘
```

### 2. Tick del Director → Generación de Story Beat

```
┌─────────────────┐
│  DirectorLoop    │  (setInterval, cada 30 min)
│  ┌─────────────┐│
│  │ WorldClock  ││──▶ tick(minutes) → avanza el tiempo → dispara eventos programados
│  └─────────────┘│
│  ┌─────────────┐│
│  │SocialSim    ││──▶ simulateInteraction() → selección de pares → generación de eventos
│  └─────────────┘│
│  ┌─────────────┐│
│  │VillainMgr   ││──▶ tick() → transición de fase → acción estratégica LLM
│  └─────────────┘│
│  ┌─────────────┐│
│  │ProbEngine   ││──▶ roll() → eventos de azar (clima, accidentes, descubrimientos)
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryPlanner ││──▶ shouldGenerateBeat() → generateNextBeat() → LLM
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryEngine  ││──▶ generateEvent() → LLM → aplicar efectos → publicar evento
│  └─────────────┘│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  EventBus        │────▶│  WebSocketManager │
│  (STORY_BEAT)    │     │  (broadcast)      │
└─────────────────┘     └──────────────────┘
```

### 3. Flujo de creación de mundo

```
┌──────────┐     ┌──────────────────┐     ┌────────────────┐
│ Navegador │────▶│  POST /worlds     │────▶│  WorldManager   │
│           │     │  (routes/worlds)  │     │  createWorld()  │
└──────────┘     └──────────────────┘     └───────┬────────┘
                                                   │
                    ┌──────────────────────────────┤
                    ▼                              ▼
          ┌─────────────────┐            ┌────────────────┐
          │  mkdir worlds/   │            │ EventBus.publish│
          │  {name}/         │            │ (WORLD_CREATED) │
          └─────────────────┘            └────────────────┘
                                                   │
                                                   ▼
                                          ┌────────────────┐
                                          │NarrativeService │
                                          │    .reset()     │
                                          └────────────────┘

POST /api/launch:
┌─────────────────┐
│  WorldBuilder    │
│  ├─ createWorld()│──▶ LLM → WorldFrame JSON
│  ├─ buildL1()    │──▶ LLM → identidad L1 para cada entidad
│  ├─ buildL2()    │──▶ LLM → estado dinámico L2
│  ├─ buildL3()    │──▶ LLM → oculto/secreto L3
│  └─ buildRels()  │──▶ LLM → relaciones
└─────────────────┘
          │
          ▼
┌─────────────────┐
│ EventBus.publish │
│ (ENTITY_ADDED    │
│  × N entidades)  │
└─────────────────┘
```

### 4. Flujo de memoria del agente

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│    Stylist       │────▶│ EventBus.publish  │────▶│  WorldMemory    │
│  (genera la      │     │ (MEMORY_ADDED)    │     │  .addEvent()    │
│   narrativa)     │     └──────────────────┘     └───────┬────────┘
└─────────────────┘                                       │
                                                    ┌─────┴──────┐
                                                    ▼            ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │EmbeddingQueue │ │ WriteBehind  │
                                            │ (BGE-M3 por   │ │   Buffer     │
                                            │  lotes)       │ │              │
                                            └──────┬───────┘ └──────┬───────┘
                                                   │                │
                                                   ▼                ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │ VectorIndex   │ │ SQLiteStore  │
                                            │ (FAISS)       │ │ (tns.db)     │
                                            └──────────────┘ └──────────────┘

Flujo de consulta:
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│ AgentMemory   │────▶│ SQLiteStore       │────▶│ FTS5 (palabras  │
│ .search()     │     │ .searchMemories   │     │ clave) + vectores│
│               │     │                   │     │ densos → fusión │
│               │     │                   │     │ RRF             │
└──────────────┘     └──────────────────┘     └────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │ ReciprocalRank    │
                    │ Fusion (RRF)      │
                    └──────────────────┘
```

---

## [A9] Dependencias entre Contextos

```
                    ┌─────────────────────┐
                    │  Gestión de Mundo    │
                    │  (BC1)               │
                    └──────────┬──────────┘
                               │ crea/carga
                               ▼
┌──────────────┐    ┌─────────────────────┐    ┌──────────────┐
│ Entidad y    │◀──▶│  Narrativa e        │◀──▶│  NPC y       │
│ Grafo (BC2)  │    │  Historia (BC3)     │    │  Diálogo     │
└──────┬───────┘    └──────────┬──────────┘    │  (BC4)       │
       │                       │                └──────┬───────┘
       │                       │                       │
       │                       ▼                       │
       │              ┌─────────────────────┐          │
       │              │  Integración LLM     │          │
       │              │  (BC8)               │◀─────────┘
       │              └──────────┬──────────┘
       │                         │
       │    ┌────────────────────┼────────────────────┐
       │    ▼                    ▼                    ▼
       │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │ │  Social y     │ │  Quests      │ │  Villano     │
       │ │  Relaciones   │ │  (BC6)       │ │  (BC10)      │
       │ │  (BC5)        │ └──────┬───────┘ └──────────────┘
       │ └──────┬───────┘        │
       │        │                │
       │        ▼                ▼
       │ ┌─────────────────────────────┐
       │ │  Probabilidad y Combate     │
       │ │  (BC9)                      │
       │ └─────────────────────────────┘
       │
       ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Memoria y          │◀──▶│  Inteligencia       │
│  Conocimiento (BC7) │    │  (BC11)             │
└─────────────────────┘    └─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Compilador          │  (BC12, v0.33.4)
│  Literario v2        │
└─────────────────────┘
```

**Dependencias clave:**

| BC de origen | BC de destino | Mecanismo de acoplamiento |
|-----------|-----------|-------------------|
| BC1 (World) | BC2 (Entity) | Instancia compartida de `UnifiedEntityStore` |
| BC1 (World) | BC3 (Narrative) | `NarrativeService.reset()` |
| BC3 (Narrative) | BC4 (NPC) | `NPCRuntime` inyectado en `RoleplayEngine` |
| BC3 (Narrative) | BC5 (Social) | `SocialSimulator` inyectado en `DirectorLoop` |
| BC3 (Narrative) | BC6 (Quest) | `QuestManager` inyectado en `StoryEngine` |
| BC3 (Narrative) | BC10 (Villain) | `VillainManager` inyectado en `DirectorLoop` |
| BC3 (Narrative) | BC9 (Probability) | `ProbabilityEngine` en `RoleplayEngine` |
| BC3 (Narrative) | BC12 (LitCompiler) | `RoleplayEngine` llama a `searchTemplates` + `fillTemplate` |
| BC4 (NPC) | BC7 (Memory) | `NPCRuntime` usa `EpisodicMemory` |
| BC5 (Social) | BC2 (Entity) | `SocialGraph` lee de `UnifiedEntityStore` |
| BC8 (LLM) | Todos los BC | `LLMQueue` se comparte entre todos los agentes |
| BC8 (LLM) | BC12 (LitCompiler) | El extractor offline usa `LLMClient` para extracción estructurada |
| BC7 (Memory) | BC8 (LLM) | `EmbeddingQueue` llama a `LLMClient` para embeddings |
| BC11 (Intelligence) | BC2 (Entity) | El análisis de grafo lee `GraphStore` |

---

## [A10] Decisiones de Diseño Clave

### D1: Patrón Composition Root

**Decisión:** `NarrativeService` (`src/services/narrative-service.ts`) actúa como composition root, instanciando todos los servicios y cableando las dependencias manualmente.

**Compensación:** DI explícita sin framework. Todas las dependencias son visibles en un solo constructor, haciendo el sistema depurable pero verboso. La alternativa (contenedor IoC) añadiría magia en tiempo de ejecución.

### D2: Archivos JSON como almacén principal (con SQLite para búsqueda)

**Decisión:** El estado de las entidades, los perfiles de NPC y las relaciones sociales se almacenan como archivos JSON. SQLite se usa solo para búsqueda (FTS5), embeddings (vector), sesiones y prompts de agentes.

**Compensación:** Lecturas/escrituras simples con operaciones de archivo atómicas, pero sin garantías transaccionales entre entidades. El patrón `atomicWriteJson()` (escribir a temporal + renombrar) proporciona seguridad ante fallos para escrituras individuales, pero no consistencia entre múltiples archivos. SQLite proporciona ACID completo para búsqueda y embeddings.

### D3: Bus de eventos para comunicación entre contextos

**Decisión:** `EventBus` con gestores ordenados por prioridad y buffer de repetición conecta los contextos delimitados de forma asíncrona.

**Compensación:** Desacopla los contextos (NPC no sabe de Memory, Memory no sabe de NPC) pero añade indirección. El buffer de repetición (100 eventos) garantiza que los suscriptores tardíos no pierdan eventos recientes, a costa de memoria.

### D4: Asignación de modelo por agente

**Decisión:** Cada agente (`stylist`, `director`, `researcher`, `translation`, etc.) puede tener su propio proveedor LLM, modelo, temperatura y máximo de tokens.

**Compensación:** Máxima flexibilidad (usar modelos baratos para chronicler, modelos potentes para stylist) pero requiere gestión de configuración. ProviderManager lo gestiona con `conf/providers.json` y `conf/agents.json`.

### D5: Perfil de entidad de tres capas (L1/L2/L3)

**Decisión:** Los perfiles de entidad usan tres capas: L1 (identidad/nombre), L2 (estado dinámico/ubicación), L3 (oculta/secreta).

**Compensación:** Permite la revelación progresiva y los secretos controlados por el DM. L1 siempre es visible, L2 se actualiza durante el juego, L3 está oculta para los jugadores. El coste es la complejidad adicional en la resolución de perfiles.

### D6: Director Loop en segundo plano

**Decisión:** `DirectorLoop` se ejecuta como un intervalo en segundo plano, orquestando ticks de reloj, simulación social, acciones del villano y beats de historia independientemente de la entrada del jugador.

**Compensación:** Crea un mundo vivo que evoluciona incluso cuando los jugadores están desconectados. La compensación es la complejidad en la gestión del estado (estados pausado/ejecutando, enfriamientos de beats mayores) y la posibilidad de que los jugadores se pierdan eventos.

### D7: Búsqueda híbrida (FTS5 + Vector + RRF)

**Decisión:** La búsqueda de memoria usa tanto búsqueda por palabras clave (FTS5) como semántica (vector denso), combinadas mediante Reciprocal Rank Fusion.

**Compensación:** Lo mejor de ambos mundos — coincidencias exactas por palabras clave y similitud semántica. El coste es mantener ambos índices y el pipeline de embeddings (BGE-M3 vía servidor llama.cpp en el puerto 5002).

### D8: Ramificación tipo Git para grafos de historia

**Decisión:** `BranchManager` soporta la ramificación del grafo de entidades, permitiendo caminos de historia alternativos.

**Compensación:** Permite escenarios "what if" y líneas temporales paralelas sin duplicar todo el estado del mundo. Cada rama almacena solo adiciones y eliminaciones relativas al padre.

### D9: Prompts de agentes basados en plantillas con respaldo SQLite

**Decisión:** Los prompts de los agentes se almacenan en SQLite (`agent_prompts`) con aislamiento por mundo y por idioma, con respaldo en archivos JSON y luego en valores por defecto codificados.

**Compensación:** Soporta i18n y personalización por mundo sin cambios de código. El respaldo de tres niveles garantiza que el sistema funcione incluso sin base de datos.

### D10: Mojo FFI para cálculos críticos de rendimiento

**Decisión:** Los cálculos de probabilidad y las operaciones vectoriales pueden usar kernels Mojo FFI (`probability_ffi.mojo`, `vector_ffi.mojo`) con alternativas TypeScript.

**Compensación:** Ganancias de rendimiento significativas para operaciones por lotes (tiradas de probabilidad, similitud coseno), pero añade complejidad de compilación y dependencia de plataforma. Las alternativas TypeScript garantizan la portabilidad.

---

## Apéndice: Referencia de Archivos

| Directorio | Archivos | Propósito |
|-----------|-------|---------|
| `src/models/` | 12 archivos | Modelos de dominio (Entity, Quest, Story, Director, NPC, Romance, Probability, Memory, Item, Rank, Archetype) |
| `src/services/` | 45+ archivos | Servicios de aplicación + dominio |
| `src/routes/` | 18 archivos | Adaptadores HTTP (routers Hono) |
| `src/lib/` | 15+ archivos | Infraestructura (LLM, SQLite, EventBus, operaciones vectoriales, Proveedores) |
| `src/memory/` | 12 archivos | Subsistema de memoria (puntuación, agrupamiento, embedding, pipeline cognitivo) |
| `src/intelligence/` | 10 archivos | Análisis y validación de grafos |
| `src/store/` | 1 archivo | Almacén unificado de entidades con NameIndex |
| `src/config/` | env.ts | Configuración de entorno |
| `src/i18n/` | Internacionalización | Soporte multilingüe (7 idiomas) |
| `src/middleware/` | auth, rate-limiter, etc. | Middleware HTTP |
| `src/utils/` | logger, sanitize, etc. | Utilidades compartidas |
