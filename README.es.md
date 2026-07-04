# TrueNeverStory v0.15.0

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
| **Memoria y RAG** | Búsqueda vectorial (BGE-M3 + SQLite híbrido FTS5/d denso/RRF) |
| **Sistema de probabilidad** | Resultados deterministas para combate, persuasión, sigilo, romance |
| **Romance y social** | Gestión de relaciones, facciones, alianzas, jerarquía feudal, diálogos NPC |
| **Sistema de quests** | Generación dinámica, objetivos, recompensas, cadenas, límites de tiempo |
| **Inventario y comercio** | Objetos con rareza, estadísticas, equipamiento, oro, comercio con NPC |
| **Economía NPC** | Jerarquía feudal (10 rangos), impuestos, producción de alimentos, sistema familiar, 34 arquetipos |
| **Streaming en tiempo real** | WebSocket + SSE para entrega de narrativa |
| **i18n (7 idiomas)** | EN, RU, DE, FR, ES, JA, ZH |
| **Auth por contraseña** | Sesiones con HttpOnly cookies, protección CSRF |
| **Almacenamiento SQLite** | Entidades, embeddings, memoria, prompts, traducciones |

---

## Plataformas compatibles

| Plataforma | Estado | Notas |
|------------|:------:|-------|
| Linux x86_64 | ✅ | Soporte completo, kernels FFI |
| Linux ARM64 | ✅ | Soporte completo, kernels FFI |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

---

## Inicio rápido

**No necesitas Bun, Node.js ni ningún runtime.** Solo descarga y ejecuta.

### 1. Descargar

Última release para tu plataforma en [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Plataforma | Archivo |
|------------|---------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Ejecutar

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

### 3. Abrir

Ir a **http://localhost:8000** — contraseña: **`changeme`**

Cambia la contraseña en Ajustes después del primer inicio de sesión.

Eso es todo. Sin base de datos, sin instalar paquetes, sin editar archivos de configuración.

---

## Configurar LLM

Abrir la página de **Ajustes** o editar `.env`:

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

También funciona con vLLM, Anthropic, Google y cualquier API compatible con OpenAI.

---

## Estructura del proyecto

```
TrueNeverStory/
├── src/
│   ├── config/           # Configuración validada con Zod
│   ├── lib/              # Cliente LLM, SQLite store, operaciones vectoriales
│   ├── memory/           # WorldMemory, pipeline cognitivo
│   ├── middleware/        # Auth, rate limiter, cabeceras de seguridad
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── routes/           # Rutas API (chat, entities, agents, settings)
│   ├── services/         # 52 servicios (motor de juego, agentes, economía)
│   ├── intelligence/     # Análisis de grafo, detección de duplicados
│   ├── i18n/             # Paquetes de idiomas (7 idiomas)
│   ├── store/            # EntityStore con índice O(1)
│   └── utils/            # Logger, hash, sanitizar, plantillas
├── mojo/kernels/         # Kernels de cómputo C FFI (compilados via Zig)
├── public/               # Interfaz web (estilo terminal)
├── worlds/               # Datos del mundo (SQLite, entidades, sesiones)
├── conf/                 # Configuración
└── tests/                # Suite de tests
```

---

## API

### Autenticación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/login` | Página de login |
| POST | `/login` | Autenticar |
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
| GET | `/api/entity/:uid` | Detalles de entidad |
| GET | `/api/neighbors/:uid` | Vecinos con profundidad |
| GET | `/api/search?q=` | Buscar por nombre o semántica |
| GET | `/api/graph/summary` | Estadísticas del grafo |

### Agentes e i18n

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/agents` | Configuraciones de agentes |
| PUT | `/api/agents/:id` | Actualizar agente |
| PUT | `/api/agents/:id/prompts/:lang` | Prompts por idioma |
| GET | `/api/i18n/translations/:lang/:page` | Traducciones |

### WebSocket

| Endpoint | Descripción |
|----------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Streaming de juego de rol en tiempo real |

---

## Ejemplos

```bash
# Login
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# Configurar sesión
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# Enviar mensaje
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Desenvaino mi espada y me enfrento al dragón"}'
```

---

## Para desarrolladores

Documentación completa de arquitectura, referencia del contenedor DI y guía de contribución: [DEV.README.es.md](docs/DEV.README.es.md)

### Requisitos

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
| `bun test` | Ejecutar tests |
| `bun run build` | Construir bundle |

---

## Compilación de binarios

Cross-compilation via Zig:

```bash
cd mojo/kernels
./build.sh native           # Plataforma actual
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # Todos los targets
```

Ver [COMPILE.md](docs/COMPILE.md). GitHub Actions compila todas las plataformas automáticamente.

---

## Cambios recientes

### v0.15.0 — Refuerzo de seguridad

- Sesiones en SQLite (sobreviven reinicios)
- Validación de token WebSocket
- Protección contra path traversal
- Protección CSRF en formulario de login
- Cookie Secure, CSP reforzado
- Mensajes de error sanitizados

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

### v0.14.1 — Kernels C FFI y Cross-Compilation

- 5 kernels portados de Mojo a C puro
- Cross-compilation Zig para 10 plataformas
- Pausa/reanudación de procesamiento en segundo plano

---

## Licencia

Apache 2.0
