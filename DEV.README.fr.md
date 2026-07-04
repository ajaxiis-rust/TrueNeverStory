# TrueNeverStory — Guide Développeur

Documentation technique pour les contributeurs et développeurs.

---

## Vue d'ensemble de l'architecture

TrueNeverStory est un moteur de jeu de rôle IA multi-agents. Un joueur envoie des messages qui sont traités par un pipeline de 14 agents IA spécialisés, chacun gérant un aspect spécifique de la narration (narration, dialogues PNJ, transitions de scènes, planification de l'intrigue, etc.).

```
Entrée du joueur
    ↓
RoleplayEngine.processInput()
    ↓
┌─────────────────────────────────┐
│  Détection d'intention          │
│  - Mouvement → SceneAgent       │
│  - Parler à PNJ → NPCAgent     │
│  - Mention @agent → Agent       │
│  - Défaut → NarratorAgent       │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│  Pipeline d'agents              │
│  1. Construire le contexte      │
│  2. Générer le prompt           │
│  3. Appeler le LLM via queue    │
│  4. Parser la réponse           │
│  5. Mettre à jour l'état        │
└─────────────┬───────────────────┘
              ↓
         Réponse narrative
```

---

## Stack technique

| Couche | Technologie |
|--------|-----------|
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
├── index.ts                    # Point d'entrée serveur (Bun.serve)
├── app.ts                      # App Hono — chaîne middleware + montage des routes
│
├── config/
│   ├── env.ts                  # Config env validée par Zod
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # Client HTTP LLM avec cache LRU
│   ├── llm-queue.ts            # File parallèle avec pause/resume
│   ├── sqlite-store.ts         # SQLite (FTS5 + vecteurs + prompts + traductions)
│   ├── vector-ops.ts           # Cosinus, L2, produit scalaire
│   ├── mojo-ffi.ts             # Bindings FFI (C/Mojo) + fallbacks TS
│   ├── session-store.ts        # Stockage de sessions SQLite
│   ├── event-bus.ts            # Système d'événements pub/sub
│   └── providers/
│       ├── provider-manager.ts # Routage multi-fournisseur
│       ├── openai-provider.ts
│       ├── ollama-provider.ts
│       └── ...
│
├── middleware/
│   ├── auth.ts                 # Auth cookies (PBKDF2, CSRF, rate limiting)
│   ├── rate-limiter.ts         # Token bucket par IP
│   ├── security-headers.ts     # CSP, X-Frame-Options, etc.
│   └── error-handler.ts        # Gestionnaire d'erreurs global
│
├── models/                     # Modèles de données (22 fichiers)
│   ├── entity.ts               # Entity core (uid, name, profil L1/L2/L3)
│   ├── chat.ts                 # ChatMessageSchema, SessionSetupSchema (Zod)
│   ├── probability.ts          # ProbabilityProfile, Modifier
│   ├── quest.ts                # Quest, Objective, Reward
│   └── ...
│
├── routes/                     # Routes API (18 modules)
│   ├── index.ts                # Agrégateur de routes
│   ├── chat.ts                 # POST /chat/setup, /message, /stream (SSE), /agent
│   ├── entities.ts             # GET /entity/:uid, /neighbors, /search, /graph/*
│   ├── agents.ts               # CRUD configs agents + prompts par langue
│   ├── i18n.ts                 # CRUD traductions (7 langues)
│   ├── worlds.ts               # CRUD multi-mondes, génération de chapitres
│   └── system.ts               # Pause/reprise du traitement en arrière-plan
│
├── services/                   # Logique métier (52+ services)
│   │
│   │  ── Cœur ──
│   ├── narrative-service.ts    # Conteneur DI — instancie TOUS les services
│   ├── roleplay-engine.ts      # Pipeline principal (processInput)
│   ├── story-engine.ts         # Génération d'événements narratifs
│   ├── director-loop.ts        # Progression narrative en arrière-plan
│   ├── agent-coordinator.ts    # File de tâches prioritaire
│   │
│   │  ── Agents (14) ──
│   ├── narrator-agent.ts       # Narrateur principal
│   ├── director-agent.ts       # Injection de battements narratifs
│   ├── scene-agent.ts          # Transitions de scènes
│   ├── npc-agent.ts            # Dialogues et réactions PNJ
│   ├── researcher-agent.ts     # Vérification factuelle
│   ├── historian-agent.ts      # Événements historiques
│   ├── cartographer-agent.ts   # Géographie, distances
│   ├── merchant-agent.ts       # Commerce, tarification
│   ├── quest-giver-agent.ts    # Génération de quêtes
│   ├── lorekeeper-agent.ts     # Faits du monde, règles de magie
│   ├── chronicler.ts           # Gestion de la timeline
│   ├── villain-manager.ts      # Actions des antagonistes
│   ├── social-simulator.ts     # Dynamique sociale PNJ
│   │
│   │  ── Systèmes mondiaux ──
│   ├── story-planner.ts        # Planification d'arcs (LLM)
│   ├── world-builder.ts        # Création d'entités
│   ├── world-clock.ts          # Temps dans le monde
│   ├── world-evolver.ts        # Auto-ajout PNJ/lieux/objets
│   ├── birth.ts                # Assistant de création de personnage
│   │
│   │  ── Systèmes PNJ ──
│   ├── npc-runtime.ts          # Gestion de l'état PNJ
│   ├── npc-generator.ts        # Création intelligente de PNJ
│   ├── npc-economy.ts          # Économie féodale
│   ├── memory-engine.ts        # Mémoire épisodique PNJ
│   ├── behavior-engine.ts      # Actions autonomes PNJ
│   ├── dialogue-manager.ts     # Sessions de conversation
│   ├── social-graph.ts         # Relations, factions, alliances
│   │
│   │  ── Mécaniques de jeu ──
│   ├── probability-engine.ts   # Résultats déterministes
│   ├── probability-expression.ts # Évaluateur math (descent récursive)
│   ├── romance-engine.ts       # Relations romantiques
│   ├── quest-system.ts         # Cycle de vie des quêtes
│   ├── inventory-manager.ts    # Objets, équipement, commerce
│   ├── navigator.ts            # Pathfinding dans le graphe (BFS)
│   │
│   │  ── Infrastructure ──
│   ├── agent-config.ts         # Config agents (SQLite-first + JSON)
│   ├── prompt-builder.ts       # Construction de prompts
│   ├── model-manager.ts        # Catalogue de modèles
│   ├── settings.ts             # Persistance des paramètres
│   └── websocket-manager.ts    # Pool de connexions WebSocket
│
├── intelligence/               # Intelligence de graphe
│   ├── graph-analyzer.ts       # Statistiques du graphe
│   ├── graph-validator.ts      # Auto-réparation du graphe
│   ├── duplicate-detector.ts   # Déduplication d'entités
│   └── pipeline.ts             # Orchestration du pipeline
│
├── memory/                     # Sous-système mémoire
│   ├── world-memory.ts         # Classe principale mémoire
│   ├── cognitive-pipeline.ts   # Extraction → contradictions → pain signals
│   ├── entity-extractor.ts     # Extraction d'entités
│   └── write-buffer.ts         # Buffer d'écriture batch
│
├── i18n/                       # Internationalisation (7 langues)
│   ├── types.ts                # Interface LanguagePack
│   ├── index.ts                # Registre, getLanguagePack()
│   └── [en|ru|de|fr|es|ja|zh].ts
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — accès O(1) + NameIndex
│
└── utils/
    ├── sanitize.ts             # Défense anti prompt injection
    └── template-resolver.ts    # Résolution {variable} dans les templates

mojo/kernels/                   # Noyaux de calcul C FFI
├── c/
│   ├── probability_ffi.c       # Chance de succès, lancer, batch
│   ├── vector_ffi.c            # Opérations vectorielles 4-dim
│   ├── vector_full.c           # Cosinus batch 768-dim (BGE-M3)
│   ├── batch_ops.c             # Opérations batch PNJ
│   └── graph_ops.c             # Traversée de graphe, RRF, réputation
└── build.sh                    # Cross-compilation via Zig

public/                         # Frontend (HTML statique)
├── index.html                  # UI principale chat/jeu de rôle
├── agents.html                 # Config agents (i18n)
├── graph.html                  # Visualisation graphe (D3.js)
├── settings.html               # Paramètres globaux (i18n)
└── worlds.html                 # Gestion des mondes + assistant de naissance
```

---

## Conteneur DI — NarrativeService

`NarrativeService` est le conteneur DI central. Il instancie tous les services et connecte leurs dépendances.

**Cycle de vie:**
1. `new NarrativeService({dbPath, worldFrame})` — tout connecter
2. `start()` — démarrer la queue LLM, synchroniser les entités, lancer le director
3. `stop()` — arrêter director + LLM
4. `pause()` / `resume()` — quand l'utilisateur quitte le chat
5. `reset(newDbPath, worldFrame)` — changement à chaud de monde
6. `shutdown()` — arrêt propre

---

## Cycle de vie d'une requête

### REST API (POST /api/chat/message)

```
1. Chaîne middleware Hono:
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. Handler de route (chat.ts):
   - Validation Zod (ChatMessageSchema)
   - sanitizeInput() — suppression des patterns d'injection
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput():
   - Détection d'intention
   - Routage vers l'agent approprié
   - Construction du contexte
   - Génération du prompt
   - Appel LLM via la queue
   - Parsing de la réponse
   - Mise à jour de l'état du monde

4. Réponse: JSON { narrative, location, story_time, ... }
```

---

## Système d'agents

Chaque agent est une classe avec `generateResponse()`.

### Priorité des agents (plus haut = traité en premier)

| Priorité | Agent |
|----------|-------|
| 10 | Narrator |
| 9 | NPC |
| 8 | Director |
| 7 | Scene, Quest Giver |
| 6 | Story Planner, Villain, Historian, Lorekeeper |
| 5 | Chronicler, Merchant |
| 4 | Social Sim, Cartographer |
| 3 | Researcher |

---

## Couche de données

### EntityStore (JSON)
- Accès O(1) par UID via `Map<string, EntityNode>`
- Recherche par nom O(1) via `NameIndex`

### SQLiteStore
Tables: `entities` (FTS5), `embeddings` (vecteurs), `memories`, `agent_prompts`, `ui_translations`

Recherche hybride: FTS5 + vecteurs denses + Reciprocal Rank Fusion.

### Noyaux FFI
5 noyaux C via Zig: probability_ffi, vector_ffi, vector_full, batch_ops, graph_ops.

---

## Configuration

### Variables d'environnement (.env)

| Variable | Défaut | Description |
|----------|--------|-------------|
| `WORLD_LLM_BASE_URL` | – | Endpoint compatible OpenAI |
| `WORLD_LLM_API_KEY` | – | Clé API |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Nom du modèle |
| `WORLD_LLM_TIMEOUT` | `300` | Timeout requête (secondes) |
| `WORLD_SERVER_HOST` | `127.0.0.1` | Adresse d'écoute |
| `WORLD_SERVER_PORT` | `8000` | Port d'écoute |
| `AUTH_PASSWORD` | – | Mot de passe de connexion |

---

## Chaîne Middleware

```
1. errorHandler     — Gestionnaire d'erreurs global
2. requestLogger    — Logging Pino
3. rateLimiter      — 100 req/min par IP
4. securityHeaders  — CSP, X-Frame-Options, etc.
5. CORS             — Origins localhost:8000
6. authMiddleware   — Validation session cookie
```

---

## Tests

```bash
bun test                              # Tous les tests
bun test tests/entity-store.test.ts   # Tests entity store
bun test tests/probability-engine.test.ts  # Tests probabilités
```

---

## Ajouter un nouvel agent

1. Créer `src/services/my-agent.ts`
2. Enregistrer dans `roleplay-engine.ts`
3. Ajouter la logique de routage dans `processInput()`
4. Ajouter le prompt système dans `agent-config.ts` ou SQLite

---

## Patterns clés

- **Dual-write**: Les paramètres écrivent en SQLite + JSON
- **Résolution de templates**: Prompts avec `{variable}`
- **Éval sûr**: Formules via descente récursive (pas de eval)
- **Défense anti injection**: `sanitizeInput()` avant LLM
- **Écriture JSON atomique**: via fichier temp + rename
