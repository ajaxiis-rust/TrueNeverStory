# TrueNeverStory — Referencia API

API REST para la plataforma de creación de mundos y rol TrueNeverStory. Todos los endpoints devuelven JSON salvo que se indique lo contrario.

**URL base:** `http://localhost:8000`

---

## Tabla de contenidos

- [Salud](#salud)
- [Chat y Rol](#chat-y-rol)
- [Mundos](#mundos)
- [Entidades y Grafo](#entidades-y-grafo)
- [Sesiones](#sesiones)
- [Ramas](#ramas)
- [Probabilidad](#probabilidad)
- [Romance](#romance)
- [Misiones](#misiones)
- [Memoria](#memoria)
- [Mantenimiento](#mantenimiento)
- [Agentes](#agentes)
- [Proveedores y Modelos](#proveedores-y-modelos)
- [Configuración](#configuración)
- [Inicio](#inicio)

---

## Salud

### `GET /health`
Verificación de salud.

**Respuesta:** `{ status: "ok", engine_ready: boolean, uptime: number }`

### `GET /system-check`
Estado del sistema con versión de Node e información de plataforma.

**Respuesta:** `{ ok: boolean, message: string, node_version: string, platform: string }`

---

## Chat y Rol

### `POST /chat/setup`
Inicializar o actualizar la sesión de rol activa.

**Solicitud:**
```json
{
  "character": "Kaelen",
  "location": "Silverwood",
  "story_time": "2025-06-01T12:00:00Z",
  "role": "protagonist",
  "session_id": "default"
}
```

**Respuesta:** `{ active_character, current_location, current_time, session_id }`

### `POST /chat/message`
Enviar un mensaje del jugador, obtener una respuesta narrativa.

**Solicitud:** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**Respuesta:** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
Streaming SSE para entrega progresiva del relato. Cuerpo de solicitud idéntico a `/chat/message`.

**Respuesta:** Flujo Server-Sent Events:
- `event: start` — estado de la sesión
- `event: chunk` — fragmento del relato
- `event: agent` — respuesta del agente (para menciones `@agent`)
- `event: done` — estado final
- `event: error` — mensaje de error
- `data: [DONE]` — marcador de fin del flujo

### `POST /chat/agent`
Enviar un mensaje privado a un agente específico.

**Solicitud:** `{ agentId: string, message: string }`

**Respuesta:** `{ narrative, agent_id, agent_name, location, story_time, active_character, success, error? }`

### `GET /chat/session`
Obtener el estado actual de la sesión.

**Respuesta:** `{ active_character, current_location, current_time, session_id }`

### `GET /chat/history?limit=20`
Obtener el historial de conversaciones recientes.

**Respuesta:** Array de `{ user: string, assistant: string, timestamp: string }`

---

## Mundos

### `GET /worlds`
Listar todos los mundos disponibles.

**Respuesta:** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
Nombre del mundo activo (consulta ligera).

**Respuesta:** `{ active: string }`

### `POST /worlds`
Crear un nuevo mundo.

**Solicitud:** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

**Respuesta:** `{ status: "created", world }`

### `GET /worlds/:name`
Detalles del mundo y datos del frame.

### `PUT /worlds/:name`
Actualizar campos del world frame.

### `DELETE /worlds/:name`
Eliminar un mundo.

### `POST /worlds/:name/switch`
Cambiar el mundo activo.

### `POST /worlds/:name/chapters/generate`
Generar un capítulo literario a partir de datos de sesión.

**Solicitud:** `{ sessionId?: string, prompt?: string }`

### `GET /worlds/:name/chapters`
Listar capítulos generados.

### `GET /worlds/:name/chapters/:filename`
Contenido de un capítulo.

### `GET /worlds/:name/detail`
Estadísticas completas del mundo para el modal de estadísticas.

**Respuesta:**
```json
{
  "name": "default",
  "title": "Mi mundo",
  "description": "...",
  "genre": "fantasy",
  "language": "es",
  "worldRules": [{ "name": "...", "description": "..." }],
  "magicSystem": "...",
  "entityCounts": { "Character": 5, "Location": 3, "Faction": 2, "Item": 8 },
  "totalEntities": 18,
  "characters": [{ "name": "...", "summary": "...", "tags": [], "relationships": [] }],
  "locations": [{ "name": "...", "summary": "..." }],
  "factions": [{ "name": "...", "summary": "..." }],
  "items": [{ "name": "...", "summary": "..." }],
  "sessionCount": 4,
  "eventCount": 42,
  "chapterCount": 3,
  "villainCount": 1,
  "hasFrame": true
}
```

---

## Entidades y Grafo

### `GET /entity/:uid?layers=l1,l2,l3`
Detalles de entidad por UID.

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
Vecinos de la entidad con recorrido del grafo. Dirección: `out`, `in` o `both`.

### `GET /path?source=Character:Kaelen&target=Location:Village`
Encontrar el camino más corto entre dos entidades.

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
Buscar entidades por nombre o similitud semántica.

**Respuesta:** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
Estadísticas del grafo (conteo de nodos/aristas, info de rama).

### `GET /graph/d3?mode=relationships`
Datos del grafo para visualización d3-force. Modo: `relationships` o `crafting`.

**Respuesta:** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## Sesiones

### `GET /sessions`
Listar todos los historiales de sesiones.

### `GET /sessions/list`
Listar sesiones de juego disponibles.

**Respuesta:** `{ sessions: array, count: number }`

### `GET /sessions/:sessionId/history`
Historial de conversaciones de una sesión.

### `GET /sessions/:sessionId/summarize`
Resumir una sesión.

### `POST /sessions/export`
Exportar sesión a markdown.

**Solicitud:** `{ session_id?: string, messages: [{role, content, timestamp?}] }`

### `GET /sessions/exports`
Listar archivos markdown exportados.

### `GET /sessions/exports/:filename`
Cargar un archivo exportado.

---

## Ramas

### `POST /branch/create?name=my-branch&from_branch=main`
Crear una nueva rama del mundo (snapshots tipo git).

### `POST /branch/switch?name=my-branch`
Cambiar la rama activa.

### `POST /branch/merge?name=my-branch`
Fusionar una rama en main.

### `GET /branch/list`
Listar todas las ramas.

---

## Probabilidad

### `GET /probability/:character/:profile?target=optional`
Obtener la probabilidad de éxito de una acción de personaje.

Perfiles: `combat`, `persuasion`, `stealth`, `intimidation`, `deception`, `athletics`, `investigation`, `romance`, `generic`.

**Respuesta:** `{ character, profile, probability: number }`

### `POST /probability/modifier`
Aplicar un modificador temporal de probabilidad.

**Solicitud:** `{ entity: string, parameter: string, value: number, duration_seconds?: number }`

### `GET /probability/modifiers/:entity`
Listar modificadores activos de una entidad.

---

## Romance

### `GET /romance/:character1/:character2`
Estado de la relación romántica.

**Respuesta:** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
Intentar una acción romántica. Acciones: `attraction`, `confess`, `date`, `kiss`, `propose`, `breakup`.

**Solicitud:** `{ character, target, location?, message? }`

**Respuesta:** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
Todas las relaciones románticas de un personaje.

---

## Misiones

### `GET /quests`
Listar todas las misiones con progreso.

### `GET /quest/:questId`
Detalles de una misión.

---

## Memoria

### `POST /memory/forget?older_than=30&min_importance=0.2`
Olvidar recuerdos antiguos de baja importancia.

### `POST /memory/summarise?tag=keyword`
Resumir recuerdos por etiqueta o UID de nodo.

### `GET /memory/export?fmt=json`
Exportar todos los recuerdos.

### `POST /memory/import`
Importar recuerdos desde el cuerpo.

**Solicitud:** `{ data: MemoryEntry[] }`

### `POST /memory/update/:entryId`
Actualizar una entrada de memoria.

**Solicitud:** `{ content: string }`

### `GET /memory/stats`
Estadísticas del sistema de memoria.

### `POST /memory/rebuild`
Reconstruir el índice vectorial FAISS.

### `GET /memory/retrieve?q=keyword&top_k=10`
Búsqueda semántica sobre recuerdos.

---

## Mantenimiento

### `POST /maintenance/run?full=true`
Ejecutar mantenimiento de memoria (poda, clustering, archivado).

### `GET /maintenance/status`
Estadísticas de memoria y mantenimiento.

### `POST /maintenance/rebuild-index`
Reconstruir índice vectorial.

### `POST /maintenance/clean-orphans`
Limpiar embeddings huérfanos.

---

## Agentes

### `GET /agents`
Listar todos los agentes configurados.

### `GET /agents/:id`
Configuración de un agente.

### `PUT /agents/:id`
Actualizar configuración de un agente (modelo, temperatura, prompts, etc.). Límite: 30 req/min/IP.

### `PUT /agents/:id/prompts`
Actualizar solo los prompts de un agente.

### `POST /agents/:id/reset`
Restablecer un agente a valores predeterminados.

### `GET /agents/providers/options`
Opciones de proveedores/modelos disponibles para asignación a agentes.

---

## Proveedores y Modelos

### `GET /providers`
Listar todos los proveedores LLM.

### `POST /providers`
Agregar un proveedor.

### `GET /providers/models`
Listar todos los modelos de los proveedores.

### `POST /providers/health`
Activar verificación de salud de todos los proveedores.

### `POST /providers/assign`
Asignar proveedor+modelo a un agente.

**Solicitud:** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `DELETE /providers/assign/:agentId`
Eliminar asignación de proveedor de un agente.

### `GET /providers/:id`
Detalles del proveedor y modelos disponibles.

### `PUT /providers/:id`
Actualizar configuración del proveedor.

### `DELETE /providers/:id`
Eliminar un proveedor.

### `POST /providers/:id/default`
Establecer proveedor como predeterminado.

### `POST /providers/:id/keys`
Agregar una clave API.

### `DELETE /providers/:id/keys/:keyId`
Eliminar una clave API.

### `GET /models`
Listar todos los modelos instalados y disponibles.

### `POST /models/install`
Instalar un modelo.

**Solicitud:** `{ source: "ollama"|"gguf_url", name: string, backend: "ollama"|"llamacpp" }`

### `DELETE /models/:id`
Eliminar un modelo.

### `POST /models/import`
Importar un archivo de modelo local.

### `POST /models/apply`
Aplicar un modelo a la configuración.

### `GET /models/browse?path=/`
Explorar el sistema de archivos en busca de modelos.

---

## Configuración

### `GET /settings`
Configuración actual (claves API enmascaradas).

### `PUT /settings`
Actualizar configuración. Las contraseñas se hashean automáticamente, las claves enmascaradas se ignoran.

### `POST /settings/reset`
Restablecer a valores predeterminados.

### `GET /languages`
Listar idiomas de interfaz disponibles (EN, RU, DE, FR, ES, JA, ZH).

---

## Inicio

### `POST /launch`
Crear una nueva sesión de juego con generación de personaje.

**Solicitud:** `{ hints?: string, isekai?: boolean, starting_age?: number }`

**Respuesta:** `{ status: "success", session_id, character_name, opening_narrative, url }`

### `POST /continue`
Continuar una sesión existente.

**Solicitud:** `{ session_id: string }`

**Respuesta:** `{ status: "success", session_id, character_name, url }`

---

## WebSocket

### `GET /ws/roleplay/:sessionId`
Endpoint WebSocket para rol en tiempo real. Mensajes en JSON:

**Cliente → Servidor:** `{ type: "message", content: string }`
**Servidor → Cliente:** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## Autenticación

Cuando la autenticación por contraseña está habilitada, las sesiones usan cookies HttpOnly. Incluya `credentials: "include"` en las llamadas fetch.

---

*Generado: 2026-06-27 | TrueNeverStory v0.12.0*
