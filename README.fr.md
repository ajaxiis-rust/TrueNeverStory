# TrueNeverStory v0.11.2 – Plateforme de jeux narratifs interactifs

**TrueNeverStory v0.11.2** est une réimplémentation moderne de la plateforme de mondes fantastiques [BRING](https://github.com/Eva-E1/BRING), migrée de Python vers une stack hybride haute performance :

- **TypeScript (Bun + Hono)** – Serveur web, API, WebSocket, routage, auth, streaming, logique métier
- **Mojo FFI** – Noyaux de calcul pour les probabilités et opérations vectorielles (optionnel, avec fallback TypeScript)

> *«D'un seul prompt à un monde vivant et respirant – où chaque NPC se souvient, chaque action a une chance, et l'histoire ne s'arrête jamais.»*

---

## Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| **Construction à couches du monde** | Chaque entité (personnage, lieu, objet, faction) a trois couches : L1 (classification), L2 (détails), L3 (secrets) |
| **Savoir en graphe** | Toutes les relations dans un graphe orienté avec recherche O(1), parcours BFS, gestion des branches |
| **Mémoire auto-optimisée** | Mémoire accélérée par vecteurs avec pipeline cognitif (extraction d'entités, détection de contradictions, signaux de douleur) |
| **RAG pour tous les agents** | Support complet des embeddings via llama.cpp (BGE-M3) + recherche hybride SQLite (FTS5 + vecteurs denses + RRF) |
| **Système de probabilités** | Résultats déterministes pour combat, persuasion, discrétion, romance avec modificateurs dynamiques |
| **Système de romance** | Gestion complète des relations amoureuses avec actions probabilistes |
| **Directeur vivant** | Agent en arrière-plan qui développe les arcs narratifs, plans de méchants, interactions NPC |
| **Jeu de rôle immersif** | Narration à la troisième personne, dialogues NPC, transitions de scènes – LLM ne parle jamais pour votre personnage |
| **Système de quêtes** | Génération dynamique de quêtes et suivi d'objectifs |
| **Planificateur du2019histoire** | Planification dynamique par LLM, génération en deux phases, replanification adaptative |
| **Agent Chercheur** | Vérification de faits, validation du réalisme, précision historique pour recettes, personnages et scènes |
| **Intelligence NPC** | Recherche en mémoire, comportement autonome, relations sociales, contexte de dialogue enrichi |
| **Économie NPC** | Hiérarchie féodale (10 rangs), taxes, pots-de-vin, production alimentaire, système familial, vices, 34 archétypes |
| **Système d'objets** | Objets uniques avec bonus permanents de stats (1-10%), évalués par les agents Historien/Chercheur |
| **14 agents spécialisés** | Narrateur, Réalisateur, Scène, PNJ, Chroniqueur, Planificateur, Sim. sociale, Méchant, Chercheur, Historien, Cartographe, Marchand, Donneur de quêtes, Gardien des connaissances |
| **WebSocket en temps réel** | Streaming de jeu de rôle en direct et événements de mémoire |
| **SSE Streaming** | Livraison progressive de récit via Server-Sent Events |
| **i18n (7 langues)** | Localisation complète : EN, RU, DE, FR, ES, JA, ZH – interface, prompts, noms d'agents |
| **Stockage SQLite** | Les prompts d'agents et les chaînes UI sont stockés dans SQLite par monde + langue |
| **Auth par mot de passe** | Authentification basée sur des sessions avec HttpOnly cookies |
| **Interface Terminal** | Belle interface web sombre de style terminal |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Navigateur (Terminal UI)              │
│              WebSocket + REST + SSE                      │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────▼─────────────────────────────────┐
│              TypeScript (Bun + Hono)                     │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ HTTP API │ │WebSocket │ │SSE Stream│ │   Auth     │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬──────┘  │
│       └─────────────┼───────────┼─────────────┘         │
│  ┌──────────────────▼───────────▼─────────────────────┐  │
│  │              Couche Services                       │  │
│  │  RoleplayEngine │ ProbabilityEngine │ RomanceEngine│  │
│  │  QuestManager   │ WorldClock        │ Director     │  │
│  │  StoryPlanner   │ VillainManager    │ SocialSim    │  │
│  │  ResearcherAgent│ CrafterAgent      │ Chronicler   │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           Système de mémoire (WorldMemory)          │  │
│  │  VectorIndex │ CognitivePipeline │ EntityExtractor │  │
│  │  Scoring     │ Partitions        │ WriteBuffer     │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           Couche de données (EntityStore + JSON)    │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │      Mojo FFI (optionnel, détection automatique)   │  │
│  │  Noyaux de probabilité │ Opérations vectorielles  │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP (compatible OpenAI)
┌───────────────────────▼─────────────────────────────────┐
│              API LLM externe (Ollama, OpenAI, etc.)      │
└─────────────────────────────────────────────────────────┘
```

---

## Démarrage rapide

### Prérequis

- [Bun](https://bun.sh) v1.0+ (pour le développement)
- Une API LLM compatible OpenAI (OpenAI, Ollama, vLLM, LM Studio, etc.)

Pour le binaire compilé — rien n'est nécessaire, lancez directement.

### 1. Installation

```bash
cd TNS
bun install
```

### 2. Configuration du LLM

Ouvrez `http://localhost:8000/settings` et configurez votre fournisseur LLM :

- **Ollama** (local) : `http://localhost:11434/v1`, modèle : `llama3`
- **OpenAI** : `https://api.openai.com/v1`, modèle : `gpt-4o-mini`
- **vLLM** (local) : `http://localhost:8000/v1`
- **LM Studio** : `http://localhost:1234/v1`

Ou éditez `conf/settings.json` directement.

### 3. Lancement

```bash
bun run dev
```

Ouvrez `http://localhost:8000` et connectez-vous avec le mot de passe : **`changeme`**

Changez le mot de passe dans les paramètres après la première connexion.

### Binaire (sans dépendances)

```bash
# Téléchargez depuis GitHub Releases, puis :
chmod +x tns-server
./tns-server
# Connexion : http://localhost:8000 — mot de passe : changeme
```

---

## Exemples d'utilisation

### Démarrer depuis le binaire (sans dépendances)

Téléchargez la dernière version pour votre plateforme et lancez directement :

```bash
# Linux / macOS
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

Pas besoin de Bun, Node.js ou d'un autre runtime. Configurez simplement `.env` et lancez.

### Démarrer depuis les sources (développement)

```bash
# Mode développement avec rechargement à chaud
bun run dev

# Mode production (sans rechargement)
bun run start

# Créer le bundle (sans binaire)
bun run build
```

### Démarrer avec un LLM local (Ollama)

```bash
# 1. Démarrer Ollama avec un modèle
ollama pull llama3
ollama serve

# 2. Configurer TNS pour Ollama
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

# 3. Démarrer le serveur
./tns-server
```

### Démarrer avec l'API OpenAI

```bash
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

./tns-server
```

### Exemples d'appels API

```bash
# Authentification
curl -c cookies.txt -X POST http://localhost:8000/login \
  -d "password=mypassword"

# Démarrer une nouvelle session
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# Envoyer un message et obtenir le récit
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Je dégaine mon épée et fais face au dragon"}'

# Réponse en streaming (SSE)
curl -b cookies.txt -N http://localhost:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Parle-moi de cette forêt ancienne"}'

# Rechercher des entités
curl -b cookies.txt "http://localhost:8000/api/search?q=dragon"

# Obtenir les détails d'une entité
curl -b cookies.txt http://localhost:8000/api/entity/uid-character-aragorn

# Obtenir les voisins du graphe
curl -b cookies.txt "http://localhost:8000/api/neighbors/uid-location-rivendell?depth=2"

# Vérifier la probabilité
curl -b cookies.txt http://localhost:8000/api/probability/aragorn/combat

# Lister les quêtes
curl -b cookies.txt http://localhost:8000/api/quests
```

### WebSocket pour le jeu de rôle en temps réel

```javascript
// Connexion WebSocket
const ws = new WebSocket('ws://localhost:8000/ws/roleplay/session-id');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'message',
    content: 'J\'entre dans l\'auberge et regarde autour de moi'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.narrative); // Flux narratif en temps réel
};
```

### Compiler depuis les sources

```bash
# Installer Mojo (optionnel, pour les noyaux de performance)
curl https://get.modular.com | sh
modular install mojo

# Compiler pour la plateforme actuelle
./build.sh compile

# Compiler pour une plateforme spécifique
./build.sh compile linux-x64
./build.sh compile macos-arm64

# Compilation croisée pour toutes les plateformes
./build.sh cross

# Voir COMPILE.md pour les détails
```

---

## Points de terminaison API

### Authentification

| Méthode | Point de terminaison | Description |
|---------|---------------------|-------------|
| GET | `/login` | Page de connexion |
| POST | `/login` | Authentification (formulaire : `password=...`) |
| POST | `/logout` | Effacer la session |

### Chat

| Méthode | Point de terminaison | Description |
|---------|---------------------|-------------|
| POST | `/api/chat/setup` | Initialiser la session de jeu de rôle |
| POST | `/api/chat/message` | Envoyer un message, obtenir le récit |
| POST | `/api/chat/stream` | Réponse SSE en streaming |
| GET | `/api/chat/session` | État actuel de la session |
| GET | `/api/chat/history` | Historique des conversations |

### Entités et Graphe

| Méthode | Point de terminaison | Description |
|---------|---------------------|-------------|
| GET | `/api/entity/:uid` | Détails de l'entité |
| GET | `/api/neighbors/:uid` | Voisins avec profondeur |
| GET | `/api/path` | Trouver le plus court chemin |
| GET | `/api/search` | Recherche par nom ou sémantique |
| GET | `/api/graph/summary` | Statistiques du graphe |

### Branches

| Méthode | Point de terminaison | Description |
|---------|---------------------|-------------|
| POST | `/api/branch/create` | Créer une branche |
| POST | `/api/branch/switch` | Changer de branche active |
| POST | `/api/branch/merge` | Fusionner dans main |
| GET | `/api/branch/list` | Lister toutes les branches |

### Probabilités

| Méthode | Point de terminaison | Description |
|---------|---------------------|-------------|
| GET | `/api/probability/:character/:profile` | Chance de succès |
| POST | `/api/probability/modifier` | Appliquer un modificateur |
| GET | `/api/probability/modifiers/:entity` | Modificateurs actifs |

### Romance

| Méthode | Point de terminaison | Description |
|---------|---------------------|-------------|
| GET | `/api/romance/:c1/:c2` | Statut de la relation |
| POST | `/api/romance/attempt/:action` | Tenter une action romantique |
| GET | `/api/romance/characters/:char` | Lister les romances du personnage |

### Quêtes

| Méthode | Point de terminaison | Description |
|---------|---------------------|-------------|
| GET | `/api/quests` | Lister toutes les quêtes |
| GET | `/api/quest/:id` | Détails de la quête |

### Sessions et Maintenance

| Méthode | Point de terminaison | Description |
|---------|---------------------|-------------|
| GET | `/api/sessions` | Historiques de sessions |
| POST | `/api/maintenance/run` | Lancer la maintenance |
| GET | `/api/maintenance/status` | Statistiques de maintenance |
| POST | `/api/launch` | Nouvelle partie |
| POST | `/api/continue` | Reprendre la partie |
| GET | `/api/health` | Vérification de santé |

### Agents

| Méthode | Point de terminaison | Description |
|---------|---------------------|-------------|
| GET | `/api/agents` | Lister toutes les configurations d'agents |
| GET | `/api/agents/:id` | Configuration d'un agent |
| PUT | `/api/agents/:id` | Mettre à jour la configuration |
| PUT | `/api/agents/:id/prompts` | Mettre à jour les prompts |
| POST | `/api/agents/:id/reset` | Réinitialiser aux valeurs par défaut |
| GET | `/api/agents/providers/options` | Options fournisseurs/modèles |

### WebSocket

| Point de terminaison | Description |
|---------------------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Jeu de rôle en temps réel |
| `ws://host:8000/ws/memory` | Fil d'événements de mémoire |

---

## Structure du Projet

```
TrueNeverStory/
├── src/
│   ├── config/           # Configuration validée par Zod
│   ├── lib/              # Client LLM, queue, event bus, historique, I/O atomique
│   ├── memory/           # WorldMemory, index FAISS, pipeline cognitif, scoring
│   ├── middleware/        # Auth, CORS, gestion d'erreurs, logger, rate limiter
│   ├── models/           # Entity, chat, probability, romance, quest, story, memory
│   ├── routes/           # 16 modules de routes (chat, entities, agents etc.)
│   ├── services/         # 42 services (moteur de jeu de rôle, agents, probabilités etc.)
│   ├── intelligence/     # Analyse de graphe, doublons, recommandations, générateur de scènes
│   ├── i18n/             # Packs de langues (EN, RU, DE, FR, ES, JA, ZH)
│   ├── store/            # EntityStore avec NameIndex O(1)
│   ├── utils/            # Logger, hash, utilitaires de temps
│   ├── app.ts            # App Hono avec chaîne de middleware
│   └── index.ts          # Point d'entrée du serveur
├── mojo/
│   ├── kernels/          # Noyaux FFI probabilités et vecteurs
│   └── src/              # 81 fichiers source Mojo (backend performance optionnel)
├── public/
│   ├── index.html        # Interface web style terminal
│   ├── agents.html       # Configuration des agents (i18n)
│   ├── providers.html    # Paramètres fournisseurs LLM
│   ├── models.html       # Gestion des modèles
│   └── settings.html     # Paramètres globaux
├── worlds/
│   ├── default/          # Active world
│   │   ├── world_frame.json
│   │   ├── entities.json
│   │   ├── agents/       # Per-agent JSON configs
│   │   ├── session_history/
│   │   ├── chapters/
│   │   ├── timeline.jsonl
│   │   └── settings.json
├── local-models/         # GGUF models (downloaded locally)
├── tests/
│   ├── entity-store.test.ts
│   ├── probability-engine.test.ts
│   └── integration/
│       └── server.test.ts
├── .env                  # Configuration (ignoré par git)
├── .env.example          # Modèle de configuration
├── startgame.sh          # Lanceur serveur + llama-server (avec nettoyage PID)
├── package.json
├── tsconfig.json
└── plan.md               # Plan de migration
```

---

## Configuration

Toute la configuration se fait via des variables d'environnement (fichier `.env`) :

| Variable | Par défaut | Description |
|----------|------------|-------------|
| `WORLD_LLM_BASE_URL` | – | Point de terminaison LLM compatible OpenAI |
| `WORLD_LLM_API_KEY` | – | Clé API |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Nom du modèle |
| `WORLD_LLM_TIMEOUT` | `120` | Délai d'attente de la requête (secondes) |
| `WORLD_LLM_MAX_TOKENS` | `4096` | Max. jetons par réponse |
| `WORLD_LLM_TEMPERATURE` | `0.7` | Température d'échantillonnage |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | Max. requêtes LLM simultanées |
| `WORLD_DB_PATH` | `./worlds/default` | Répertoire de la base de données |
| `LOCAL_MODELS_PATH` | `./local-models` | Répertoire des modèles GGUF locaux |
| `WORLD_SERVER_HOST` | `0.0.0.0` | Adresse d'écoute |
| `WORLD_SERVER_PORT` | `8000` | Port d'écoute |
| `AUTH_PASSWORD` | – | Mot de passe de connexion (vide = pas d'auth) |
| `MAX_SERVE_URL` | `http://localhost:8000` | Point de terminaison Mojo MAX Serve |

---

## Développement

```bash
# Développement avec hot reload
bun run dev

# Vérification des types
npx tsc --noEmit

# Exécuter tous les tests
bun test

# Exécuter des tests spécifiques
bun test tests/entity-store.test.ts
bun test tests/probability-engine.test.ts
bun test tests/integration/server.test.ts

# Construire pour la production
bun run build
```

---

## Dernières modifications

### Extension du noyau Mojo (v0.11.2)

Amélioration majeure des performances des noyaux de calcul Mojo pour la recherche vectorielle, les opérations batch PNJ et le parcours de graphes :

| Fonctionnalité | Description |
|----------------|-------------|
| **Noyau de probabilités** | Chance de succès, résultat de lancer, modificateur + probabilités batch via Mojo FFI |
| **Noyau vectoriel** | Similarité cosinus 4-dim, distance L2, produit scalaire via Mojo FFI |
| **Vecteurs pleine dimension** | Embeddings BGE-M3 768-dim — similarité cosinus batch via Mojo FFI |
| **Opérations batch PNJ** | Décroissance liée à l'âge, vices, impôts, somme de richesse, vérifications de loyauté via Mojo FFI |
| **Opérations sur graphes** | Fusion RRF, force des relations, calcul de la réputation via Mojo FFI |
| **Accélération SQLite** | searchDense/searchMemoriesDense utilisent la similarité cosinus en batch |

**Nouveaux fichiers :**
- `mojo/kernels/vector_full.mojo` — Opérations vectorielles pleine dimension (cosinus, L2, produit scalaire, batch)
- `mojo/kernels/batch_ops.mojo` — Opérations batch de stats PNJ (décroissance, vices, impôts, loyauté)
- `mojo/kernels/graph_ops.mojo` — Parcours de graphe et fusion RRF
- `src/lib/mojo-ffi.test.ts` — 19 tests couvrant tous les bindings FFI

**Fichiers modifiés :**
- `mojo/kernels/probability_ffi.mojo` — Ajout de batch_success_chance et batch_roll
- `src/lib/mojo-ffi.ts` — 5 bindings noyau avec fallbacks TypeScript
- `src/lib/vector-ops.ts` — Utilise cosineSimilarity accéléré par Mojo
- `src/lib/sqlite-store.ts` — searchDense/searchMemoriesDense utilisent batchCosineSimilarity
- `build.sh` — Compile les 5 noyaux (probability, vector_4dim, vector_full, batch_ops, graph_ops)

### Systèmes sociaux et politiques (v0.11.0)

| Fonctionnalité | Description |
|----------------|-------------|
| **Hiérarchie féodale** | Serment de fidélité, seigneurs/vassaux, chaîne de commandement, loyauté |
| **Système de factions** | 6 types (militaire/économique/religieux/criminel/noble/neutre), dirigeants |
| **Alliances politiques** | 5 types (militaire/commerce/défense/non-agression/vassal), trahison |
| **Dialogues PNJ** | Gestion des sessions, 11 catégories de sujets, salutations contextuelles |
| **Système de quêtes** | 5 types, 7 types d'objectifs, récompenses, prérequis, chaînes |
| **Planificateur du2019histoire** | Planification dynamique par LLM, génération en deux phases, replanification adaptative |
| **Système d'inventaire** | Rareté (5 niveaux), emplacements d'équipement, poids/capacité, commerce |

**Nouveaux fichiers :** `social-graph.ts`, `dialogue-manager.ts`, `quest-system.ts`, `inventory-manager.ts`

### Système d'Économie NPC (v0.11.0)

Simulation féodale complète avec des PNJ vivants :

| Fonctionnalité | Description |
|----------------|-------------|
| **Hiérarchie féodale** | 10 rangs : Esclave → Citoyen → Baronnet → Baron → Vicomte → Comte → Marquis → Duc → Roi → Empereur |
| **Stats NPC** | 6 stats : richesse, pouvoir, popularité, santé, expérience, intrigue |
| **Système de taxes** | Taxes hiérarchiques : 0% (Empereur) → 90% (Citoyen), réduit par pouvoir/popularité |
| **Mécanique de pots-de-vin** | Pots-de-vin à risque : 10% de base + montant/témoins, seuil de trahison |
| **Économie alimentaire** | Les esclaves produisent 300-1000 nourriture/mois, tous consomment par rang |
| **Système familial** | 50% des revenus à la femme, 10% aux enfants, héritage au décès |
| **Vices et dégradation** | 8 vices affectant les stats, déclin de santé lié à l'âge |
| **34 archétypes** | 22 par défaut + 12 uniques, sélection aléatoire pondérée, groupes de contexte |
| **Perte de pouvoir** | Rébellion → mort/esclavage, Guerre → rançon/esclavage, Faillite → esclavage |
| **Bonus d'objets** | Les objets uniques donnent des bonus permanents de stats (1-10%), évalués par Historien/Chercheur |

### Stockage SQLite pour prompts et traductions (v0.11.0)
Les prompts d'agents et les chaînes UI sont maintenant stockés dans SQLite par monde + langue :

- **Table `agent_prompts`** — stocke `systemPrompt`, `userTemplate`, `outputFormat` par monde + langue
- **Table `ui_translations`** — stocke les chaînes UI par langue + page (agents, settings, agent_names, agent_descs)
- **Stratégie dual-write** — les écritures vont à la fois dans SQLite et les fichiers JSON pour la compatibilité ascendante
- **Prompts par langue** — chaque monde peut avoir sa propre langue, déterminant quels prompts sont chargés
- **Remplissage automatique** — au premier démarrage, toutes les 7 langues sont remplies dans `ui_translations`

**Hiérarchie de stockage :**
1. **SQLite** (`tns.db`) — stockage principal, par monde + langue
2. **Fichiers JSON** (`worlds/{world}/agents/{agentId}.json`) — fallback pendant la migration
3. **Valeurs par défaut** (`DEFAULT_PROMPTS` dans `src/services/agent-config.ts`)

### Points de terminaison API i18n
Nouvelle API REST pour la gestion des traductions :

| Méthode | Point de terminaison | Description |
|---------|----------------------|-------------|
| GET | `/api/i18n/translations/:lang/:page` | Obtenir les traductions pour langue + page |
| GET | `/api/i18n/translations/:lang` | Obtenir toutes les traductions pour une langue |
| PUT | `/api/i18n/translations` | Mettre à jour par lots les traductions |
| DELETE | `/api/i18n/translations/:lang/:page/:key` | Supprimer une clé de traduction |

**Exemple de requête (PUT) :**
```json
{
  "language": "fr",
  "page": "agents",
  "entries": {
    "title": "Configuration des agents",
    "savePrompts": "Enregistrer les prompts"
  }
}
```

### Prompts d'agents par langue
Les prompts d'agents supportent maintenant le stockage par monde et par langue :

```sql
CREATE TABLE agent_prompts (
  world TEXT NOT NULL DEFAULT 'default',
  agent_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  system_prompt TEXT NOT NULL DEFAULT '',
  user_template TEXT NOT NULL DEFAULT '',
  output_format TEXT NOT NULL DEFAULT '',
  UNIQUE(world, agent_id, language)
);
```

**Points de terminaison API pour les prompts par langue :**
- `GET /api/agents/:id/prompts/:lang` — obtenir les prompts pour une langue spécifique
- `PUT /api/agents/:id/prompts/:lang` — mettre à jour les prompts pour une langue spécifique

### Intégration i18n dans le frontend
Les pages frontend chargent maintenant les traductions depuis SQLite via l'API :

```javascript
// agents.html
async function loadTranslations(langCode) {
  const res = await fetch(`/api/i18n/translations/${langCode}/agents`);
  const data = await res.json();
  remoteTranslations = data.translations || {};
}

function t(key) {
  if (remoteTranslations[key] !== undefined) return remoteTranslations[key];
  return I18N[lang]?.[key] ?? I18N.en[key] ?? key;
}
```

### Nouveaux agents spécialisés (v0.11.0)
Cinq nouveaux agents pour l'enrichissement du monde et l'interaction avec les joueurs :

- **Historien** — se souvient et raconte les événements historiques, le lore et la chronologie
- **Cartographe** — fournit des informations sur les lieux, distances, chemins et géographie
- **Marchand** — gère le commerce, la tarification et l'inventaire des PNJ
- **Donneur de quêtes** — génère des quêtes contextuelles basées sur l'état du monde avec objectifs et récompenses
- **Gardien des connaissances** — maintient les faits du monde, les règles de magie, les informations sur les races et le canon établi

Chaque agent a ses propres prompts système, modèles utilisateur et formats de sortie configurés dans `src/services/agent-config.ts`.

### Système RAG pour tous les agents (v0.11.0)
Support complet des embeddings avec mémoire à long terme pour chaque agent :

- **llama.cpp Embedding Server** — modèle BGE-M3 dédié sur le port 5002 pour la génération de vecteurs
- **Recherche hybride SQLite** — recherche par mots-clés FTS5 + recherche vectorielle dense + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — isolation mémoire par agent et par session via la colonne `role`
- **Mémoire par monde** — la mémoire est isolée par monde pour empêcher les hallucinations inter-mondes
- **Opérations Mojo Graph** — opérations vectorielles via Mojo FFI pour les performances (similarité cosinus, distance L2)

**Architecture :**
```
Requête agent → AgentMemoryStore → SQLite (recherche hybride)
                                      ↓
                              ┌───────┴───────┐
                              │ FTS5 (LIKE)   │ Vecteurs denses (BGE-M3)
                              │ Recherche par │ Similarité cosinus
                              │ mots-clés     │
                              └───────┬───────┘
                                      ↓
                              Reciprocal Rank Fusion (RRF)
                                      ↓
                              Contexte pour le prompt LLM
```

**Fichiers clés :**
- `src/lib/agent-memory-store.ts` — AgentMemoryStore avec intégration embedding
- `src/lib/sqlite-store.ts` — SQLiteStore avec FTS5 + recherche vectorielle + RRF
- `src/lib/vector-ops.ts` — Opérations vectorielles (cosinus, L2, produit scalaire)

### Refonte du système NPC (v0.11.0)
Quatre nouveaux services pour un comportement NPC plus intelligent :

- **MemoryEngine** — recherche sémantique, filtrage par émotion/lieu, clustering des souvenirs sur les mémoires épisodiques des NPC
- **BehaviorEngine** — actions autonomes, évaluation des objectifs, routines quotidiennes, adaptation de l'humeur, prise de décision
- **SocialGraph** — suivi des relations, scores de réputation, amis communs, appartenance aux factions et conflits
- **DialogueContext** — prompts NPC enrichis combinant relations, mémoire, humeur, lieu, faction, objectifs et inventaire

**Architecture :** Deux pistes parallèles — Piste 1 (Mémoire + Comportement) construit la fondation, Piste 2 (Connexions sociales + Dialogue) ajoute les fonctionnalités utilisateur.

**Intégration :** `NPCAgent.initialize(runtime, statePath)` crée les quatre composants. Fallback sur le template/PromptBuilder quand DialogueContext n'est pas initialisé.

### Agent Chercheur (v0.11.0)
Nouvel agent pour la vérification de faits et la validation du réalisme :
- **`verifyRecipe()`** – valide les recettes du crafter pour le réalisme
- **`researchTopic()`** – recherche historique/culturelle pour la construction du monde
- **`validateCharacter()`** – vérifie les vêtements, nourriture, quotidien des personnages
- **`enrichScene()`** – ajoute des détails sensoriels réalistes aux scènes
- **`factCheck()`** – vérification générale de faits

### Système i18n
Localisation complète pour 7 langues (EN, RU, DE, FR, ES, JA, ZH) :
- Tous les prompts d'agents et chaînes d'interface
- Noms et descriptions des agents
- Pages de paramètres (agents, fournisseurs, modèles)
- Messages de démarrage/arrêt du serveur

**Structure** — chaque langue est un fichier séparé dans `src/i18n/` :

```
src/i18n/
├── types.ts    # Interface LanguagePack + type Language
├── en.ts       # Anglais (pack de base – toutes les clés définies ici)
├── ru.ts       # Russe (hérite EN, redéfinit les traductions)
├── de.ts       # Allemand
├── fr.ts       # Français
├── es.ts       # Espagnol
├── ja.ts       # Japonais
├── zh.ts       # Chinois
└── index.ts    # Export barrel, registre, getLanguagePack()
```

**Ajouter une nouvelle langue** (ex. coréen) :

1. Créer `src/i18n/ko.ts` :
```ts
import { EN } from "./en";
import type { LanguagePack } from "./types";

export const KO: LanguagePack = {
  ...EN,
  code: "ko",
  name: "Korean",
  nativeName: "한국어",
  systemPrompt: "한국어로만 답변하세요.",
  uiSettings: "설정",
  // ... redéfinir les autres clés
};
```

2. Enregistrer dans `src/i18n/index.ts` :
```ts
import { KO } from "./ko";
// ajouter au type Language : "ko"
// ajouter à PACKS : ko: KO
// ajouter au tableau LANGUAGES
```

3. Ajouter `"ko"` à l'union `Language` dans `src/i18n/types.ts`.

### Améliorations du serveur
- **Suivi du fichier PID** (`.server.pid`) – empêche les processus orphelins
- **Nettoyage au démarrage** – tue automatiquement les anciens processus
- **Arrêt gracieux** – timeout SIGTERM de 5 secondes, puis fallback SIGKILL

---

## Migration depuis Python

Ce projet est un port TypeScript + Mojo de [BRING](https://github.com/Eva-E1/BRING) — une plateforme Python de mondes fantastiques alimentée par IA. Changements clés :

| Composant | Python | TypeScript |
|-----------|--------|------------|
| Framework web | FastAPI | Hono (Bun) |
| Runtime | Python asyncio | Bun native async |
| Validation | Pydantic | Zod |
| Logging | Python logging | Logger léger (remplacement de Pino) |
| Graphe | NetworkX | Map d'adjacence personnalisée |
| Recherche vectorielle | FAISS (Python) | Mojo FFI + fallback cosinus local |
| WebSocket | FastAPI WebSocket | Bun native WebSocket |
| Auth | Aucune | Sessions basées sur cookies |
| Streaming | SSE (starlette) | ReadableStream + SSE |

---

## Avertissement

Ce projet a été développé en utilisant le **vibe coding** — une approche de développement assistée par IA, propulsée par [MiMo Code](https://github.com/XiaomiMiMo/MiMo). La base de code a été générée grâce à la collaboration humain-IA, ce qui signifie :

- Le code est **fonctionnel et testé** — toutes les fonctionnalités fonctionnent comme décrit
- Certaines parties peuvent contenir des **schémas sous-optimaux** ou bénéficier d'un refactoring
- Il peut y avoir de **légères différences** de style de code entre les différents modules
- L'architecture et la logique sont **vérifiées et validées par un humain**

Les contributions sont les bienvenues si vous trouvez des axes d'amélioration.

---

## Licence

Apache 2.0
