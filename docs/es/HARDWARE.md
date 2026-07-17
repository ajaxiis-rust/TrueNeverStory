# Requisitos de hardware y recomendaciones de modelos

TrueNeverStory es flexible — puedes ejecutarlo en cualquier cosa, desde una Raspberry Pi hasta un servidor multi-GPU. Elige tu configuración según el hardware disponible.

---

## Requisitos mínimos

| Componente | Mínimo | Recomendado |
|------------|--------|-------------|
| **RAM** | 4 GB | 8+ GB |
| **CPU** | 2 núcleos | 4+ núcleos |
| **Almacenamiento** | 2 GB | 10+ GB |
| **GPU** | No requerida | Cualquier GPU con VRAM |

---

## Perfiles de configuración

### Perfil 1: Ultra-ligero (2-4 GB RAM)

**Caso de uso:** Laptop antigua, VPS, Raspberry Pi 4+

```
Intent Parser:    Gemma 3 1B (Q4_K_M) — 760 MB
Traducciones:     NLLB-200 600M (Q4_K_M) — 340 MB
Narrative Gen:    API Cloud (Gemini Flash)
Embeddings:       Fallback hash (sin modelo necesario)
```

**RAM total:** ~1.1 GB  
**Velocidad:** Lento (3-5 tok/s en CPU)  
**Calidad:** Aceptable  
**Privacidad:** Parcial (narrativo vía cloud)

---

### Perfil 2: Equilibrado (4-8 GB RAM)

**Caso de uso:** Laptop moderna, escritorio, servidor pequeño

```
Todo-en-uno:      Llama 3.2 3B (Q4_K_M) — 2 GB
                  O Qwen 2.5 3B (Q4_K_M) — 2 GB
Traducciones:     NLLB-200 600M (Q4_K_M) — 340 MB
Embeddings:       BGE M3 (Q4_K_M) — 438 MB
```

**RAM total:** ~2.8 GB  
**Velocidad:** Moderado (5-10 tok/s en CPU)  
**Calidad:** Buena  
**Privacidad:** Completa (todo local)

---

### Perfil 3: Calidad (8-16 GB RAM)

**Caso de uso:** PC gaming, estación de trabajo, servidor dedicado

```
Todo-en-uno:      Gemma 3 4B (Q4_K_M) — 2.3 GB
                  O Qwen 2.5 7B (Q4_K_M) — 4.4 GB
Traducciones:     NLLB-200 600M (Q8_0) — 620 MB
Embeddings:       BGE M3 (Q8_0) — 635 MB
```

**RAM total:** ~3.6-5.5 GB  
**Velocidad:** Buena (10-20 tok/s en CPU, 30+ en GPU)  
**Calidad:** Alta  
**Privacidad:** Completa

---

### Perfil 4: Acelerado por GPU (4+ GB VRAM)

**Caso de uso:** PC gaming con GPU, estación de trabajo con GPU dedicada

```
LLM:              Llama 3.1 8B (Q4_K_M) — 5 GB VRAM
Traducciones:     Mismo modelo (multilingüe)
Embeddings:       BGE M3 (Q8_0) — CPU offload
```

**VRAM total:** ~5 GB  
**Velocidad:** Rápido (30-50 tok/s)  
**Calidad:** Excelente  
**Privacidad:** Completa

---

## Recomendaciones de modelos por tarea

### Intent Parser (reconocimiento de comandos)

| Modelo | Tamaño | Velocidad | Calidad | Notas |
|--------|--------|-----------|---------|-------|
| Gemma 3 1B | 760 MB | Rápido | Básico | Mínimo |
| Llama 3.2 3B | 2 GB | Moderado | Bueno | Recomendado |
| Gemma 3 4B | 2.3 GB | Moderado | Alto | Mejor calidad |

### Traducciones (multilingüe)

| Modelo | Tamaño | Idiomas | Velocidad | Calidad |
|--------|--------|---------|-----------|---------|
| NLLB-200 600M | 340-620 MB | 35+ | Rápido | Bueno |
| MADLAD-400 3B | 2 GB | 400+ | Moderado | Alto |
| Qwen 2.5 3B | 2 GB | 29+ | Moderado | Alto |

### Generación narrativa (prosa)

| Modelo | Tamaño | Velocidad | Calidad | Notas |
|--------|--------|-----------|---------|-------|
| Gemma 3 1B | 760 MB | Rápido | Básico | Demasiado débil para narrativa |
| Llama 3.2 3B | 2 GB | Moderado | Bueno | Mínimo para narrativa |
| Gemma 3 4B | 2.3 GB | Moderado | Alto | Recomendado |
| Qwen 2.5 7B | 4.4 GB | Lento | Excelente | Mejor calidad |
| YandexGPT 5 Lite 8B | 4.9 GB | Lento | Excelente | Mejor para texto RU |

### Embeddings (búsqueda semántica)

| Modelo | Tamaño | Dimensiones | Calidad |
|--------|--------|-------------|---------|
| Embedding Gemma 300M | 329 MB | 768 | Básico |
| BGE M3 (Q4_K_M) | 438 MB | 1024 | Bueno |
| BGE M3 (Q8_0) | 635 MB | 1024 | Alto |
| Qwen3 Embedding 0.6B | 639 MB | 1024 | Alto |

---

## Ejemplos de configuración

### Ejemplo 1: VPS económico (4 GB RAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.2:3b

# Configuración de Ollama
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=2
```

**Instalar modelos:**
```bash
ollama pull llama3.2:3b
ollama pull nllb-200-distilled-600m
```

---

### Ejemplo 2: Escritorio con GPU (8 GB VRAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.1:8b
WORLD_EMBEDDING_MODEL=bge-m3
WORLD_EMBEDDING_BASE_URL=http://localhost:5002
```

---

### Ejemplo 3: Híbrido en la nube

```bash
# .env — Narrativo vía cloud
WORLD_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
WORLD_LLM_MODEL=gemini-2.0-flash
WORLD_LLM_API_KEY=your-key

# Local para traducciones (privacidad)
OLLAMA_NUM_PARALLEL=1
```

**En la configuración de agentes:**
- Narrator → Google Gemini (cloud)
- Translation → Ollama NLLB-200 (local)
- Intent Parser → Ollama Llama 3.2 3B (local)

---

## Consejos de rendimiento

1. **Solo CPU:** Usa cuantización Q4_K_M para mejor relación velocidad/calidad
2. **GPU:** Q5_K_M o Q8_0 para mejor calidad (si la VRAM lo permite)
3. **Solicitudes paralelas:** Establece `WORLD_LLM_MAX_CONCURRENT=1` en CPU
4. **Embeddings:** Usa fallback hash si la RAM es limitada (deshabilita el modelo de embedding)
5. **Traducciones:** NLLB-200 está optimizado para traducción, no para chat general

---

## Soporte de idiomas

| Modelo | Idiomas | Mejor para |
|--------|---------|------------|
| NLLB-200 | 35+ | Traducciones |
| MADLAD-400 | 400+ | Idiomas raros |
| Gemma 3 | 140+ | Multilingüe general |
| Qwen 2.5 | 29+ | Chino, idiomas asiáticos |
| YandexGPT | RU/EN | Texto ruso |
| GigaChat | RU/EN | Narrativa rusa |
