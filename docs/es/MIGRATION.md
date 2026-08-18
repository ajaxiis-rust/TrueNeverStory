# Guía de migración: JSON a SQLite

Esta guía cubre la migración de los datos del mundo de archivos JSON a SQLite, además del esquema de almacenamiento usado por TrueNeverStory.

## Visión general

TrueNeverStory almacena los datos del mundo en **SQLite** mediante la clase `WorldStore` (`src/store/world-store.ts`). El archivo de base de datos es `tns.db`, creado dentro del directorio del mundo (`<worldPath>/tns.db`) con el modo de journal WAL habilitado.

Los archivos JSON originales permanecen en el directorio del mundo como fuente de la migración y nunca se eliminan — sirven como respaldo y registro histórico.

## Migración v0.33.0: Compilador Literario y Modelos Económicos

La versión v0.33.0 añade el Compilador Literario y los Modelos Económicos. No se requiere migración — son funcionalidades aditivas que extienden el pipeline State-First existente.

## Migración v0.33.0: Pipeline State-First

### Qué cambió

La versión v0.33.0 introduce una arquitectura de pipeline state-first. Ahora coexisten dos sistemas de agentes:

1. **The Big Six (AgentV2)** — la canalización de prosa narrativa (`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`), registrados en `AgentRegistryV2`.
2. **Agentes configurados (`DEFAULT_AGENTS`)** — los agentes dirigidos por configuración en `src/services/agent-config.ts` (`director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation`), que respaldan la UI de Ajustes/Proveedores y algunos subsistemas.

**Pipeline anterior:**
```
Intención del usuario → Selección de agente → Ejecución del agente → Respuesta
```

**Pipeline nuevo:**
```
Intención del usuario → Simulación → Selección de patrón (Dramaturg) → Verificación de hechos (Validator) → Renderizado de estilo (Stylist) → Diálogo de NPC (Actor) → Corrección (Censor) → Actualización de memoria (Chronicler)
```

**Agentes eliminados:**

| Eliminado | Reemplazado por |
|---------|-------------|
| `narrator`, `scene` | `stylist` (generación de prosa) |
| `historian` | `validator` (verificación de hechos) |
| `cartographer`, `lorekeeper`, `merchant`, `quest-giver` | (eliminados) |
| `npc` | `actor` (diálogo de NPC) |

`villain`, `social-sim`, `researcher` y `director` siguen disponibles como agentes configurados. `crafter` permanece como subsistema de artesanía.

**Compatibilidad con versiones anteriores:** Los IDs de agentes eliminados (`@narrator`, `@npc`, `@scene`, `@director`) ya no existen y no se resuelven. Las `@mentions` del chat enrutan solo a los gestores configurados (`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`).

### Integración MCP

v0.33.0 introduce herramientas del Model Context Protocol (MCP) para el acceso a conocimiento externo:

| Servidor MCP | Herramientas | Propósito |
|------------|-------|---------|
| Analizador bíblico | `search_verses`, `get_pattern`, `get_archetype` | Patrones narrativos de textos bíblicos |
| Analizador Gutenberg | `get_style_pattern`, `apply_style` | Patrones estilísticos de la literatura |
| Herramientas de Wikipedia | `verify_fact`, `get_context` | Verificación histórica de hechos |

**Configuración:**

```typescript
// In conf/settings.json
{
  "mcpServers": {
    "bible": { "enabled": true, "dbPath": "./data/bible.db" },
    "gutenberg": { "enabled": true, "dbPath": "./data/styles.db" },
    "wikipedia": { "enabled": true }
  }
}
```

### Nuevas dependencias

| Dependencia | Estado | Propósito |
|------------|--------|---------|
| Zod | Ya en el proyecto | Validación de esquema |
| Mojo FFI | Ya en el proyecto | Núcleos de cómputo |
| TranslationService | Sin dependencias externas | Traducciones de UI |

### Cambios incompatibles

- **Flujo interno de RoleplayEngine reescrito** — El pipeline ahora sigue Simulación → Patrón → Estilo → Diálogo → Corrección → Memoria
- **AgentV2.process() reemplaza a generateResponse()** — Nueva firma: `process(intent, simulation, context, pattern?)`
- **createRoleplayEngine() requiere nuevas dependencias** — referencias de servidor MCP, AgentRegistryV2, EventBus
- **`getLanguageInstruction()` eliminado** — el manejo del idioma se trasladó a `TranslationService` en el límite de salida

---

## Esquema de almacenamiento

### Base de datos SQLite

El constructor de `WorldStore` abre (y crea si no existe) un archivo `tns.db` dentro del directorio del mundo:

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");
// Opens worlds/my-world/tns.db with:
//   PRAGMA journal_mode = WAL
//   PRAGMA synchronous = NORMAL
```

**Tablas creadas al iniciar (`CREATE TABLE IF NOT EXISTS`):**

| Tabla | Propósito |
|-------|---------|
| `quests` | Datos de quest (`id`, `title`, `description`, `giver`, `objectives`, `status`, marcas de tiempo) |
| `npc_memories` | Memorias a corto y largo plazo de NPC, indexadas por `npc_uid` + `memory_type` |
| `story_arcs` | Datos de arco del planificador de historias (un blob JSON por fila) |
| `world_frame` | Pares clave/valor del world frame |
| `director_state` | Pares clave/valor del estado del director |
| `villains` | Datos del villano (blob JSON por fila) |

### Archivos JSON (fuente de migración)

Los archivos JSON originales viven en el mismo directorio del mundo y se leen como fuente de la migración. Nunca se eliminan después de la migración:

| Archivo JSON | Migrado a la tabla |
|-----------|---------------------|
| `worlds/{name}/quests.json` | `quests` |
| `worlds/{name}/npc_profiles.json` | `npc_memories` |
| `worlds/{name}/world_frame.json` | `world_frame` |
| `worlds/{name}/story_planner.json` | `story_arcs` |
| `worlds/{name}/director_state.json` | `director_state` |
| `worlds/{name}/villains.json` | `villains` |

## Proceso de migración

### Desencadenar la migración

La migración se ejecuta bajo demanda mediante el endpoint HTTP (no hay migración automática al arrancar):

```typescript
const store = new WorldStore("worlds/my-world");

const result = await store.migrate();
// result = { migrated: ["quests", "npc_profiles", ...], errors: [] }

store.close();
```

El método `migrate()` migra cada fuente de datos de forma independiente dentro de su propio `try/catch`, de modo que un fallo en una fuente no aborta las demás. Cada fuente migrada correctamente se añade a `migrated`; cualquier fallo se registra en `errors`.

**Fuentes migradas (en orden):** `quests`, `npc_profiles`, `world_frame`, `story_planner`, `director_state`, `villains`.

Si un archivo de origen JSON falta o no se puede analizar, esa fuente se omite silenciosamente (el helper de lectura devuelve `null`).

### Migración de ruta heredada

Al arrancar (`src/index.ts`), si el directorio `WORLDS_ROOT` no existe, se crea y un directorio heredado `WORLD_DB_PATH` (p. ej. `world_db/`) se renombra a `worlds/default/`:

```
world_db/  →  worlds/default/
```

## WorldStore API

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");

// Migration
const result = await store.migrate();           // { migrated: string[], errors: string[] }

// Quest CRUD
const quests = store.getQuests();               // QuestData[]
const quest = store.getQuest(id);               // QuestData | null
store.upsertQuest(quest);                       // insert or replace
const removed = store.deleteQuest(id);          // boolean

// NPC memories
const memories = store.getNPCMemories(npcUid);              // all memory types
const short = store.getNPCMemories(npcUid, "short_term");   // filtered by type
store.addNPCMemory(npcUid, memory);                         // default type "short_term"

// World frame
const frame = store.getWorldFrame();            // Record<string, string>
store.setWorldFrame(key, value);

// Stats
const stats = store.getStats();                 // { quests, memories, worldFrame }

store.close();
```

## Endpoints de la API

El router (`src/routes/world-store.ts`) se monta bajo `/api`. Cada endpoint acepta un parámetro de consulta opcional `?world=` para apuntar a un mundo específico (por defecto el mundo activo):

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/world-store/migrate` | Migra archivos JSON a SQLite; devuelve `{ status, world, migrated, errors }` |
| `GET` | `/api/world-store/stats` | Devuelve `{ world, stats }` (recuentos de quests, memorias, claves del world frame) |
| `GET` | `/api/world-store/quests` | Lista las quests de SQLite |
| `GET` | `/api/world-store/npc-memories/:uid` | Memorias de NPC (`?type=short_term\|long_term_episodic`) |
| `GET` | `/api/world-store/frame` | Pares clave/valor del world frame |

## Reversión

Si la migración falla o necesitas revertir:

1. Los datos SQLite están aislados en `worlds/{name}/tns.db`
2. Los archivos JSON originales permanecen en `worlds/{name}/`
3. Elimina `worlds/{name}/tns.db` para restablecer un estado solo-JSON
4. Vuelve a ejecutar `POST /api/world-store/migrate` para migrar de nuevo desde JSON

## Solución de problemas

### Error «Table already exists»

Esto es normal — las tablas se crean con `IF NOT EXISTS`.

### Datos faltantes después de la migración

Comprueba que el archivo de origen JSON existe en el directorio del mundo y es un JSON válido. Los archivos no analizables se omiten silenciosamente y solo se notifican si el análisis lanza una excepción — inspecciona el array `errors` en el resultado de la migración para más detalles.

### Rendimiento

- El modo WAL de SQLite está habilitado por defecto en `WorldStore`
- Se establece `PRAGMA synchronous = NORMAL` para un equilibrio entre durabilidad y velocidad
- Ejecuta `PRAGMA optimize` periódicamente en bases de datos grandes
