# Hardware-Anforderungen & Modell-Empfehlungen

TrueNeverStory ist flexibel — es läuft auf allem, von einem Raspberry Pi bis zu einem Multi-GPU-Server. Wählen Sie Ihre Konfiguration basierend auf der verfügbaren Hardware.

---

## Mindestanforderungen

| Komponente | Minimum | Empfohlen |
|------------|---------|-----------|
| **RAM** | 4 GB | 8+ GB |
| **CPU** | 2 Kerne | 4+ Kerne |
| **Speicher** | 2 GB | 10+ GB |
| **GPU** | Nicht erforderlich | Beliebige GPU mit VRAM |

---

## Konfigurationsprofile

### Profil 1: Ultra-Leicht (2-4 GB RAM)

**Anwendung:** Alter Laptop, VPS, Raspberry Pi 4+

```
Intent Parser:    Gemma 3 1B (Q4_K_M) — 760 MB
Übersetzungen:    NLLB-200 600M (Q4_K_M) — 340 MB
Narrative Gen:    Cloud API (Gemini Flash)
Embeddings:       Hash-Fallback (kein Modell nötig)
```

**Gesamt-RAM:** ~1.1 GB  
**Geschwindigkeit:** Langsam (3-5 tok/s auf CPU)  
**Qualität:** Akzeptabel  
**Datenschutz:** Teilweise (Narrative über Cloud)

---

### Profil 2: Ausgewogen (4-8 GB RAM)

**Anwendung:** Moderner Laptop, Desktop, kleiner Server

```
Alles-in-einem:   Llama 3.2 3B (Q4_K_M) — 2 GB
                  ODER Qwen 2.5 3B (Q4_K_M) — 2 GB
Übersetzungen:    NLLB-200 600M (Q4_K_M) — 340 MB
Embeddings:       BGE M3 (Q4_K_M) — 438 MB
```

**Gesamt-RAM:** ~2.8 GB  
**Geschwindigkeit:** Mäßig (5-10 tok/s auf CPU)  
**Qualität:** Gut  
**Datenschutz:** Vollständig (alles lokal)

---

### Profil 3: Qualität (8-16 GB RAM)

**Anwendung:** Gaming-PC, Workstation, dedizierter Server

```
Alles-in-einem:   Gemma 3 4B (Q4_K_M) — 2.3 GB
                  ODER Qwen 2.5 7B (Q4_K_M) — 4.4 GB
Übersetzungen:    NLLB-200 600M (Q8_0) — 620 MB
Embeddings:       BGE M3 (Q8_0) — 635 MB
```

**Gesamt-RAM:** ~3.6-5.5 GB  
**Geschwindigkeit:** Gut (10-20 tok/s auf CPU, 30+ auf GPU)  
**Qualität:** Hoch  
**Datenschutz:** Vollständig

---

### Profil 4: GPU-beschleunigt (4+ GB VRAM)

**Anwendung:** Gaming-PC mit GPU, Workstation mit dedizierter GPU

```
LLM:              Llama 3.1 8B (Q4_K_M) — 5 GB VRAM
Übersetzungen:    Dieselbe Modell (mehrsprachig)
Embeddings:       BGE M3 (Q8_0) — CPU-Offload
```

**Gesamt-VRAM:** ~5 GB  
**Geschwindigkeit:** Schnell (30-50 tok/s)  
**Qualität:** Ausgezeichnet  
**Datenschutz:** Vollständig

---

## Modell-Empfehlungen nach Aufgabe

### Intent Parser (Befehlserkennung)

| Modell | Größe | Geschwindigkeit | Qualität | Anmerkungen |
|--------|-------|-----------------|----------|-------------|
| Gemma 3 1B | 760 MB | Schnell | Basis | Minimum |
| Llama 3.2 3B | 2 GB | Mäßig | Gut | Empfohlen |
| Gemma 3 4B | 2.3 GB | Mäßig | Hoch | Beste Qualität |

### Übersetzungen (mehrsprachig)

| Modell | Größe | Sprachen | Geschwindigkeit | Qualität |
|--------|-------|----------|-----------------|----------|
| NLLB-200 600M | 340-620 MB | 35+ | Schnell | Gut |
| MADLAD-400 3B | 2 GB | 400+ | Mäßig | Hoch |
| Qwen 2.5 3B | 2 GB | 29+ | Mäßig | Hoch |

### Narrative Generation (Prosa)

| Modell | Größe | Geschwindigkeit | Qualität | Anmerkungen |
|--------|-------|-----------------|----------|-------------|
| Gemma 3 1B | 760 MB | Schnell | Basis | Zu schwach für Narration |
| Llama 3.2 3B | 2 GB | Mäßig | Gut | Minimum für Narration |
| Gemma 3 4B | 2.3 GB | Mäßig | Hoch | Empfohlen |
| Qwen 2.5 7B | 4.4 GB | Langsam | Ausgezeichnet | Beste Qualität |
| YandexGPT 5 Lite 8B | 4.9 GB | Langsam | Ausgezeichnet | Beste für RU-Text |

### Embeddings (semantische Suche)

| Modell | Größe | Dimensionen | Qualität |
|--------|-------|-------------|----------|
| Embedding Gemma 300M | 329 MB | 768 | Basis |
| BGE M3 (Q4_K_M) | 438 MB | 1024 | Gut |
| BGE M3 (Q8_0) | 635 MB | 1024 | Hoch |
| Qwen3 Embedding 0.6B | 639 MB | 1024 | Hoch |

---

## Konfigurationsbeispiele

### Beispiel 1: Budget-VPS (4 GB RAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.2:3b

# Ollama-Einstellungen
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=2
```

**Modelle installieren:**
```bash
ollama pull llama3.2:3b
ollama pull nllb-200-distilled-600m
```

---

### Beispiel 2: Desktop mit GPU (8 GB VRAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.1:8b
WORLD_EMBEDDING_MODEL=bge-m3
WORLD_EMBEDDING_BASE_URL=http://localhost:5002
```

---

### Beispiel 3: Cloud-Hybrid

```bash
# .env — Narrative über Cloud
WORLD_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
WORLD_LLM_MODEL=gemini-2.0-flash
WORLD_LLM_API_KEY=your-key

# Lokal für Übersetzungen (Datenschutz)
OLLAMA_NUM_PARALLEL=1
```

**In den Agent-Einstellungen:**
- Narrator → Google Gemini (Cloud)
- Translation → Ollama NLLB-200 (lokal)
- Intent Parser → Ollama Llama 3.2 3B (lokal)

---

## Leistungstipps

1. **Nur CPU:** Verwenden Sie Q4_K_M-Quantisierung für das beste Geschwindigkeits-/Qualitätsverhältnis
2. **GPU:** Q5_K_M oder Q8_0 für bessere Qualität (wenn VRAM es erlaubt)
3. **Parallele Anfragen:** Setzen Sie `WORLD_LLM_MAX_CONCURRENT=1` auf CPU
4. **Embeddings:** Verwenden Sie Hash-Fallback bei wenig RAM (Embedding-Modell deaktivieren)
5. **Übersetzungen:** NLLB-200 ist für Übersetzungen optimiert, nicht für allgemeinen Chat

---

## Sprachunterstützung

| Modell | Sprachen | Am besten für |
|--------|----------|---------------|
| NLLB-200 | 35+ | Übersetzungen |
| MADLAD-400 | 400+ | Seltene Sprachen |
| Gemma 3 | 140+ | Allgemeines Mehrsprachig |
| Qwen 2.5 | 29+ | Chinesisch, asiatische Sprachen |
| YandexGPT | RU/EN | Russischer Text |
| GigaChat | RU/EN | Russische Narration |
