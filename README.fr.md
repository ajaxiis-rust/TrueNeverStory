# TrueNeverStory v0.15.0

### Écris ton livre en jouant.

TrueNeverStory est un moteur de narration interactive propulsé par l'IA. Chaque PNJ se souvient, chaque action a une chance, et l'histoire ne s'arrête jamais. Joue un personnage, explore un monde vivant, et regarde tes choix façonner le récit — ou laisse le monde évoluer seul.

Construit sur TypeScript (Bun + Hono) avec des noyaux de calcul C FFI pour les opérations critiques.

---

## Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| **Monde vivant** | Personnages, lieux, objets, factions — tous connectés dans un graphe de connaissances O(1) |
| **14 agents IA** | Narrateur, Directeur, PNJ, Scène, Chroniqueur, Scénariste, Vilain, Chercheur, Historien, Cartographe, Marchand, Donneur de quêtes, Gardien du savoir, Sim. sociale |
| **Mémoire & RAG** | Recherche vectorielle (BGE-M3 + SQLite hybride FTS5/dense/RRF) |
| **Système de probabilité** | Résultats déterministes pour combat, persuasion, discrétion, romance |
| **Romance & Social** | Gestion des relations, factions, alliances, hiérarchie féodale, dialogues PNJ |
| **Système de quêtes** | Génération dynamique, objectifs, récompenses, chaînes, limites de temps |
| **Inventaire & Commerce** | Objets avec rareté, stats, équipement, or, commerce avec PNJ |
| **Économie PNJ** | Hiérarchie féodale (10 rangs), impôts, production alimentaire, système familial, 34 archétypes |
| **Streaming temps réel** | WebSocket + SSE pour la diffusion du récit |
| **i18n (7 langues)** | EN, RU, DE, FR, ES, JA, ZH |
| **Auth par mot de passe** | Sessions HttpOnly cookies, protection CSRF |
| **Stockage SQLite** | Entités, embeddings, mémoire, prompts, traductions |

---

## Plateformes supportées

| Plateforme | Statut | Notes |
|------------|:------:|-------|
| Linux x86_64 | ✅ | Support complet, noyaux FFI |
| Linux ARM64 | ✅ | Support complet, noyaux FFI |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

---

## Démarrage rapide

**Aucun Bun, Node.js ou autre runtime nécessaire.** Télécharge et lance.

### 1. Télécharger

Dernière release pour votre plateforme sur [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest) :

| Plateforme | Fichier |
|------------|---------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Lancer

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

### 3. Ouvrir

Aller sur **http://localhost:8000** — mot de passe : **`changeme`**

Changez le mot de passe dans les paramètres après la première connexion.

C'est tout. Pas de base de données, pas d'installation de packages, pas de fichiers de configuration.

---

## Configurer le LLM

Ouvrir la page **Settings** ou éditer `.env` :

### Ollama (local, gratuit)

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

Fonctionne aussi avec vLLM, Anthropic, Google et toute API compatible OpenAI.

---

## Structure du projet

```
TrueNeverStory/
├── src/
│   ├── config/           # Configuration validée par Zod
│   ├── lib/              # Client LLM, SQLite store, opérations vectorielles
│   ├── memory/           # WorldMemory, pipeline cognitif
│   ├── middleware/        # Auth, rate limiter, en-têtes sécurité
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── routes/           # Routes API (chat, entities, agents, settings)
│   ├── services/         # 52 services (moteur de jeu, agents, économie)
│   ├── intelligence/     # Analyse de graphe, détection de doublons
│   ├── i18n/             # Packs de langues (7 langues)
│   ├── store/            # EntityStore avec index O(1)
│   └── utils/            # Logger, hash, sanitize, templates
├── mojo/kernels/         # Noyaux de calcul C FFI (compilés via Zig)
├── public/              # Interface web (style terminal)
├── worlds/              # Données du monde (SQLite, entités, sessions)
├── conf/                # Configuration
└── tests/               # Suite de tests
```

---

## API

### Authentification

| Méthode | Point d'accès | Description |
|---------|---------------|-------------|
| GET | `/login` | Page de connexion |
| POST | `/login` | Authentification |
| POST | `/logout` | Déconnexion |

### Chat & Jeu de rôle

| Méthode | Point d'accès | Description |
|---------|---------------|-------------|
| POST | `/api/chat/setup` | Initialiser la session |
| POST | `/api/chat/message` | Envoyer un message |
| POST | `/api/chat/stream` | Streaming SSE |
| GET | `/api/chat/session` | État de la session |
| GET | `/api/chat/history` | Historique |

### Entités & Graphe

| Méthode | Point d'accès | Description |
|---------|---------------|-------------|
| GET | `/api/entity/:uid` | Détails de l'entité |
| GET | `/api/neighbors/:uid` | Voisins avec profondeur |
| GET | `/api/search?q=` | Recherche par nom ou sémantique |
| GET | `/api/graph/summary` | Statistiques du graphe |

### Agents & i18n

| Méthode | Point d'accès | Description |
|---------|---------------|-------------|
| GET | `/api/agents` | Configurations des agents |
| PUT | `/api/agents/:id` | Mettre à jour un agent |
| PUT | `/api/agents/:id/prompts/:lang` | Prompts par langue |
| GET | `/api/i18n/translations/:lang/:page` | Traductions |

### WebSocket

| Point d'accès | Description |
|---------------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Streaming de jeu de rôle en temps réel |

---

## Exemples

```bash
# Connexion
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# Configurer la session
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# Envoyer un message
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Je dégaine mon épée et affronte le dragon"}'
```

---

## Pour les développeurs

### Prérequis

- [Bun](https://bun.sh) v1.0+

### Installation

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

### Commandes

| Commande | Description |
|----------|-------------|
| `bun run dev` | Développement avec hot reload |
| `bun run start` | Mode production |
| `bun run lint` | Vérification des types |
| `bun test` | Tests |
| `bun run build` | Construire le bundle |

---

## Compilation des binaires

Cross-compilation via Zig :

```bash
cd mojo/kernels
./build.sh native           # Plateforme actuelle
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # Toutes les cibles
```

Voir [COMPILE.md](COMPILE.md). GitHub Actions compile toutes les plateformes automatiquement.

---

## Changements récents

### v0.15.0 — Renforcement de la sécurité

- Sessions SQLite (survivent aux redémarrages)
- Validation du token WebSocket
- Protection contre le path traversal
- Protection CSRF sur le formulaire de connexion
- Cookie Secure, CSP renforcé
- Messages d'erreur sanitizés

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

### v0.14.1 — Noyaux C FFI & Cross-Compilation

- 5 noyaux de calcul portés de Mojo vers du C pur
- Cross-compilation Zig pour 10 plateformes
- Pause/Resume du traitement en arrière-plan

---

## Licence

Apache 2.0
