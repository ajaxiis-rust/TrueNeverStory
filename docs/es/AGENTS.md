# Referencia de agentes (v0.33.4)

TrueNeverStory tiene **dos sistemas de agentes** que coexisten:

1. **The Big Six (AgentV2)** — la canalización de prosa narrativa. Registrados en `AgentRegistryV2` e instanciados en `RoleplayEngine`.
2. **Agentes configurados (`DEFAULT_AGENTS`)** — los agentes más antiguos dirigidos por configuración, listados en `src/services/agent-config.ts`. Respaldan la UI de Ajustes/Proveedores y algunos subsistemas (investigación inactiva, `@mentions` del chat).

Los Big Six son: `dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`. Los agentes configurados son: `director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation`.

`stylist` es el único generador de prosa. Los agentes eliminados (`narrator`, `npc`, `scene`, `historian`, `cartographer`, `lorekeeper`, `merchant`, `quest-giver`) ya no existen en ninguna parte del código.

---

## Los Big Six (AgentV2)

Estos gestionan la canalización determinista de prosa: intención → simulación → contexto → prosa.

### 1. Dramaturg (El Arquitecto)

**ID:** `dramaturg`
**Rol:** Selecciona patrones narrativos de arquetipos bíblicos
**Herramientas MCP:** `search_verses`, `get_pattern`, `get_archetype`

| Aspecto | Detalle |
|---------|---------|
| **Propósito** | Analiza la situación actual y elige estructuras narrativas adecuadas a partir de patrones bíblicos |
| **Entrada** | Intent, SimulationResult, GameContext |
| **Salida** | NarrativePattern (arquetipo, nombre, descripción, versículos, tono) |
| **Dependencias** | TNSServer (MCP), LLMQueue |

**Flujo:**
1. Infiere el tono a partir del tipo de intención y el resultado de la simulación
2. Consulta el MCP de la Biblia en busca de arquetipos coincidentes
3. Recurre a patrones generados por LLM si el MCP no está disponible

### 2. Validator (El Verificador de hechos)

**ID:** `validator`
**Rol:** Verifica hechos mediante el MCP de Wikipedia
**Herramientas MCP:** `verify_fact`, `get_context`

| Aspecto | Detalle |
|---------|---------|
| **Propósito** | Garantiza la coherencia del mundo y la precisión histórica |
| **Entrada** | Intent, SimulationResult, GameContext |
| **Salida** | Resultados de verificación (verificado, confianza, evidencia, fuentes) |
| **Dependencias** | TNSServer (MCP) |

**Flujo:**
1. Extrae afirmaciones factuales de la situación
2. Consulta el MCP de Wikipedia para verificar
3. Devuelve resultados de verificación con niveles de confianza

### 3. Stylist (El Narrador)

**ID:** `stylist`
**Rol:** Genera prosa usando patrones de estilo de Gutenberg — el único generador de prosa
**Herramientas MCP:** `get_style_pattern`, `apply_style`

| Aspecto | Detalle |
|---------|---------|
| **Propósito** | Agente central de generación de texto que produce prosa narrativa |
| **Entrada** | Intent, SimulationResult, GameContext, NarrativePattern |
| **Salida** | Texto en prosa |
| **Dependencias** | TNSServer (MCP), LLMQueue |

**Flujo:**
1. Obtiene el estilo según el tono desde el MCP de Gutenberg
2. Construye un prompt restringido con resultados de simulación y estilo
3. Genera prosa mediante el LLM
4. Devuelve el texto renderizado

### 4. Actor (Conjunto de NPC)

**ID:** `actor`
**Rol:** Gestiona las interacciones y diálogos de los NPC
**Herramientas MCP:** Ninguna

| Aspecto | Detalle |
|---------|---------|
| **Propósito** | Maneja todos los diálogos de NPC, comercio, artesanía, dinámica social |
| **Entrada** | Intent, SimulationResult, GameContext |
| **Salida** | Texto de diálogo de NPC, cambios de estado |
| **Dependencias** | UnifiedEntityStore, LLMQueue |

**Flujo:**
1. Enruta al subgestor adecuado según el tipo de intención
2. Obtiene las motivaciones ocultas del NPC desde el perfil L3
3. Genera la respuesta del NPC mediante el LLM
4. Calcula los cambios de estado de la relación

### 5. Censor (El Corrector)

**ID:** `censor`
**Rol:** Elimina clichés de IA y refuerza la coherencia de estilo
**Herramientas MCP:** Ninguna

| Aspecto | Detalle |
|---------|---------|
| **Propósito** | Limpia la prosa eliminando clichés y anacronismos generados por IA |
| **Entrada** | Texto en prosa, GameContext |
| **Salida** | Texto en prosa limpio |
| **Dependencias** | LLMQueue |

**Flujo:**
1. Elimina clichés de IA mediante patrones regex
2. Corrige anacronismos según el contexto del mundo
3. Pulido basado en LLM para casos complejos
4. Devuelve el texto limpio

**Clichés de IA eliminados habitualmente:**
- "delved", "tapestry", "rich tapestry", "palpable", "visceral"
- "it's worth noting", "it goes without saying"
- "the very fabric of", "on a deeper level"

### 6. Chronicler

**ID:** `chronicler`
**Rol:** Actualiza la memoria del mundo y mantiene la línea de tiempo
**Herramientas MCP:** Ninguna

| Aspecto | Detalle |
|---------|---------|
| **Propósito** | Registra todos los eventos significativos y mantiene la coherencia del mundo |
| **Entrada** | Intent, SimulationResult, GameContext |
| **Salida** | Cambios de estado (actualizaciones de memoria de NPC) |
| **Dependencias** | UnifiedEntityStore, EventBus |

**Flujo:**
1. Crea una descripción del evento a partir de la intención y el resultado
2. La publica en el EventBus para otros sistemas
3. Actualiza los recuerdos de los NPC cercanos
4. La registra en la línea de tiempo

---

## Agentes configurados (`DEFAULT_AGENTS`)

Estos viven en `src/services/agent-config.ts` y respaldan la UI de Ajustes/Proveedores, `LLMQueue`/`LLMClient` y algunos subsistemas. `chronicler` se comparte con los Big Six. Su temperatura y límites de tokens provienen de los valores globales por defecto (0.7 / 2048) a menos que se anulen en `conf/agents.json`.

| ID | Nombre | Prioridad | Usado por |
|----|--------|-----------|-----------|
| `director` | Director | 8 | inyección de story-beats |
| `chronicler` | Chronicler | 5 | resumen de línea de tiempo (también `@mention`) |
| `story-planner` | Planificador de historias | 6 | sugerencias de arcos narrativos (`@mention`) |
| `social-sim` | Simulador social | 4 | dinámica social de NPC (`@mention`) |
| `villain` | Gestor de antagonistas | 6 | planes del antagonista (`@mention`) |
| `researcher` | Investigador | 3 | `IdleResearchScheduler`, evaluación de objetos (`@mention`) |
| `translation` | Traducción | 2 | inglés ↔ idioma del usuario en el límite de salida |

**Plantillas de prompt (variables de plantilla → a qué se resuelven):**

- **director** — `{narrative}`, `{beat}`. Integra un story beat en la narrativa en curso.
- **chronicler** — `{events}`, `{timeline}`. Resume los nuevos eventos cronológicamente.
- **story-planner** — `{world_state}`, `{characters}`, `{events}`, `{quests}`. Salida: `{"arc": ..., "quests": [{"title", "description", "objectives"}], "hooks": [...]}`.
- **social-sim** — `{characters}`, `{relationships}`, `{context}`. Describe los cambios de relación y las implicaciones de facción.
- **villain** — `{villain}`, `{world_state}`, `{recent_actions}`. Planifica el próximo movimiento del antagonista.
- **researcher** — `{task}`, `{world_context}`. Salida: `{"verdict": "plausible|questionable|unrealistic", "confidence", "issues", "suggestions", "enrichedDetails"}`.
- **translation** — `{source_lang}`, `{target_lang}`, `{text}`. Devuelve únicamente el texto traducido.

---

## Sistema de diálogo (v0.33.4)

Nuevo `DialogueManager` + `DialogueContext` para conversaciones estructuradas con NPC:

| Funcionalidad | Descripción |
|---------------|-------------|
| **Gestión de sesiones** | Ciclo Saludo → Activo → Despedida |
| **Conciencia de relaciones** | Saludos y disponibilidad de temas para amigos/neutrales/enemigos |
| **Jerarquía feudal** | Saludos especiales señor/vasallos |
| **Elecciones temáticas** | personal, facción, misión, comercio, combate, artesanía, rumor, chisme, etc. |
| **Registro en memoria** | Resúmenes de diálogo almacenados en la memoria a largo plazo del NPC |

Acceso mediante `engine.dialogueManager` (requiere `npcRuntime` disponible).

**Nota:** Las `@mentions` del chat enrutan a los gestores configurados (`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`), no a los Big Six. `@narrator`, `@director`, `@scene` y `@npc` ya no existen.

---

## Agent Registry v2

Los Big Six se registran en `AgentRegistryV2` (`src/services/agent-registry-v2.ts`):

```typescript
import { getAgentRegistryV2 } from './agent-registry-v2';

const registry = getAgentRegistryV2();

// Register agents
registry.register(dramaturgAgent);
registry.register(validatorAgent);
registry.register(stylistAgent);
registry.register(actorAgent);
registry.register(censorAgent);
registry.register(chroniclerAgent);

// Get agent by ID
const dramaturg = registry.get('dramaturg');

// Get agents with specific MCP tool
const withSearch = registry.getAgentsWithTool('search_verses');
```

---

## Interfaz de agente (v0.33.4)

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

interface AgentOutput {
  text?: string;
  stateChanges?: StateChange[];
  metadata?: Record<string, unknown>;
}
```

---

## Variables globales

Estas variables están disponibles para los agentes a través del contexto de juego:

| Variable | Descripción |
|----------|-------------|
| `{world_name}` | Nombre del mundo actual (desde world_frame.json) |
| `{time}` | Hora actual de la historia (cadena ISO) |
| `{location}` | Ubicación actual del personaje |
| `{character}` | Nombre del personaje activo |
| `{role}` | Rol del usuario (protagonista, observador, etc.) |
| `{rules}` | Reglas del mundo (leyes mágicas, normas sociales, etc.) |
| `{timeline}` | Eventos recientes del mundo (últimos 5 del Chronicler) |
| `{memories}` | Recuerdos recientes del juego de rol |
| `{facts}` | Hechos establecidos del mundo |
| `{npcs}` | Nombres de NPC cercanos |
| `{history}` | Historial reciente de conversación (últimos 3 intercambios) |
| `{events}` | Eventos recientes (según contexto, últimos 3–5) |
| `{world_state}` | Resumen del estado actual del mundo |
| `{world_context}` | Contexto del mundo para investigación |
| `{genre}` | Género del mundo (fantasía, ciencia ficción, terror, etc.) |
| `{magic_system}` | Descripción del sistema de magia |
| `{language}` | Idioma principal del mundo (en, ru, etc.) |
| `{world_description}` | Descripción/pitch del mundo |

---

## Guía de temperatura

Los agentes configurados usan los valores globales por defecto (temperatura 0.7, máximo 2048 tokens) a menos que se anulen en `conf/agents.json`.

| Valor | Efecto | Usar para |
|-------|--------|-----------|
| 0.1 - 0.3 | Enfocado, determinista | Investigación, verificación de hechos, análisis de intención |
| 0.4 - 0.6 | Equilibrado | Chronicler, simulación social |
| 0.7 - 0.8 | Creativo | Narrativa, diálogo de NPC, planes del antagonista |

---

## Usar @agent en el chat

Envía un mensaje privado a un agente desde el chat. Las `@mentions` del chat enrutan a los gestores configurados, no a los Big Six:

```
@chronicler summarize the last hour
@story-planner suggest the next story beat
@researcher is this medieval sword historically accurate?
@social-sim how do the villagers react?
@villain what does the antagonist do next?
```

Las respuestas se marcan con un borde azul a la izquierda y el nombre del agente entre corchetes.

Los Big Six (`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`) están registrados en `AgentRegistryV2` pero **no** son accesibles mediante `@mention`.

---

## Sistema RAG (embeddings + memoria a largo plazo)

Todos los agentes tienen soporte completo de embeddings con memoria a largo plazo vía RAG:

- **Servidor de embeddings llama.cpp** — modelo BGE-M3 en el puerto 5002 para generación de vectores
- **Búsqueda híbrida SQLite** — búsqueda por palabras clave FTS5 + búsqueda vectorial densa + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — aislamiento de memoria por agente y por sesión mediante la columna `role`
- **Memoria por mundo** — la memoria se aísla por mundo para evitar alucinaciones entre mundos
- **Núcleos de cómputo Mojo** — 5 núcleos Mojo vía FFI con alternativas TypeScript:
  - `probability_ffi.mojo` — probabilidad de éxito, resultados de tirada, probabilidad por lotes
  - `vector_ffi.mojo` — operaciones vectoriales 4-dim (coseno, L2, producto punto)
  - `vector_full.mojo` — operaciones vectoriales de dimensión completa (768-dim BGE-M3)
  - `batch_ops.mojo` — operaciones NPC por lotes (decaimiento de edad, vicio, impuesto, lealtad)
  - `graph_ops.mojo` — recorrido de grafos, fusión RRF, cálculo de reputación

**Flujo de memoria:**
```
Agent Request → AgentMemoryStore → SQLite (hybrid search)
                                      ↓
                              ┌───────┴───────┐
                              │ FTS5 (LIKE)   │ Dense Vectors (BGE-M3)
                              │ Keyword Match │ Cosine Similarity
                              └───────┬───────┘
                                      ↓
                              Reciprocal Rank Fusion (RRF)
                                      ↓
                              Context for LLM Prompt
```

---

## Integración MCP (v0.33.4)

### Patrones bíblicos

Textos bíblicos almacenados en SQLite con granularidad de versículo. Cada versículo es un puntero atómico que los agentes pueden referenciar.

**Herramientas:**
- `search_verses` — Buscar por texto, libro o referencia
- `get_pattern` — Obtener patrones narrativos por arquetipo, tono o función
- `get_archetype` — Obtener detalles del arquetipo por nombre

### Estilos Gutenberg

Patrones estilísticos extraídos de textos del Proyecto Gutenberg. Las descripciones deslexicalizadas preservan la estructura sin nombres de personajes.

**Herramientas:**
- `get_style_pattern` — Buscar estilos por tono, etiquetas o descripción
- `apply_style` — Aplicar estilo al texto (deslexificar y devolver sugerencias)

### Validación de Wikipedia

Verificación histórica de hechos mediante la API de Wikipedia.

**Herramientas:**
- `verify_fact` — Verificar una afirmación factual
- `get_context` — Obtener el contexto de Wikipedia de un tema

---

## Sistema de plantillas

### Cómo funciona userTemplate

Cada agente almacena un `userTemplate` en SQLite (tabla `agent_prompts`) con respaldo en archivo JSON. La plantilla contiene marcadores `{var}` que se reemplazan con valores reales en tiempo de ejecución mediante `resolveTemplate()` (`src/utils/template-resolver.ts`).

**Flujo:**
1. El agente carga la configuración: `loadAgentConfig(agentId, world?, lang?)`
2. Lee `prompts.userTemplate` primero desde SQLite y luego del respaldo JSON
3. Llama a `resolveTemplate(template, vars)` con los datos de contexto
4. Envía el prompt resuelto al LLM

**Si no existe ningún userTemplate** → respaldo en `PromptBuilder` (plantillas TypeScript codificadas).

---

## Perfiles de estilo del jugador (v0.33.4)

`PlayerProfileStore` (`src/lib/player-profile-store.ts`) proporciona perfiles de estilo de jugador entre agentes, compartidos entre Stylist y LiteraryV2Generator.

**Métricas rastreadas:**
| Métrica | Descripción |
|---------|-------------|
| `avg_sentence_len` | Longitud promedio de las frases en palabras |
| `sensory_bias` | Preferencia por detalles sensoriales (0–1) |
| `register_score` | Registro formal/informal (0–1) |
| `dialogue_ratio` | Proporción de diálogo en el texto |
| `narrative_distance` | Narración cercana vs distante (0–1) |
| `action_orientation` | Preferencia acción vs reflexión (0–1) |
| `emotional_expressiveness` | Nivel de detalles emocionales (0–1) |
| `preferred_pace` | lento / medio / rápido |
| `literary_sophistication` | Complejidad de vocabulario/estructura (0–1) |
| `preferred_motifs` | Motivos narrativos preferidos |
| `anti_patterns` | Patrones evitados |
| `sample_snippets` | Fragmentos de texto representativos |
| `confidence` | Confianza del perfil (0–1) |

**Almacenamiento:** `data/player-profiles.db` (SQLite, modo WAL)

---

## Arquitectura de almacenamiento

### Base de datos SQLite

El proyecto usa SQLite mediante el módulo integrado `bun:sqlite` de Bun. El archivo de base de datos es `tns.db` en el `dbPath` configurado (por defecto `./worlds/{active}`).

**Tablas:**
- `entities` — Entidades del mundo con búsqueda de texto completo FTS5
- `embeddings` — Embeddings vectoriales para búsqueda semántica
- `memories` — Recuerdos de juego de rol con FTS5
- `agent_prompts` — Prompts de agentes por mundo + idioma
- `ui_translations` — Cadenas de traducción de UI por idioma + página

### Almacenamiento en archivos JSON (respaldo)

Los archivos JSON permanecen como respaldo durante la migración:

```
conf/
  settings.json          — Ajustes de la aplicación (LLM, servidor, idioma, etc.)
  agents.json            — Asignaciones globales de modelo/proveedor de agentes
worlds/{active}/
  agents/{agentId}.json  — Prompts de agentes por mundo (respaldo)
```
