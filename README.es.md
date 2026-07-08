# TrueNeverStory v0.22.2

### Escribe tu libro solo jugando.

TrueNeverStory es un motor de narrativa interactiva impulsado por IA. Cada NPC recuerda, cada acción tiene una probabilidad, y la historia nunca se detiene. Juega un personaje, explora un mundo vivo, y observa cómo tus decisiones moldean la narrativa — o deja que el mundo evolucione solo.

Construido en TypeScript (Bun + Hono) con kernels de cómputo C FFI para operaciones críticas.

**[English](README.md) | [Русский](README.ru.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [日本語](README.ja.md) | [中文](README.zh.md)**

---

## Características

| Característica | Descripción |
|----------------|-------------|
| **Mundo vivo** | Personajes, lugares, objetos, facciones — todo conectado en un grafo de conocimiento O(1) |
| **14 agentes IA** | Narrador, Director, NPC, Escena, Cronista, Planificador, Villano, Investigador, Historiador, Cartógrafo, Mercader, Depositar quests, Guardián del saber, Sim. social |
| **Memoria y RAG** | Búsqueda vectorial (BGE-M3 + SQLite híbrido FTS5/denso/RRF) |
| **Sistema de probabilidad** | Resultados deterministas para combate, persuasión, sigilo, romance |
| **Romance y social** | Gestión de relaciones, facciones, alianzas, jerarquía feudal, diálogos NPC |
| **Sistema de quests** | Generación dinámica, objetivos, recompensas, cadenas, límites de tiempo |
| **Inventario y comercio** | Objetos con rareza, estadísticas, equipamiento, oro, comercio con NPC |
| **Economía NPC** | Jerarquía feudal (10 rangos), impuestos, producción de alimentos, sistema familiar, 34 arquetipos |
| **Motor de reglas** | 14 sistemas sociales/económicos predefinidos (feudalismo, democracia, anarquía, etc.) con matriz de sinergia |
| **Multi-mundos** | Ejecución aislada de mundos con monitoreo de recursos (memoria, CPU, tokens) |
| **Inter-mundos** | Comunicación de eventos entre mundos con portales y memoria compartida |
| **Sistema de plugins** | Arquitectura extensible con gestor de plugins, hooks de ciclo de vida y API |
| **Feature flags** | Pruebas A/B, despliegue gradual, orientación por porcentaje |
| **Versionado API** | Endpoints v1/v2 con encabezados de deprecación |
| **Streaming en tiempo real** | WebSocket + SSE para entrega de narrativa |
| **i18n (7 idiomas)** | EN, RU, DE, FR, ES, JA, ZH |
| **Auth por contraseña** | Sesiones con HttpOnly cookies, protección CSRF, sesiones SQLite |
| **Almacenamiento SQLite** | Entidades, embeddings, memoria, prompts, traducciones |
| **Circuit Breaker** | Failover automático de proveedores LLM con cadena de respaldo |
| **Registro estructurado** | IDs de trazado, IDs de correlación, métricas para depuración multi-agente |

---

## Plataformas soportadas

| Plataforma | Estado | Notas |
|------------|:------:|-------|
| Linux x86_64 | ✅ | Soporte completo, kernels FFI |
| Linux ARM64 | ✅ | Soporte completo, kernels FFI |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

---

## Inicio rápido

**No necesitas Bun, Node.js ni otro runtime.** Solo descarga y ejecuta.

### 1. Descargar

Última versión en [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Plataforma | Archivo |
|------------|---------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Ejecutar

El launcher detecta automáticamente tu proveedor LLM (Ollama, LM Studio, OpenAI, llama.cpp), configura `.env` e inicia el servidor.

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

**Desde código fuente (requiere Bun):**
```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
./startgame.sh            # Linux/macOS
.\startgame.ps1           # Windows PowerShell
```

### 3. Abrir

**http://localhost:8000** — contraseña: **`changeme`**

Cambia la contraseña después del primer inicio de sesión.

---

## Configurar LLM

Abre **Configuración** o edita `.env`:

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

También funciona con vLLM, Anthropic, Google y cualquier API compatible con OpenAI.

---

## Estructura del proyecto

```
TrueNeverStory/
├── src/
│   ├── config/           # Configuración validada por Zod
│   ├── lib/              # Cliente LLM, SQLite, operaciones vectoriales, circuit breaker, feature flags
│   ├── memory/           # WorldMemory, pipeline cognitivo
│   ├── middleware/        # Auth, rate limiter, cabeceras de seguridad, logger
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── plugins/          # Interfaz y gestor de plugins
│   ├── routes/           # Rutas API (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # Motor de reglas (14 reglas, matriz sinergia, dependencias tech)
│   ├── services/         # 55+ servicios (motor de juego, agentes, economía, aislamiento mundos, bus inter-mundos)
│   ├── intelligence/     # Análisis grafo, detección duplicados
│   ├── i18n/             # Paquetes de idiomas (7 idiomas)
│   ├── store/            # EntityStore con NameIndex O(1), WorldStore
│   └── utils/            # Logger, hash, sanitizer, template resolver
├── mojo/kernels/         # Kernles C FFI (compilados via Zig)
├── public/               # Interfaz web (estilo terminal)
├── worlds/               # Datos mundos (SQLite, entidades, sesiones)
├── conf/                 # Configuración
└── tests/                # Suite de pruebas
```

---

## API

### Autenticación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/login` | Página de inicio de sesión |
| POST | `/login` | Autenticación |
| POST | `/logout` | Cerrar sesión |

### Chat y juego de rol

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/chat/setup` | Inicializar sesión |
| POST | `/api/chat/message` | Enviar mensaje |
| POST | `/api/chat/stream` | Streaming SSE |
| GET | `/api/chat/session` | Estado de sesión |
| GET | `/api/chat/history` | Historial |

### Entidades y grafo

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/entity/:uid` | Detalles entidad |
| GET | `/api/neighbors/:uid` | Vecinos con recorrido |
| GET | `/api/search?q=` | Búsqueda |
| GET | `/api/graph/summary` | Estadísticas grafo |

### Agentes e i18n

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/agents` | Configuraciones agentes |
| PUT | `/api/agents/:id` | Actualizar agente |
| PUT | `/api/agents/:id/prompts/:lang` | Prompts por idioma |
| GET | `/api/i18n/translations/:lang/:page` | Traducciones |

### Motor de reglas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/rules` | Reglas disponibles |
| GET | `/api/rules/:id` | Detalles regla |
| POST | `/api/rules/validate` | Validar JSON regla |

### Inter-mundos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/cross-world/status` | Estado inter-mundos |
| POST | `/api/cross-world/enable` | Activar |
| POST | `/api/cross-world/disable` | Desactivar |
| GET | `/api/cross-world/portals` | Listar portales |
| POST | `/api/cross-world/portals` | Crear portal |
| DELETE | `/api/cross-world/portals/:id` | Eliminar portal |
| GET | `/api/cross-world/events` | Registro eventos |

### Plugins

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/plugins` | Plugins registrados |
| GET | `/api/plugins/:id` | Detalles plugin |
| GET | `/api/plugins/:id/capabilities` | Capacidades plugin |

### Feature Flags

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/feature-flags` | Feature flags |
| PUT | `/api/feature-flags/:id` | Actualizar flag |

### WebSocket

| Endpoint | Descripción |
|----------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Streaming juego de rol tiempo real |

---

## Ejemplos

### API

```bash
# Iniciar sesión
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# Inicializar sesión
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# Enviar mensaje
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Desenvaino mi espada y me enfrento al dragón"}'

# Reglas disponibles
curl -b cookies.txt "http://localhost:8000/api/rules"

# Crear portal inter-mundos
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

---

## Para desarrolladores

Documentación completa: [DEV.README.es.md](docs/DEV.README.es.md)

### Prerrequisitos

- [Bun](https://bun.sh) v1.0+

### Instalación

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

### Comandos

| Comando | Descripción |
|---------|-------------|
| `bun run dev` | Desarrollo con hot reload |
| `bun run start` | Modo producción |
| `bun run lint` | Verificación de tipos |
| `bun test` | Pruebas |
| `bun run build` | Build |

---

## Últimos cambios

### v0.22.2 — Corrección sistema temas

- Corrección de `theme-custom.css` — sintaxis de variables CSS corregida (usaba `var()` en lugar de `--name: value`)
- Variables faltantes `--accent-subtle`, `--success-subtle`, `--warning-subtle`, `--interactive-subtle` agregadas al tema personalizado
- Los 5 temas (Oscuro, Claro, Terminal, Cyberpunk, Personalizado) ahora funcionan correctamente a través de los botones selectores

### v0.20.4 — Corrección grafo mundo + modal estadísticas + inyección idioma + temas

- Corrección de `buildRelationships()` muerto — construcción heurística automática de relaciones al inicio
- Nuevo endpoint `GET /worlds/:name/detail` para estadísticas del mundo
- Nuevo modal de estadísticas con listas de entidades, reglas y detalles de personajes
- Inyección de idioma — respuestas LLM coinciden con el idioma de la interfaz (7 idiomas)
- Sistema de temas — 5 temas integrados (Oscuro, Claro, Terminal, Cyberpunk, Personalizado) + constructor

### v0.20.1 — Corrección del motor de reglas para binario

- Corrección del crash de `/api/rules` en el binario Bun compilado
- Reemplazo de `import.meta.dir` por `process.cwd()` para la resolución de directorios de reglas
- Resolución del error ENOENT (`/$bunfs/root/../rules/social`) en el binario compilado
- Archivos afectados: `src/routes/rules.ts` y `src/rules/rules-engine.ts`

### v0.20.0 — Mejoras arquitectónicas

Revisión arquitectónica completa en 5 etapas:

**Etapa 1-2:**
- División NarrativeService (Bootstrapper + Facade + Service)
- Modelo unificado de agentes con interfaz y clase base
- Event Sourcing con eventos de dominio y snapshots
- Circuit Breaker para LLM con failover automático
- Registro de agentes con 4 tipos de fuente
- Registro estructurado con trace IDs y correlación

**Etapa 3:**
- Motor de reglas — 14 sistemas predefinidos
- Matriz de sinergia, dependencias tecnológicas, modificadores de felicidad
- Validador de reglas y modelado de deriva cultural
- Feature flags con pruebas A/B y despliegue gradual
- Versionado API (v1/v2)
- WorldStore — migración SQLite

**Etapa 4:**
- Aislamiento multi-mundos con monitoreo de recursos
- Comunicación inter-mundos con portales y eventos
- Sistema de plugins con gestor y hooks

**Etapa 5:**
- Actualización de documentación

→ [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | [MIGRATION.md](docs/MIGRATION.md)

### v0.15.0 — Refuerzo de seguridad

- Sesiones SQLite
- Validación token WebSocket
- Protección path traversal
- Protección CSRF
- Secure cookie, CSP reforzado

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

---

## Licencia

---

🔗 **Proyecto:** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
