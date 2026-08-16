# TrueNeverStory v0.32.5 — Guide de compilation

## Démarrage rapide

```bash
# Current platform
./build.sh compile

# Specific target
./build.sh compile linux-x64
./build.sh compile linux-arm64
./build.sh compile macos-arm64
./build.sh compile windows-x64

# Interactive selection
./build.sh select

# All platforms
./build.sh cross
```

## Plateformes prises en charge

| Plateforme | TypeScript | Mojo (.so) | MCP | Backend | Remarques |
|-----------|:----------:|:----------:|:---:|:-------:|---------|
| linux-x64 | ✅ | ✅ | ✅ | mojo | Prise en charge complète |
| linux-arm64 | ✅ | ✅ | ✅ | mojo | Prise en charge complète |
| macos-arm64 | ✅ | ✅ | ✅ | mojo | Apple Silicon |
| macos-x64 | ✅ | ✅ | ✅ | mojo | Intel Mac |
| windows-x64 | ✅ | ❌ | ✅ | typescript | Repli TypeScript |

## MCP — Model Context Protocol

Le MCP fournit aux agents LLM des outils pour interroger des sources de données externes :

| Outil | Source de données | Description |
|------------|----------------|----------|
| `search_verses` | Bible SQLite | Rechercher des versets par texte, livre, référence |
| `get_pattern` | Bible SQLite | Motifs narratifs par archétype/humeur |
| `get_archetype` | Bible SQLite | Détails d'un archétype par nom |
| `get_cross_refs` | Bible SQLite | Références croisées entre versets |
| `get_style_pattern` | Gutenberg SQLite | Motifs stylistiques par humeur/tags |
| `apply_style` | Gutenberg SQLite | Appliquer un style au texte |
| `verify_fact` | Wikipedia API | Vérifier des affirmations factuelles |
| `get_context` | Wikipedia API | Contexte Wikipédia par sujet |
| `get_quest_templates` | Literary Compiler | Modèles de quêtes par archétype |
| `search_quest_templates` | Literary Compiler | Rechercher des quêtes par texte |
| `get_economic_phase` | Economic DB | Phase actuelle du cycle économique |
| `calculate_price` | Economic DB | Calcul de prix tenant compte de la phase |
| `generate_dilemma` | Economic DB | Générer un dilemme de faction |
| `check_jubilee` | Economic DB | Vérifier le cycle du jubilé |

### Compilation des bases de données MCP

Le serveur MCP nécessite des bases de données SQLite compilées :

```bash
# Bible: BSB, LEB, NHEBME + cross-references
bun run scripts/run-bsb-compiler.ts

# Full pipeline (Bible + Literary Compiler)
bun run scripts/run-full-compiler-pipeline.ts

# Bible only
bun run scripts/run-full-bible-compiler.ts

# Cached pipeline (incremental)
bun run scripts/run-cached-pipeline.ts
```

### Structure des données MCP

```
worlds/{active}/
├── bible.db              # BSB + LEB + NHEBME + cross-refs
├── gutenberg.db          # Styles from Project Gutenberg
├── mcp/
│   ├── bible/            # Bible parser cache
│   └── gutenberg/        # Gutenberg parser cache
└── economic.db           # Economic data
```

### Lancer le MCP

Le serveur MCP démarre automatiquement lorsque `bible.db` ou `gutenberg.db` sont trouvés :

```bash
# Automatic start
./bun run src/index.ts

# Check MCP
curl http://localhost:8000/health  # → "status": "ok"
```

### Catalogue web Gutenberg

Via la Console MCP (`/mcp.html`), vous pouvez télécharger vos auteurs préférés depuis Project Gutenberg pour améliorer le style d'écriture :

1. Ouvrez l'onglet « Catalogue »
2. Saisissez des noms d'auteurs ou un sujet
3. Parcourez, filtrez et sélectionnez des livres
4. Téléchargez — les styles sont extraits automatiquement pour l'agent styliste

Consultez le **[Guide de la Console MCP](MCP-HELP.md)** (7 langues) pour plus de détails.

## Repli automatique

Le serveur détecte automatiquement la disponibilité de Mojo :

```
.so files present  → Backend: mojo       (fast, ~10-50x for vectors)
.so files absent   → Backend: typescript  (works, slower)
```

Vérifiez le backend actuel :
```bash
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
```

### Ce qui fonctionne sans Mojo

| Composant | Backend Mojo | Repli TypeScript | Différence |
|-----------|:------------:|:-------------------:|---------|
| Probabilité (combat, romance) | Mojo FFI | TypeScript | ~2-5x |
| Similarité vectorielle | Mojo FFI | TypeScript | ~10-50x |
| Produit scalaire | Mojo FFI | TypeScript | ~5-10x |
| Chat / Jeu de rôle | TypeScript | TypeScript | 0% |
| Système de mémoire | TypeScript + Mojo | TypeScript uniquement | Recherche plus lente |
| Quêtes / Directeur | TypeScript | TypeScript | 0% |
| MCP Bible/Gutenberg | TypeScript | TypeScript | 0% |
| MCP Wikipédia | HTTP | HTTP | 0% |

**Conclusion :** la version Windows est entièrement fonctionnelle. La seule différence est la performance de calcul.

## Structure de build

```
dist/
├── linux-arm64/
│   ├── tns-server              # Standalone binary
│   ├── libtns_kernels.so       # Mojo: probabilities
│   ├── libtns_vectors.so       # Mojo: vector operations
│   ├── libtns_graph_ops.so     # Mojo: graph operations
│   ├── libtns_batch_ops.so     # Mojo: batch operations
│   └── .env                      # Configuration
├── linux-x64/
│   └── ...
├── macos-arm64/
│   └── ...
├── macos-x64/
│   └── ...
└── windows-x64/
    ├── tns-server.exe          # TypeScript only (fallback)
    └── .env
```

## Ce dont l'utilisateur a besoin

1. Téléchargez le dossier correspondant à votre plateforme
2. Configurez `.env` (endpoint LLM, mot de passe)
3. Copiez `conf/` depuis la racine du projet (ou créez-le manuellement)
4. Exécutez :

```bash
# Linux/macOS
./tns-server

# Windows
tns-server.exe
```

**Non requis :** Bun, Node.js, Python, Mojo, compilateurs.

Pour que le MCP fonctionne, vous devez en outre compiler les bases de données (voir la section MCP ci-dessus).

## Modèles d'embedding (serveur local)

Pour la recherche vectorielle et la similarité sémantique, vous pouvez lancer un llama-server séparé avec un modèle d'embedding :

```bash
# BGE M3 — multilingual (100+ languages, 8192 tokens)
./llama-server -m local-models/bge-m3-Q8_0.gguf --embedding --pooling mean --port 8081

# Qwen3 Embedding 0.6B — compact and fast
./llama-server -m local-models/Qwen3-Embedding-0.6B-Q8_0.gguf --embedding --pooling mean --port 8081

# KaLM Embedding Gemma3 12B — maximum quality
./llama-server -m local-models/KaLM-Embedding-Gemma3-12B-2511.Q4_K_M.gguf --embedding --pooling mean --port 8081
```

Dans `.env`, indiquez :
```ini
EMBED_MODEL=bge-m3-Q8_0
EMBED_SERVER_PORT=8081
```

> **Important :** les options `--embedding` et `--pooling mean` sont requises pour que les modèles d'embedding fonctionnent correctement. Sans elles, llama-server s'exécute comme un LLM classique et produit du texte au lieu de vecteurs.

| Modèle | Taille | Langues | Contexte | Recommandation |
|--------|--------|-------|----------|--------------|
| BGE M3 (Q8_0) | ~635 MB | 100+ | 8192 | Meilleure couverture linguistique |
| BGE M3 (Q4_K_M) | ~438 MB | 100+ | 8192 | Équilibre taille/qualité |
| Qwen3 Embedding 0.6B | ~639 MB | Multi | — | Le plus rapide |
| Embedding Gemma 300M | ~329 MB | EN+ | — | Taille minimale |
| KaLM Gemma3 12B (Q4_K_M) | ~7.3 GB | Multi | — | Qualité maximale |

## Configuration requise

| OS | Version minimale | Architecture | Mojo | MCP |
|----|-------------------|-------------|:----:|:---:|
| Linux | glibc 2.34+ (Ubuntu 22.04+, Debian 12+, RHEL 9+) | x86_64, ARM64 | ✅ | ✅ |
| macOS | 11 Big Sur+ | x86_64, ARM64 (Apple Silicon) | ✅ | ✅ |
| Windows | 10+ (64 bits) | x86_64 | ❌ | ✅ |

## Windows — Détails

La version Windows s'exécute via le **repli TypeScript** :

- `tns-server.exe` — binaire autonome, s'exécute sans installation
- Les fichiers `.so` Mojo ne sont pas compilés (Mojo ne prend pas en charge Windows/MSVC)
- Tous les calculs s'exécutent en TypeScript — plus lent, mais fonctionnellement identique
- Le MCP fonctionne pleinement (TypeScript)
- WSL2 n'est pas requis — exécution Windows native

### Performances Windows

Pour la plupart des scénarios, la différence est négligeable :
- Chat et jeu de rôle — identiques (TypeScript)
- Probabilité — différence négligeable (<1ms)
- Recherche vectorielle — plus lente avec de gros volumes de données (>10K souvenirs)
- MCP — identique (TypeScript + HTTP)

Pour des performances maximales sous Windows :
1. **Serveur externe** sous Linux
2. **Scénarios typiques** — la différence est négligeable

## Compilation manuelle

### TypeScript (Bun)

```bash
# Current platform
bun build --compile --outfile dist/tns-server src/index.ts

# Windows (from Linux via cross-compilation)
bun build --compile \
  --compile-executable-path dist/.bun-cache/bun-windows-x64 \
  --outfile dist/windows-x64/tns-server.exe \
  src/index.ts
```

### Mojo (.so pour FFI)

```bash
# Linux/macOS only (not Windows!)
mojo build --emit shared-lib -O3 \
  -o dist/libtns_kernels.so \
  mojo/kernels/probability_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_vectors.so \
  mojo/kernels/vector_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_graph_ops.so \
  mojo/kernels/graph_ops.c

mojo build --emit shared-lib -O3 \
  -o dist/libtns_batch_ops.so \
  mojo/kernels/batch_ops.c
```

### Compilation croisée

Les fichiers `.so` Mojo ne peuvent pas être compilés en croisé de manière fiable. Il est recommandé de **compiler sur la plateforme cible**.

### Compiler Windows depuis Linux

```bash
# TypeScript + .env (no Mojo)
./build.sh compile windows-x64

# Result: dist/windows-x64/
#   tns-server.exe   — standalone binary
#   .env               — configuration
```

## Débogage

```bash
# Check the backend
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
# → "mojo" or "typescript"

# Check that the binary works
./dist/linux-arm64/tns-server --help

# Check .so symbols
nm -D dist/linux-arm64/libtns_kernels.so | grep tns

# Check FFI from TypeScript
bun run -e "
  import { computeSuccessChance } from './src/lib/mojo-ffi';
  console.log(computeSuccessChance(0.8, 0.3, 0.5, 0.1));
"

# Check the binary's platform
file dist/linux-arm64/tns-server

# Check MCP (databases required)
bun run scripts/run-bsb-compiler.ts
curl http://localhost:8000/health
```

## Pipeline Gutenberg

### Prérequis
- Fichiers .txt téléchargés dans `data/gutenberg/texts/`
- (Optionnel) `data/mcp/gutenberg-catalog.db` pour l'enrichissement des métadonnées

### Importer les textes
```bash
bun run scripts/import-gutenberg-texts.ts
```
Crée `data/gutenberg/classics.db` à partir des fichiers .txt + du catalogue.

### Pipeline de traitement
```bash
# Phase A only (rule-based, no LLM)
bun run scripts/process-gutenberg.ts --phase v1

# Phase B only (LLM-enriched)
bun run scripts/process-gutenberg.ts --phase v2

# Both phases
bun run scripts/process-gutenberg.ts --phase all
```

### Étendre le corpus
```bash
bun run scripts/expand-corpus.ts --authors "Dickens,Tolstoy" --target 3
bun run scripts/expand-corpus.ts --authors "Hemingway" --dry-run
```
