# TrueNeverStory — Guide du développeur

Documentation technique pour les contributeurs et développeurs.

---

## Vue d'ensemble de l'architecture

TrueNeverStory est un moteur de jeu de rôle IA multi-agents avec une architecture State-First. Un joueur envoie des messages, qui sont traités via un pipeline déterministe : analyse d'intention, simulation, mutation d'état, construction de contexte et rendu par des agents spécialisés.

```
Entrée du joueur
    ↓
Analyseur d'intention → Moteur de simulation → Mutateur d'état → Constructeur de contexte
    ↓
Dramaturg (MCP) → Stylist (MCP) → Censor → Service de traduction
    ↓
Réponse narrative
```

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Runtime | Bun (pas Node.js) |
| Framework web | Hono |
| Base de données | SQLite via `bun:sqlite` (mode WAL) |
| Validation | Zod |
| Logging | Pino |
| LLM | API compatible OpenAI (via HTTP) |
| WebSocket | `@hono/node-ws` |
| Noyaux de calcul | C FFI (compilé via Zig) + fallback TypeScript |

---

## Structure du projet

```
src/
├── index.ts                    # Point d'entrée du serveur (Bun.serve)
├── app.ts                      # App Hono — chaîne de middleware + montage de routes
│
├── config/
│   ├── env.ts                  # Config d'environnement validée par Zod (.env + process.env)
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # Client HTTP LLM avec cache LRU
│   ├── llm-queue.ts            # File de requêtes concurrente avec pause/reprise
│   ├── llm-types.ts            # Définitions de types LLM
│   ├── sqlite-store.ts         # SQLite (FTS5 + vecteurs + prompts d'agents + traductions)
│   ├── vector-ops.ts           # Cosinus, L2, produit scalaire
│   ├── mojo-ffi.ts             # Bindings FFI (C/Mojo) + fallbacks TS
│   ├── session-store.ts        # Stockage de sessions SQLite
│   ├── event-bus.ts            # Système d'événements pub/sub
│   ├── history-manager.ts      # Persistance de l'historique de conversation
│   ├── atomic-io.ts            # Lecture/écriture JSON sûre (renommage atomique)
│   └── providers/
│       ├── index.ts            # Registre des fournisseurs
│       ├── llm-provider.ts     # Interface abstraite de fournisseur
│       ├── provider-manager.ts # Routage multi-fournisseurs
│       ├── openai-provider.ts
│       ├── ollama-provider.ts
│       ├── anthropic-provider.ts
│       ├── google-provider.ts
│       └── llamacpp-provider.ts
│
├── middleware/
│   ├── auth.ts                 # Auth par cookie (PBKDF2, CSRF, rate limiting)
│   ├── rate-limiter.ts         # Seau à jetons par IP
│   ├── security-headers.ts     # CSP, X-Frame-Options, etc.
│   ├── error-handler.ts        # Gestionnaire d'erreurs global
│   └── logger.ts               # Logging des requêtes
│
├── models/                     # Modèles de données (25 fichiers)
│   ├── entity.ts               # Entité principale (uid, nom, profil avec couches L1/L2/L3)
│   ├── chat.ts                 # ChatMessageSchema, SessionSetupSchema (Zod)
│   ├── director.ts             # DirectorTask, TaskPriority
│   ├── intent.ts               # Intent, IntentType
│   ├── simulation.ts           # SimulationResult, SimulationState
│   ├── heartbeat.ts            # HeartbeatPayload
│   ├── memory.ts               # MemoryEntry
│   ├── probability.ts          # ProbabilityProfile, Modifier
│   ├── romance.ts              # RomanceState
│   ├── story.ts                # StoryContext
│   ├── quest.ts                # Quest, Objective, Reward
│   ├── item.ts                 # Item, ItemBoost
│   ├── rank.ts                 # Hiérarchie féodale (10 rangs)
│   ├── archetype.ts            # 34 archétypes de NPC
│   ├── npc-state.ts            # État d'exécution des NPC
│   └── npc-stats.ts            # NPCStats, Vices, FamilyExpenses
│
├── routes/                     # Routes API (18 modules)
│   ├── index.ts                # Agrégateur de routes — monte tous les modules sous /api
│   ├── chat.ts                 # POST /chat/setup, /message, /stream (SSE), /agent
│   ├── entities.ts             # GET /entity/:uid, /neighbors, /path, /search, /graph/*
│   ├── agents.ts               # CRUD configs agents + prompts par langue
│   ├── i18n.ts                 # CRUD traductions (7 langues)
│   ├── settings.ts             # GET/PUT paramètres, gestion serveur LLM
│   ├── worlds.ts               # CRUD multi-mondes, switch, génération de chapitres
│   ├── memory.ts               # Endpoints mémoire
│   ├── branches.ts             # Gestion des branches d'histoire
│   ├── probability.ts          # Requêtes de probabilité
│   ├── romance.ts              # Endpoints du système romantique
│   ├── quests.ts               # Endpoints de quêtes
│   ├── sessions.ts             # Historique des sessions
│   ├── maintenance.ts          # Maintenance du graphe
│   ├── launch.ts               # Nouvelle partie / reprise
│   ├── health.ts               # Vérification de santé
│   ├── models.ts               # Catalogue de modèles
│   ├── providers.ts            # Gestion des fournisseurs LLM
│   └── system.ts               # Pause/reprise du traitement en arrière-plan
│
├── services/                   # Logique métier (60+ services)
│   │
│   │  ── Moteur principal ──
│   ├── narrative-service.ts    # Conteneur DI — instancie TOUS les services
│   ├── roleplay-engine.ts      # Pipeline de traitement principal (processInput)
│   ├── story-engine.ts         # Génération d'événements narratifs
│   ├── director-loop.ts        # Progression d'histoire en arrière-plan (setInterval)
│   ├── agent-coordinator.ts    # File de tâches prioritaires pour le directeur
│   │
│   │  ── Agents (Big Six) ──
│   ├── agents/
│   │   ├── dramaturg.ts       # Sélection de patterns narratifs (MCP)
│   │   ├── validator.ts       # Vérification de faits via Wikipedia (MCP)
│   │   ├── stylist.ts         # Rendu de la prose (MCP)
│   │   ├── actor.ts           # Dialogue NPC + interactions
│   │   ├── censor.ts          # Suppression des clichés IA
│   │   └── chronicler.ts      # Mise à jour timeline + mémoire
│   ├── agent-registry-v2.ts   # Enregistrement + recherche d'agents
│   └── agent-v2.ts            # Interface AgentV2 + classe de base
│
│   │  ── Pipeline d'état ──
│   ├── intent-parser.ts       # Classification de l'intention utilisateur
│   ├── simulation-engine.ts   # Simulation déterministe du monde
│   ├── state-mutator.ts       # Mises à jour de l'état du monde
│   ├── context-builder.ts     # Assemblage du contexte de prompt
│   ├── heartbeat.ts           # Battement de cœur du monde en arrière-plan
│   └── translation-service.ts # Traduction multilingue des réponses
│   │
│   │  ── Systèmes du monde ──
│   ├── story-planner.ts        # Planification d'arcs par LLM
│   ├── story-arc-manager.ts    # Cycle de vie des arcs
│   ├── branch-manager.ts       # Branches d'histoire
│   ├── world-builder.ts        # Création d'entités du monde
│   ├── world-clock.ts          # Temps in-world
│   ├── world-evolver.ts        # Ajout auto de NPC/lieux/objets
│   ├── world-manager.ts        # CRUD multi-mondes
│   ├── world-validator.ts      # Validation du frame du monde
│   ├── birth.ts                # Assistant de création de personnage
│   ├── start-resolver.ts       # Résolution du début de partie
│   │
│   │  ── Systèmes NPC ──
│   ├── npc-runtime.ts          # Gestion d'état des NPC
│   ├── npc-generator.ts        # Création intelligente de NPC
│   ├── npc-economy.ts          # Économie féodale
│   ├── npc-economy-runtime.ts  # Simulation au tour par tour
│   ├── slave-economy.ts        # Mécaniques de traite des esclaves
│   ├── memory-engine.ts        # Mémoire épisodique des NPC
│   ├── memory-manager.ts       # Recherche + contexte mémoire
│   ├── behavior-engine.ts      # Actions autonomes des NPC
│   ├── dialogue-manager.ts     # Sessions de conversation NPC
│   ├── dialogue-context.ts     # Prompts NPC enrichis
│   ├── social-graph.ts         # Relations, factions, alliances
│   │
│   │  ── Mécaniques de jeu ──
│   ├── probability-engine.ts   # Résultats déterministes
│   ├── probability-profiles.ts # Définitions de profils
│   ├── probability-expression.ts # Évaluateur mathématique sûr (descente récursive)
│   ├── probability-resolver.ts # Résolution de contexte
│   ├── romance-engine.ts       # Relations romantiques
│   ├── romance-profiles.ts     # Définitions d'actions romantiques
│   ├── quest-system.ts         # Cycle de vie des quêtes, objectifs, chaînes
│   ├── quest-manager.ts        # Persistance des quêtes
│   ├── inventory-manager.ts    # Objets, équipement, commerce
│   ├── item-evaluation.ts      # Évaluation d'unicité + boost des objets
│   ├── navigator.ts            # Recherche de chemin dans le graphe (BFS)
│   │
│   │  ── Infrastructure ──
│   ├── agent-config.ts         # Config des agents (SQLite d'abord + JSON en secours)
│   ├── prompt-builder.ts       # Construction de prompts
│   ├── model-manager.ts        # Catalogue de modèles + téléchargements
│   ├── settings.ts             # Persistance des paramètres
│   └── websocket-manager.ts    # Pool de connexions WebSocket
│
├── intelligence/               # Intelligence du graphe
│   ├── graph-analyzer.ts       # Statistiques du graphe
│   ├── graph-validator.ts      # Réparations auto-cicatrisantes du graphe
│   ├── duplicate-detector.ts   # Dédoublonnage d'entités
│   ├── recommender.ts          # Suggestions de relations
│   ├── relationship-repairer.ts
│   ├── rule-checker.ts         # Validation des règles du monde
│   ├── scene-generator.ts      # Descriptions de scènes
│   ├── subgraph-expander.ts    # Expansion du contexte
│   └── pipeline.ts             # Orchestration du pipeline d'intelligence
│
├── memory/                     # Sous-système mémoire
│   ├── world-memory.ts         # Classe mémoire principale
│   ├── cognitive-pipeline.ts   # Extraction d'entités → contradiction → signaux de douleur
│   ├── entity-extractor.ts     # Extraction d'entités du texte
│   ├── contradiction-detector.ts
│   ├── pain-signals.ts         # Détection de moments importants
│   ├── scoring.ts              # Notation d'importance mémoire
│   ├── clustering.ts           # Clustering mémoire
│   ├── partition.ts            # Partitionnement mémoire
│   ├── faiss-index.ts          # Index vectoriel (compatible FAISS)
│   ├── embedding-queue.ts      # Génération d'embeddings async
│   ├── optimizer.ts            # Optimisation mémoire
│   └── write-buffer.ts         # Tampon d'écriture par lot
│
├── mcp/                        # Serveur MCP — parseurs Bible/Gutenberg, outils Wikipedia
│
├── i18n/                       # Internationalisation (7 langues)
│   ├── types.ts                # Interface LanguagePack
│   ├── index.ts                # Registre, getLanguagePack(), setLanguage()
│   ├── en.ts                   # Anglais (base)
│   ├── ru.ts                   # Russe
│   ├── de.ts                   # Allemand
│   ├── fr.ts                   # Français
│   ├── es.ts                   # Espagnol
│   ├── ja.ts                   # Japonais
│   └── zh.ts                   # Chinois
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — accès O(1) + NameIndex
│
└── utils/
    ├── logger.ts               # Logger Pino
    ├── hash.ts                 # Utilitaires SHA-256
    ├── time.ts                 # Formatage de dates
    ├── sanitize.ts             # Défense contre l'injection de prompts
    └── template-resolver.ts    # Résolution de {variables} de templates d'agents

mojo/
├── kernels/                    # Noyaux de calcul C FFI
│   ├── c/
│   │   ├── probability_ffi.c   # Chance de succès, lancer, probabilité par lot
│   │   ├── vector_ffi.c        # Ops vectorielles 4-dim (cosinus, L2, scalaire)
│   │   ├── vector_full.c       # Cosinus par lot 768-dim (BGE-M3)
│   │   ├── batch_ops.c         # Ops NPC par lot (décroissance d'âge, vice, taxe)
│   │   └── graph_ops.c         # Parcours de graphe, RRF, réputation
│   ├── build.sh                # Compilation croisée via Zig
│   └── dist/                   # .so/.dylib/.dll compilés
└── src/                        # 81 fichiers source Mojo (backend perf optionnel)

public/                         # Frontend (HTML statique)
├── index.html                  # UI principale chat/jeu de rôle
├── agents.html                 # Config des agents (i18n)
├── graph.html                  # Visualiseur de graphe de connaissances (D3.js)
├── models.html                 # Gestion des modèles
├── providers.html              # Paramètres des fournisseurs LLM
├── settings.html               # Paramètres globaux (i18n)
├── worlds.html                 # Gestion des mondes + assistant de naissance
└── static/
    ├── fonts/                  # Polices personnalisées
    └── vendor/                 # d3.v7.min.js, purify.min.js

conf/                           # Configuration d'exécution (gitignored)
├── settings.json               # Paramètres de l'app (LLM, auth, serveur)
├── agents.json                 # Affectations globales de modèles d'agents
├── providers.json              # Registre des fournisseurs
└── llm-config.json             # Config des fournisseurs LLM

worlds/                         # Données des mondes (gitignored)
└── default/
    ├── tns.db                  # SQLite (entités, embeddings, mémoires, prompts, traductions)
    ├── entities.json           # Graphe d'entités (JSON)
    ├── world_frame.json        # Définition du monde
    ├── session_history/        # Journaux de conversation par session
    ├── chapters/               # Chapitres littéraires générés
    ├── npc_profiles/           # Fichiers d'état des NPC
    ├── timeline.jsonl          # Timeline d'événements
    ├── story_planner.json      # État du planificateur d'histoire
    ├── villains.json           # État des antagonistes
    └── world_clock.json        # Temps in-world

worlds/_sessions/
    └── sessions.db             # Stockage SQLite des sessions
```

---

## Injection de dépendances — NarrativeService

`NarrativeService` (`src/services/narrative-service.ts`) est le conteneur DI central. Il instancie tous les 30+ services et câble leurs dépendances.

```
NarrativeService
├── entityStore (UnifiedEntityStore) — accès O(1) aux entités
├── graphStore (GraphStore) — carte d'adjacence + pathfinding
├── eventBus (EventBus) — événements pub/sub
├── historyMgr (HistoryManager) — persistance de la conversation
├── llm (LLMClient) — client HTTP pour les APIs LLM
├── llmQueue (LLMQueue) — file de requêtes concurrente (max 3)
├── sqliteStore (SQLiteStore) — FTS5 + vecteurs + agent_prompts + translations
├── chronicler (Chronicler) — rédacteur timeline.jsonl
├── validator (WorldValidator) — validation du frame du monde
├── questMgr (QuestManager) — persistance des quêtes
├── clock (WorldClock) — temps in-world
├── probEngine (ProbabilityEngine) — résultats déterministes
├── probResolver (ProbabilityContextResolver) — contexte pour la probabilité
├── storyPlanner (StoryPlanner) — planification d'arcs par LLM
├── villainManager (VillainManager) — actions des antagonistes
├── socialSim (SocialSimulator) — dynamique sociale des NPC
├── npcRuntime (NPCRuntime) — gestion d'état des NPC
├── storyEngine (StoryEngine) — génération d'événements narratifs
├── director (DirectorLoop) — progression d'histoire en arrière-plan
├── worldBuilder (WorldBuilder) — création d'entités
├── agentCoordinator (AgentCoordinator) — file de tâches prioritaires
├── storyArcManager (StoryArcManager) — cycle de vie des arcs
├── userAgent (UserAgent) — groupe + combat
├── npcGenerator (NPCGenerator) — création intelligente de NPC
├── worldEvolver (WorldEvolver) — expansion automatique du monde
├── graphValidator (GraphValidator) — graphe auto-cicatrisant
├── intentParser (IntentParser) — classification de l'intention utilisateur
├── simEngine (SimulationEngine) — simulation déterministe du monde
├── stateMutator (StateMutator) — mises à jour de l'état du monde
├── contextBuilder (ContextBuilder) — assemblage du contexte de prompt
├── heartbeatService (HeartbeatService) — battement de cœur du monde
├── tnsServer (TNSServer) — serveur MCP (Bible/Gutenberg/Wikipedia)
├── translationService (TranslationService) — traduction multilingue
└── agentRegistry (AgentRegistryV2) — enregistrement + recherche d'agents
```

**Cycle de vie :**
1. `new NarrativeService({dbPath, worldFrame})` — le constructeur câble tout
2. `start()` — démarre la file LLM, synchronise les entités vers SQLite, construit automatiquement les relations heuristiques (si des entités existent mais n'ont pas de connexions), démarre la boucle du directeur
3. `stop()` — arrête le directeur + la file LLM
4. `pause()` / `resume()` — pour quand l'utilisateur quitte la vue chat
5. `reset(newDbPath, worldFrame)` — hot-swap vers un monde différent
6. `shutdown()` — arrêt propre

---

## Cycle de vie d'une requête

### API REST (POST /api/chat/message)

```
1. Chaîne de middleware Hono :
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. Gestionnaire de route (chat.ts) :
   - Validation Zod (ChatMessageSchema)
   - sanitizeInput() — supprime les motifs d'injection de prompt
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput() :
   - Intent Parser → classifie l'intention de l'utilisateur
   - Simulation Engine → simulation déterministe du monde
   - State Mutator → met à jour l'état du monde
   - Context Builder → assemble le contexte du prompt
   - Dramaturg (MCP) → sélectionne le pattern narratif
   - Stylist (MCP) → rend la prose
   - Censor → supprime les clichés IA
   - Translation Service → réponse multilingue
   - Retourne la chaîne narrative

4. Réponse : JSON { narrative, location, story_time, ... }
```

### Streaming SSE (POST /api/chat/stream)

Identique au REST, mais enveloppe `engine.processInputStream()` dans un `ReadableStream` avec des pings keepalive.

### WebSocket (ws://host/ws/...)

```
1. Upgrade : vérifie le cookie de session (bring_session)
2. Au message : parse JSON → route vers le moteur
3. À la réponse : stringify JSON → ws.send()
```

---

## Système d'agents

Chaque agent implémente l'interface `AgentV2` avec une méthode `process()` qui reçoit l'intention, les résultats de simulation et le contexte de jeu.

### Les Big Six

| Agent | Rôle | Outils MCP |
|-------|------|------------|
| Dramaturg | Sélection de patterns narratifs | search_verses, get_pattern, get_archetype |
| Validator | Vérification de faits via Wikipedia | verify_fact, get_context |
| Stylist | Rendu de la prose | get_style_pattern, apply_style |
| Actor | Dialogue NPC + interactions | — |
| Censor | Suppression des clichés IA | — |
| Chronicler | Mise à jour timeline + mémoire | — |

### Interface AgentV2

```typescript
interface AgentV2 {
  readonly id: AgentId;
  readonly name: string;
  readonly description: string;
  readonly mcpTools: string[];
  process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput>;
}
```

**Note :** L'ancien système à 14 agents est déprécié mais toujours fonctionnel pour la rétrocompatibilité. Les anciens IDs d'agents (`@narrator`, `@director`, etc.) sont routés vers les nouveaux agents en interne.

### Résolution des prompts

Les prompts des agents sont résolus dans cet ordre :
1. Table SQLite `agent_prompts` (par monde + langue)
2. Fallback JSON (`worlds/{world}/agents/{agentId}.json`)
3. Valeurs par défaut codées en dur (`DEFAULT_PROMPTS` dans `agent-config.ts`)

Les templates utilisent des placeholders `{variable}` résolus par `resolveTemplate()`.

---

## Intégration MCP (v0.33.0)

TNSServer (`src/mcp/tns-server.ts`) fournit des outils MCP pour l'accès aux données externes.

| Outil | Source | Description |
|-------|--------|-------------|
| search_verses | Bible | Recherche de versets bibliques par texte, livre ou référence |
| get_pattern | Bible | Patterns narratifs par archétype, humeur ou fonction |
| get_archetype | Bible | Détails d'un archétype par nom |
| get_style_pattern | Gutenberg | Recherche de styles par humeur, tags ou description |
| apply_style | Gutenberg | Applique un style au texte (délexifier et retourner des suggestions) |
| verify_fact | Wikipedia | Vérifie une affirmation factuelle |
| get_context | Wikipedia | Contexte Wikipedia pour un sujet |
| get_economic_phase | Éco DB | Phase actuelle du cycle économique |
| calculate_price | Éco DB | Prix avec modificateur de phase |
| generate_dilemma | Éco DB | Dilemme fiscal de faction |
| check_jubilee | Éco DB | Vérification du cycle du jubilé |

### Console MCP (v0.33.0)

Console de gestion de bases de données web pour toutes les bases du projet.

**Lancement :** `./startgame.sh --mcp` (démarre uniquement le serveur de gestion DB sur le port 8000, pas de jeu)

**Interface web :** `http://localhost:8000` — onglets pour Bible, Gutenberg, Wikipedia, LiteraryCompiler, Economics, System

**API :** Tous les endpoints sous `/mcp/*` — voir `src/routes/mcp.ts` pour la liste complète. Progression SSE à `/mcp/stream/:jobId`.

**Téléchargement Gutenberg sélectif :** Téléchargement basé sur le catalogue avec filtrage par genre/auteur. Scripts de téléchargement TypeScript avec suivi de progression SSE.

---

## Couche de données

### EntityStore (JSON)

- `entities.json` — carte d'adjacence de toutes les entités
- Accès O(1) par UID via `Map<string, EntityNode>`
- Recherche O(1) par nom via `NameIndex` (insensible à la casse)
- Suivi des mutations via callback `onMutation()` → synchronisation vers SQLite

### SQLiteStore

Tables :
- `entities` — recherche plein texte FTS5
- `embeddings` — blobs vectoriels (BGE-M3, 1024-dim)
- `memories` — mémoires de jeu de rôle avec FTS5
- `agent_prompts` — stockage de prompts par monde + langue
- `ui_translations` — chaînes UI par langue + page

Recherche hybride : mots-clés FTS5 + vecteurs denses + Reciprocal Rank Fusion.

### Noyaux FFI

5 noyaux C compilés via Zig pour la distribution multi-plateforme :

| Noyau | Fonctions | Fallback |
|-------|-----------|----------|
| `probability_ffi` | success_chance, roll, batch | TS pur |
| `vector_ffi` | cosine_4d, l2_4d, dot_4d | TS pur |
| `vector_full` | batch_cosine_768d | TS pur |
| `batch_ops` | age_decay, vice_decay, tax, loyalty | TS pur |
| `graph_ops` | rrf_fusion, reputation | TS pur |

Détection : `dlopen()` dans `mojo-ffi.ts`, fallback en cas d'échec.

---

## Configuration

### Variables d'environnement (.env)

| Variable | Défaut | Description |
|----------|--------|-------------|
| `WORLD_LLM_BASE_URL` | – | Endpoint compatible OpenAI |
| `WORLD_LLM_API_KEY` | – | Clé API |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Nom du modèle |
| `WORLD_LLM_TIMEOUT` | `300` | Délai d'expiration des requêtes (secondes) |
| `WORLD_LLM_MAX_TOKENS` | `4096` | Tokens max par réponse |
| `WORLD_LLM_TEMPERATURE` | `0.7` | Température d'échantillonnage |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | Requêtes LLM concurrentes max |
| `WORLD_DB_PATH` | `./world_db` | Répertoire de la base de données (legacy) |
| `WORLDS_ROOT` | `./worlds` | Répertoire racine des mondes |
| `WORLD_SERVER_HOST` | `127.0.0.1` | Adresse d'écoute |
| `WORLD_SERVER_PORT` | `8000` | Port d'écoute |
| `AUTH_PASSWORD` | – | Mot de passe de connexion (vide = pas d'auth) |
| `AUTH_PASSWORD_HASH` | – | Hash PBKDF2 (sel:hash) |

### Paramètres (conf/settings.json)

Chargés via `loadSettings()`. Priorité : settings.json > .env > défauts.

Contient : paramètres LLM, config d'embedding, config serveur, mot de passe auth, paramètres mémoire, chance de probabilité, sélection de monde, langue.

---

## Chaîne de middleware

L'ordre compte — appliqué dans `app.ts` :

```
1. errorHandler     — gestionnaire d'erreurs global
2. requestLogger    — logging des requêtes Pino
3. rateLimiter      — 100 req/min par IP
4. securityHeaders  — CSP, X-Frame-Options, etc.
5. CORS             — origines localhost:8000
6. authMiddleware   — validation du cookie de session (protège /api/*, /ws/*)
```

---

## Tests

```bash
bun test                              # Exécuter tous les tests
bun test tests/entity-store.test.ts   # Tests du magasin d'entités
bun test tests/probability-engine.test.ts  # Tests de probabilité
bun test tests/integration/server.test.ts  # Tests d'intégration (nécessite un serveur actif)
```

Les fichiers de test utilisent la convention `*.test.ts` à côté des fichiers source.

---

## Ajouter un nouvel agent

1. Créer `src/services/my-agent.ts` :
```typescript
export class MyAgent {
  constructor(deps: { llmQueue: LLMQueue; entityStore: UnifiedEntityStore }) {}
  
  async generateResponse(ctx: AgentContext): Promise<string> {
    const prompt = buildPrompt(ctx);
    return await this.deps.llmQueue.enqueue({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4o-mini",
    });
  }
}
```

2. Enregistrer dans le constructeur de `roleplay-engine.ts`
3. Ajouter la logique de routage dans `processInput()`
4. Ajouter le prompt système dans `agent-config.ts` ou la table SQLite `agent_prompts`

---

## Ajouter une nouvelle route

1. Créer `src/routes/my-route.ts` :
```typescript
import { Hono } from "hono";
const myRoute = new Hono();
myRoute.get("/my-endpoint", async (c) => c.json({ ok: true }));
export { myRoute as myRouteRouter };
```

2. Monter dans `src/routes/index.ts` :
```typescript
import { myRouteRouter } from "./my-route";
routes.route("/", myRouteRouter);
```

---

## Gestion des mondes

Plusieurs mondes isolés sous `worlds/` :

```
worlds/
├── default/           # Monde actif
│   ├── tns.db         # Base de données SQLite
│   ├── entities.json  # Graphe d'entités
│   └── ...
├── levant/            # Un autre monde
└── _sessions/         # Magasin global de sessions
```

Changer de monde via `POST /api/worlds/:name/switch`. Hot-swap du conteneur DI.

Statistiques du monde disponibles via `GET /api/worlds/:name/detail` — retourne le nombre d'entités par type, les listes de personnages/lieux/factions/objets, et les compteurs de sessions/évènements/chapitres/antagonistes, ainsi que les règles du monde.

---

## Motifs clés

- **Double écriture** : les paramètres sont écrits à la fois dans SQLite et JSON (rétrocompatibilité)
- **Résolution de templates** : les prompts d'agents utilisent des placeholders `{variable}` résolus à l'exécution
- **Évaluation d'expressions sûre** : les formules de probabilité utilisent un analyseur par descente récursive (pas d'eval)
- **Défense contre l'injection de prompt** : `sanitizeInput()` supprime les motifs d'injection courants avant le LLM
- **Écritures JSON atomiques** : `atomicWriteJson()` utilise un fichier temporaire + renommage pour la sécurité en cas de crash
- **Piloté par événements** : `EventBus` découple les services (création d'entités, événements mémoire, etc.)
- **Injection d'instruction de langue** : les directives de langue sont intégrées dans les prompts d'agents lors de la création du monde via `seedWorldAgents()`, et aussi ajoutées à l'exécution par `getLanguageInstruction()` pour le dialogue dynamique des NPC
