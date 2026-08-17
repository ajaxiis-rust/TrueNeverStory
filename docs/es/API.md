# Referencia API de TrueNeverStory

API REST para la plataforma de construcción de mundos y juego de rol TrueNeverStory. Todos los endpoints devuelven JSON salvo que se indique lo contrario.

**URL base:** `http://localhost:8000`

---

## Tabla de contenidos

- [Salud](#salud)
- [Chat y juego de rol](#chat-y-juego-de-rol)
- [Mundos](#mundos)
- [Entidades y grafo](#entidades-y-grafo)
- [Sesiones](#sesiones)
- [Ramas](#ramas)
- [Probabilidad](#probabilidad)
- [Romance](#romance)
- [Misiones](#misiones)
- [Feedback](#feedback)
- [Motor de reglas](#motor-de-reglas)
- [Feature flags](#feature-flags)
- [Versionado de API](#versionado-de-api)
- [Memoria](#memoria)
- [Mantenimiento](#mantenimiento)
- [Sistema](#sistema)
- [Agentes](#agentes)
- [Proveedores y modelos](#proveedores-y-modelos)
- [Configuración](#configuración)
- [Lanzamiento](#lanzamiento)
- [WebSocket](#websocket)
- [Autenticación](#autenticación)
- [Inter-mundos](#inter-mundos)
- [Plugins](#plugins)
- [Monitorización](#monitorización)
- [I18n](#i18n)
- [Almacenamiento del mundo](#almacenamiento-del-mundo)
- [Investigación Wiki](#investigación-wiki)

---

## Salud

### `GET /health`
Verificación de estado.

**Respuesta:** `{ status: "ok", engine_ready: boolean, uptime: number, version: string }`

### `GET /system-check`
Estado del sistema con versión de Node e información de plataforma.

**Respuesta:** `{ ok: boolean, message: string, node_version: string, platform: string }`

---

## Chat y juego de rol

### `POST /chat/setup`
Inicializar o actualizar la sesión de juego de rol activa.

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
Enviar un mensaje del jugador y obtener una respuesta narrativa.

**Solicitud:** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**Respuesta:** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
Endpoint SSE para entrega progresiva del relato. Cuerpo de solicitud igual que `/chat/message`.

**Respuesta:** Flujo Server-Sent Events:
- `event: start` — estado de la sesión
- `event: chunk` — fragmento de texto narrativo
- `event: agent` — respuesta del agente (para menciones `@agent`)
- `event: heartbeat` — comentario keepalive (`: keepalive`)
- `event: done` — estado final
- `event: error` — mensaje de error
- `data: [DONE]` — centinela de fin de flujo

### `POST /chat/agent`
Enviar un mensaje privado a un agente específico.

**Solicitud:** `{ agentId: string, message: string }`

**Respuesta:** `{ narrative, agent_id, agent_name, location, story_time, active_character, success, error? }`

### `GET /chat/session`
Obtener el estado actual de la sesión.

**Respuesta:** `{ active_character, current_location, current_time, session_id }`

### `GET /chat/history?limit=20`
Obtener el historial reciente de la conversación.

**Respuesta:** Array de `{ user: string, assistant: string, timestamp: string }`

---

## Mundos

### `GET /worlds`
Listar todos los mundos disponibles.

**Respuesta:** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
Obtener el nombre del mundo activo (ligero).

**Respuesta:** `{ active: string }`

### `POST /worlds`
Crear un nuevo mundo.

**Solicitud:** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

**Respuesta:** `{ status: "created", world }`

### `GET /worlds/:name`
Obtener detalles del mundo y datos del frame.

### `PUT /worlds/:name`
Actualizar campos del frame del mundo.

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
Obtener contenido del capítulo.

### `GET /worlds/:name/detail`
Estadísticas completas del mundo para la modal de estadísticas.

**Respuesta:**
```json
{
  "name": "default",
  "title": "My World",
  "description": "...",
  "genre": "fantasy",
  "language": "en",
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

## Entidades y grafo

### `GET /entity/:uid?layers=l1,l2,l3`
Obtener detalles de entidad por UID.

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
Obtener vecinos de entidad con recorrido de grafo. Dirección: `out`, `in` o `both`.

### `GET /path?source=Character:Kaelen&target=Location:Village`
Encontrar el camino más corto entre dos entidades.

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
Buscar entidades por nombre o similitud semántica.

**Respuesta:** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
Estadísticas del grafo (conteo de nodos/aristas, información de ramas).

### `GET /graph/d3?mode=relationships`
Datos del grafo formateados para visualización d3-force. Modo: `relationships` o `crafting`.

**Respuesta:** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## Sesiones

### `GET /sessions`
Listar todos los historiales de sesiones.

### `GET /sessions/list`
Listar sesiones de juego disponibles.

**Respuesta:** `{ sessions: array, count: number }`

### `GET /sessions/:sessionId/history`
Obtener historial de conversación de una sesión.

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
Obtener la probabilidad de éxito de una acción del personaje.

Perfiles: `combat`, `persuasion`, `stealth`, `intimidation`, `deception`, `athletics`, `investigation`, `romance`, `generic`.

**Respuesta:** `{ character, profile, probability: number }`

### `POST /probability/modifier`
Aplicar un modificador de probabilidad temporal.

**Solicitud:** `{ entity: string, parameter: string, value: number, duration_seconds?: number }`

### `GET /probability/modifiers/:entity`
Listar modificadores activos para una entidad.

---

## Romance

### `GET /romance/:character1/:character2`
Obtener el estado de la relación romántica.

**Respuesta:** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
Intentar una acción romántica. Acciones: `attraction`, `confess`, `date`, `kiss`, `propose`, `breakup`.

**Solicitud:** `{ character, target, location?, message? }`

**Respuesta:** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
Obtener todas las relaciones románticas de un personaje.

---

## Misiones

### `GET /quests`
Listar todas las misiones con progreso.

### `GET /quest/:questId`
Obtener detalles de una misión.

---

## Feedback

### `POST /feedback`
Registrar una reacción like/dislike/neutro para el último turno narrativo.

**Solicitud:** `{ turnId: number, reaction: 'like'|'dislike'|'neutral', techniques: string[] }`

En caso de `dislike`, el motor regenera el último turno y devuelve `{ ok, regenerated }`. En caso contrario devuelve `{ ok: true }`.

---

## Motor de reglas

### `GET /rules`
Listar reglas sociales/económicas del mundo.

### `GET /rules/:id`
Obtener detalles de una regla por ID.

### `POST /rules/preview`
Vista previa de reglas fusionadas con modificadores. Cuerpo: `RulesConfig`.

### `POST /rules/check`
Verificar si una acción está permitida. Cuerpo: `{ config, action, superiorClass?, subordinateClass? }`.

---

## Feature flags

### `GET /feature-flags`
Listar todos los feature flags y exposiciones.

### `GET /feature-flags/:id`
Obtener un solo flag.

### `POST /feature-flags`
Crear un nuevo flag.

### `PUT /feature-flags/:id`
Actualizar un flag.

### `DELETE /feature-flags/:id`
Eliminar un flag.

### `POST /feature-flags/:id/check`
Verificar si un flag está habilitado para un contexto (usuario, etc.).

---

## Versionado de API

TrueNeverStory soporta dos versiones de API:

- **v1** — Envoltura legacy para compatibilidad hacia atrás
- **v2** — Versión mejorada con integración del registro de agentes

Las rutas legacy (todo bajo `/api/*`) incluyen cabeceras de deprecación:

- `X-API-Version: legacy`
- `Deprecation: true`
- `Sunset: 2026-12-31`

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
Actualizar un recuerdo.

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

## Sistema

### `POST /system/pause`
Pausar el motor de juego de rol. No acepta parámetros.

### `POST /system/resume`
Reanudar el motor de juego de rol. No acepta parámetros.

### `GET /system/status`
Obtener el estado de ejecución/pausa del motor.

---

## Agentes

### `GET /agents`
Listar todos los agentes configurados.

**Parámetros de consulta:** `world` — opcional, filtrar por mundo específico

### `GET /agents/:id`
Obtener configuración de un agente.

**Parámetros de consulta:** `world` — opcional, cargar desde mundo específico

### `PUT /agents/:id`
Actualizar configuración del agente (modelo, temperatura, prompts, etc.). Límite: 30/min/IP.

**Parámetros de consulta:** `world` — opcional, guardar en mundo específico

### `PUT /agents/:id/prompts`
Actualizar solo los prompts de un agente.

**Parámetros de consulta:** `world` — opcional, guardar en mundo específico

### `POST /agents/:id/reset`
Restablecer agente a valores por defecto.

### `GET /agents/providers/options`
Obtener opciones de proveedores/modelos disponibles para asignación de agentes.

### `GET /agents/:id/prompts/:lang`
Obtener prompts de un agente para un idioma específico.

### `PUT /agents/:id/prompts/:lang`
Actualizar prompts de un agente para un idioma específico.

### `GET /agents/registry`
Listar todos los agentes registrados (AgentRegistry).

### `GET /agents/registry/stats`
Obtener estadísticas del registro.

### `GET /agents/registry/:id`
Obtener un agente registrado.

### `PUT /agents/registry/:id`
Actualizar un agente registrado.

### `POST /agents/registry/:id/enable`
Habilitar un agente.

### `POST /agents/registry/:id/disable`
Deshabilitar un agente.

### `DELETE /agents/registry/:id`
Eliminar un agente del registro.

---

## Proveedores y modelos

### `GET /providers`
Listar todos los proveedores LLM.

### `POST /providers`
Agregar un nuevo proveedor.

### `GET /providers/models`
Listar todos los modelos en los proveedores.

### `POST /providers/health`
Ejecutar verificación de salud en todos los proveedores.

### `POST /providers/assign`
Asignar un proveedor+modelo a un agente.

**Solicitud:** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `GET /providers/assignments`
Listar todas las asignaciones proveedor-agente.

### `GET /providers/agents`
Listar agentes del gestor de proveedores.

### `POST /providers/sync-from-agents`
Sincronizar asignaciones desde la configuración de agentes.

### `GET /providers/reset`
Restablecer gestor de proveedores.

### `DELETE /providers/assign/:agentId`
Eliminar asignación de proveedor de un agente.

### `GET /providers/:id`
Obtener detalles del proveedor y modelos disponibles.

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
Explorar sistema de archivos en busca de archivos de modelo.

---

## Configuración

### `GET /settings`
Obtener configuración actual (claves API enmascaradas).

### `PUT /settings`
Actualizar configuración. Las contraseñas se hashean automáticamente, las claves enmascaradas se ignoran.

### `POST /settings/reset`
Restablecer a valores por defecto.

### `GET /languages`
Listar idiomas de interfaz disponibles (EN, RU, DE, FR, ES, JA, ZH).

### `GET /llm-config`
Obtener configuración del servidor LLM.

### `PUT /llm-config`
Actualizar configuración del servidor LLM.

### `POST /server/restart`
Reiniciar servidores LLM.

### `GET /server/status`
Verificar estado del servidor LLM.

---

## Lanzamiento

### `POST /launch`
Crear una nueva sesión de juego con generación de personaje.

**Solicitud:** `{ hints?: string, isekai?: boolean, starting_age?: number, name?: string }`

- `name` — nombre explícito del personaje (opcional). Si se proporciona, se omite la generación de nombre por LLM. Soporta caracteres no latinos.

**Respuesta:** `{ status: "success", session_id, character_name, opening_narrative, race, social_class, birthplace, initial_location }`

### `POST /continue`
Continuar una sesión existente.

**Solicitud:** `{ session_id: string }`

**Respuesta:** `{ status: "success", session_id, character_name, restored: boolean }`

### `POST /snapshot`
Guardar el estado actual del juego.

**Solicitud:** `{ session_id?: string }`

---

## WebSocket

### `GET /ws/*`
Endpoint WebSocket para juego de rol en tiempo real. El servidor acepta actualizaciones WebSocket en cualquier ruta `/ws/*`. El contexto de sesión se determina por el tipo de mensaje, no por la URL.

**Cliente → Servidor:** `{ type: "message", content: string }` o `{ type: "setup", ... }`
**Servidor → Cliente:** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## Autenticación

Cuando la autenticación por contraseña está habilitada, las sesiones usan cookies HttpOnly. Incluya `credentials: "include"` en las llamadas fetch.

---

## Inter-mundos

### `GET /api/cross-world/status`
Obtener el estado de la comunicación inter-mundos.

**Respuesta:** `{ enabled: boolean, portals: number, eventLog: number }`

### `POST /api/cross-world/enable`
Habilitar comunicación inter-mundos.

**Respuesta:** `{ enabled: true }`

### `POST /api/cross-world/disable`
Deshabilitar comunicación inter-mundos.

**Respuesta:** `{ enabled: false }`

### `GET /api/cross-world/portals`
Listar portales activos entre mundos.

**Respuesta:** Array de `{ id, world1, world2, createdAt, active }`

### `POST /api/cross-world/portals`
Crear un portal entre dos mundos.

**Solicitud:** `{ world1: string, world2: string }`

**Respuesta:** `{ id, world1, world2, createdAt, active }`

### `DELETE /api/cross-world/portals/:id`
Destruir un portal.

**Respuesta:** `{ deleted: true }`

### `GET /api/cross-world/events?limit=50`
Obtener registro de eventos inter-mundos.

**Respuesta:** Array de `{ type, data, source, timestamp }`

---

## Plugins

### `GET /api/plugins`
Listar todos los plugins registrados.

**Respuesta:** Array de `{ id, name, version, description, agents, routes, hooks }`

### `GET /api/plugins/:id`
Obtener detalles de un plugin.

**Respuesta:** Objeto plugin con todos los detalles.

### `GET /api/plugins/:id/capabilities`
Obtener capacidades del plugin (conteo de agentes, rutas, hooks).

**Respuesta:** `{ agents: number, routes: number, hooks: number }`

### `GET /api/plugins/agents/all`
Obtener todos los agentes registrados por plugins.

**Respuesta:** Array de `{ id, name, description, config }`

### `GET /api/plugins/routes/all`
Obtener todas las rutas registradas por plugins.

**Respuesta:** Array de `{ path, method, handler }`

---

## Monitorización

### `GET /monitoring/dashboard`
Datos agregados del panel de monitorización.

### `GET /monitoring/stats`
Estadísticas ligeras para polling.

---

## I18n

### `GET /i18n/translations/:lang/:page`
Obtener traducciones para un idioma y página específicos.

### `GET /i18n/translations/:lang`
Obtener todas las traducciones para un idioma.

### `PUT /i18n/translations`
Insertar/actualizar traducciones por lote.

### `DELETE /i18n/translations/:lang/:page/:key`
Eliminar una clave de traducción.

---

## Almacenamiento del mundo

### `POST /world-store/migrate`
Migrar datos JSON a SQLite.

### `GET /world-store/stats`
Obtener estadísticas de migración.

### `GET /world-store/quests`
Obtener misiones desde SQLite.

### `GET /world-store/npc-memories/:uid`
Obtener recuerdos de NPCs por UID de entidad.

### `GET /world-store/frame`
Obtener el frame del mundo desde SQLite.

---

## Investigación Wiki

### `POST /api/wiki/research/:worldId`
Iniciar investigación de Wikipedia para un mundo.

### `GET /api/wiki/research/:worldId/progress`
Flujo SSE de progreso para investigación en curso.

### `POST /api/wiki/research/:worldId/pause`
Pausar investigación en curso.

### `POST /api/wiki/research/:worldId/resume`
Reanudar investigación pausada.

### `GET /api/wiki/research/:worldId/status`
Obtener estado de la investigación.

---

*Generado: 2026-07-31 | TrueNeverStory v0.32.6*
