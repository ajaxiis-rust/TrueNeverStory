# MCP Console — Guia del usuario

La Consola MCP es una interfaz web de gestion para todas las bases de datos de TrueNeverStory. Accede a ella en `/mcp.html` en modo MCP.

## Inicio rapido

### Iniciar modo MCP

```bash
TNS_MCP_MODE=1 bun run src/index.ts
```

Abre `http://localhost:8000` en tu navegador. Si hay una contrasena configurada, seras redirigido a la pagina de inicio de sesion.

### Proteccion por contrasena

El modo MCP usa la misma contrasena que el servidor del juego principal. Configurala via:
- **Variable de entorno:** `AUTH_PASSWORD=tu_contrasena`
- **Pagina de ajustes:** Ajustes → Contrasena de autenticacion

Si no hay contrasena configurada, el modo MCP funciona sin autenticacion (adecuado para desarrollo local).

## Resumen de pestanas

| Pestana | Proposito |
|---------|-----------|
| **Panel** | Estado de bases de datos (existencia, tamano) |
| **Biblia** | Buscar versiculos, personajes, bootstrap/compactar |
| **Gutenberg** | Buscar estilos, deslexificar, descargar/convertir corpus |
| **Catalogo** | Crear y gestionar catalogo de libros para aprendizaje de estilo |
| **Wikipedia** | Buscar articulos, verificar hechos |
| **Literatura** | Plantillas de misiones, compilar/compactar |
| **Economia** | Fase economica, generacion de dilemas |
| **Sistema** | Tiempo activo, memoria, registros de operaciones |

## Catalogo — Descargar autores favoritos

La pestana Catalogo te permite crear una biblioteca personal desde Project Gutenberg para mejorar la calidad de escritura del agente Estilista.

### Paso 1: Crear un catalogo

Ingresa nombres de autores (separados por comas) y haz clic en **Crear catalogo**:

```
Mark Twain, Jack London, Edgar Allan Poe
```

O ingresa un tema (por ej. `adventure`, `romance`, `gothic`) para descubrir autores.

Para un inicio rapido, haz clic en **Populares 500** para cargar los libros mas descargados.

### Paso 2: Explorar y filtrar

- **Busqueda** — busqueda de texto completo en titulos, autores y temas
- **Filtro** — por nombre de autor, rango de anos de nacimiento/fallecimiento, descargas minimas
- **Ordenar** — haz clic en los encabezados de columna
- **Paginacion** — navegacion con botones Anterior/Siguiente

### Paso 3: Seleccionar libros

- **Individual** — marca las casillas junto a cada libro
- **Toda la pagina** — marca la casilla del encabezado
- **Todos los filtrados** — haz clic en « Seleccionar todo »
- **Deseleccionar** — haz clic en « Deseleccionar todo »

### Paso 4: Descargar seleccionados

Haz clic en **Descargar seleccionados** para obtener los textos completos. El proceso se ejecuta en segundo plano con seguimiento de progreso.

Despues de la descarga, el agente Estilista extrae automaticamente patrones de escritura (vocabulario, estructuras de oraciones, etiquetas de animo) de los textos de cada autor.

### Como mejora la escritura

Los textos descargados son procesados por el parser Gutenberg que:
1. **Deslexifica** — reemplaza nombres propios con marcadores para preservar la estructura
2. **Extrae vocabulario** — identifica elecciones lexicas caracteristicas de cada autor
3. **Extrae patrones de oraciones** — estructuras sintacticas comunes
4. **Infiere etiquetas de animo** — oscuro, luminoso, romantico, misterioso, etc.

El agente Estilista usa estos patrones al generar prosa narrativa, coincidiendo con el animo y estilo de los autores elegidos.

## Endpoints API

Todos los endpoints estan bajo `/mcp/`:

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/mcp/status` | Estado del sistema e info de BD |
| `GET` | `/mcp/gutenberg/catalog/stats` | Estadisticas del catalogo |
| `GET` | `/mcp/gutenberg/catalog` | Lista paginada del catalogo |
| `GET` | `/mcp/gutenberg/catalog/search?q=` | Busqueda de texto completo |
| `GET` | `/mcp/gutenberg/catalog/filter?author=&year_from=&year_to=&min_downloads=&subject=` | Filtrado |
| `POST` | `/mcp/gutenberg/catalog/build` | Iniciar construccion del catalogo |
| `POST` | `/mcp/gutenberg/catalog/select` | Alternar seleccion individual |
| `POST` | `/mcp/gutenberg/catalog/select-all` | Seleccionar todo |
| `POST` | `/mcp/gutenberg/catalog/deselect-all` | Deseleccionar todo |
| `POST` | `/mcp/gutenberg/download-selected` | Descargar seleccionados |
| `POST` | `/mcp/gutenberg/process` | Activar canalizacion de procesamiento Gutenberg |

### POST /mcp/gutenberg/process

Activa la canalizacion de procesamiento Gutenberg desde la Consola MCP.

**Cuerpo de la solicitud:**
```json
{
  "phase": "all"  // "v1" | "v2" | "all"
}
```

**Respuesta (flujo SSE):**
```json
{"phase":"parse","pct":10,"message":"Parsed 45/59 books"}
{"phase":"compile","pct":50,"message":"Running DramaturgicPass..."}
{"phase":"analyze","pct":75,"message":"Analyzing chunks..."}
{"phase":"done","pct":100,"message":"Pipeline complete"}
```

**Fases:**
- `v1` — Solo Fase A (basada en reglas, sin LLM): parse → compile → done
- `v2` — Solo Fase B (LLM): analyze → extract → done  
- `all` — Ambas fases secuencialmente

## Solucion de problemas

| Problema | Solucion |
|----------|----------|
| Catalogo vacio | Crear un catalogo primero (ingresar autores → Crear catalogo) |
| Casilla se reinicia | Verificar que el servidor esta ejecutandose; revisar consola del navegador |
| « Autenticacion requerida » | Configurar `AUTH_PASSWORD` en env o Ajustes |
| Descarga atascada | Revisar pestana Sistema → Registros de operaciones |
| Estilos no aparecen | Ejecutar Conversion Gutenberg despues de la descarga |
