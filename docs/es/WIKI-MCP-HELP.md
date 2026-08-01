# Wikipedia RAG — Guía del Usuario

Wikipedia RAG (Retrieval-Augmented Generation) enriquece automáticamente los mundos del juego con conocimiento real de Wikipedia. Cuando creas un mundo, el sistema investiga temas relevantes y construye una base de conocimiento que los agentes usan para narrativas precisas y detalladas.

## Cómo funciona

### Investigación automática

Cuando se crea un mundo, el sistema:

1. **Extrae palabras clave** de la descripción del mundo (ej. "medieval", "caballeros", "Inglaterra")
2. **Busca en Wikipedia** artículos relevantes
3. **Parsea artículos** — extrae texto, secciones, categorías
4. **Divide en chunks** — trocea en piezas de ~500 tokens con superposición
5. **Construye índice RAG** — almacena chunks para consultas de agentes

### Escenario de ejemplo

Quieres un mundo de **caballeros medievales** con referencias literarias (Ivanhoe, Quentin Durward):

```
Usuario: "Quiero un mundo de caballeros y la Edad Media"
```

El sistema investiga automáticamente:
- **Geografía** — castillos, ciudades, rutas comerciales en la Inglaterra medieval
- **Vida cotidiana** — comida, ropa, oficios, estructura social
- **Armas y armaduras** — espadas, escudos, cota de malla, armadura de placas
- **Gobernantes y comandantes** — reyes, señores, sus caracteres y fechas
- **Catástrofes** — plagas, incendios, terremotos de la época

Todo este conocimiento se almacena en el índice RAG y los agentes lo usan para generar narrativas precisas y detalladas.

### Enriquecimiento en inactividad

Cuando un jugador está inactivo más de 1 hora, el sistema continúa investigando en segundo plano:
- Investiga temas relacionados con el mundo
- Añade más detalles al índice RAG
- Las próximas respuestas de agentes usan el nuevo conocimiento

## Seguimiento de progreso

### Interfaz web

El progreso en tiempo real está disponible vía SSE (Server-Sent Events):

```
GET /api/wiki/research/{worldId}/progress
```

Etapas de progreso:
1. **Generando mundo** — LLM crea el marco del mundo
2. **Investigación Wikipedia** — Descargando y parseando artículos
3. **Construyendo RAG** — Creando índice vectorial

### Progreso CLI

Barra de progreso en terminal durante la creación del mundo:

```
[Etapa 2/3: Investigación Wikipedia] Investigando caballería medieval...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Actual: Caballero
  → Errores: 1 (omitido: Castillos_en_Inglaterra)
```

### Botones en chat

En la interfaz web puedes controlar la investigación:
- **🌍 Investigar Wikipedia** — Iniciar investigación
- **⏸ Pausa** — Pausar investigación
- **▶ Continuar** — Reanudar investigación

## Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/wiki/research/{worldId}/progress` | Stream SSE de progreso |
| `POST` | `/api/wiki/research/{worldId}` | Iniciar investigación |
| `POST` | `/api/wiki/research/{worldId}/pause` | Pausar investigación |
| `POST` | `/api/wiki/research/{worldId}/resume` | Reanudar investigación |
| `GET` | `/api/wiki/research/{worldId}/status` | Obtener estado actual |

## Integración MCP

Wikipedia RAG está disponible como herramienta MCP para agentes:

### Wiki Search Tool

```typescript
// Buscar conocimiento relevante
const results = await wikiSearch({
  query: "caballería medieval",
  worldId: "my-world",
  limit: 10
});
```

Retorna:
```json
[
  {
    "article": "Caballero",
    "section": "Historia",
    "text": "El concepto de caballería se originó en el período medieval...",
    "score": 0.85
  }
]
```

### Uso en agentes

Los agentes usan automáticamente RAG al generar respuestas:
- **Dramaturgo** — Usa contexto histórico para patrones narrativos
- **Validador** — Verifica hechos contra datos de Wikipedia
- **Estilista** — Enriquece descripciones con detalles reales
- **Actor** — Proporciona conocimiento preciso de NPCs sobre el mundo

## Configuración

### Política de reintentos

- **5 intentos** por artículo
- **2 minutos timeout** por intento
- **Backoff exponencial**: 5s → 10s → 20s → 40s → 80s

### Degradación elegante

Si Wikipedia no está disponible:
- La creación del mundo continúa sin datos de Wikipedia
- Los agentes usan solo conocimiento generado por LLM
- La investigación se reintenta en segundo plano

## Estructura de archivos

```
src/services/
├── wikipedia-researcher.ts      # Cliente Wikipedia API
├── wiki-rag-builder.ts          # Chunking de artículos
├── idle-research-scheduler.ts   # Enriquecimiento en segundo plano
└── world-creation-progress.ts   # Seguimiento de progreso

src/mcp/wiki/
├── index.ts                     # Exportaciones del módulo
└── wiki-search.ts               # Herramienta de búsqueda MCP

src/routes/
└── wiki-research.ts             # Endpoints SSE

src/utils/
└── progress-bar.ts              # Barra de progreso CLI
```

## Solución de problemas

| Problema | Solución |
|----------|----------|
| Investigación no inicia | Verifique la accesibilidad de Wikipedia API |
| Progreso atascado | Verifique pestaña Sistema → Logs de operaciones |
| Artículos no cargan | Política de reintentos maneja fallos temporales |
| RAG no usado por agentes | Asegúrese que `enableWikipediaResearch()` fue llamado |
| "Autenticación requerida" | Configure `AUTH_PASSWORD` en env o Configuración |

## Detalles técnicos

### Estrategia de chunking

Los artículos se dividen en chunks de ~1500 caracteres (~500 tokens):
- **Superposición**: 150 caracteres entre chunks
- **Secciones**: Cada sección se chunka independientemente
- **Metadatos**: Cada chunk almacena título del artículo, sección, categorías

### Algoritmo de búsqueda

La herramienta de búsqueda wiki usa coincidencia de palabras clave:
1. Divide la consulta en palabras
2. Verifica cada chunk para presencia de palabras
3. Calcula puntuación de relevancia (coincidencias / total de palabras)
4. Retorna los mejores resultados ordenados por puntuación

### Almacenamiento

- **SQLite**: Metadatos de artículos y texto de chunks
- **FAISS**: Embeddings vectoriales para búsqueda semántica
- **Aislamiento por mundo**: Cada mundo tiene su propio índice RAG
