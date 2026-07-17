# TrueNeverStory v0.27.0

### Escribe tu libro solo jugando.

TrueNeverStory es un motor de narrativa interactiva impulsado por IA con **arquitectura State-First**. Cada NPC recuerda, cada accion tiene un resultado determinista, y la historia nunca se detiene. Juega un personaje, explora un mundo vivo, y observa como tus decisiones moldean la narrativa — o deja que el mundo evolucione solo.

Construido en TypeScript (Bun + Hono) con kernels de computo C FFI para operaciones criticas.

**[English](README.md) | [Русский](README.ru.md) | [Deutsch](README.de.md) | [Francais](README.fr.md) | [日本語](README.ja.md) | [中文](README.zh.md)**

---

## Novedades en v0.27.0

### Optimizacion de la BD Biblica
- **Busqueda FTS5** — reemplazo de `LIKE '%query%'` por FTS5 `MATCH` para consultas de texto completo O(1) (con fallback a LIKE)
- **Recorrido por lotes del grafo** — `getRelatedVerses()` ahora usa consultas por lotes `IN (...)` en lugar de N consultas individuales (N+1 a 1)
- **Indices de versiculos** — se agrego `idx_verses_book_chapter` para acelerar consultas filtradas
- **Sistema de personajes** — nuevo `CharacterDB` con 3 tablas: `bible_characters`, `bible_character_edges`, `bible_character_mentions`
- **Diccionario de nombres** — 40+ personajes biblicos con variaciones multilingues (EN/RU/HE/EL)
- **Herramientas MCP para personajes** — `searchCharacters`, `getCharacter`, `getCharacterEdges`, `getVerseCharacters`
- **Limpieza de git** — eliminados 177MB de fuentes raw + 59MB de BD compilada del seguimiento
- **Scripts de compilacion** — `download-sources.sh` + `bootstrap-bible-db.ts` para configuracion del cliente

## Novedades en v0.27.0

### Pipeline State-First
El motor ahora procesa acciones **de forma determinista antes de generar texto**:
1. **Intent Parser** — Intents estructurados validados por Zod reemplazan el enrutamiento por regex
2. **Motor de simulacion** — Mojo FFI calcula resultados antes de la generacion de prosa
3. **State Mutator** — EntityStore se actualiza inmediatamente despues de la logica
4. **Context Builder** — Contexto de juego compartido para todos los agentes
5. **Generacion de prosa** — LLM genera texto restringido por resultados de simulacion

### Integracion MCP (Literatura-como-Codigo)
- **Biblia como stdlib** — Patrones biblicos como arquetipos narrativos (SQLite + MCP)
- **Gutenberg como CSS de estilo** — Patrones estilisticos delexificados para renderizado de prosa
- **Wikipedia como validador** — Verificacion historica via conocimiento externo

### Los Seis Grandes Agentes
14 agentes consolidados en 6 roles especializados:

| Agente | Rol | Descripcion |
|--------|-----|-------------|
| **Dramaturgo** | El Arquitecto | Selecciona patrones narrativos de arquetipos biblicos |
| **Validador** | El Verificador | Verifica hechos via Wikipedia MCP |
| **Estilista** | El Narrador | Renderiza prosa usando patrones de estilo Gutenberg |
| **Actor** | Conjunto NPC | Maneja dialogos NPC con motivaciones ocultas L3 |
| **Censor** | Linter | Elimina cliches de IA y aplica consistencia de estilo |
| **Cronista** | Memoria del mundo | Actualiza cronologia y estado del mundo |

### System Heartbeat
Indicadores de progreso en tiempo real en la interfaz de chat:
- "Entendiendo tu entrada..."
- "Lanzando dados..."
- "Resultado: Exito (73%)"
- "Tejiendo narrativa..."
- "Completado"

### Interlingua (ingles como idioma interno)
Todas las operaciones agente-a-agente y agente-a-MCP usan ingles para eficiencia de tokens y precision. La traduccion ocurre en la frontera de salida.

---

## Caracteristicas

| Caracteristica | Descripcion |
|----------------|-------------|
| **Pipeline State-First** | Simulacion determinista -> mutacion de estado -> generacion de prosa restringida |
| **6 agentes IA** | Dramaturgo, Validador, Estilista, Actor, Censor, Cronista |
| **Integracion MCP** | Patrones biblicos, estilos Gutenberg, validacion Wikipedia |
| **Mundo vivo** | Personajes, lugares, objetos, facciones — todo conectado en un grafo de conocimiento O(1) |
| **Memoria y RAG** | Busqueda vectorial (BGE-M3 + SQLite hibrido FTS5/denso/RRF) |
| **Sistema de probabilidad** | Resultados deterministas para combate, persuasion, sigilo, romance |
| **Romance y social** | Gestion de relaciones, facciones, alianzas, jerarquia feudal, dialogos NPC |
| **Sistema de quests** | Generacion dinamica, objetivos, recompensas, cadenas, limites de tiempo |
| **Inventario y comercio** | Objetos con rareza, estadisticas, equipamiento, oro, comercio con NPC |
| **Economia NPC** | Jerarquia feudal (10 rangos), impuestos, produccion de alimentos, sistema familiar, 34 arquetipos |
| **Motor de reglas** | 14 sistemas sociales/economicos predefinidos (feudalismo, democracia, anarquia, etc.) con matriz de sinergia |
| **Multi-mundos** | Ejecucion aislada de mundos con monitoreo de recursos (memoria, CPU, tokens) |
| **Inter-mundos** | Comunicacion de eventos entre mundos con portales y memoria compartida |
| **Sistema de plugins** | Arquitectura extensible con gestor de plugins, hooks de ciclo de vida y API |
| **Feature flags** | Pruebas A/B, despliegue gradual, orientacion por porcentaje |
| **Versionado API** | Endpoints v1/v2 con encabezados de deprecacion |
| **Streaming en tiempo real** | WebSocket + SSE para entrega de narrativa con progreso heartbeat |
| **i18n (7 idiomas)** | EN, RU, DE, FR, ES, JA, ZH — UI, prompts, nombres de agentes |
| **Auth por contrasena** | Sesiones con HttpOnly cookies, proteccion CSRF, sesiones SQLite |
| **Almacenamiento SQLite** | Entidades, embeddings, memoria, prompts, traducciones |
| **Circuit Breaker** | Failover automatico de proveedores LLM con cadena de respaldo |
| **Registro estructurado** | IDs de trazado, IDs de correlacion, metricas para depuracion multi-agente |

---

## Plataformas soportadas

| Plataforma | Estado | Notas |
|------------|:------:|-------|
| Linux x86_64 | ✅ | Soporte completo, kernels FFI |
| Linux ARM64 | ✅ | Soporte completo, kernels FFI |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

El servidor detecta kernels FFI automaticamente — fallback a TypeScript puro si no estan disponibles.

---

## Inicio rapido

**No necesitas Bun, Node.js ni otro runtime.** Solo descarga y ejecuta.

### 1. Descargar

Ultima version en [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Plataforma | Archivo |
|------------|---------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Ejecutar

El launcher detecta automaticamente tu proveedor LLM (Ollama, LM Studio, OpenAI, llama.cpp), configura `.env` e inicia el servidor.

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x startgame.sh
./startgame.sh

# Windows (PowerShell)
# Descomprimir tns-windows-x64.zip, luego:
.\startgame.ps1
```

**Opciones de inicio:**
```bash
./startgame.sh --local    # CORS=localhost solo (seguro para desarrollo)
./startgame.sh --remote   # CORS=* (por defecto, permite acceso externo)
```

**Desde codigo fuente (requiere Bun):**
```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
./startgame.sh            # Linux/macOS
.\startgame.ps1           # Windows PowerShell
```

### 3. Abrir

**http://localhost:8000** — contrasena: **`changeme`**

Cambia la contrasena despues del primer inicio de sesion.

---

## Configurar LLM

Abre **Configuracion** o edita `.env`:

### Ollama (local, gratis)

```bash
ollama pull llama3
ollama serve
```

```
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
```

### OpenAI

```
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
```

### LM Studio

```
WORLD_LLM_BASE_URL=http://localhost:1234/v1
WORLD_LLM_API_KEY=lm-studio
WORLD_LLM_MODEL=your-model
```

Tambien funciona con vLLM, Anthropic, Google y cualquier API compatible con OpenAI.

---

## Estructura del proyecto

```
TrueNeverStory/
├── src/
│   ├── config/           # Configuracion validada por Zod
│   ├── lib/              # Cliente LLM, SQLite, operaciones vectoriales, session store, circuit breaker, feature flags
│   ├── memory/           # WorldMemory, pipeline cognitivo, extraccion de entidades
│   ├── middleware/        # Auth, rate limiter, cabeceras de seguridad, CORS, logger
│   ├── models/           # Entity, chat, probability, romance, quest, item, intent, simulation, heartbeat
│   ├── mcp/              # Servidor MCP, parseadores Bible/Gutenberg, herramientas Wikipedia
│   ├── plugins/          # Interfaz y gestor de plugins
│   ├── routes/           # Rutas API (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # Motor de reglas (14 reglas, matriz sinergia, dependencias tech)
│   ├── services/         # 60+ servicios (motor de juego, agentes, economia, aislamiento mundos, bus inter-mundos)
│   │   ├── agents/       # Nuevos agentes v0.27.0 (Dramaturgo, Validador, Estilista, Actor, Censor, Cronista)
│   │   └── ...
│   ├── intelligence/     # Analisis grafo, deteccion duplicados, sistema de recomendacion
│   ├── i18n/             # Paquetes de idiomas (7 idiomas)
│   ├── store/            # EntityStore con NameIndex O(1), WorldStore
│   └── utils/            # Logger, hash, sanitizer, template resolver
├── mojo/kernels/         # Kernels C FFI (compilados via Zig)
├── public/               # Interfaz web (estilo terminal con progreso heartbeat)
├── worlds/               # Datos mundos (SQLite, entidades, sesiones)
├── conf/                 # Configuracion
└── tests/                # Suite de pruebas
```

---

## Arquitectura: Pipeline State-First

```
Entrada del jugador
  │
  ▼
Intent Parser (validacion Zod)
  │
  ▼
Motor de simulacion (Mojo FFI)
  │ resultado, probabilidad, cambios de estado
  ▼
State Mutator (EntityStore L1-L3)
  │
  ▼
Context Builder (estado de juego compartido)
  │
  ▼
Dramaturgo (seleccion de patrones biblicos via MCP)
  │
  ▼
Estilista (renderizado de estilo Gutenberg via MCP)
  │
  ▼
Censor (eliminacion de cliches de IA)
  │
  ▼
Servicio de traduccion (ingles -> idioma del usuario)
  │
  ▼
Respuesta al usuario
```

---

## API

### Autenticacion

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/login` | Pagina de inicio de sesion |
| POST | `/login` | Autenticacion (`password=...`) |
| POST | `/logout` | Cerrar sesion |

### Chat y juego de rol

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/chat/setup` | Inicializar sesion (personaje, lugar, rol) |
| POST | `/api/chat/message` | Enviar mensaje, obtener narrativa |
| POST | `/api/chat/stream` | Streaming SSE con heartbeat |
| GET | `/api/chat/session` | Estado de sesion |
| GET | `/api/chat/history` | Historial |

### Entidades y grafo

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/entity/:uid` | Detalles entidad |
| GET | `/api/neighbors/:uid` | Vecinos con recorrido en profundidad |
| GET | `/api/path?source=&target=` | Camino mas corto entre entidades |
| GET | `/api/search?q=` | Busqueda por nombre o semantica |
| GET | `/api/graph/summary` | Estadisticas grafo |

### Agentes e i18n

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/agents` | Configuraciones agentes |
| PUT | `/api/agents/:id` | Actualizar agente |
| PUT | `/api/agents/:id/prompts/:lang` | Prompts por idioma |
| GET | `/api/i18n/translations/:lang/:page` | Traducciones |
| PUT | `/api/i18n/translations` | Upsert traducciones |

### Motor de reglas

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/rules` | Reglas disponibles |
| GET | `/api/rules/:id` | Detalles regla |
| POST | `/api/rules/validate` | Validar JSON regla |

### Inter-mundos

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/cross-world/status` | Estado inter-mundos |
| POST | `/api/cross-world/enable` | Activar |
| POST | `/api/cross-world/disable` | Desactivar |
| GET | `/api/cross-world/portals` | Listar portales |
| POST | `/api/cross-world/portals` | Crear portal |
| DELETE | `/api/cross-world/portals/:id` | Eliminar portal |
| GET | `/api/cross-world/events` | Registro eventos |

### Plugins

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/plugins` | Plugins registrados |
| GET | `/api/plugins/:id` | Detalles plugin |
| GET | `/api/plugins/:id/capabilities` | Capacidades plugin |

### Feature Flags

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/feature-flags` | Feature flags |
| PUT | `/api/feature-flags/:id` | Actualizar flag |

### Sistema

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/system/pause` | Pausar procesamiento en segundo plano |
| POST | `/api/system/resume` | Reanudar procesamiento en segundo plano |
| GET | `/api/health` | Verificacion de salud |

### WebSocket

| Endpoint | Descripcion |
|----------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Streaming juego de rol tiempo real con heartbeat |

---

## Ejemplos

### API

```bash
# Iniciar sesion
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# Inicializar sesion
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# Enviar mensaje
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Desenvaino mi espada y me enfrento al dragon"}'

# Buscar entidades
curl -b cookies.txt "http://localhost:8000/api/search?q=dragon"

# Reglas disponibles
curl -b cookies.txt "http://localhost:8000/api/rules"

# Crear portal inter-mundos
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

### Streaming SSE con Heartbeat

```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: 'Exploro las ruinas antiguas' }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));
    
    if (event.type === 'heartbeat') {
      console.log(`Progreso: ${event.message} (${event.progress * 100}%)`);
    } else if (event.type === 'chunk') {
      process.stdout.write(event.content);
    }
  }
}
```

---

## Para desarrolladores

Documentacion completa: [DEV.README.es.md](docs/DEV.README.es.md)

### Prerrequisitos

- [Bun](https://bun.sh) v1.0+

### Instalacion

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

Abrir http://localhost:8000

### Comandos

| Comando | Descripcion |
|---------|-------------|
| `bun run dev` | Desarrollo con hot reload |
| `bun run start` | Modo produccion |
| `bun run lint` | Verificacion de tipos |
| `bun test` | Pruebas |
| `bun run build` | Build |

---

## Compilacion de releases binarios

Cross-compilacion via Zig para todas las plataformas:

```bash
cd mojo/kernels
./build.sh native           # Plataforma actual
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # Todos los objetivos
```

Compilar binario del servidor:

```bash
bun build --compile --outfile tns-server src/index.ts
```

Ver [COMPILE.md](docs/COMPILE.md). GitHub Actions construye todas las plataformas automaticamente en push de tag.

---

## Ultimos cambios

### v0.27.0 — Optimizacion de la BD Biblica

**Rendimiento:**
- Busqueda FTS5 con fallback a LIKE — O(n) a O(1) consultas de texto completo
- Recorrido por lotes del grafo — N+1 a 1 consultas SQL para versiculos relacionados
- Indices de versiculos + metodo VACUUM para compactacion de BD

**Funcionalidades:**
- Sistema de personajes (CharacterDB con 3 tablas SQLite)
- Diccionario de nombres biblicos (40+ personajes, variaciones EN/RU/HE/EL)
- Herramientas MCP: busqueda, obtencion, conexiones, menciones, personajes de versiculos
- Soporte gzip para archivos fuente de la Biblia
- Scripts de descarga y bootstrap para configuracion del cliente

**Mantenimiento:**
- Eliminados 177MB de fuentes + 59MB de BD compilada de git
- Agregado .gitignore para fuentes y BD compilada

### v0.27.0 — Literary Compiler y Modelos economicos

**Literary Compiler (Fases 0-6):**
- 4 pases de analisis sin conexion: Dramaturgico, Estilistico, Emocional, Metadatos
- Esquema SQL con FTS5 para busqueda de plantillas de misiones
- Linter para validacion, deduplicacion y deteccion de cliches
- Prompt anti-moralizacion para el agente Estilista

**Modelos economicos:**
- JubileeManager — reinicio de deudas cada 50 anos, devolucion de tierras, aumento de lealtad
- FactionTaxDilemma — conflictos fiscales auto-generados entre facciones con decision del jugador
- FactionLaborRules — salarios fijos/proportionales por faccion, deteccion de conflictos de lealtad
- EconomicCycles — modelo de Jose con fases de abundancia/transition/carestia

**Integracion economica:**
- Fachada EconomicService para los 4 modelos economicos
- Integracion DirectorLoop: transiciones de ciclo, eventos de jubileo, generacion de dilemas
- Integracion NPC-Economy con calculo de salarios segun reglas de trabajo
- 7 nuevas herramientas MCP: get_economic_phase, get_price_modifier, calculate_price, get_wage, generate_dilemma, check_jubilee, get_jubilee_info

**Correcciones:**
- Eliminada dependencia `better-sqlite3` no utilizada (el proyecto usa `bun:sqlite`)
- Nombres de facciones hardcodeados en opciones de dilema corregidos — usa nombres reales
- Lista de facciones hardcodeada en DirectorLoop corregida — lee desde config del mundo
- Aproximacion de ano corregida — usa `getFullYear()` en vez de calculo manual

### v0.27.0 — Arquitectura State-First

**Refactorizacion del motor principal:**
- Intent Parser con esquemas Zod (6 tipos de intent: movimiento, dialogo, accion, comando, observacion, meta)
- Motor de simulacion con resultados deterministas Mojo FFI
- State Mutator para actualizaciones inmediatas de EntityStore
- Context Builder para estado de juego compartido
- Refactorizacion de RoleplayEngine como orquestador ligero

**Integracion MCP:**
- Servidor MCP TNS con herramientas Bible, Gutenberg y Wikipedia
- Parseador Bible para bases de datos SQLite externas con busqueda FTS
- Parseador Gutenberg con extraccion de estilo y delexificacion
- Validador Wikipedia para verificacion historica

**Consolidacion de agentes:**
- 14 agentes -> 6 roles especializados (Dramaturgo, Validador, Estilista, Actor, Censor, Cronista)
- AgentRegistryV2 para gestion de ciclo de vida
- Integracion de herramientas MCP para cada agente

**System Heartbeat:**
- Indicadores de progreso en tiempo real via SSE
- Componente frontend HeartbeatUI
- Barra de progreso con mensajes por etapa

**Interlingua:**
- Ingles como idioma interno para todas las operaciones
- TranslationService en la frontera de salida

**Correccion de bugs:**
- Todos los errores TypeScript corregidos (0 errores)
- Tipos de parametros de consulta SQLite corregidos
- Incompatibilidades de firma LLMQueue corregidas

### v0.22.2 — Theme Builder

- Pagina de constructor de temas independiente en `/theme-builder`
- 8 temas predefinidos: Dracula, Nord, Monokai, Solarized, Gruvbox, Tokyo Night, One Dark, Catppuccin
- Controles de seleccion de color para 14 variables CSS (fondos, bordes, texto, acentos)
- Selectores de fuentes para mono, body y display
- Panel de vista previa en vivo con todos los componentes UI
- Export/importar temas como archivos JSON
- Enlace de navegacion desde la pagina de configuracion

### v0.22.2 — Correccion sistema temas

- Correccion de `theme-custom.css` — sintaxis de variables CSS corregida (usaba `var()` en lugar de `--name: value`)
- Variables faltantes `--accent-subtle`, `--success-subtle`, `--warning-subtle`, `--interactive-subtle` agregadas al tema personalizado
- Los 5 temas (Oscuro, Claro, Terminal, Cyberpunk, Personalizado) ahora funcionan correctamente a traves de los botones selectores

### v0.20.4 — Correccion grafo mundo + modal estadisticas + inyeccion idioma + temas

- Correccion de `buildRelationships()` muerto — construccion heuristica automatica de relaciones al inicio
- Nuevo endpoint `GET /worlds/:name/detail` para estadisticas del mundo
- Nuevo modal de estadisticas con listas de entidades, reglas y detalles de personajes
- Inyeccion de idioma — respuestas LLM coinciden con el idioma de la interfaz (7 idiomas)
- Sistema de temas — 5 temas integrados (Oscuro, Claro, Terminal, Cyberpunk, Personalizado) + constructor

### v0.20.1 — Correccion del motor de reglas para binario

- Correccion del crash de `/api/rules` en el binario Bun compilado
- Reemplazo de `import.meta.dir` por `process.cwd()` para la resolucion de directorios de reglas
- Resolucion del error ENOENT (`/$bunfs/root/../rules/social`) en el binario compilado
- Archivos afectados: `src/routes/rules.ts` y `src/rules/rules-engine.ts`

### v0.20.0 — Mejoras arquitectonicas

Revision arquitectonica completa en 5 etapas:

**Etapa 1-2:**
- Division NarrativeService (Bootstrapper + Facade + Service)
- Modelo unificado de agentes con interfaz y clase base
- Event Sourcing con eventos de dominio y snapshots
- Circuit Breaker para LLM con failover automatico
- Registro de agentes con 4 tipos de fuente
- Registro estructurado con trace IDs y correlacion

**Etapa 3:**
- Motor de reglas — 14 sistemas predefinidos
- Matriz de sinergia, dependencias tecnologicas, modificadores de felicidad
- Validador de reglas y modelado de deriva cultural
- Feature flags con pruebas A/B y despliegue gradual
- Versionado API (v1/v2)
- WorldStore — migracion SQLite

**Etapa 4:**
- Aislamiento multi-mundos con monitoreo de recursos
- Comunicacion inter-mundos con portales y eventos
- Sistema de plugins con gestor y hooks

**Etapa 5:**
- Actualizacion de documentacion

→ [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | [MIGRATION.md](docs/MIGRATION.md)

### v0.15.0 — Refuerzo de seguridad

- Sesiones SQLite
- Validacion token WebSocket
- Proteccion path traversal
- Proteccion CSRF
- Secure cookie, CSP reforzado

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

---

## Licencia

---

**Proyecto:** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
