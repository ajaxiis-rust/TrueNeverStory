# TrueNeverStory v0.15.0 – Plataforma de Juegos Narrativos Interactivos

**TrueNeverStory v0.15.0** es una reimplementación moderna de la plataforma de mundos de fantasía [BRING](https://github.com/Eva-E1/BRING), migrada de Python a un stack híbrido de alto rendimiento:

- **TypeScript (Bun + Hono)** – Servidor web, API, WebSocket, enrutamiento, auth, streaming, lógica de negocio
- **C FFI Kernels (compilados vía Zig, con respaldo TypeScript)** – Núcleos de cómputo para cálculos de probabilidad y operaciones vectoriales (compilados vía Zig, con respaldo TypeScript)

> *"De un solo prompt a un mundo vivo y respirando – donde cada NPC recuerda, cada acción tiene una oportunidad, y la historia nunca se detiene."*

---

## Características

| Característica | Descripción |
|----------------|-------------|
| **Construcción de mundo en capas** | Cada entidad (personaje, lugar, objeto, facción) tiene tres capas: L1 (clasificación), L2 (detalles), L3 (secretos) |
| **Conocimiento en grafo** | Todas las relaciones en un grafo dirigido con búsquedas O(1), recorrido BFS, gestión de ramas |
| **Memoria auto-optimizada** | Memoria acelerada por vectores con pipeline cognitivo (extracción de entidades, detección de contradicciones, señales de dolor) |
| **RAG para todos los agentes** | Soporte completo de embeddings via llama.cpp (BGE-M3) + búsqueda híbrida SQLite (FTS5 + vectores densos + RRF) |
| **Sistema de probabilidades** | Resultados deterministas para combate, persuasión, sigilo, romance con modificadores dinámicos |
| **Sistema de romance** | Gestión completa de relaciones románticas con acciones probabilísticas |
| **Director viviente** | Agente de fondo que desarrolla arcos narrativos, planes de villanos, interacciones NPC |
| **Juego de rol inmersivo** | Narración en tercera persona, diálogos NPC, transiciones de escena – LLM nunca habla por tu personaje |
| **Sistema de misiones** | Generación dinámica de misiones y seguimiento de objetivos |
| **Planificador de historias** | Planificación dinámica con LLM, generación en dos fases, replaneación adaptativa |
| **Agente Investigador** | Verificación de hechos, validación de realismo, precisión histórica para recetas, personajes y escenas |
| **Inteligencia NPC** | Búsqueda en memoria, comportamiento autónomo, relaciones sociales, contexto de diálogo enriquecido |
| **Economía NPC** | Jerarquía feudal (10 rangos), impuestos, sobornos, producción de alimentos, sistema familiar, vicios, 34 arquetipos |
| **Sistema de objetos** | Objetos únicos con mejoras permanentes de estadísticas (1-10%), evaluados por agentes Historiador/Investigador |
| **14 agentes especializados** | Narrador, Director, Escena, NPC, Cronista, Planificador, Sim. social, Villano, Investigador, Historiador, Cartógrafo, Mercader, Generador de misiones, Guardián del conocimiento |
| **WebSocket en tiempo real** | Streaming de juego de rol en vivo y eventos de memoria |
| **SSE Streaming** | Entrega progresiva de narrativa mediante Server-Sent Events |
| **i18n (7 idiomas)** | Localización completa: EN, RU, DE, FR, ES, JA, ZH – interfaz, prompts, nombres de agentes |
| **Almacenamiento SQLite** | Los prompts de agentes y cadenas UI se almacenan en SQLite por mundo + idioma |
| **Auth por contraseña** | Autenticación basada en sesiones con HttpOnly cookies |
| **Interfaz Terminal** | Hermosa interfaz web oscura de estilo terminal |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    Navegador (Terminal UI)               │
│              WebSocket + REST + SSE                      │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────▼─────────────────────────────────┐
│              TypeScript (Bun + Hono)                     │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ HTTP API │ │WebSocket │ │SSE Stream│ │   Auth     │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬──────┘  │
│       └─────────────┼───────────┼─────────────┘         │
│  ┌──────────────────▼───────────▼─────────────────────┐  │
│  │              Capa de Servicios                     │  │
│  │  RoleplayEngine │ ProbabilityEngine │ RomanceEngine│  │
│  │  QuestManager   │ WorldClock        │ Director     │  │
│  │  StoryPlanner   │ VillainManager    │ SocialSim    │  │
│  │  ResearcherAgent│ CrafterAgent      │ Chronicler   │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           Sistema de Memoria (WorldMemory)          │  │
│  │  VectorIndex │ CognitivePipeline │ EntityExtractor │  │
│  │  Scoring     │ Partitions        │ WriteBuffer     │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           Capa de Datos (EntityStore + JSON)        │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │      C FFI Kernels (compilados vía Zig)              │  │
│  │  Núcleos de probabilidad │ Operaciones vectoriales│  │
│  │  .so/.dylib/.dll → dlopen() o respaldo TypeScript │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP (compatible con OpenAI)
┌───────────────────────▼─────────────────────────────────┐
│              API LLM externa (Ollama, OpenAI, etc.)      │
└─────────────────────────────────────────────────────────┘
```

---

## Inicio Rápido

### Prerrequisitos

- [Bun](https://bun.sh) v1.0+ (para desarrollo)
- Una API LLM compatible con OpenAI (OpenAI, Ollama, vLLM, LM Studio, etc.)

Para el binario compilado — no se necesita nada, simplemente ejecute.

### 1. Instalación

```bash
cd TNS
bun install
```

### 2. Configurar LLM

Abra `http://localhost:8000/settings` y configure su proveedor LLM:

- **Ollama** (local): `http://localhost:11434/v1`, modelo: `llama3`
- **OpenAI**: `https://api.openai.com/v1`, modelo: `gpt-4o-mini`
- **vLLM** (local): `http://localhost:8000/v1`
- **LM Studio**: `http://localhost:1234/v1`

O edite `conf/settings.json` directamente.

### 3. Ejecutar

```bash
bun run dev
```

Abra `http://localhost:8000` e inicie sesión con contraseña: **`changeme`**

Cambie la contraseña en Configuración después del primer inicio de sesión.

### Binario (sin dependencias)

```bash
# Descargue de GitHub Releases, luego:
chmod +x tns-server
./tns-server
# Inicio de sesión: http://localhost:8000 — contraseña: changeme
```

---

## Ejemplos de uso

### Ejecutar desde binario (sin dependencias)

Descargue la última versión para su plataforma y ejecute directamente:

```bash
# Linux / macOS
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

No necesita Bun, Node.js u otro runtime. Configure `.env` y ejecute.

### Ejecutar desde código fuente (desarrollo)

```bash
# Modo desarrollo con recarga en caliente
bun run dev

# Modo producción (sin recarga)
bun run start

# Crear bundle (sin binario)
bun run build
```

### Ejecutar con LLM local (Ollama)

```bash
# 1. Iniciar Ollama con un modelo
ollama pull llama3
ollama serve

# 2. Configurar TNS para Ollama
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

# 3. Iniciar el servidor
./tns-server
```

### Ejecutar con API de OpenAI

```bash
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

./tns-server
```

### Ejemplos de llamadas API

```bash
# Autenticación
curl -c cookies.txt -X POST http://localhost:8000/login \
  -d "password=mypassword"

# Iniciar nueva sesión
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# Enviar mensaje y obtener narrativa
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Desenvaino mi espada y me enfrento al dragón"}'

# Respuesta en streaming (SSE)
curl -b cookies.txt -N http://localhost:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Cuéntame sobre este bosque antiguo"}'

# Buscar entidades
curl -b cookies.txt "http://localhost:8000/api/search?q=dragon"

# Obtener detalles de entidad
curl -b cookies.txt http://localhost:8000/api/entity/uid-character-aragorn

# Obtener vecinos del grafo
curl -b cookies.txt "http://localhost:8000/api/neighbors/uid-location-rivendell?depth=2"

# Verificar probabilidad
curl -b cookies.txt http://localhost:8000/api/probability/aragorn/combat

# Listar misiones
curl -b cookies.txt http://localhost:8000/api/quests
```

### WebSocket para juego de rol en tiempo real

```javascript
// Conexión WebSocket
const ws = new WebSocket('ws://localhost:8000/ws/roleplay/session-id');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'message',
    content: 'Entro en la taberna y miro a mi alrededor'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.narrative); // Flujo narrativo en tiempo real
};
```

### Compilar desde código fuente

```bash
# Instalar Mojo (opcional, para kernels de rendimiento)
curl https://get.modular.com | sh
modular install mojo

# Compilar para plataforma actual
./build.sh compile

# Compilar para plataforma específica
./build.sh compile linux-x64
./build.sh compile macos-arm64

# Compilación cruzada para todas las plataformas
./build.sh cross

# Ver COMPILE.md para detalles
```

---

## Endpoints de API

### Autenticación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/login` | Página de inicio de sesión |
| POST | `/login` | Autenticación (formulario: `password=...`) |
| POST | `/logout` | Limpiar sesión |

### Chat

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/chat/setup` | Inicializar sesión de rol |
| POST | `/api/chat/message` | Enviar mensaje, obtener narrativa |
| POST | `/api/chat/stream` | Respuesta SSE streaming |
| GET | `/api/chat/session` | Estado actual de la sesión |
| GET | `/api/chat/history` | Historial de conversaciones |

### Entidades y Grafo

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/entity/:uid` | Detalles de la entidad |
| GET | `/api/neighbors/:uid` | Vecinos con profundidad |
| GET | `/api/path` | Encontrar camino más corto |
| GET | `/api/search` | Buscar por nombre o semánticamente |
| GET | `/api/graph/summary` | Estadísticas del grafo |

### Ramas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/branch/create` | Crear rama |
| POST | `/api/branch/switch` | Cambiar rama activa |
| POST | `/api/branch/merge` | Fusionar en main |
| GET | `/api/branch/list` | Listar todas las ramas |

### Probabilidades

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/probability/:character/:profile` | Probabilidad de éxito |
| POST | `/api/probability/modifier` | Aplicar modificador |
| GET | `/api/probability/modifiers/:entity` | Modificadores activos |

### Romance

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/romance/:c1/:c2` | Estado de la relación |
| POST | `/api/romance/attempt/:action` | Intentar acción romántica |
| GET | `/api/romance/characters/:char` | Listar romances del personaje |

### Misiones

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/quests` | Listar todas las misiones |
| GET | `/api/quest/:id` | Detalles de la misión |

### Sesiones y Mantenimiento

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/sessions` | Historiales de sesiones |
| POST | `/api/maintenance/run` | Ejecutar mantenimiento |
| GET | `/api/maintenance/status` | Estadísticas de mantenimiento |
| POST | `/api/launch` | Nuevo juego |
| POST | `/api/continue` | Continuar juego |
| GET | `/api/health` | Verificación de salud |

### Sistema (procesamiento en segundo plano)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/system/pause` | Pausar bucle del director y cola LLM |
| POST | `/api/system/resume` | Reanudar bucle del director y cola LLM |
| GET | `/api/system/status` | Obtener estado de pausa/ejecución |

### Agentes

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/agents` | Listar configuraciones de agentes |
| GET | `/api/agents/:id` | Configuración de un agente |
| PUT | `/api/agents/:id` | Actualizar configuración |
| PUT | `/api/agents/:id/prompts` | Actualizar prompts |
| POST | `/api/agents/:id/reset` | Restablecer valores predeterminados |
| GET | `/api/agents/providers/options` | Opciones de proveedores/modelos |

### WebSocket

| Endpoint | Descripción |
|----------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Juego de rol en tiempo real |
| `ws://host:8000/ws/memory` | Feed de eventos de memoria |

---

## Estructura del Proyecto

```
TrueNeverStory/
├── src/
│   ├── config/           # Configuración validada con Zod
│   ├── lib/              # Cliente LLM, cola, event bus, historial, I/O atómico
│   ├── memory/           # WorldMemory, índice FAISS, pipeline cognitivo, scoring
│   ├── middleware/        # Auth, CORS, manejo de errores, logger, rate limiter
│   ├── models/           # Entity, chat, probability, romance, quest, story, memory
│   ├── routes/           # 13 módulos de rutas (chat, entities, agents etc.)
│   ├── services/         # 23 servicios (motor de rol, agentes, probabilidades etc.)
│   ├── intelligence/     # Análisis de grafo, duplicados, recomendaciones, generador de escenas
│   ├── i18n/             # Paquetes de idiomas (EN, RU, DE, FR, ES, JA, ZH)
│   ├── store/            # EntityStore con NameIndex O(1)
│   ├── utils/            # Logger, hash, utilidades de tiempo
│   ├── app.ts            # App Hono con cadena de middleware
│   └── index.ts          # Punto de entrada del servidor
├── mojo/
│   ├── kernels/          # Núcleos FFI de probabilidad y vectores
│   └── src/              # 81 archivos fuente Mojo (backend de rendimiento opcional)
├── public/
│   ├── index.html        # Interfaz web estilo terminal
│   ├── agents.html       # Configuración de agentes (i18n)
│   ├── providers.html    # Configuración de proveedores LLM
│   ├── models.html       # Gestión de modelos
│   └── settings.html     # Configuración global
├── worlds/
│   ├── default/          # Active world
│   │   ├── world_frame.json
│   │   ├── entities.json
│   │   ├── agents/       # Per-agent JSON configs
│   │   ├── session_history/
│   │   ├── chapters/
│   │   ├── timeline.jsonl
│   │   └── settings.json
├── local-models/         # GGUF models (downloaded locally)
├── tests/
│   ├── entity-store.test.ts
│   ├── probability-engine.test.ts
│   └── integration/
│       └── server.test.ts
├── .env                  # Configuración (ignorado por git)
├── .env.example          # Plantilla de configuración
├── startgame.sh          # Lanzador de servidor + llama-server (con limpieza PID)
├── package.json
├── tsconfig.json
└── plan.md               # Plan de migración
```

---

## Configuración

Toda la configuración es a través de variables de entorno (archivo `.env`):

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `WORLD_LLM_BASE_URL` | – | Endpoint LLM compatible con OpenAI |
| `WORLD_LLM_API_KEY` | – | Clave API |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Nombre del modelo |
| `WORLD_LLM_TIMEOUT` | `120` | Tiempo de espera de solicitud (segundos) |
| `WORLD_LLM_MAX_TOKENS` | `4096` | Máx. tokens por respuesta |
| `WORLD_LLM_TEMPERATURE` | `0.7` | Temperaturade muestreo |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | Máx. solicitudes LLM simultáneas |
| `WORLD_DB_PATH` | `./worlds/default` | Directorio de base de datos |
| `LOCAL_MODELS_PATH` | `./local-models` | Directorio de modelos GGUF locales |
| `WORLD_SERVER_HOST` | `0.0.0.0` | Dirección de escucha |
| `WORLD_SERVER_PORT` | `8000` | Puerto de escucha |
| `AUTH_PASSWORD` | – | Contraseña de login (vacío = sin auth) |
| `MAX_SERVE_URL` | `http://localhost:8000` | Endpoint Mojo MAX Serve |

---

## Desarrollo

```bash
# Desarrollo con hot reload
bun run dev

# Verificación de tipos
npx tsc --noEmit

# Ejecutar todas las pruebas
bun test

# Ejecutar pruebas específicas
bun test tests/entity-store.test.ts
bun test tests/probability-engine.test.ts
bun test tests/integration/server.test.ts

# Compilar para producción
bun run build
```

---

## Cambios Recientes

### C FFI Kernels y compilación cruzada (v0.14.1)

Portado de kernels de cómputo Mojo a C puro con compilación cruzada Zig para 10 plataformas:

| Característica | Descripción |
|----------------|-------------|
| **C FFI Kernels** | 5 kernels de cómputo portados de Mojo a C puro (probability, vector, vector_full, batch_ops, graph_ops) |
| **Compilación cruzada Zig** | Script de compilación único para Linux, macOS, Windows, ARM, RISC-V |
| **10 objetivos de plataforma** | aarch64/x86_64 Linux (glibc+musl), macOS, Windows, ARMv7, RISC-V |
| **Paquetes distribuibles** | Cada archivo de release contiene binario + FFI .so/.dll + public/ + .env |
| **Pausa/Reanudación** | Bucle del director y cola LLM se pausan cuando el usuario abandona el chat |

**Archivos nuevos:**
- `mojo/kernels/c/probability_ffi.c` — Kernels de probabilidad (chance de éxito, tirada, batch)
- `mojo/kernels/c/vector_ffi.c` — Operaciones vectoriales 4-dim (coseno, L2, producto escalar)
- `mojo/kernels/c/vector_full.c` — Operaciones vectoriales de dimensión completa (768-dim)
- `mojo/kernels/c/batch_ops.c` — Operaciones batch NPC (decadencia, vices, impuestos, lealtad)
- `mojo/kernels/c/graph_ops.c` — Recorrido de grafo, fusión RRF, reputación
- `mojo/kernels/build.sh` — Compilación cruzada vía Zig
- `src/routes/system.ts` — Endpoints de API pausa/reanudación

**Archivos modificados:**
- `src/services/director-loop.ts` — Métodos `pause()`/`resume()` añadidos
- `src/lib/llm-queue.ts` — Métodos `pause()`/`resume()` añadidos
- `src/services/narrative-service.ts` — Delegación `pause()`/`resume()` añadida
- `public/index.html` — Auto-pausa al abandonar página, auto-reanudación al cargar

### Expansión del kernel Mojo (v0.12.0)

Mayor rendimiento de los kernels de cómputo Mojo para búsqueda vectorial, operaciones batch NPC y recorrido de grafos:

| Característica | Descripción |
|----------------|-------------|
| **Kernel de probabilidades** | Chance de éxito, resultado de tirada, modificador + probabilidades batch vía Mojo FFI |
| **Kernel vectorial** | Similitud coseno 4-dim, distancia L2, producto escalar vía Mojo FFI |
| **Vectores de dimensión completa** | Embeddings BGE-M3 de 768-dim — similitud coseno batch vía Mojo FFI |
| **Operaciones batch NPC** | Decadencia por edad, vices, impuestos, suma de riqueza, verificaciones de lealtad vía Mojo FFI |
| **Operaciones de grafo** | Fusión RRF, fuerza de relación, cálculo de reputación vía Mojo FFI |
| **Aceleración SQLite** | searchDense/searchMemoriesDense usan similitud coseno por lotes |

**Archivos nuevos:**
- `mojo/kernels/vector_full.mojo` — Operaciones vectoriales de dimensión completa (coseno, L2, producto escalar, batch)
- `mojo/kernels/batch_ops.mojo` — Operaciones batch de estadísticas NPC (decadencia, vices, impuestos, lealtad)
- `mojo/kernels/graph_ops.mojo` — Recorrido de grafo y fusión RRF
- `src/lib/mojo-ffi.test.ts` — 19 pruebas cubriendo todos los bindings FFI

**Archivos modificados:**
- `mojo/kernels/probability_ffi.mojo` — Añadidos batch_success_chance y batch_roll
- `src/lib/mojo-ffi.ts` — 5 bindings de kernel con fallbacks TypeScript
- `src/lib/vector-ops.ts` — Usa cosineSimilarity acelerado por Mojo
- `src/lib/sqlite-store.ts` — searchDense/searchMemoriesDense usan batchCosineSimilarity
- `build.sh` — Compila los 5 kernels (probability, vector_4dim, vector_full, batch_ops, graph_ops)

**Performance (ms per 1000 iterations):**

| Operation | Python | NumPy | TS | TS+SQLite | Mojo | Mojo vs TS |
|-----------|--------|-------|-----|-----------|------|------------|
| cosine (768-dim) | 3.6 | 4.8 | 5.2 | - | **1.5** | **3.5x** |
| batch_cosine (100×768) | 35.6 | 6.1 | 27.4 | 105.4 | **14.0** | **2.0x** |
| age_decay (100 NPCs) | 75.6 | 21.5 | 1.8 | - | **1.6** | 1.1x |
| rrf_fusion (100×3) | 706.1 | 10.4 | 2.5 | - | **2.2** | 1.1x |
| reputation (500 rels) | 41.9 | - | 5.1 | - | **3.1** | **1.6x** |

Mojo kernels use `abi("c")` + `UnsafePointer` FFI with TypeScript fallbacks. All functions have zero-overhead TS fallbacks when `.so` is unavailable.

### Sistemas sociales y políticos (v0.11.0)

| Característica | Descripción |
|----------------|-------------|
| **Jerarquía feudal** | Juramento de lealtad, señores/vasallos, cadena de mando, lealtad, rebelión |
| **Sistema de facciones** | 6 tipos (militar/económico/religioso/criminal/noble/neutro), líderes, influencia |
| **Alianzas políticas** | 5 tipos (militar/comercio/defensa/no agresión/vasallo), traición, reputación |
| **Diálogos NPC** | Gestión de sesiones, 11 categorías de temas, saludos contextuales |
| **Sistema de misiones** | 5 tipos, 7 tipos de objetivos, recompensas, prerrequisitos, cadenas |
| **Planificador de historias** | Planificación dinámica con LLM, generación en dos fases, replaneación adaptativa |
| **Sistema de inventario** | Rareza (5 niveles), ranuras de equipo, peso/capacidad, comercio |

**Archivos nuevos:** `social-graph.ts`, `dialogue-manager.ts`, `quest-system.ts`, `inventory-manager.ts`

### Sistema de Economía NPC (v0.11.0)

Simulación feudal completa con NPCs vivos:

| Característica | Descripción |
|----------------|-------------|
| **Jerarquía feudal** | 10 rangos: Esclavo → Ciudadano → Baronet → Barón → Vizconde → Conde → Marqués → Duque → Rey → Emperador |
| **Estadísticas NPC** | 6 estadísticas: riqueza, poder, popularidad, salud, experiencia, intriga |
| **Sistema de impuestos** | Impuestos jerárquicos: 0% (Emperador) → 90% (Ciudadano), reducido por poder/popularidad |
| **Mecánica de sobornos** | Sobornos basados en riesgo: 10% base + monto/testigos, umbral de traición |
| **Economía alimentaria** | Los esclavos producen 300-1000 comida/mes, todos consumen por rango |
| **Sistema familiar** | 50% de ingresos a la esposa, 10% a los hijos, herencia al morir |
| **Vicios y degradación** | 8 vicios que afectan estadísticas, decadencia de salud basada en edad |
| **34 arquetipos** | 22 predeterminados + 12 únicos, selección aleatoria ponderada, grupos de contexto |
| **Pérdida de poder** | Rebelión → muerte/esclavitud, Guerra → rescate/esclavitud, Bancarrota → esclavitud |
| **Mejoras de objetos** | Objetos únicos dan mejoras permanentes de estadísticas (1-10%), evaluados por Historiador/Investigador |

### Almacenamiento SQLite para prompts y traducciones (v0.11.0)
Los prompts de agentes y cadenas UI ahora se almacenan en SQLite por mundo + idioma:

- **Tabla `agent_prompts`** — almacena `systemPrompt`, `userTemplate`, `outputFormat` por mundo + idioma
- **Tabla `ui_translations`** — almacena cadenas UI por idioma + página (agents, settings, agent_names, agent_descs)
- **Estrategia dual-write** — las escrituras van tanto a SQLite como a archivos JSON para compatibilidad hacia atrás
- **Prompts por idioma** — cada mundo puede tener su propio idioma, determinando qué prompts se cargan
- **Relleno automático** — en el primer inicio, todos los 7 idiomas se rellenan en `ui_translations`

**Jerarquía de almacenamiento:**
1. **SQLite** (`tns.db`) — almacenamiento principal, por mundo + idioma
2. **Archivos JSON** (`worlds/{world}/agents/{agentId}.json`) — fallback durante la migración
3. **Valores por defecto** (`DEFAULT_PROMPTS` en `src/services/agent-config.ts`)

### Puntos de terminación API i18n
Nueva API REST para gestión de traducciones:

| Método | Punto de terminación | Descripción |
|--------|----------------------|-------------|
| GET | `/api/i18n/translations/:lang/:page` | Obtener traducciones para idioma + página |
| GET | `/api/i18n/translations/:lang` | Obtener todas las traducciones para un idioma |
| PUT | `/api/i18n/translations` | Actualizar traducciones por lotes |
| DELETE | `/api/i18n/translations/:lang/:page/:key` | Eliminar clave de traducción |

**Ejemplo de solicitud (PUT):**
```json
{
  "language": "es",
  "page": "agents",
  "entries": {
    "title": "Configuración de agentes",
    "savePrompts": "Guardar prompts"
  }
}
```

### Prompts de agentes por idioma
Los prompts de agentes ahora admiten almacenamiento por mundo e idioma:

```sql
CREATE TABLE agent_prompts (
  world TEXT NOT NULL DEFAULT 'default',
  agent_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  system_prompt TEXT NOT NULL DEFAULT '',
  user_template TEXT NOT NULL DEFAULT '',
  output_format TEXT NOT NULL DEFAULT '',
  UNIQUE(world, agent_id, language)
);
```

**Puntos de terminación API para prompts por idioma:**
- `GET /api/agents/:id/prompts/:lang` — obtener prompts para un idioma específico
- `PUT /api/agents/:id/prompts/:lang` — actualizar prompts para un idioma específico

### Integración i18n en frontend
Las páginas frontend ahora cargan traducciones desde SQLite a través de la API:

```javascript
// agents.html
async function loadTranslations(langCode) {
  const res = await fetch(`/api/i18n/translations/${langCode}/agents`);
  const data = await res.json();
  remoteTranslations = data.translations || {};
}

function t(key) {
  if (remoteTranslations[key] !== undefined) return remoteTranslations[key];
  return I18N[lang]?.[key] ?? I18N.en[key] ?? key;
}
```

### Nuevos agentes especializados (v0.11.0)
Cinco nuevos agentes para enriquecimiento del mundo e interacción con jugadores:

- **Historiador** — recuerda y narra eventos históricos, lore y cronología
- **Cartógrafo** — proporciona información sobre ubicaciones, distancias, caminos y geografía
- **Mercader** — maneja trading, precios y gestión de inventario de NPC
- **Generador de misiones** — genera misiones contextuales basadas en el estado del mundo con objetivos y recompensas
- **Guardián del conocimiento** — mantiene hechos del mundo, reglas de magia, información de razas y canon establecido

Cada agente tiene sus propios prompts de sistema, plantillas de usuario y formatos de salida configurados en `src/services/agent-config.ts`.

### Sistema RAG para todos los agentes (v0.11.0)
Soporte completo de embeddings con memoria a largo plazo para cada agente:

- **llama.cpp Embedding Server** — modelo BGE-M3 dedicado en puerto 5002 para generación de vectores
- **Búsqueda híbrida SQLite** — búsqueda por palabras clave FTS5 + búsqueda vectorial densa + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — aislamiento de memoria por agente y sesión mediante columna `role`
- **Memoria por mundo** — la memoria está aislada por mundo para prevenir alucinaciones entre mundos
- **Operaciones Mojo Graph** — operaciones vectoriales via Mojo FFI para rendimiento (similitud coseno, distancia L2)

**Arquitectura:**
```
Solicitud del agente → AgentMemoryStore → SQLite (búsqueda híbrida)
                                              ↓
                                      ┌───────┴───────┐
                                      │ FTS5 (LIKE)   │ Vectores densos (BGE-M3)
                                      │ Búsqueda por  │ Similitud coseno
                                      │ palabras clave│
                                      └───────┬───────┘
                                              ↓
                                      Reciprocal Rank Fusion (RRF)
                                              ↓
                                      Contexto para prompt LLM
```

**Archivos clave:**
- `src/lib/agent-memory-store.ts` — AgentMemoryStore con integración de embeddings
- `src/lib/sqlite-store.ts` — SQLiteStore con FTS5 + búsqueda vectorial + RRF
- `src/lib/vector-ops.ts` — Operaciones vectoriales (coseno, L2, producto escalar)

### Reforma del sistema NPC (v0.11.0)
Cuatro nuevos servicios para un comportamiento NPC más inteligente:

- **MemoryEngine** — búsqueda semántica, filtrado por emoción/ubicación, clustering de recuerdos sobre memorias episódicas de NPC
- **BehaviorEngine** — acciones autónomas, evaluación de objetivos, rutinas diarias, adaptación de estado de ánimo, toma de decisiones
- **SocialGraph** — seguimiento de relaciones, puntuaciones de reputación, amigos mutuos, membresía de facciones y conflictos
- **DialogueContext** — prompts NPC enriquecidos combinando relaciones, memoria, estado de ánimo, ubicación, facción, objetivos e inventario

**Arquitectura:** Dos pistas paralelas — Pista 1 (Memoria + Comportamiento) construye la base, Pista 2 (Conexiones sociales + Diálogo) agrega funciones de usuario.

**Integración:** `NPCAgent.initialize(runtime, statePath)` crea los cuatro componentes. Fallback a template/PromptBuilder cuando DialogueContext no está inicializado.

### Agente Investigador (v0.11.0)
Nuevo agente para verificación de hechos y validación de realismo:
- **`verifyRecipe()`** – valida recetas del crafter por plausibilidad
- **`researchTopic()`** – investigación histórica/cultural para construcción del mundo
- **`validateCharacter()`** – verifica ropa, comida, vida cotidiana de personajes
- **`enrichScene()`** – añade detalles sensoriales realistas a escenas
- **`factCheck()`** – verificación general de hechos

### Sistema i18n
Localización completa para 7 idiomas (EN, RU, DE, FR, ES, JA, ZH):
- Todos los prompts de agentes y cadenas de interfaz
- Nombres y descripciones de agentes
- Páginas de configuración (agentes, proveedores, modelos)
- Mensajes de inicio/parada del servidor

**Estructura** — cada idioma es un archivo separado en `src/i18n/`:

```
src/i18n/
├── types.ts    # Interfaz LanguagePack + tipo Language
├── en.ts       # Inglés (paquete base — todas las claves definidas aquí)
├── ru.ts       # Ruso (hereda EN, redefine traducciones)
├── de.ts       # Alemán
├── fr.ts       # Francés
├── es.ts       # Español
├── ja.ts       # Japonés
├── zh.ts       # Chino
└── index.ts    # Export barrel, registro, getLanguagePack()
```

**Agregar un nuevo idioma** (ej. coreano):

1. Crear `src/i18n/ko.ts`:
```ts
import { EN } from "./en";
import type { LanguagePack } from "./types";

export const KO: LanguagePack = {
  ...EN,
  code: "ko",
  name: "Korean",
  nativeName: "한국어",
  systemPrompt: "한국어로만 답변하세요.",
  uiSettings: "설정",
  // ... redefinir otras claves
};
```

2. Registrar en `src/i18n/index.ts`:
```ts
import { KO } from "./ko";
// agregar al tipo Language: "ko"
// agregar a PACKS: ko: KO
// agregar al array LANGUAGES
```

3. Agregar `"ko"` a la unión `Language` en `src/i18n/types.ts`.

### Mejoras del servidor
- **Seguimiento de archivo PID** (`.server.pid`) – previene procesos huérfanos
- **Limpieza al inicio** – mata automáticamente procesos antiguos
- **Apagado graceful** – timeout SIGTERM de 5 segundos, luego fallback SIGKILL

---

## Migración desde Python

Este proyecto es un port de TypeScript + Mojo de [BRING](https://github.com/Eva-E1/BRING) — una plataforma Python de mundos de fantasía con IA. Cambios clave:

| Componente | Python | TypeScript |
|------------|--------|------------|
| Framework web | FastAPI | Hono (Bun) |
| Runtime | Python asyncio | Bun native async |
| Validación | Pydantic | Zod |
| Logging | Python logging | Logger ligero (reemplazo de Pino) |
| Grafo | NetworkX | Mapa de adyacencia personalizado |
| Búsqueda vectorial | FAISS (Python) | Mojo FFI + fallback coseno local |
| WebSocket | FastAPI WebSocket | Bun native WebSocket |
| Auth | Ninguna | Sesiones basadas en cookies |
| Streaming | SSE (starlette) | ReadableStream + SSE |

---

## Aviso

Este proyecto fue desarrollado utilizando **vibe coding** — un enfoque de desarrollo asistido por IA impulsado por [MiMo Code](https://github.com/XiaomiMiMo/MiMo). La base de código fue generada mediante la colaboración humano-IA, lo que significa:

- El código es **funcional y probado** — todas las funciones funcionan como se describe
- Algunas áreas pueden contener **patrones subóptimos** o beneficiarse de refactoring
- Puede haber **pequeñas inconsistencias** en el estilo de código entre diferentes módulos
- La arquitectura y la lógica son **revisadas y validadas por humanos**

Si encuentra áreas de mejora, las contribuciones son bienvenidas.

---

## Licencia

Apache 2.0
