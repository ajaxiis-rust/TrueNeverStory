# TrueNeverStory — Document d'architecture

> Une analyse orientée conception pilotée par le domaine (Domain-Driven Design) du moteur RPG narratif TrueNeverStory.
> Mis à jour pour la v0.32.5 — RoleplayEngine refactorisé avec SessionState, CommandHandler, PipelineRunner, stratégies Prose.

---

## [A1] Modèle architectural

**Architecture en oignon (onion) en couches avec extensions pilotées par événements + pipeline State-First**

TrueNeverStory suit une **architecture en oignon (hexagonale) en couches** à sa base, enveloppée par une **couche d'orchestration pilotée par événements** pour le traitement narratif asynchrone. Depuis la v0.32.5, le moteur utilise un **pipeline State-First** où la simulation déterministe se produit avant la génération de prose.

Ce modèle convient parce que :

1. **Les modèles de domaine sont isolés** — `src/models/` contient des structures de données pures sans dépendances d'infrastructure. `EntityNode`, `Quest`, `StoryContext`, `NPCProfile`, `ProbabilityModifier`, `Intent`, `SimulationResult` sont tous indépendants du framework.
2. **Les services orchestrent la logique de domaine** — `src/services/` contient des services applicatifs (`RoleplayEngine`, `StoryEngine`) et des services de domaine (`ProbabilityEngine`, `SocialSimulator`, `RomanceEngine`, `SimulationEngine`).
3. **L'infrastructure est repoussée aux frontières** — `src/lib/` contient la persistance (`SQLiteStore`, `AtomicIO`), les intégrations externes (`LLMClient`, `ProviderManager`) et le transport (`WebSocketManager`).
4. **Les routes sont des adaptateurs fins** — `src/routes/` mappe HTTP vers des appels de service avec une logique minimale.
5. **Intégration MCP** — `src/mcp/` fournit des sources de connaissances externes (Bible, Gutenberg, Wikipédia) via Model Context Protocol.

Le **bus d'événements** (`EventBus` dans `src/lib/event-bus.ts`) ajoute une couche de découplage asynchrone entre les contextes bornés, permettant à la boucle Director d'orchestrer les événements narratifs sans couplage direct avec les sous-systèmes NPC, Social ou Quest.

### Pipeline State-First (v0.32.5)

Le pipeline est désormais structuré en étapes composables gérées par `PipelineRunner` :

```
Player Input (any language)
  │
  ▼
PipelineRunner.buildContext() — snapshot engine state
  │
  ▼
PipelineRunner.translateAndClassify() — IntentParser + TranslationService
  │ translated text + intent
  ▼
CommandHandler.handle() — early exit for commands
  │
  ▼
PipelineRunner.runSimulation() — SimulationEngine (deterministic)
  │ outcome, probability, stateChanges
  ▼
StateMutator.applyChanges() — apply to EntityStore
  │
  ▼
PipelineRunner.buildGameContext() — ContextBuilder
  │
  ▼
Prose Generators:
  ├─ LiteraryV2Generator (feature-flag gated) → Stylist
  └─ LegacyIntentGenerator → MovementHandler | DialogueHandler | ObservationHandler | ActionHandler
  │
  ▼
TranslationService.translate() — if non-English target language
  │
  ▼
Response to User

Total: 2-3 LLM calls
```

### Pipeline de traitement Gutenberg (v0.32.5)

Un pipeline en deux phases convertit les fichiers .txt bruts de Gutenberg en bases de données exploitables par les agents :

**Phase A (V1 — basée sur des règles, sans LLM) :**
```
classics.db → GutenbergParser → gutenberg-normalized.db (styles + FTS)
         └→ 4-pass compiler → classics-compiled.db (quest templates)
              DramaturgicPass → StylisticPass → EmotionalPass → MetadataPass → Linter
```

**Phase B (V2 — enrichie par LLM) :**
```
classics-compiled.db → AnalyzePass → narrative_extractor → literary.db (scene_templates + style_patterns)
```

**Nouvelles tables dans classics-compiled.db :**
- `narrative_arcs` — archétypes d'arc narratif et points de tension par livre
- `thematic_motifs` — motifs symboliques avec suivi d'évolution
- `quality_calibration` — scores de qualité des réponses LLM

**PlayerProfileStore** — profils de style de joueur autonomes inter-agents (14 métriques), stockés dans `data/player-profiles.db`.

### Architecture à double modèle (v0.32.5)

Le moteur prend en charge deux modèles LLM par agent :

| Modèle | Objectif | Exemples |
|-------|---------|----------|
| **Modèle principal** | Génération narrative, dialogue de PNJ, planification d'histoire | llama-3.1-8b, qwen2.5-14b |
| **Modèle de traduction** | Traduction, classification d'intention (rapide, petit) | phi-3-mini, gemma-2-2b, qwen2.5-3b |

**Configuration** (par agent dans `conf/agents.json`) :
```json
{
  "agentId": "translation",
  "providerId": "ollama",
  "modelId": "qwen2.5:14b",
  "translationProviderId": "ollama",
  "translationModelId": "phi3:mini"
}
```

**LLMClient** résout le modèle via le drapeau `useTranslationModel` :
- `LLMQueue.getAgentClient("translation", { useTranslationModel: true })` → utilise `translationModelId`
- `LLMQueue.getAgentClient("stylist")` → utilise `modelId`

```
┌─────────────────────────────────────────────────┐
│                   Routes (HTTP/WS)               │  ← Adapter Layer
├─────────────────────────────────────────────────┤
│              Application Services                │  ← Use Cases
│  RoleplayEngine │ NarrativeService │ StoryEngine │
├─────────────────────────────────────────────────┤
│               Domain Services                    │  ← Domain Logic
│  ProbabilityEngine │ SocialSimulator │ NPCRuntime │
├─────────────────────────────────────────────────┤
│               Domain Models                      │  ← Core Entities
│  EntityNode │ Quest │ NPCProfile │ StoryArc      │
├─────────────────────────────────────────────────┤
│              Infrastructure                      │  ← Persistence/External
│  SQLiteStore │ LLMClient │ EventBus │ AtomicIO   │
└─────────────────────────────────────────────────┘
```

---

## [A2] Contextes bornés

### BC1 : Gestion du monde

**Objectif :** Cycle de vie multi-monde — création, configuration, bascule et persistance de l'état du monde.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | `World`, `WorldFrame` |
| **Entités clés** | `EntityNode` (Character, Faction, Location, Item, Event, Race, WorldRule) |
| **Objets de valeur** | `WorldCreateParams`, `WorldSummary`, `LayeredProfile` (couches L1/L2/L3) |
| **Événements de domaine** | `WORLD_CREATED`, `WORLD_FRAME_LOADED`, `WORLD_EVOLVED` |
| **Persistance** | `worlds/{name}/world_frame.json`, `worlds/{name}/entities.json` |

**Fichiers clés :**
- `src/services/world-manager.ts` — opérations CRUD, bascule de monde
- `src/services/world-builder.ts` — construction de monde en couches pilotée par LLM
- `src/services/world-validator.ts` — contrôles d'intégrité
- `src/services/world-evolver.ts` — ajoute des PNJ/lieux/objets au fil du temps
- `src/routes/worlds.ts` — adaptateur HTTP

**Règles de domaine :**
- Les noms de monde sont slugifiés et uniques
- Chaque monde possède son propre répertoire de données isolé sous `worlds/`
- `WorldFrame` définit la structure canonique (calendrier, système magique, races, factions, lieux, objets, événements historiques, règles du monde)
- Les profils d'entités utilisent un système à 3 couches : L1 (identité), L2 (état dynamique), L3 (caché/secret)

---

### BC2 : Entité & Graphe

**Objectif :** Représentation en mémoire sous forme de graphe des entités du monde et de leurs relations. Fournit des recherches en O(1) et un parcours de graphe.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | `GraphStore` (racine d'agrégat pour le graphe du monde) |
| **Entités clés** | `EntityNode`, `GraphEdge` |
| **Objets de valeur** | `Relationship`, `LayeredProfile`, `GraphSummary` |
| **Événements de domaine** | `ENTITY_ADDED`, `ENTITY_UPDATED`, `ENTITY_REMOVED`, `RELATIONSHIP_ADDED`, `RELATIONSHIP_BROKEN`, `GRAPH_CHANGED` |
| **Persistance** | `worlds/{name}/entities.json` (via `UnifiedEntityStore`), `worlds/{name}/branches.json` |

**Fichiers clés :**
- `src/store/entity-store.ts` — `UnifiedEntityStore` avec `NameIndex` pour une résolution nom→UID en O(1)
- `src/services/graph-store.ts` — graphe à carte d'adjacence avec arêtes avant/arrière
- `src/services/branch-manager.ts` — branchement de type Git pour les graphes d'histoire
- `src/intelligence/` — analyse de graphe, validation, réparation des relations

**Règles de domaine :**
- Les entités ont un `uid` unique et se résolvent par nom, jeton ou préfixe de type
- `NameIndex` prend en charge la résolution floue (insensible à la casse, basée sur les jetons, type dépouillé)
- `BranchManager` prend en charge le branchement parent→enfant avec ajouts/suppressions par branche
- Les arêtes du graphe sont bidirectionnelles (cartes avant + arrière)

---

### BC3 : Narration & Histoire

**Objectif :** Génération narrative de base — le conteur, les transitions de scène, les temps forts de l'histoire et l'orchestration dramatique.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | `StoryContext`, `StoryArc`, `DirectorTask`, `ChapterData`, `BeatData` |
| **Entités clés** | `StoryBeat`, `ArcPhase`, `ArcTimelineEvent` |
| **Objets de valeur** | `NarratorOutput`, `NPCDialogue`, `SceneTransition` |
| **Événements de domaine** | `STORY_EVENT`, `STORY_BEAT`, `VILLAIN_PROGRESS` |
| **Persistance** | `worlds/{name}/director_state.json`, `worlds/{name}/story_arcs.json`, `worlds/{name}/planner_state.json` |

**Fichiers clés :**
- `src/services/narrative-service.ts` — **Racine de composition** / conteneur DI pour tous les services narratifs
- `src/services/roleplay-engine.ts` — traitement principal du jeu de rôle, répartition des agents
- `src/services/agents/stylist.ts` — génération de prose pilotée par LLM (le seul générateur de prose)
- `src/services/agents/dramaturg.ts` — sélection de motifs narratifs parmi les archétypes bibliques
- `src/services/agents/validator.ts` — vérification des faits via le MCP Wikipédia
- `src/services/director-loop.ts` — orchestrateur d'arrière-plan (horloge→social→antagoniste→hasard→temps forts)
- `src/services/story-engine.ts` — génération d'événements à partir des temps forts de l'histoire + application des effets
- `src/services/story-planner.ts` — planification de chapitres/temps forts pilotée par LLM
- `src/services/story-arc-manager.ts` — CRUD des arcs d'histoire avec phases
- `src/models/story.ts` — `StoryContext`, `NarratorOutput`, `NPCDialogue`, `SceneTransition`
- `src/models/director.ts` — `DirectorTask`, `StoryArc`, `StoryBeat`, `TaskPriority`

**Règles de domaine :**
- `DirectorLoop` s'exécute sur un intervalle de tick configurable (30 minutes par défaut)
- Les temps forts majeurs de l'histoire ont un délai de récupération (6 heures par défaut)
- `StoryPlanner` utilise une planification en deux phases : plan de chapitre → génération de temps forts
- L'énumération `TaskPriority` contrôle l'ordre de la file LLM (CRITICAL > HIGH > NORMAL > LOW)
- Les prompts des agents se résolvent depuis SQLite d'abord, puis le repli JSON, puis les valeurs par défaut codées en dur

---

### BC4 : PNJ & Dialogue

**Objectif :** Gestion de l'état des personnages non-joueurs, mémoire épisodique, sessions de dialogue et génération de PNJ.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | `NPCProfile` (racine d'agrégat par PNJ) |
| **Entités clés** | `EpisodicMemory`, `DialogueSession`, `DialogueMessage` |
| **Objets de valeur** | `NPCSkills`, `NPCDialogue`, `DialogueChoice`, `GreetingTemplate` |
| **Événements de domaine** | `ENTITY_ADDED` (pour les PNJ générés), `MEMORY_ADDED`, `MEMORY_CONSOLIDATED` |
| **Persistance** | `worlds/{name}/npc_profiles.json`, `worlds/{name}/npc_profiles/{name}.json` |

**Fichiers clés :**
- `src/services/npc-runtime.ts` — `NPCRuntime` : stockage d'état avec mémoire à court/long terme
- `src/services/npc-generator.ts` — création de PNJ pilotée par LLM
- `src/services/agents/actor.ts` — génération de dialogue et d'interaction de PNJ
- `src/services/npc-economy.ts` — richesse, impôts, trésorerie, production alimentaire des PNJ
- `src/services/dialogue-manager.ts` — sessions de conversation, sujets, choix
- `src/services/dialogue-context.ts` — état contextuel du dialogue
- `src/models/npc-state.ts` — `NPCProfile`, `EpisodicMemory`, `NPCSkills`

**Règles de domaine :**
- Les profils de PNJ ont une mémoire à court terme (plafonnée à 20) et une mémoire épisodique à long terme
- La consolidation de mémoire se produit lorsque le court terme dépasse `_importanceThreshold` (0,4)
- Les PNJ se synchronisent depuis le magasin d'entités au démarrage — les profils manquants sont créés automatiquement
- Les sessions de dialogue suivent une machine à états : `greeting → active → farewell → idle`
- L'énumération `TopicCategory` contraint les sujets de conversation valides

---

### BC5 : Social & Relations

**Objectif :** Relations entre personnages, dynamique de factions, alliances, hiérarchies féodales et relations amoureuses.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | `SocialGraph` (racine d'agrégat pour tout l'état social) |
| **Entités clés** | `Relationship`, `Faction`, `Alliance`, `FeudalRelationship` |
| **Objets de valeur** | `FactionSummary`, `FeudalSummary`, `RomanceStatus`, `RomanceProgression` |
| **Événements de domaine** | `RELATIONSHIP_ADDED`, `RELATIONSHIP_REPAIRED`, `RELATIONSHIP_BROKEN` |
| **Persistance** | répertoire `worlds/{name}/social/` (fichiers JSON par sous-système) |

**Fichiers clés :**
- `src/services/social-graph.ts` — `SocialGraph` : relations, factions, alliances, féodalité
- `src/services/social-simulator.ts` — sélection de paires, génération d'interactions
- `src/services/romance-engine.ts` — progression des relations amoureuses
- `src/services/romance-profiles.ts` — profils de probabilité pour les événements amoureux
- `src/models/romance.ts` — `RelationshipMemory`, `RomanceStatus`, `RomanceProgression`

**Règles de domaine :**
- `SocialSimulator` sélectionne les paires selon la proximité géographique et l'alignement de faction
- Les types d'interaction sont pondérés par le contexte : même lieu vs même faction vs factions différentes
- La romance utilise `ProbabilityEngine` pour une résolution déterministe des résultats
- Les relations féodales suivent la loyauté, la contribution fiscale, l'obligation militaire
- Les alliances peuvent être trahies ; la trahison a des conséquences

---

### BC6 : Quêtes

**Objectif :** Gestion du cycle de vie des quêtes — génération, objectifs, récompenses, chaînes et intégration au dialogue.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | `Quest`, `QuestDefinition` |
| **Entités clés** | `QuestObjective`, `QuestObjectiveDef` |
| **Objets de valeur** | `QuestReward`, `QuestPrerequisite` |
| **Événements de domaine** | `QUEST_ADDED`, `QUEST_UPDATED` |
| **Persistance** | `worlds/{name}/quests.json` |

**Fichiers clés :**
- `src/services/quest-manager.ts` — CRUD de base des quêtes
- `src/services/quest-system.ts` — cycle de vie complet avec chaînes, prérequis, limites de temps
- `src/models/quest.ts` — `Quest`, `QuestObjective`, `QuestData`

**Règles de domaine :**
- Types de quêtes : `main`, `side`, `daily`, `faction`, `chain`
- États de quête : `available → active → completed | failed | abandoned`
- `QuestSystem` applique les prérequis (niveau minimal, faction, quêtes terminées, relation)
- `Quest.progress` est une valeur calculée (objectifs terminés / objectifs totaux)
- Les quêtes en chaîne se lient via le champ `chainNext`

---

### BC7 : Mémoire & Connaissance

**Objectif :** Mémoire du monde, mémoire des agents, recherche sémantique, récupération basée sur les embeddings et gestion du cycle de vie de la mémoire.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | `WorldMemory` (racine d'agrégat), `AgentMemoryStore` (par agent) |
| **Entités clés** | `WorldMemoryEntry`, `AgentMemoryEntry` |
| **Objets de valeur** | `MemoryConfig`, `ScoringWeights`, `MemoryMetadata`, `RankedItem` |
| **Événements de domaine** | `MEMORY_ADDED`, `MEMORY_CONSOLIDATED`, `MEMORY_FORGOTTEN` |
| **Persistance** | `tns.db` (SQLite), `worlds/{name}/memory/` (partitions), index FAISS |

**Fichiers clés :**
- `src/memory/world-memory.ts` — `WorldMemory` : scoring, partitionnement, embedding, regroupement
- `src/lib/agent-memory-store.ts` — `AgentMemoryStore` : RAG par agent avec recherche hybride
- `src/lib/sqlite-store.ts` — `SQLiteStore` : FTS5 + recherche vectorielle + fusion RRF
- `src/lib/vector-ops.ts` — similarité cosinus, distance L2, produit scalaire
- `src/services/memory-engine.ts` — `MemoryEngine` : recherche sémantique sur les mémoires épisodiques des PNJ
- `src/services/memory-manager.ts` — `MemoryManager` : historique de conversation
- `src/memory/` — scoring, regroupement, tampon d'écriture, file d'embeddings, pipeline cognitif

**Règles de domaine :**
- Le scoring de mémoire utilise une formule pondérée : importance (0,35) + récence (0,25) + accès (0,15) + émotion (0,10) + pertinence (0,15)
- Les mémoires sous `minKeepScore` (0,15) et plus anciennes que `minKeepDays` (30) sont élaguées
- La mémoire des agents est isolée par la colonne `role` (ID d'agent) dans SQLite
- Recherche hybride : mot-clé FTS5 + vecteur dense → Reciprocal Rank Fusion (RRF)
- L'index FAISS est reconstruit lorsque la fragmentation dépasse le seuil (200 nouvelles entrées)
- Le tampon d'écriture regroupe la génération d'embeddings par efficacité

---

### BC8 : Intégration LLM

**Objectif :** Gestion LLM multi-fournisseurs, file de requêtes, limitation de débit, affectation de modèle par agent et construction de prompts.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | `ProviderManager` (singleton), `LLMQueue` |
| **Entités clés** | `AgentModelAssignment`, `LLMProvider` |
| **Objets de valeur** | `AgentConfig`, `AgentPromptConfig`, `LLMClientOptions` |
| **Événements de domaine** | Aucun (couche d'infrastructure) |
| **Persistance** | `conf/providers.json`, `conf/agents.json`, `tns.db` (table agent_prompts) |

**Fichiers clés :**
- `src/lib/llm-client.ts` — `LLMClient` : cache LRU par agent, répartition des fournisseurs
- `src/lib/llm-queue.ts` — `LLMQueue` : file de priorité, contrôle de concurrence, limitation de débit
- `src/lib/providers/provider-manager.ts` — `ProviderManager` : support multi-fournisseurs, multi-clés
- `src/lib/providers/` — fournisseurs OpenAI, Anthropic, Google, Ollama, LlamaCpp
- `src/services/agent-config.ts` — configuration des agents (prompts globaux + par monde)
- `src/services/prompt-builder.ts` — modèles de prompts statiques pour tous les agents
- `src/services/model-manager.ts` — gestion des modèles

**Règles de domaine :**
- `LLMQueue` applique une concurrence maximale (3 par défaut) et un plafond de file (50 par défaut)
- Éviction par priorité : les tâches de priorité la plus basse sont abandonnées lorsque la file est pleine
- Limitation de débit via `RateLimiter` (basée sur les RPM avec rechargement automatique)
- Chaque agent peut avoir son propre fournisseur, modèle, température et nombre maximal de jetons
- Résolution des prompts : SQLite (`agent_prompts`) → repli JSON → valeurs par défaut codées en dur
- `LLMClient` utilise un cache LRU (256 entrées, TTL de 5 minutes) pour les requêtes répétées

---

### BC9 : Probabilité & Combat

**Objectif :** Calculs de probabilité déterministes pour toutes les mécaniques de jeu — combat, actions sociales, artisanat, romance.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | `ProbabilityEngine` |
| **Entités clés** | `ProbabilityModifier`, `ProbabilityProfile` |
| **Objets de valeur** | `ProbabilityParameter`, `ProbabilityResult`, `OutcomeQuality` |
| **Événements de domaine** | Aucun (calcul pur) |
| **Persistance** | Aucune (en mémoire, dérivée de l'état des PNJ) |

**Fichiers clés :**
- `src/services/probability-engine.ts` — calculs de probabilité de base
- `src/services/probability-resolver.ts` — résolution de contexte (lieu, relations, état du monde)
- `src/services/probability-expression.ts` — analyseur d'expressions pour les modificateurs dynamiques
- `src/services/probability-profiles.ts` — profils de probabilité prédéfinis
- `src/models/probability.ts` — `ProbabilityModifier`, `ProbabilityProfile`, `OutcomeQuality`

**Règles de domaine :**
- Les modificateurs ont des types : `ADD`, `MULTIPLY`, `REPLACE`
- Règles d'empilement : `STACK`, `TAKE_HIGHEST`, `TAKE_LOWEST`, `OVERRIDE`
- Les modificateurs peuvent expirer (durée basée sur le temps)
- `OutcomeQuality` s'étend de `CRITICAL_FAILURE` à `CRITICAL_SUCCESS`
- Le résolveur de contexte injecte des modificateurs dynamiques selon le lieu, les relations, l'état du monde
- Les noyaux FFI Mojo (`probability_ffi.mojo`) accélèrent les calculs par lots

---

### BC10 : Gestion des antagonistes

**Objectif :** Gestion du cycle de vie des antagonistes avec planification stratégique pilotée par LLM et phases de machine à états.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | `VillainAgendaData` |
| **Entités clés** | `VillainMemoryData` |
| **Objets de valeur** | Phase (`plotting → preparing → executing → climax`) |
| **Événements de domaine** | `VILLAIN_PROGRESS` |
| **Persistance** | `worlds/{name}/villain_state.json` |

**Fichiers clés :**
- `src/services/villain-manager.ts` — `VillainManager` : transitions de phase, planification stratégique

**Règles de domaine :**
- L'antagoniste suit une machine à états à 4 phases : `plotting → preparing → executing → climax`
- Chaque transition de phase nécessite l'achèvement d'un ensemble d'actions
- Le LLM génère des actions d'antagoniste sensibles au contexte (sabotage, rumeur, infiltration d'espions, etc.)
- Les actions de l'antagoniste ont des conséquences de succès/échec qui affectent l'état du monde
- Les sbires peuvent être affectés à l'exécution des plans de l'antagoniste

---

### BC11 : Intelligence & Analyse

**Objectif :** Analyse de graphe, validation, déduplication et moteur de recommandation.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | Aucun (couche de services) |
| **Entités clés** | Aucune |
| **Objets de valeur** | Résultats de validation, recommandations |
| **Événements de domaine** | Aucun |
| **Persistance** | Lit depuis le magasin d'entités, écrit les résultats de validation |

**Fichiers clés :**
- `src/intelligence/graph-analyzer.ts` — métriques de graphe, centralité, clusters
- `src/intelligence/graph-validator.ts` — contrôles d'intégrité
- `src/intelligence/duplicate-detector.ts` — déduplication d'entités
- `src/intelligence/relationship-repairer.ts` — réparation des relations rompues
- `src/intelligence/recommender.ts` — recommandations de contenu
- `src/intelligence/scene-generator.ts` — génération procédurale de scènes
- `src/intelligence/rule-checker.ts` — application des règles du monde
- `src/intelligence/subgraph-expander.ts` — expansion de sous-graphes

---

### BC12 : Compilateur littéraire v2 (v0.32.5)

**Objectif :** Extraction narrative hors ligne à partir de sources littéraires et récupération hybride à l'exécution pour une génération de prose contrainte. Remplace le pipeline v1 lourd en LLM par un système déterministe de modèles + motifs de style.

| Aspect | Détail |
|--------|--------|
| **Agrégats clés** | `LiteraryCompilerDB` (racine d'agrégat pour toutes les tables v2) |
| **Entités clés** | `SceneTemplate`, `StylePattern`, `ChunkIndex`, `TemplateStyleLink` |
| **Objets de valeur** | `RetrievalKeys`, `RankedTemplate`, `ExtractResult`, `PreScoreResult`, `TurnMetrics` |
| **Événements de domaine** | Aucun (pipeline hors ligne + récupération à l'exécution) |
| **Persistance** | `literary.db` (SQLite avec index FTS5) |

**Fichiers clés :**
- `src/mcp/literary-compiler/schema.ts` — `LiteraryCompilerDB` : 6 tables v2, FTS5, méthodes CRUD
- `src/mcp/literary-compiler/archetypes.ts` — 12 archétypes canoniques + ensembles de mots-clés + variables + positions
- `src/mcp/literary-compiler/chunker.ts` — découpage de texte par phrases (200-400 jetons, chevauchement 40-80)
- `src/mcp/literary-compiler/pre-score.ts` — scoring de mots-clés par dictionnaire + densité narrative (dialogue/action/conflit)
- `src/mcp/literary-compiler/extractor.ts` — extracteur JSON LLM avec validation de style Zod
- `src/mcp/literary-compiler/retrieval.ts` — scoring composite : archétype (0,40) + humeur (0,15) + domaine (0,15) + qualité (0,10) + fraîcheur (0,05) + étiquettes (0,15)
- `src/mcp/literary-compiler/fill-template.ts` — remplacement déterministe des `[placeholder]`
- `src/mcp/literary-compiler/linter.ts` — validation V2 : détection de moralisation, limites de jetons, validité d'archétype
- `src/mcp/literary-compiler/runtime-metrics.ts` — suivi de latence par tour
- `src/services/agents/stylist.ts` — `buildMicroPrompt()` pour la génération contrainte v2
- `src/lib/feature-flags.ts` — drapeaux `literary-compiler-v2`, `literary-v2-retrieval`, `literary-v2-stylist`
- `scripts/migrate-v1-to-v2.ts` — migration des noms d'archétypes (escape → escape_liberation, etc.)

**Règles de domaine :**
- Tous les modèles utilisent l'anglais (interlingua) pour l'optimisation RAG
- Les modèles sont anonymisés (aucun nom de personnage de la source)
- Contrainte anti-moralisation appliquée au niveau du linter + du prompt
- Chaque modèle a un squelette de ≤ 120 jetons
- La récupération renvoie le modèle top-1 (top-2 si quasi-égalité)
- Budget strict : 1-2 appels LLM par tour (contre 4-5 en v1)
- Activé par drapeaux de fonctionnalité pour un déploiement progressif

**Pipeline hors ligne :**
```
Source text
  → A. Chunker (pure code, 200-400 tokens, overlap 40-80)
  → B. BGE-M3 embed + store
  → C. Dictionary/heuristic candidate pass
  → D. Cluster / near-dup collapse (vectors)
  → E. Select representatives
  → F. Small local LLM JSON extract (Qwen3-8B, temp=0.1)
  → G. Role consistency map
  → H. Linter / quality gate
  → I. Write scene_templates + style_patterns + links
  → J. Emit metrics report
```

**Flux à l'exécution :**
```
Player input
  → Intent + Simulation + State mutation (0 LLM)
  → Build retrieval keys (position, archetype, mood, domain)
  → FTS + dictionary hybrid retrieval → top-1 template
  → Get linked style_pattern
  → fillTemplate (deterministic)
  → Stylist micro-prompt → 1 LLM call → 2-3 paragraphs
  → Rule-based Censor
```

---

## [A3] Agrégats & Entités

### BC1 : Gestion du monde

| Composant | Type | Invariants |
|-----------|------|------------|
| `World` | Racine d'agrégat | Doit avoir un nom slugifié unique ; doit avoir un `WorldFrame` valide |
| `WorldFrame` | Objet de valeur | Doit définir `world_name` ; `world_rules` doit être non vide pour des mondes valides |
| `LayeredProfile` | Objet de valeur | L1 doit avoir `name` et `type` ; les couches sont L1/L2/L3 |
| `EntityNode` | Entité | Doit avoir un `uid` unique ; `entityType` doit être un `EntityTypeValue` valide |
| `EntityType` | Objet de valeur (enum) | `CHARACTER`, `FACTION`, `LOCATION`, `ITEM`, `EVENT`, `WORLD_RULE`, `RACE`, `UNKNOWN` |

### BC2 : Entité & Graphe

| Composant | Type | Invariants |
|-----------|------|------------|
| `GraphStore` | Racine d'agrégat | Doit être démarré avant le parcours ; les arêtes référencent des UID valides |
| `GraphEdge` | Entité | `source` et `target` doivent être des UID d'entités valides |
| `Relationship` | Objet de valeur | `sourceUid` et `targetUid` doivent exister ; `strength` est 0-1 |
| `BranchManager` | Entité | Les noms de branche doivent être uniques ; le parent doit exister |

### BC3 : Narration & Histoire

| Composant | Type | Invariants |
|-----------|------|------------|
| `StoryContext` | Objet de valeur | Doit avoir `worldName`, `currentTime`, `location` |
| `StoryArc` | Racine d'agrégat | Doit avoir un `id` unique ; tableau `beats` ordonné par timing |
| `DirectorTask` | Entité | Doit avoir un `id` unique ; `priority` dans la plage `TaskPriority` |
| `BeatData` | Entité | Doit appartenir à un `chapter_id` valide ; `triggered` est booléen |
| `ChapterData` | Objet de valeur | Doit avoir un `id` unique ; tableau `beats` non nul |

### BC4 : PNJ & Dialogue

| Composant | Type | Invariants |
|-----------|------|------------|
| `NPCProfile` | Racine d'agrégat (par PNJ) | Doit avoir un `name` et un `uid` uniques ; `health` 0-100 ; valeurs `skills` 0-1 |
| `EpisodicMemory` | Entité | Doit avoir un `id` unique ; `importance` 0-1 ; `emotion` non vide |
| `DialogueSession` | Entité | Doit avoir un `id` unique ; `state` dans la plage d'enum valide |
| `NPCSkills` | Objet de valeur | Toutes les valeurs de compétence doivent être 0-1 |
| `DialogueMessage` | Objet de valeur | `role` doit être `player` ou `npc` |

### BC5 : Social & Relations

| Composant | Type | Invariants |
|-----------|------|------------|
| `SocialGraph` | Racine d'agrégat | Doit avoir un chemin d'état valide ; les relations référencent des entités valides |
| `Relationship` | Entité | `type` dans un enum valide ; `strength` 0-1 ; `source` ≠ `target` |
| `Faction` | Objet de valeur | Doit avoir un `name` unique ; les membres sont uniques |
| `Alliance` | Objet de valeur | `faction1` ≠ `faction2` ; `strength` 0-1 |
| `FeudalRelationship` | Objet de valeur | `vassal` ≠ `liege` ; `loyalty` 0-1 |

### BC6 : Quêtes

| Composant | Type | Invariants |
|-----------|------|------------|
| `Quest` | Racine d'agrégat | Doit avoir un `id` unique ; `status` dans un enum valide ; `progress` calculé |
| `QuestDefinition` | Racine d'agrégat | Doit avoir un `id` unique ; `objectives` non vide |
| `QuestObjective` | Entité | `completed` est booléen |
| `QuestReward` | Objet de valeur | `gold`, `experience` ≥ 0 |
| `QuestPrerequisite` | Objet de valeur | Au moins un prérequis doit être défini |

### BC7 : Mémoire & Connaissance

| Composant | Type | Invariants |
|-----------|------|------------|
| `WorldMemory` | Racine d'agrégat | Doit avoir un chemin de stockage valide ; entrées scorées par formule pondérée |
| `WorldMemoryEntry` | Entité | Doit avoir un `id` unique ; `importance` 0-1 ; `content` non vide |
| `AgentMemoryStore` | Racine d'agrégat | Isolé par `agentId` ; utilise la recherche hybride FTS5 + vecteur |
| `MemoryConfig` | Objet de valeur | Toutes les pondérations ≥ 0 ; `halfLifeDays` > 0 |
| `ScoringWeights` | Objet de valeur | Les pondérations totalisent 1,0 |

---

## [A4] Services de domaine

Services transversaux qui n'appartiennent pas à un agrégat unique :

| Service | Fichier | Objectif |
|---------|------|---------|
| `NarrativeService` | `src/services/narrative-service.ts` | **Racine de composition** — instancie et câble tous les sous-systèmes narratifs |
| `RoleplayEngine` | `src/services/roleplay-engine.ts` | Point d'entrée principal : orchestre PipelineRunner → CommandHandler → générateurs Prose. SessionState extrait vers `roleplay/session-state.ts`, gestionnaires dans `roleplay/handlers/` |
| `StoryEngine` | `src/services/story-engine.ts` | Génération d'événements à partir des temps forts + application des effets (déplacements de PNJ, changements de relations, création de quêtes) |
| `DirectorLoop` | `src/services/director-loop.ts` | Orchestrateur d'arrière-plan : tick d'horloge → sim sociale → antagoniste → événements de hasard → temps forts narratifs |
| `SocialSimulator` | `src/services/social-simulator.ts` | Sélection de paires de PNJ + génération d'interactions |
| `ProbabilityEngine` | `src/services/probability-engine.ts` | Résolution déterministe des résultats avec empilement de modificateurs |
| `MemoryEngine` | `src/services/memory-engine.ts` | Recherche sémantique sur les mémoires épisodiques des PNJ |
| `WorldValidator` | `src/services/world-validator.ts` | Validation de l'intégrité du monde |
| `AgentCoordinator` | `src/services/agent-coordinator.ts` | File de priorité pour l'exécution des tâches du directeur |
| `StartResolver` | `src/services/start-resolver.ts` | Résout le contexte d'histoire initial depuis l'état du monde |
| `WorldIsolator` | `src/services/world-isolator.ts` | Isolation multi-monde avec surveillance des ressources (mémoire, CPU, jetons) |
| `CrossWorldBus` | `src/services/cross-world-bus.ts` | Communication d'événements inter-mondes avec portails |
| `PluginManager` | `src/plugins/plugin-manager.ts` | Gestion du cycle de vie des plugins (enregistrement, désenregistrement, capacités) |

---

## [A5] Événements de domaine

Tous les événements sont définis dans l'énumération `EventTopic` (`src/lib/event-bus.ts`) :

| Événement | Éditeur | Consommateurs | Description |
|-------|-----------|-----------|-------------|
| `ENTITY_ADDED` | `WorldBuilder`, `NPCGenerator` | `GraphStore`, `WorldMemory` | Nouvelle entité créée |
| `ENTITY_UPDATED` | Divers services | `GraphStore`, `WorldMemory` | Profil d'entité modifié |
| `ENTITY_REMOVED` | `GraphStore` | `WorldMemory` | Entité supprimée |
| `ENTITY_LAYER_COMPLETED` | `WorldBuilder` | `GraphStore` | Phase de construction L1/L2/L3 terminée |
| `RELATIONSHIP_ADDED` | `SocialSimulator` | `GraphStore` | Nouvelle relation formée |
| `RELATIONSHIP_REPAIRED` | `SocialSimulator` | `GraphStore` | Relation rompue réparée |
| `RELATIONSHIP_BROKEN` | `SocialSimulator` | `GraphStore` | Relation rompue |
| `WORLD_CREATED` | `WorldManager` | Tous les services | Nouveau monde initialisé |
| `WORLD_FRAME_LOADED` | `WorldBuilder` | Tous les services | Cadre du monde chargé depuis le disque |
| `WORLD_EVOLVED` | `WorldEvolver` | `Chronicler`, `WebSocketManager` | État du monde modifié |
| `STORY_EVENT` | `StoryEngine` | `Chronicler`, `WebSocketManager` | Événement d'histoire généré |
| `STORY_BEAT` | `DirectorLoop` | `Chronicler`, `WebSocketManager` | Temps fort d'histoire injecté |
| `VILLAIN_PROGRESS` | `VillainManager` | `Chronicler`, `WebSocketManager` | Action d'antagoniste exécutée |
| `QUEST_ADDED` | `QuestSystem` | `WebSocketManager` | Nouvelle quête créée |
| `QUEST_UPDATED` | `QuestSystem` | `WebSocketManager` | État de quête modifié |
| `MEMORY_ADDED` | `WorldMemory` | `AgentMemoryStore` | Nouvelle mémoire stockée |
| `MEMORY_CONSOLIDATED` | `WorldMemory` | — | Promotion court→long terme |
| `MEMORY_FORGOTTEN` | `WorldMemory` | — | Mémoire élaguée |
| `MAINTENANCE_START` | Système | Tous les services | Début du cycle de maintenance |
| `MAINTENANCE_DONE` | Système | Tous les services | Cycle de maintenance terminé |
| `GRAPH_CHANGED` | `GraphStore` | `Intelligence` | Topologie du graphe modifiée |
| `ERROR` | Divers | Journalisation | Une erreur s'est produite |

**Mécanique du bus d'événements :**
- Les gestionnaires sont triés par `priority` (plus élevée = exécuté en premier)
- Tampon de relecture (100 événements par défaut) pour les abonnés tardifs
- Publication asynchrone avec `await` — pas de fire-and-forget

---

## [A6] Couche applicative

### Flux de cas d'utilisation : Message du joueur → Réponse du Stylist

```
1. HTTP POST /chat/message
   └─→ routes/chat.ts: Zod validation, input sanitization

2. RoleplayEngine.processInput(sanitizedMessage)
   ├─→ SessionState (activeCharacter, currentLocation, currentTime)
   ├─→ PipelineRunner.translateAndClassify() → IntentParser
   ├─→ CommandHandler.handle() for commands
   ├─→ PipelineRunner.runSimulation() → SimulationEngine
   ├─→ Prose generation: LiteraryV2Generator or LegacyIntentGenerator
   └─→ Returns narrative string

3. Stylist.process(intent, simulation, context, pattern)
   ├─→ loadAgentConfig("stylist") → SQLite prompts → JSON fallback → defaults
   ├─→ resolveTemplate(template, vars) with StoryContext fields
   └─→ LLMQueue.generateText(prompt, priority, temperature, agentId)

4. LLMQueue
   ├─→ RateLimiter.check() → concurrency control
   ├─→ ProviderManager.getProvider(agentId) → provider/model
   ├─→ LLMClient.generate() → LRU cache check → HTTP to LLM
   └─→ Return response

5. RoleplayEngine
   ├─→ MemoryManager.addEntry(user, response)
   ├─→ Chronicler.logEvent(...) → WorldMemory.addEvent(...)
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Return { narrative, location, storyTime, activeCharacter }

6. WebSocketManager.broadcast({ type: "narrative", ... })
```

### Flux de cas d'utilisation : Tick du Directeur → Temps fort d'histoire

```
1. DirectorLoop (background setInterval, default 30min)
   ├─→ WorldClock.tick(minutes)
   ├─→ SocialSimulator.simulateInteraction()
   ├─→ VillainManager.tick() → phase transitions
   ├─→ ProbabilityEngine.roll() → chance events
   └─→ StoryPlanner.shouldGenerateBeat() → StoryEngine.generateEvent()

2. StoryEngine.generateEvent()
   ├─→ LLMQueue.generateJson(EVENT_PROMPT, ...) → structured event
   ├─→ Apply effects: NPC moves, relationship changes, quest creation
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Chronicler.logEvent(...)

3. DirectorLoop
   ├─→ StoryEngine.generateBeat() → LLM generates narrative beat
   ├─→ RoleplayEngine.injectBeat(beat) → prepend to next response
   └─→ Save director_state.json
```

### Flux de cas d'utilisation : Création de monde

```
1. HTTP POST /api/worlds
   └─→ routes/worlds.ts → world-manager.createWorld(params)

2. WorldManager.createWorld()
   ├─→ mkdir worlds/{slugified-name}/
   ├─→ Write world_frame.json
   ├─→ EventBus.publish(WORLD_CREATED)
   └─→ NarrativeService.reset(dbPath, worldFrame)

3. WorldBuilder (on /api/launch)
   ├─→ createWorld() → LLM generates WorldFrame
   ├─→ buildL1() → identity layer for all entities
   ├─→ buildL2() → dynamic state layer
   ├─→ buildL3() → hidden/secret layer
   ├─→ buildRelationships() → entity relationships
   └─→ EventBus.publish(ENTITY_ADDED) for each entity

4. WebSocketManager.broadcast({ type: "world_created", ... })
```

### Flux de cas d'utilisation : Mémoire des agents

```
1. Stylist generates narrative prose
   └─→ EventBus.publish(MEMORY_ADDED, { content, source: "stylist" })

2. WorldMemory.addEvent()
   ├─→ Create WorldMemoryEntry with scoring metadata
   ├─→ EmbeddingQueue.enqueue(entry) → batch embedding via BGE-M3
   ├─→ VectorIndex.add(embedding, entryId)
   ├─→ WriteBehindBuffer.add(entry)
   └─→ Periodic flush to SQLite + FAISS rebuild

3. AgentMemoryStore.search(agentId, query)
   ├─→ getEmbedding(query) → BGE-M3 endpoint
   ├─→ SQLiteStore.searchMemoriesFTS(query) → keyword matches
   ├─→ SQLiteStore.searchMemoriesDense(vector) → cosine similarity
   ├─→ ReciprocalRankFusion(ftsResults, denseResults)
   └─→ Return top-K results filtered by agentId
```

---

## [A7] Infrastructure

### Intégration LLM

```
ProviderManager (singleton)
├── OpenAIProvider    (conf/providers.json)
├── AnthropicProvider
├── GoogleProvider
├── OllamaProvider
└── LlamaCppProvider  (local, port 5002 for embeddings)

LLMClient (per-agent)
├── ProviderManager.getProvider(agentId) → provider/model
├── LRU Cache (256 entries, 5-min TTL)
├── parseJsonWithRetry() for structured output
└── Per-agent config: temperature, maxTokens, model

LLMQueue (global)
├── Priority queue (CRITICAL > HIGH > NORMAL > LOW)
├── RateLimiter (RPM-based, auto-refill)
├── Max concurrency (default 3)
├── Queue cap (default 50) with priority eviction
└── Per-agent LLMClient instances
```

**Fichier :** `src/lib/llm-client.ts`, `src/lib/llm-queue.ts`, `src/lib/providers/provider-manager.ts`

### Persistance

| Magasin | Technologie | Chemin | Objectif |
|-------|-----------|------|---------|
| `UnifiedEntityStore` | Fichiers JSON | `worlds/{name}/entities.json` | CRUD d'entités avec résolution de nom en O(1) |
| `SQLiteStore` | `bun:sqlite` | `worlds/{name}/tns.db` | Recherche FTS5, embeddings vectoriels, prompts d'agents, traductions |
| `GraphStore` | Carte d'adjacence en mémoire | `worlds/{name}/entities.json` | Parcours de graphe, branchement |
| `SessionStore` | `bun:sqlite` | `worlds/_sessions/sessions.db` | Jetons de session d'authentification |
| `Chronicler` | Fichiers JSONL | `worlds/{name}/timeline.jsonl` | Chronologie des événements avec rotation |
| `WorldClock` | Fichier JSON | `worlds/{name}/clock_state.json` | Temps de jeu, événements planifiés |
| `NPCRuntime` | Fichiers JSON | `worlds/{name}/npc_profiles.json` | État des PNJ + mémoire épisodique |
| `SocialGraph` | Fichiers JSON | `worlds/{name}/social/*.json` | Relations, factions, alliances |
| `StoryPlanner` | Fichier JSON | `worlds/{name}/planner_state.json` | Chapitres, temps forts |
| `DirectorLoop` | Fichier JSON | `worlds/{name}/director_state.json` | État du directeur |
| `VillainManager` | Fichier JSON | `worlds/{name}/villain_state.json` | Programmes des antagonistes |
| `WorldMemory` | SQLite + FAISS | `worlds/{name}/memory/` | Mémoire sémantique avec embeddings |
| `AgentMemoryStore` | SQLite | `tns.db` | RAG par agent |
| `settings.json` | Fichier JSON | `conf/settings.json` | Paramètres applicatifs |
| `providers.json` | Fichier JSON | `conf/providers.json` | Configurations des fournisseurs LLM |
| `agents.json` | Fichier JSON | `conf/agents.json` | Affectations de modèles des agents |

**Modèle de persistance :** Toutes les écritures JSON utilisent `atomicWriteJson()` (écriture dans un fichier temporaire + renommage) pour la sécurité en cas de plantage. SQLite utilise le mode WAL avec `PRAGMA synchronous = NORMAL`.

### WebSocket temps réel

**Fichier :** `src/services/websocket-manager.ts`

- `WebSocketManager` gère les clients connectés avec des ID uniques
- `broadcast(message)` envoie à tous les clients connectés (nettoyage des connexions mortes)
- `sendTo(id, message)` pour une livraison ciblée
- Les événements de l'`EventBus` sont transférés aux clients WebSocket

### Authentification

**Fichier :** `src/middleware/auth.ts`, `src/lib/session-store.ts`

- Authentification de session par jeton (hex aléatoire de 32 octets)
- Sessions stockées en SQLite (`worlds/_sessions/sessions.db`)
- TTL de 24 heures avec nettoyage horaire
- `authMiddleware` protège toutes les routes `/api/*` sauf `/login`
- Connexion/déconnexion via des points de terminaison POST

---

## [A8] Diagrammes de flux de données

### 1. Message utilisateur → Réponse du Stylist

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│  Browser  │────▶│ routes/chat  │────▶│  RoleplayEngine  │
│           │◀────│   (Hono)     │◀────│                  │
└──────────┘     └──────────────┘     └────────┬─────────┘
                                               │
                    ┌──────────────────────────┤
                    ▼                          ▼
          ┌─────────────────┐      ┌──────────────────┐
          │    Stylist       │      │  MemoryManager   │
          │  (LLM prompt)    │      │  (history save)  │
          └────────┬─────────┘      └──────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │    LLMQueue      │
          │  (priority, rate │
          │   limit, cache)  │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐
          │  ProviderManager │
          │  (OpenAI/Anth/   │
          │   Google/Ollama) │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐     ┌──────────────────┐
          │   External LLM   │────▶│  Chronicler.log   │
          │   API            │     │  EventBus.publish │
          └─────────────────┘     └──────────────────┘
```

### 2. Tick du Directeur → Génération de temps fort d'histoire

```
┌─────────────────┐
│  DirectorLoop    │  (setInterval, every 30min)
│  ┌─────────────┐│
│  │ WorldClock  ││──▶ tick(minutes) → advance time → fire scheduled events
│  └─────────────┘│
│  ┌─────────────┐│
│  │SocialSim    ││──▶ simulateInteraction() → pair selection → event generation
│  └─────────────┘│
│  ┌─────────────┐│
│  │VillainMgr   ││──▶ tick() → phase transition → LLM strategic action
│  └─────────────┘│
│  ┌─────────────┐│
│  │ProbEngine   ││──▶ roll() → chance events (weather, accidents, discoveries)
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryPlanner ││──▶ shouldGenerateBeat() → generateNextBeat() → LLM
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryEngine  ││──▶ generateEvent() → LLM → apply effects → publish event
│  └─────────────┘│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  EventBus        │────▶│  WebSocketManager │
│  (STORY_BEAT)    │     │  (broadcast)      │
└─────────────────┘     └──────────────────┘
```

### 3. Flux de création de monde

```
┌──────────┐     ┌──────────────────┐     ┌────────────────┐
│  Browser  │────▶│  POST /worlds     │────▶│  WorldManager   │
│           │     │  (routes/worlds)  │     │  createWorld()  │
└──────────┘     └──────────────────┘     └───────┬────────┘
                                                   │
                    ┌──────────────────────────────┤
                    ▼                              ▼
          ┌─────────────────┐            ┌────────────────┐
          │  mkdir worlds/   │            │ EventBus.publish│
          │  {name}/         │            │ (WORLD_CREATED) │
          └─────────────────┘            └────────────────┘
                                                   │
                                                   ▼
                                          ┌────────────────┐
                                          │NarrativeService │
                                          │    .reset()     │
                                          └────────────────┘

POST /api/launch:
┌─────────────────┐
│  WorldBuilder    │
│  ├─ createWorld()│──▶ LLM → WorldFrame JSON
│  ├─ buildL1()    │──▶ LLM → L1 identity for each entity
│  ├─ buildL2()    │──▶ LLM → L2 dynamic state
│  ├─ buildL3()    │──▶ LLM → L3 hidden/secret
│  └─ buildRels()  │──▶ LLM → relationships
└─────────────────┘
          │
          ▼
┌─────────────────┐
│ EventBus.publish │
│ (ENTITY_ADDED    │
│  × N entities)   │
└─────────────────┘
```

### 4. Flux de mémoire des agents

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│    Stylist       │────▶│ EventBus.publish  │────▶│  WorldMemory    │
│  (generates      │     │ (MEMORY_ADDED)    │     │  .addEvent()    │
│   narrative)     │     └──────────────────┘     └───────┬────────┘
└─────────────────┘                                       │
                                                    ┌─────┴──────┐
                                                    ▼            ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │EmbeddingQueue │ │ WriteBehind  │
                                            │ (batch BGE-M3)│ │   Buffer     │
                                            └──────┬───────┘ └──────┬───────┘
                                                   │                │
                                                   ▼                ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │ VectorIndex   │ │ SQLiteStore  │
                                            │ (FAISS)       │ │ (tns.db)     │
                                            └──────────────┘ └──────────────┘

Query flow:
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│ AgentMemory   │────▶│ SQLiteStore       │────▶│ FTS5 (keyword)  │
│ .search()     │     │ .searchMemories   │     │ + Dense vectors │
│               │     │                   │     │ → RRF fusion    │
└──────────────┘     └──────────────────┘     └────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │ ReciprocalRank    │
                    │ Fusion (RRF)      │
                    └──────────────────┘
```

---

## [A9] Dépendances inter-contextes

```
                    ┌─────────────────────┐
                    │  World Management    │
                    │  (BC1)               │
                    └──────────┬──────────┘
                               │ creates/loads
                               ▼
┌──────────────┐    ┌─────────────────────┐    ┌──────────────┐
│ Entity &     │◀──▶│  Narrative & Story   │◀──▶│  NPC &       │
│ Graph (BC2)  │    │  (BC3)               │    │  Dialogue    │
└──────┬───────┘    └──────────┬──────────┘    │  (BC4)       │
       │                       │                └──────┬───────┘
       │                       │                       │
       │                       ▼                       │
       │              ┌─────────────────────┐          │
       │              │  LLM Integration     │          │
       │              │  (BC8)               │◀─────────┘
       │              └──────────┬──────────┘
       │                         │
       │    ┌────────────────────┼────────────────────┐
       │    ▼                    ▼                    ▼
       │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │ │  Social &     │ │  Quests      │ │  Villain     │
       │ │  Relationships│ │  (BC6)       │ │  (BC10)      │
       │ │  (BC5)        │ └──────┬───────┘ └──────────────┘
       │ └──────┬───────┘        │
       │        │                │
       │        ▼                ▼
       │ ┌─────────────────────────────┐
       │ │  Probability & Combat       │
       │ │  (BC9)                      │
       │ └─────────────────────────────┘
       │
       ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Memory & Knowledge  │◀──▶│  Intelligence        │
│  (BC7)               │    │  (BC11)              │
└─────────────────────┘    └─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Literary Compiler   │  (BC12, v0.32.5)
│  v2                  │
└─────────────────────┘
```

**Dépendances clés :**

| BC source | BC cible | Mécanisme de couplage |
|-----------|-----------|-------------------|
| BC1 (World) | BC2 (Entity) | instance partagée `UnifiedEntityStore` |
| BC1 (World) | BC3 (Narrative) | `NarrativeService.reset()` |
| BC3 (Narrative) | BC4 (NPC) | `NPCRuntime` injecté dans `RoleplayEngine` |
| BC3 (Narrative) | BC5 (Social) | `SocialSimulator` injecté dans `DirectorLoop` |
| BC3 (Narrative) | BC6 (Quest) | `QuestManager` injecté dans `StoryEngine` |
| BC3 (Narrative) | BC10 (Villain) | `VillainManager` injecté dans `DirectorLoop` |
| BC3 (Narrative) | BC9 (Probability) | `ProbabilityEngine` dans `RoleplayEngine` |
| BC3 (Narrative) | BC12 (LitCompiler) | `RoleplayEngine` appelle `searchTemplates` + `fillTemplate` |
| BC4 (NPC) | BC7 (Memory) | `NPCRuntime` utilise `EpisodicMemory` |
| BC5 (Social) | BC2 (Entity) | `SocialGraph` lit depuis `UnifiedEntityStore` |
| BC8 (LLM) | Tous les BC | `LLMQueue` est partagé entre tous les agents |
| BC8 (LLM) | BC12 (LitCompiler) | L'extracteur hors ligne utilise `LLMClient` pour l'extraction structurée |
| BC7 (Memory) | BC8 (LLM) | `EmbeddingQueue` appelle `LLMClient` pour les embeddings |
| BC11 (Intelligence) | BC2 (Entity) | L'analyse de graphe lit `GraphStore` |

---

## [A10] Décisions de conception clés

### D1 : Modèle de racine de composition

**Décision :** `NarrativeService` (`src/services/narrative-service.ts`) agit comme racine de composition, instanciant tous les services et câblant manuellement les dépendances.

**Compromis :** DI explicite sans framework. Toutes les dépendances sont visibles dans un seul constructeur, ce qui rend le système débogable mais verbeux. L'alternative (conteneur IoC) ajouterait de la magie à l'exécution.

### D2 : Fichiers JSON comme magasin principal (avec SQLite pour la recherche)

**Décision :** L'état des entités, les profils de PNJ et les relations sociales sont stockés sous forme de fichiers JSON. SQLite n'est utilisé que pour la recherche (FTS5), les embeddings (vecteurs), les sessions et les prompts d'agents.

**Compromis :** Lectures/écritures simples avec opérations atomiques sur fichiers, mais aucune garantie transactionnelle entre entités. Le motif `atomicWriteJson()` (écriture temporaire + renommage) offre une sécurité en cas de plantage pour les écritures individuelles mais pas de cohérence multi-fichiers. SQLite fournit une ACID complète pour la recherche et les embeddings.

### D3 : Bus d'événements pour la communication inter-contextes

**Décision :** `EventBus` avec gestionnaires triés par priorité et tampon de relecture connecte les contextes bornés de manière asynchrone.

**Compromis :** Découple les contextes (NPC ne connaît pas Memory, Memory ne connaît pas NPC) mais ajoute une indirection. Le tampon de relecture (100 événements) garantit que les abonnés tardifs ne manquent pas les événements récents, au prix de la mémoire.

### D4 : Affectation de modèle par agent

**Décision :** Chaque agent (`stylist`, `director`, `researcher`, `translation`, etc.) peut avoir son propre fournisseur LLM, modèle, température et nombre maximal de jetons.

**Compromis :** Flexibilité maximale (utiliser des modèles bon marché pour chronicler, des modèles puissants pour stylist) mais nécessite une gestion de configuration. ProviderManager gère cela avec `conf/providers.json` et `conf/agents.json`.

### D5 : Profil d'entité à trois couches (L1/L2/L3)

**Décision :** Les profils d'entités utilisent trois couches : L1 (identité/nom), L2 (état dynamique/lieu), L3 (caché/secret).

**Compromis :** Permet une révélation progressive et des secrets contrôlés par le MJ. L1 est toujours visible, L2 se met à jour pendant le jeu, L3 est caché aux joueurs. Le coût est une complexité supplémentaire dans la résolution des profils.

### D6 : Boucle Director en arrière-plan

**Décision :** `DirectorLoop` s'exécute comme un intervalle d'arrière-plan, orchestrant les ticks d'horloge, la simulation sociale, les actions des antagonistes et les temps forts narratifs indépendamment de la saisie du joueur.

**Compromis :** Crée un monde vivant qui évolue même lorsque les joueurs sont hors ligne. Le compromis est la complexité de la gestion d'état (états en pause/en cours, délais de récupération des temps forts majeurs) et le risque d'événements manqués par les joueurs.

### D7 : Recherche hybride (FTS5 + Vecteur + RRF)

**Décision :** La recherche de mémoire utilise à la fois la recherche par mots-clés (FTS5) et sémantique (vecteur dense), combinées via Reciprocal Rank Fusion.

**Compromis :** Le meilleur des deux mondes — correspondances exactes par mots-clés et similarité sémantique. Le coût est le maintien des deux index et du pipeline d'embeddings (BGE-M3 via le serveur llama.cpp sur le port 5002).

### D8 : Branchement de type Git pour les graphes d'histoire

**Décision :** `BranchManager` prend en charge le branchement du graphe d'entités, permettant des chemins d'histoire alternatifs.

**Compromis :** Permet des scénarios « et si » et des chronologies parallèles sans dupliquer l'ensemble de l'état du monde. Chaque branche ne stocke que les ajouts et suppressions relatifs au parent.

### D9 : Prompts d'agents basés sur des modèles avec repli SQLite

**Décision :** Les prompts d'agents sont stockés en SQLite (`agent_prompts`) avec isolation par monde et par langue, avec repli vers des fichiers JSON puis des valeurs par défaut codées en dur.

**Compromis :** Prend en charge l'i18n et la personnalisation par monde sans modification de code. Le repli à trois niveaux garantit que le système fonctionne même sans base de données.

### D10 : FFI Mojo pour les calculs critiques en performance

**Décision :** Les calculs de probabilité et les opérations vectorielles peuvent utiliser des noyaux FFI Mojo (`probability_ffi.mojo`, `vector_ffi.mojo`) avec des replis TypeScript.

**Compromis :** Gains de performance significatifs pour les opérations par lots (jets de probabilité, similarité cosinus) mais ajoute une complexité de compilation et une dépendance à la plateforme. Les replis TypeScript garantissent la portabilité.

---

## Annexe : Référence des fichiers

| Répertoire | Fichiers | Objectif |
|-----------|-------|---------|
| `src/models/` | 12 fichiers | Modèles de domaine (Entity, Quest, Story, Director, NPC, Romance, Probability, Memory, Item, Rank, Archetype) |
| `src/services/` | 45+ fichiers | Services applicatifs + de domaine |
| `src/routes/` | 18 fichiers | Adaptateurs HTTP (routeurs Hono) |
| `src/lib/` | 15+ fichiers | Infrastructure (LLM, SQLite, EventBus, opérations vectorielles, fournisseurs) |
| `src/memory/` | 12 fichiers | Sous-système de mémoire (scoring, regroupement, embedding, pipeline cognitif) |
| `src/intelligence/` | 10 fichiers | Analyse et validation de graphe |
| `src/store/` | 1 fichier | Magasin d'entités unifié avec NameIndex |
| `src/config/` | env.ts | Configuration d'environnement |
| `src/i18n/` | Internationalisation | Support multilingue (7 langues) |
| `src/middleware/` | auth, rate-limiter, etc. | Middleware HTTP |
| `src/utils/` | logger, sanitize, etc. | Utilitaires partagés |
