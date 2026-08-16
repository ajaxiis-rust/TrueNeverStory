# TrueNeverStory

### Escribe tu libro simplemente jugando.

TrueNeverStory es un motor de narrativa interactiva impulsado por IA con **arquitectura State-First**. Cada NPC recuerda, cada acción tiene un resultado determinista, y la historia nunca se detiene. Juega un personaje, explora un mundo vivo, y observa cómo tus decisiones moldean la narrativa — o deja que el mundo evolucione solo.

Construido en TypeScript (Bun + Hono) con núcleos de cómputo C FFI para operaciones críticas.

**[English](../../README.md) | [Русский](../ru/README.md) | [Deutsch](../de/README.md) | [Français](../fr/README.md) | [日本語](../ja/README.md) | [中文](../zh/README.md)**

---

## Qué es

Juegas un personaje en un mundo permanentemente vivo. Cada una de tus acciones se descompone en una intención estructurada, se simula de forma determinista y se devuelve como prosa mediante un pipeline de agentes de IA especializados. El idioma interno del motor es el inglés; la traducción ocurre en el límite de salida, de modo que la historia siempre habla tu idioma.

- **State-First** — la simulación se ejecuta antes de escribir, por lo que los resultados son deterministas y reproducibles.
- **Seis agentes, un narrador** — Dramaturg (arquetipos), Validator (hechos), Stylist (prosa), Actor (NPCs), Censor (estilo), Chronicler (memoria).
- **Literatura como código** — la Biblia como arquetipos narrativos, Gutenberg como estilos de prosa, Wikipedia como verificación de hechos, conectado mediante herramientas MCP.

## Características

| Área | Descripción |
|------|-------------|
| **Pipeline State-First** | Simulación determinista → mutación de estado → prosa restringida |
| **Mundo vivo** | Personajes, ubicaciones, facciones en un grafo de conocimiento con búsquedas O(1) |
| **Memoria y RAG** | Memoria vectorial con búsqueda híbrida FTS5 + densa + RRF (BGE-M3) |
| **Sistema de probabilidad** | Resultados deterministas para combate, persuasión, sigilo, romance |
| **Economía de NPC** | Jerarquía feudal (10 rangos), impuestos, producción de alimentos, sistema familiar |
| **Motor de reglas** | 14 sistemas sociales/económicos con matriz de sinergia |
| **Multi-mundo** | Mundos aislados con eventos y portales entre mundos |
| **Streaming en tiempo real** | WebSocket + SSE con progreso heartbeat |
| **i18n** | EN, RU, DE, FR, ES, JA, ZH |
| **Sistema de plugins** | Hooks de ciclo de vida y API |
| **Feature flags** | Despliegue gradual, segmentación por porcentaje |

## Inicio rápido

**No se requiere Bun, Node.js ni ningún runtime.** Solo descarga y ejecuta.

### 1. Descargar

Obtén la última versión para tu plataforma desde [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Plataforma | Archivo |
|------------|---------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Ejecutar

El lanzador detecta automáticamente tu proveedor LLM (Ollama, LM Studio, OpenAI, llama.cpp), configura `.env` e inicia el servidor.

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x startgame.sh
./startgame.sh

# Windows (PowerShell)
# Extrae tns-windows-x64.zip, luego:
.\startgame.ps1
```

### 3. Abrir

Ve a **http://localhost:8000** — contraseña: **`changeme`** (cámbiala en Ajustes tras el primer inicio de sesión).

Eso es todo. Sin configuración de base de datos, sin instalación de paquetes, sin archivos de configuración que editar.

## Configurar el LLM

Abre la página **Ajustes** o edita `.env`. Funciona con Ollama, LM Studio, vLLM, OpenAI, Anthropic, Google y cualquier API compatible con OpenAI. Ver [HARDWARE.md](HARDWARE.md) y [PROVIDER-RATE-LIMITING.md](../en/PROVIDER-RATE-LIMITING.md).

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [ARCHITECTURE.md](../en/ARCHITECTURE.md) | Diseño del sistema, pipeline, servicios |
| [API.md](API.md) | Endpoints HTTP y WebSocket |
| [AGENTS.md](AGENTS.md) | Referencia de agentes (los Big Six) |
| [DEV.README.md](DEV.README.md) | Guía del desarrollador — setup, comandos, DI |
| [COMPILE.md](../en/COMPILE.md) | Builds binarios y compilación cruzada |
| [CHANGELOG.md](../en/CHANGELOG.md) | Historial de versiones |
| [about.md](about.md) | Reglas del mundo y economía |
| [MIGRATION.md](../en/MIGRATION.md) | Notas de migración de versión |
| [security-audit.md](../en/security-audit.md) | Resultados de la auditoría de seguridad |

## Compilar desde el código fuente

Requiere [Bun](https://bun.sh) v1.0+.

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev        # http://localhost:8000
```

Comandos: `bun run dev` (recarga en caliente), `bun run start` (producción), `bun run lint` (verificación de tipos), `bun test` (suite de pruebas). Ver [COMPILE.md](../en/COMPILE.md) sobre releases binarias.

## Licencia

MIT
