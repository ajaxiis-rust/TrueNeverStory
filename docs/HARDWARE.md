# Hardware Requirements & Model Recommendations

TrueNeverStory is flexible — you can run it on anything from a Raspberry Pi to a multi-GPU server. Choose your configuration based on available hardware.

---

## Minimum Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **RAM** | 4 GB | 8+ GB |
| **CPU** | 2 cores | 4+ cores |
| **Storage** | 2 GB | 10+ GB |
| **GPU** | Not required | Any GPU with VRAM |

---

## Configuration Profiles

### Profile 1: Ultra-Light (2-4 GB RAM)

**Use case:** Old laptop, VPS, Raspberry Pi 4+

```
Intent Parser:    Gemma 3 1B (Q4_K_M) — 760 MB
Translation:      NLLB-200 600M (Q4_K_M) — 340 MB
Narrative Gen:    Cloud API (Gemini Flash)
Embeddings:       Hash fallback (no model needed)
```

**Total RAM:** ~1.1 GB  
**Speed:** Slow (3-5 tok/s on CPU)  
**Quality:** Acceptable  
**Privacy:** Partial (narrative via cloud)

---

### Profile 2: Balanced (4-8 GB RAM)

**Use case:** Modern laptop, desktop, small server

```
All-in-one:       Llama 3.2 3B (Q4_K_M) — 2 GB
                  OR Qwen 2.5 3B (Q4_K_M) — 2 GB
Translation:      NLLB-200 600M (Q4_K_M) — 340 MB
Embeddings:       BGE M3 (Q4_K_M) — 438 MB
```

**Total RAM:** ~2.8 GB  
**Speed:** Moderate (5-10 tok/s on CPU)  
**Quality:** Good  
**Privacy:** Full (all local)

---

### Profile 3: Quality (8-16 GB RAM)

**Use case:** Gaming PC, workstation, dedicated server

```
All-in-one:       Gemma 3 4B (Q4_K_M) — 2.3 GB
                  OR Qwen 2.5 7B (Q4_K_M) — 4.4 GB
Translation:      NLLB-200 600M (Q8_0) — 620 MB
Embeddings:       BGE M3 (Q8_0) — 635 MB
```

**Total RAM:** ~3.6-5.5 GB  
**Speed:** Good (10-20 tok/s on CPU, 30+ on GPU)  
**Quality:** High  
**Privacy:** Full

---

### Profile 4: GPU-Accelerated (4+ GB VRAM)

**Use case:** Gaming PC with GPU, workstation with dedicated GPU

```
LLM:              Llama 3.1 8B (Q4_K_M) — 5 GB VRAM
Translation:      Same model (multilingual)
Embeddings:       BGE M3 (Q8_0) — CPU offload
```

**Total VRAM:** ~5 GB  
**Speed:** Fast (30-50 tok/s)  
**Quality:** Excellent  
**Privacy:** Full

---

## Model Recommendations by Task

### Intent Parser (command recognition)

| Model | Size | Speed | Quality | Notes |
|-------|------|-------|---------|-------|
| Gemma 3 1B | 760 MB | Fast | Basic | Minimum viable |
| Llama 3.2 3B | 2 GB | Moderate | Good | Recommended |
| Gemma 3 4B | 2.3 GB | Moderate | High | Best quality |

### Translation (multilingual)

| Model | Size | Languages | Speed | Quality |
|-------|------|-----------|-------|---------|
| NLLB-200 600M | 340-620 MB | 35+ | Fast | Good |
| MADLAD-400 3B | 2 GB | 400+ | Moderate | High |
| Qwen 2.5 3B | 2 GB | 29+ | Moderate | High |

### Narrative Generation (prose)

| Model | Size | Speed | Quality | Notes |
|-------|------|-------|---------|-------|
| Gemma 3 1B | 760 MB | Fast | Basic | Too weak for narrative |
| Llama 3.2 3B | 2 GB | Moderate | Good | Minimum for narrative |
| Gemma 3 4B | 2.3 GB | Moderate | High | Recommended |
| Qwen 2.5 7B | 4.4 GB | Slow | Excellent | Best quality |
| YandexGPT 5 Lite 8B | 4.9 GB | Slow | Excellent | Best for RU text |

### Embeddings (semantic search)

| Model | Size | Dimensions | Quality |
|-------|------|------------|---------|
| Embedding Gemma 300M | 329 MB | 768 | Basic |
| BGE M3 (Q4_K_M) | 438 MB | 1024 | Good |
| BGE M3 (Q8_0) | 635 MB | 1024 | High |
| Qwen3 Embedding 0.6B | 639 MB | 1024 | High |

---

## Configuration Examples

### Example 1: Budget VPS (4 GB RAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.2:3b

# Ollama settings
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=2
```

**Install models:**
```bash
ollama pull llama3.2:3b
ollama pull nllb-200-distilled-600m
```

---

### Example 2: Desktop with GPU (8 GB VRAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.1:8b
WORLD_EMBEDDING_MODEL=bge-m3
WORLD_EMBEDDING_BASE_URL=http://localhost:5002
```

---

### Example 3: Cloud Hybrid

```bash
# .env — Narrative via cloud
WORLD_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
WORLD_LLM_MODEL=gemini-2.0-flash
WORLD_LLM_API_KEY=your-key

# Local for translations (privacy)
OLLAMA_NUM_PARALLEL=1
```

**In Agents settings:**
- Narrator → Google Gemini (cloud)
- Translation → Ollama NLLB-200 (local)
- Intent Parser → Ollama Llama 3.2 3B (local)

---

## Performance Tips

1. **CPU-only:** Use Q4_K_M quantization for best speed/quality ratio
2. **GPU:** Q5_K_M or Q8_0 for better quality (if VRAM allows)
3. **Parallel requests:** Set `WORLD_LLM_MAX_CONCURRENT=1` on CPU
4. **Embeddings:** Use hash fallback if RAM is tight (disable embedding model)
5. **Translations:** NLLB-200 is optimized for translation, not general chat

---

## Language Support

| Model | Languages | Best For |
|-------|-----------|----------|
| NLLB-200 | 35+ | Translation |
| MADLAD-400 | 400+ | Rare languages |
| Gemma 3 | 140+ | General multilingual |
| Qwen 2.5 | 29+ | Chinese, Asian languages |
| YandexGPT | RU/EN | Russian text |
| GigaChat | RU/EN | Russian narrative |
