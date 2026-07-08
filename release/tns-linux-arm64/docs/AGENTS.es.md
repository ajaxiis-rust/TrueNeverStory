# Referencia de agentes

TrueNeverStory utiliza una arquitectura multi-agente donde cada agente maneja un aspecto específico de la narrativa. Cada agente tiene su propia configuración LLM, prompts del sistema y plantillas de usuario.

## Variables globales

Estas variables están disponibles para la mayoría de los agentes a través del contexto del estado del mundo:

| Variable | Descripción |
|----------|-------------|
| `{world_name}` | Nombre del mundo actual (desde world_frame.json) |
| `{time}` | Hora actual de la historia (cadena ISO) |
| `{location}` | Ubicación actual del personaje |
| `{character}` | Nombre del personaje activo |
| `{role}` | Rol del usuario (protagonista, observador, etc.) |
| `{rules}` | Reglas del mundo (leyes mágicas, normas sociales, etc.) |
| `{timeline}` | Eventos recientes del mundo (últimos 5 del cronista) |
| `{memories}` | Recuerdos recientes del juego de rol |
| `{facts}` | Hechos establecidos del mundo |
| `{npcs}` | Nombres de NPCs cercanos |
| `{history}` | Historial reciente de la conversación (últimos 3 intercambios) |
| `{events}` | Eventos recientes (según contexto, últimos 3-5) |
| `{world_state}` | Resumen del estado actual del mundo |
| `{world_context}` | Contexto del mundo para investigación |

## Agentes

### Narrador (`narrator`)

**Descripción:** Narrador principal. Genera la narrativa del mundo a partir del contexto de la historia.

**Variables de plantilla:**
`{world_name}` `{time}` `{location}` `{character}` `{role}` `{rules}` `{timeline}` `{memories}` `{facts}` `{npcs}` `{history}`

**Prompt del sistema:** Define al narrador como un hábil contador de historias. Escribe prosa vívida e inmersiva en segunda/tercera persona. Nunca rompe el carácter.

**Temperatura:** 0.8 | **Máx. tokens:** 4096 | **Prioridad:** 10 (la más alta)

---

### Director (`director`)

**Descripción:** Inyección de momentos narrativos. Integra momentos dramáticos en la narrativa.

**Variables de plantilla:**
`{narrative}` `{beat}`

| Variable | Descripción |
|----------|-------------|
| `{narrative}` | Texto narrativo actual donde inyectar el momento |
| `{beat}` | Descripción del momento narrativo (incidente, revelación, revés, etc.) |

**Temperatura:** 0.7 | **Máx. tokens:** 2048 | **Prioridad:** 8

---

### Generador de escenas (`scene`)

**Descripción:** Transiciones de escena al moverse entre ubicaciones.

**Variables de plantilla:**
`{character}` `{origin}` `{destination}` `{rules}` `{events}`

| Variable | Descripción |
|----------|-------------|
| `{origin}` | Ubicación actual (de dónde sale el personaje) |
| `{destination}` | Ubicación objetivo (a dónde va el personaje) |

**Temperatura:** 0.8 | **Máx. tokens:** 2048 | **Prioridad:** 7

---

### Agente NPC (`npc`)

**Descripción:** Diálogos y reacciones de NPCs. Representa personajes individuales.

**Variables de plantilla:**
`{npc_name}` `{npc_personality}` `{player}` `{location}` `{relationship}` `{events}` `{line}`

| Variable | Descripción |
|----------|-------------|
| `{npc_name}` | Nombre del NPC representado |
| `{npc_personality}` | Rasgos de personalidad del NPC (del perfil de entidad) |
| `{player}` | Nombre del personaje del jugador |
| `{relationship}` | Relación con el jugador (amigo, neutral, enemigo, etc.) |
| `{line}` | Lo que el jugador le dijo al NPC |

**Temperatura:** 0.7 | **Máx. tokens:** 1024 | **Prioridad:** 9

---

### Cronista (`chronicler`)

**Descripción:** Gestión de la línea de tiempo. Resume eventos y mantiene la historia del mundo.

**Variables de plantilla:**
`{events}` `{timeline}`

| Variable | Descripción |
|----------|-------------|
| `{events}` | Nuevos eventos para cronicar (acciones, movimientos, diálogos recientes) |
| `{timeline}` | Línea de tiempo existente para contexto |

**Temperatura:** 0.5 | **Máx. tokens:** 1024 | **Prioridad:** 5

---

### Planificador de historias (`story-planner`)

**Descripción:** Planificación de arcos narrativos. Planifica misiones y desarrollos de la trama.

**Variables de plantilla:**
`{world_state}` `{characters}` `{events}` `{quests}`

| Variable | Descripción |
|----------|-------------|
| `{characters}` | Personajes activos en el mundo |
| `{quests}` | Misiones actualmente activas |

**Formato de salida:**
```json
{"arc": "descripción", "quests": [{"title": "", "description": "", "objectives": [""]}], "hooks": [""]}
```

**Temperatura:** 0.7 | **Máx. tokens:** 2048 | **Prioridad:** 6

---

### Simulador social (`social-sim`)

**Descripción:** Dinámica social. Simula relaciones e interacciones entre NPCs.

**Variables de plantilla:**
`{characters}` `{relationships}` `{context}`

| Variable | Descripción |
|----------|-------------|
| `{relationships}` | Grafo actual de relaciones entre personajes |
| `{context}` | Contexto social (encuentro, conflicto, alianza, etc.) |

**Temperatura:** 0.6 | **Máx. tokens:** 1024 | **Prioridad:** 4

---

### Gestor de villanos (`villain`)

**Descripción:** Gestión de antagonistas. Planifica acciones de villanos y sus planes.

**Variables de plantilla:**
`{villain}` `{world_state}` `{recent_actions}`

| Variable | Descripción |
|----------|-------------|
| `{villain}` | Perfil del villano (personalidad, objetivos, habilidades) |
| `{recent_actions}` | Acciones recientes del villano en el mundo |

**Temperatura:** 0.8 | **Máx. tokens:** 2048 | **Prioridad:** 6

---

### Investigador (`researcher`)

**Descripción:** Verificación de hechos, validación de realismo e investigación para la construcción del mundo.

**Variables de plantilla:**
`{task}` `{world_context}`

| Variable | Descripción |
|----------|-------------|
| `{task}` | Tarea de investigación (verificación de receta, validación de personaje, enriquecimiento de escena, verificación de hecho) |

**Formato de salida:**
```json
{"verdict": "plausible|questionable|unrealistic", "confidence": 0.0-1.0, "issues": [], "suggestions": [], "enrichedDetails": ""}
```

**Temperatura:** 0.3 | **Máx. tokens:** 2048 | **Prioridad:** 3 (la más baja)

---

## Guía de temperatura

| Valor | Efecto | Usar para |
|-------|--------|-----------|
| 0.1 - 0.3 | Enfocado, determinista | Investigación, verificación de hechos |
| 0.4 - 0.6 | Equilibrado | Cronista, simulación social |
| 0.7 - 0.8 | Creativo | Narrativa, diálogos NPC, planes de villanos |

## Usar @agent en el chat

Envíe un mensaje privado a cualquier agente desde el chat:

```
@narrator describe la atmósfera del bosque antiguo al atardecer
@director sugiere un giro argumental dramático
@researcher ¿es esta arma medieval históricamente precisa?
@chronicler resume lo que pasó en la última hora
```

Las respuestas se marcan con un borde azul a la izquierda y el nombre del agente entre corchetes.

## Prioridad

Los agentes con mayor prioridad se procesan primero cuando hay múltiples solicitudes LLM en cola.

| Agente | Prioridad |
|--------|-----------|
| narrator | 10 (la más alta) |
| npc | 9 |
| director | 8 |
| scene | 7 |
| story-planner | 6 |
| villain | 6 |
| chronicler | 5 |
| social-sim | 4 |
| researcher | 3 (la más baja) |

### Inyección de instrucción de idioma

Las respuestas del LLM coinciden automáticamente con el idioma seleccionado de la interfaz de usuario. La instrucción de idioma se integra en los prompts de los agentes durante la inicialización a través de `seedWorldAgents()`, y también se agrega en tiempo de ejecución por `getLanguageInstruction()`:

| Idioma | Texto inyectado |
|--------|-----------------|
| en | `IMPORTANT: Always respond in English.` |
| ru | `ВАЖНО: Всегда отвечай на русском языке.` |
| de | `WICHTIG: Antworte immer auf Deutsch.` |
| fr | `IMPORTANT: Réponds toujours en français.` |
| es | `IMPORTANTE: Responde siempre en español.` |
| ja | `重要：常に日本語で回答してください。` |
| zh | `重要：请始终用中文回复。` |

En la creación del mundo, `seedWorldAgents()` escribe los 14 agentes con la instrucción de idioma agregada al prompt del sistema. Esto asegura que los nuevos mundos comiencen con un aislamiento de idioma adecuado. La función de ejecución `getLanguageInstruction()` es utilizada por `dialogue-context.ts` para diálogos dinámicos de NPC.

### Puntos de extremidad API para prompts

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/agents` | Listar todos los agentes (acepta `?world=`) |
| `GET` | `/api/agents/:id` | Obtener configuración de un agente (acepta `?world=`) |
| `PUT` | `/api/agents/:id` | Actualizar configuración de un agente (acepta `?world=`) |
| `PUT` | `/api/agents/:id/prompts` | Actualizar prompts (acepta `?world=`) |
| `GET` | `/api/agents/:id/prompts/:lang` | Obtener prompts para un idioma específico |
| `PUT` | `/api/agents/:id/prompts/:lang` | Insertar/actualizar prompts para un idioma específico |

**Parámetros de consulta:**
- `world` — opcional, por defecto toma el mundo activo de la configuración. Todos los puntos de extremidad de agentes soportan `?world=` para operaciones por mundo sin cambiar el mundo activo.

**Ejemplo de respuesta:**
```json
{
  "agentId": "narrator",
  "language": "ru",
  "world": "levant",
  "prompts": {
    "systemPrompt": "...",
    "userTemplate": "...",
    "outputFormat": "..."
  }
}
```
