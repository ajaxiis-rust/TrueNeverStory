# Exigences matérielles et recommandations de modèles

TrueNeverStory est flexible — vous pouvez l'exécuter sur n'importe quoi, d'un Raspberry Pi à un serveur multi-GPU. Choisissez votre configuration en fonction du matériel disponible.

---

## Exigences minimales

| Composant | Minimum | Recommandé |
|-----------|---------|------------|
| **RAM** | 4 Go | 8+ Go |
| **CPU** | 2 cœurs | 4+ cœurs |
| **Stockage** | 2 Go | 10+ Go |
| **GPU** | Non requis | Tout GPU avec VRAM |

---

## Profils de configuration

### Profil 1: Ultra-léger (2-4 Go RAM)

**Cas d'utilisation:** Vieux laptop, VPS, Raspberry Pi 4+

```
Intent Parser:    Gemma 3 1B (Q4_K_M) — 760 Mo
Traductions:      NLLB-200 600M (Q4_K_M) — 340 Mo
Narrative Gen:    API Cloud (Gemini Flash)
Embeddings:       Fallback hash (pas de modèle nécessaire)
```

**RAM totale:** ~1.1 Go  
**Vitesse:** Lent (3-5 tok/s sur CPU)  
**Qualité:** Acceptable  
**Confidentialité:** Partielle (narratif via le cloud)

---

### Profil 2: Équilibré (4-8 Go RAM)

**Cas d'utilisation:** Laptop moderne, desktop, petit serveur`

```
Tout-en-un:       Llama 3.2 3B (Q4_K_M) — 2 Go
                  OU Qwen 2.5 3B (Q4_K_M) — 2 Go
Traductions:      NLLB-200 600M (Q4_K_M) — 340 Mo
Embeddings:       BGE M3 (Q4_K_M) — 438 Mo
```

**RAM totale:** ~2.8 Go  
**Vitesse:** Modéré (5-10 tok/s sur CPU)  
**Qualité:** Bonne  
**Confidentialité:** Totale (tout local)

---

### Profil 3: Qualité (8-16 Go RAM)

**Cas d'utilisation:** PC gaming, workstation, serveur dédié`

```
Tout-en-un:       Gemma 3 4B (Q4_K_M) — 2.3 Go
                  OU Qwen 2.5 7B (Q4_K_M) — 4.4 Go
Traductions:      NLLB-200 600M (Q8_0) — 620 Mo
Embeddings:       BGE M3 (Q8_0) — 635 Mo
```

**RAM totale:** ~3.6-5.5 Go  
**Vitesse:** Bonne (10-20 tok/s sur CPU, 30+ sur GPU)  
**Qualité:** Élevée  
**Confidentialité:** Totale

---

### Profil 4: Accéléré par GPU (4+ Go VRAM)

**Cas d'utilisation:** PC gaming avec GPU, workstation avec GPU dédié`

```
LLM:              Llama 3.1 8B (Q4_K_M) — 5 Go VRAM
Traductions:      Même modèle (multilingue)
Embeddings:       BGE M3 (Q8_0) — CPU offload
```

**VRAM totale:** ~5 Go  
**Vitesse:** Rapide (30-50 tok/s)  
**Qualité:** Excellente  
**Confidentialité:** Totale

---

## Recommandations de modèles par tâche

### Intent Parser (reconnaissance de commandes)

| Modèle | Taille | Vitesse | Qualité | Notes |
|--------|--------|---------|---------|-------|
| Gemma 3 1B | 760 Mo | Rapide | Basique | Minimum |
| Llama 3.2 3B | 2 Go | Modéré | Bon | Recommandé |
| Gemma 3 4B | 2.3 Go | Modéré | Élevé | Meilleure qualité |

### Traductions (multilingue)

| Modèle | Taille | Langues | Vitesse | Qualité |
|--------|--------|---------|---------|---------|
| NLLB-200 600M | 340-620 Mo | 35+ | Rapide | Bon |
| MADLAD-400 3B | 2 Go | 400+ | Modéré | Élevé |
| Qwen 2.5 3B | 2 Go | 29+ | Modéré | Élevé |

### Génération narrative (prose)

| Modèle | Taille | Vitesse | Qualité | Notes |
|--------|--------|---------|---------|-------|
| Gemma 3 1B | 760 Mo | Rapide | Basique | Trop faible pour la narration |
| Llama 3.2 3B | 2 Go | Modéré | Bon | Minimum pour la narration |
| Gemma 3 4B | 2.3 Go | Modéré | Élevé | Recommandé |
| Qwen 2.5 7B | 4.4 Go | Lent | Excellente | Meilleure qualité |
| YandexGPT 5 Lite 8B | 4.9 Go | Lent | Excellente | Meilleur pour le texte RU |

### Embeddings (recherche sémantique)

| Modèle | Taille | Dimensions | Qualité |
|--------|--------|------------|---------|
| Embedding Gemma 300M | 329 Mo | 768 | Basique |
| BGE M3 (Q4_K_M) | 438 Mo | 1024 | Bon |
| BGE M3 (Q8_0) | 635 Mo | 1024 | Élevé |
| Qwen3 Embedding 0.6B | 639 Mo | 1024 | Élevé |

---

## Exemples de configuration

### Exemple 1: VPS budget (4 Go RAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.2:3b

# Paramètres Ollama
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=2
```

**Installation des modèles:**
```bash
ollama pull llama3.2:3b
ollama pull nllb-200-distilled-600m
```

---

### Exemple 2: Desktop avec GPU (8 Go VRAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.1:8b
WORLD_EMBEDDING_MODEL=bge-m3
WORLD_EMBEDDING_BASE_URL=http://localhost:5002
```

---

### Exemple 3: Hybride cloud

```bash
# .env — Narratif via le cloud
WORLD_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
WORLD_LLM_MODEL=gemini-2.0-flash
WORLD_LLM_API_KEY=your-key

# Local pour les traductions (confidentialité)
OLLAMA_NUM_PARALLEL=1
```

**Dans les paramètres des agents:**
- Narrator → Google Gemini (cloud)
- Translation → Ollama NLLB-200 (local)
- Intent Parser → Ollama Llama 3.2 3B (local)

---

## Conseils de performance

1. **CPU uniquement:** Utilisez la quantification Q4_K_M pour le meilleur rapport vitesse/qualité
2. **GPU:** Q5_K_M ou Q8_0 pour une meilleure qualité (si la VRAM le permet)
3. **Requêtes parallèles:** Définissez `WORLD_LLM_MAX_CONCURRENT=1` sur CPU
4. **Embeddings:** Utilisez le fallback hash si la RAM est limitée (désactivez le modèle d'embedding)
5. **Traductions:** NLLB-200 est optimisé pour la traduction, pas pour le chat général

---

## Moteurs : Ollama vs llama.cpp

TrueNeverStory prend en charge les deux moteurs, mais **recommande llama.cpp** pour le déploiement local.

### Pourquoi llama.cpp plutôt qu'Ollama

| | Ollama | llama.cpp |
|--|--------|-----------|
| **Contrôle mémoire** | Le démon consomme **toute la RAM disponible** pour le cache des modèles | Limité explicitement via `--ctx-size`, `--threads`, `--parallel` |
| **Cœurs CPU** | Utilise tous les cœurs, le système peut ralentir | `startgame.sh` laisse **au moins 1 cœur** pour l'OS |
| **Contrôle** | Minimal — le démon décide de tout | Total — chaque paramètre est configurable |
| **Serveur** | Tourne en tant que démon (toujours actif) | Démarré par le script, s'arrête avec le jeu |
| **Modèles** | `ollama pull` — pratique mais le cache grossit | Fichiers `.gguf` dans `local-models/` — téléchargement manuel |
| **API** | Compatible OpenAI (`localhost:11434/v1`) | Même protocole (`127.0.0.1:5001/v1`) |

### Comment startgame.sh configure llama.cpp

Le script détecte automatiquement le matériel et adapte les paramètres :

| Matériel | Threads | Parallèle | Contexte |
|----------|---------|-----------|----------|
| 2-4 cœurs, ≤4 Go RAM | CPU-1 | 1 | 4096 |
| 4-8 cœurs, ≤8 Go RAM | CPU-2 | 2 | 8192 |
| 8+ cœurs, ≤16 Go RAM | 6 | 3 | 16384 |
| GPU 4+ Go VRAM | 6 | 3 | 16384 |
| GPU 8+ Go VRAM | 6 | 3 | 32768 |

**Point clé :** le script réserve toujours des ressources pour le système — le démon Ollama ne le fait pas.

### Serveur d'embeddings (processus séparé)

Pour la recherche sémantique, `startgame.sh` lance un **serveur séparé** avec les flags `--embedding --pooling mean` :

```bash
llama-server --model BGE-M3.gguf --port 5002 \
    --embedding --pooling mean --threads 1
```

Ces flags sont **obligatoires** — sans eux le serveur fonctionne comme un LLM classique et produit du texte au lieu de vecteurs.

### Ordre de détection automatique des fournisseurs

`startgame.sh` vérifie les fournisseurs par ordre de priorité :

1. **Ollama** (port 11434) — si installé et démon actif
2. **LM Studio** (port 1234)
3. **vLLM** (port 8080)
4. **OpenAI API** — si `OPENAI_API_KEY` est défini
5. **llama.cpp** — si le binaire `llama-server` + des fichiers `.gguf` existent dans `local-models/`

**Astuce :** pour utiliser llama.cpp au lieu d'Ollama, arrêtez le démon Ollama (`ollama stop`) avant le lancement — le script trouvera alors llama.cpp.

### Structure de fichiers recommandée

```
local-models/
├── Qwen2.5-7B-Q4_K_M.gguf      # LLM pour la narration
├── BGE-M3-Q8_0.gguf             # Embeddings pour la recherche
└── NLLB-200-600M-Q4_K_M.gguf   # Traductions (optionnel)
```

---

## Support des langues

| Modèle | Langues | Meilleur pour |
|--------|---------|---------------|
| NLLB-200 | 35+ | Traductions |
| MADLAD-400 | 400+ | Langues rares |
| Gemma 3 | 140+ | Multilingue général |
| Qwen 2.5 | 29+ | Chinois, langues asiatiques |
| YandexGPT | RU/EN | Texte russe |
| GigaChat | RU/EN | Narration russe |
