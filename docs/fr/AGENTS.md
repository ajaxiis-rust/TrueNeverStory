# Référence des agents (v0.32.5)

TrueNeverStory possède **deux systèmes d'agents** qui coexistent :

1. **Les Big Six (AgentV2)** — le pipeline de prose narrative. Enregistrés dans `AgentRegistryV2` et instanciés dans `RoleplayEngine`.
2. **Agents configurés (`DEFAULT_AGENTS`)** — les anciens agents pilotés par configuration, listés dans `src/services/agent-config.ts`. Ils alimentent l'interface Settings/Providers et quelques sous-systèmes (recherche inactive, `@mentions` du chat).

Les Big Six sont : `dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`. Les agents configurés sont : `director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation`.

`stylist` est le seul générateur de prose. Les agents supprimés (`narrator`, `npc`, `scene`, `historian`, `cartographer`, `lorekeeper`, `merchant`, `quest-giver`) n'existent plus nulle part dans le code.

---

## Les Big Six (AgentV2)

Ils gèrent le pipeline de prose déterministe : intention → simulation → contexte → prose.

### 1. Dramaturg (L'architecte)

**ID :** `dramaturg`
**Rôle :** Sélectionne les motifs narratifs parmi les archétypes bibliques
**Outils MCP :** `search_verses`, `get_pattern`, `get_archetype`

| Aspect | Détail |
|--------|--------|
| **Objectif** | Analyse la situation actuelle et choisit des structures narratives appropriées à partir de motifs bibliques |
| **Entrée** | Intent, SimulationResult, GameContext |
| **Sortie** | NarrativePattern (archétype, nom, description, versets, humeur) |
| **Dépendances** | TNSServer (MCP), LLMQueue |

**Flux :**
1. Déduit l'humeur à partir du type d'intention et du résultat de simulation
2. Interroge le MCP Bible pour des archétypes correspondants
3. Retombe sur des motifs générés par LLM si le MCP est indisponible

### 2. Validator (Le vérificateur de faits)

**ID :** `validator`
**Rôle :** Vérifie les faits via le MCP Wikipédia
**Outils MCP :** `verify_fact`, `get_context`

| Aspect | Détail |
|--------|--------|
| **Objectif** | Assure la cohérence du monde et l'exactitude historique |
| **Entrée** | Intent, SimulationResult, GameContext |
| **Sortie** | Résultats de vérification (vérifié, confiance, preuves, sources) |
| **Dépendances** | TNSServer (MCP) |

**Flux :**
1. Extrait les affirmations factuelles de la situation
2. Interroge le MCP Wikipédia pour vérification
3. Renvoie les résultats de vérification avec niveaux de confiance

### 3. Stylist (Le narrateur)

**ID :** `stylist`
**Rôle :** Produit la prose à l'aide de motifs de style Gutenberg — le seul générateur de prose
**Outils MCP :** `get_style_pattern`, `apply_style`

| Aspect | Détail |
|--------|--------|
| **Objectif** | Agent central de génération de texte qui produit la prose narrative |
| **Entrée** | Intent, SimulationResult, GameContext, NarrativePattern |
| **Sortie** | Texte en prose |
| **Dépendances** | TNSServer (MCP), LLMQueue |

**Flux :**
1. Obtient le style selon l'humeur depuis le MCP Gutenberg
2. Construit un prompt contraint avec les résultats de simulation et le style
3. Génère la prose via le LLM
4. Renvoie le texte rendu

### 4. Actor (Ensemble de PNJ)

**ID :** `actor`
**Rôle :** Gère les interactions et dialogues des PNJ
**Outils MCP :** Aucun

| Aspect | Détail |
|--------|--------|
| **Objectif** | Traite tous les dialogues de PNJ, le commerce, l'artisanat, la dynamique sociale |
| **Entrée** | Intent, SimulationResult, GameContext |
| **Sortie** | Texte de dialogue de PNJ, changements d'état |
| **Dépendances** | UnifiedEntityStore, LLMQueue |

**Flux :**
1. Achemine vers le sous-gestionnaire approprié selon le type d'intention
2. Obtient les motivations cachées du PNJ depuis le profil L3
3. Génère la réponse du PNJ via le LLM
4. Calcule les changements d'état de la relation

### 5. Censor (Le correcteur)

**ID :** `censor`
**Rôle :** Supprime les clichés d'IA et impose la cohérence de style
**Outils MCP :** Aucun

| Aspect | Détail |
|--------|--------|
| **Objectif** | Nettoie la prose en supprimant les clichés et anachronismes générés par l'IA |
| **Entrée** | Texte en prose, GameContext |
| **Sortie** | Texte en prose nettoyé |
| **Dépendances** | LLMQueue |

**Flux :**
1. Supprime les clichés d'IA via des motifs regex
2. Corrige les anachronismes selon le contexte du monde
3. Polissage par LLM pour les cas complexes
4. Renvoie le texte nettoyé

**Clichés d'IA couramment supprimés :**
- « delved », « tapestry », « rich tapestry », « palpable », « visceral »
- « it's worth noting », « it goes without saying »
- « the very fabric of », « on a deeper level »

### 6. Chronicler

**ID :** `chronicler`
**Rôle :** Met à jour la mémoire du monde et maintient la chronologie
**Outils MCP :** Aucun

| Aspect | Détail |
|--------|--------|
| **Objectif** | Journalise tous les événements significatifs et maintient la cohérence du monde |
| **Entrée** | Intent, SimulationResult, GameContext |
| **Sortie** | Changements d'état (mises à jour de mémoire des PNJ) |
| **Dépendances** | UnifiedEntityStore, EventBus |

**Flux :**
1. Crée une description d'événement à partir de l'intention et du résultat
2. Publie dans l'EventBus pour les autres systèmes
3. Met à jour les souvenirs des PNJ proches
4. Journalise dans la chronologie

---

## Agents configurés (`DEFAULT_AGENTS`)

Ils vivent dans `src/services/agent-config.ts` et alimentent l'interface Settings/Providers, `LLMQueue`/`LLMClient` et quelques sous-systèmes. `chronicler` est partagé avec les Big Six. Leur température et leurs limites de tokens proviennent des valeurs par défaut globales (0.7 / 2048), sauf remplacement dans `conf/agents.json`.

| ID | Nom | Priorité | Utilisé par |
|----|-----|----------|-------------|
| `director` | Directeur | 8 | injection de battement narratif |
| `chronicler` | Chroniqueur | 5 | résumé de chronologie (`@mention` aussi) |
| `story-planner` | Planificateur d'histoire | 6 | suggestions d'arcs narratifs (`@mention`) |
| `social-sim` | Simulateur social | 4 | dynamique sociale des PNJ (`@mention`) |
| `villain` | Gestionnaire d'antagonistes | 6 | plans des antagonistes (`@mention`) |
| `researcher` | Chercheur | 3 | `IdleResearchScheduler`, évaluation d'objets (`@mention`) |
| `translation` | Traduction | 2 | anglais ↔ langue de l'utilisateur à la frontière de sortie |

**Modèles de prompts (variables de template → ce qu'elles résolvent) :**

- **director** — `{narrative}`, `{beat}`. Intègre un battement narratif dans le récit en cours.
- **chronicler** — `{events}`, `{timeline}`. Résume les nouveaux événements chronologiquement.
- **story-planner** — `{world_state}`, `{characters}`, `{events}`, `{quests}`. Sortie : `{"arc": ..., "quests": [{"title", "description", "objectives"}], "hooks": [...]}`.
- **social-sim** — `{characters}`, `{relationships}`, `{context}`. Décrit les changements de relations et les implications pour les factions.
- **villain** — `{villain}`, `{world_state}`, `{recent_actions}`. Planifie le prochain coup de l'antagoniste.
- **researcher** — `{task}`, `{world_context}`. Sortie : `{"verdict": "plausible|questionable|unrealistic", "confidence", "issues", "suggestions", "enrichedDetails"}`.
- **translation** — `{source_lang}`, `{target_lang}`, `{text}`. Renvoie uniquement le texte traduit.

---

## Système de dialogue (v0.32.5)

Nouveau `DialogueManager` + `DialogueContext` pour les conversations structurées avec les PNJ :

| Fonctionnalité | Description |
|----------------|-------------|
| **Gestion des sessions** | Cycle Salutation → Actif → Au revoir |
| **Conscience des relations** | Salutations et disponibilité des sujets pour amis/neutres/ennemis |
| **Hiérarchie féodale** | Salutations spéciales seigneur/vassaux |
| **Choix thématiques** | personnel, faction, quête, commerce, combat, artisanat, rumeur, potin, etc. |
| **Enregistrement en mémoire** | Résumés de dialogue stockés dans la mémoire à long terme des PNJ |

Accès via `engine.dialogueManager` (nécessite `npcRuntime` disponible).

**Note :** Les `@mentions` du chat aiguillent vers les gestionnaires configurés (`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`), pas vers les Big Six. `@narrator`, `@director`, `@scene` et `@npc` n'existent plus.

---

## Agent Registry v2

Les Big Six sont enregistrés dans `AgentRegistryV2` (`src/services/agent-registry-v2.ts`) :

```typescript
import { getAgentRegistryV2 } from './agent-registry-v2';

const registry = getAgentRegistryV2();

// Register agents
registry.register(dramaturgAgent);
registry.register(validatorAgent);
registry.register(stylistAgent);
registry.register(actorAgent);
registry.register(censorAgent);
registry.register(chroniclerAgent);

// Get agent by ID
const dramaturg = registry.get('dramaturg');

// Get agents with specific MCP tool
const withSearch = registry.getAgentsWithTool('search_verses');
```

---

## Interface d'agent (v0.32.5)

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

interface AgentOutput {
  text?: string;
  stateChanges?: StateChange[];
  metadata?: Record<string, unknown>;
}
```

---

## Variables globales

Ces variables sont disponibles pour les agents via le contexte de jeu :

| Variable | Description |
|----------|-------------|
| `{world_name}` | Nom du monde actuel (depuis world_frame.json) |
| `{time}` | Heure actuelle de l'histoire (chaîne ISO) |
| `{location}` | Lieu actuel du personnage |
| `{character}` | Nom du personnage actif |
| `{role}` | Rôle de l'utilisateur (protagoniste, observateur, etc.) |
| `{rules}` | Règles du monde (lois magiques, normes sociales, etc.) |
| `{timeline}` | Événements récents du monde (5 derniers du Chronicler) |
| `{memories}` | Souvenirs récents du jeu de rôle |
| `{facts}` | Faits établis du monde |
| `{npcs}` | Noms des PNJ proches |
| `{history}` | Historique récent de conversation (3 derniers échanges) |
| `{events}` | Événements récents (selon le contexte, 3–5 derniers) |
| `{world_state}` | Résumé de l'état actuel du monde |
| `{world_context}` | Contexte du monde pour la recherche |
| `{genre}` | Genre du monde (fantasy, science-fiction, horreur, etc.) |
| `{magic_system}` | Description du système de magie |
| `{language}` | Langue principale du monde (en, ru, etc.) |
| `{world_description}` | Description/argumentaire du monde |

---

## Guide de température

Les agents configurés utilisent les valeurs par défaut globales (température 0.7, 2048 tokens maximum) sauf remplacement dans `conf/agents.json`.

| Valeur | Effet | Utiliser pour |
|--------|-------|---------------|
| 0.1 - 0.3 | Ciblé, déterministe | Recherche, vérification de faits, analyse d'intention |
| 0.4 - 0.6 | Équilibré | Chronicler, simulation sociale |
| 0.7 - 0.8 | Créatif | Récit, dialogue de PNJ, plans des antagonistes |

---

## Utiliser @agent dans le chat

Envoyez un message privé à un agent depuis le chat. Les `@mentions` du chat aiguillent vers les gestionnaires configurés, pas vers les Big Six :

```
@chronicler summarize the last hour
@story-planner suggest the next story beat
@researcher is this medieval sword historically accurate?
@social-sim how do the villagers react?
@villain what does the antagonist do next?
```

Les réponses sont marquées d'une bordure bleue à gauche et du nom de l'agent entre crochets.

Les Big Six (`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`) sont enregistrés dans `AgentRegistryV2` mais **ne sont pas** joignables par `@mention`.

---

## Système RAG (embeddings + mémoire à long terme)

Tous les agents disposent d'un support d'embeddings complet avec mémoire à long terme via RAG :

- **Serveur d'embeddings llama.cpp** — modèle BGE-M3 sur le port 5002 pour la génération de vecteurs
- **Recherche hybride SQLite** — recherche par mots-clés FTS5 + recherche vectorielle dense + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — isolation mémoire par agent et par session via la colonne `role`
- **Mémoire par monde** — la mémoire est isolée par monde pour éviter les hallucinations inter-mondes
- **Noyaux de calcul Mojo** — 5 noyaux Mojo via FFI avec replis TypeScript :
  - `probability_ffi.mojo` — chance de succès, résultats de jet, probabilité par lot
  - `vector_ffi.mojo` — opérations vectorielles 4-dim (cosinus, L2, produit scalaire)
  - `vector_full.mojo` — opérations vectorielles pleine dimension (768-dim BGE-M3)
  - `batch_ops.mojo` — opérations PNJ par lot (vieillissement, vice, impôt, loyauté)
  - `graph_ops.mojo` — parcours de graphe, fusion RRF, calcul de réputation

**Flux mémoire :**
```
Agent Request → AgentMemoryStore → SQLite (hybrid search)
                                      ↓
                              ┌───────┴───────┐
                              │ FTS5 (LIKE)   │ Dense Vectors (BGE-M3)
                              │ Keyword Match │ Cosine Similarity
                              └───────┬───────┘
                                      ↓
                              Reciprocal Rank Fusion (RRF)
                                      ↓
                              Context for LLM Prompt
```

---

## Intégration MCP (v0.32.5)

### Motifs bibliques

Textes bibliques stockés en SQLite avec une granularité au niveau du verset. Chaque verset est un pointeur atomique référençable par les agents.

**Outils :**
- `search_verses` — Rechercher par texte, livre ou référence
- `get_pattern` — Obtenir des motifs narratifs par archétype, humeur ou fonction
- `get_archetype` — Obtenir les détails d'un archétype par nom

### Styles Gutenberg

Motifs stylistiques extraits des textes du projet Gutenberg. Les descriptions délexicalisées préservent la structure sans noms de personnages.

**Outils :**
- `get_style_pattern` — Rechercher des styles par humeur, tags ou description
- `apply_style` — Appliquer un style au texte (délexifier et renvoyer des suggestions)

### Validation Wikipédia

Vérification historique des faits via l'API Wikipédia.

**Outils :**
- `verify_fact` — Vérifier une affirmation factuelle
- `get_context` — Obtenir le contexte Wikipédia d'un sujet

---

## Système de templates

### Fonctionnement de userTemplate

Chaque agent stocke un `userTemplate` en SQLite (table `agent_prompts`) avec repli vers un fichier JSON. Le template contient des espaces réservés `{var}` remplacés à l'exécution par `resolveTemplate()` (`src/utils/template-resolver.ts`).

**Flux :**
1. L'agent charge la configuration : `loadAgentConfig(agentId, world?, lang?)`
2. Lit `prompts.userTemplate` depuis SQLite d'abord, puis le repli JSON
3. Appelle `resolveTemplate(template, vars)` avec les données de contexte
4. Envoie le prompt résolu au LLM

**Si aucun userTemplate n'existe** → repli vers `PromptBuilder` (templates TypeScript codés en dur).

---

## Profils de style du joueur (v0.32.5)

`PlayerProfileStore` (`src/lib/player-profile-store.ts`) fournit des profils de style de joueur inter-agents partagés entre Stylist et LiteraryV2Generator.

**Métriques suivies :**
| Métrique | Description |
|----------|-------------|
| `avg_sentence_len` | Longueur moyenne des phrases en mots |
| `sensory_bias` | Préférence pour les détails sensoriels (0–1) |
| `register_score` | Registre formel/informel (0–1) |
| `dialogue_ratio` | Proportion de dialogue dans le texte |
| `narrative_distance` | Narration proche vs distante (0–1) |
| `action_orientation` | Préférence action vs réflexion (0–1) |
| `emotional_expressiveness` | Niveau de détails émotionnels (0–1) |
| `preferred_pace` | lent / moyen / rapide |
| `literary_sophistication` | Complexité du vocabulaire/structure (0–1) |
| `preferred_motifs` | Motifs narratifs préférés |
| `anti_patterns` | Motifs évités |
| `sample_snippets` | Extraits de texte représentatifs |
| `confidence` | Confiance du profil (0–1) |

**Stockage :** `data/player-profiles.db` (SQLite, mode WAL)

---

## Architecture de stockage

### Base de données SQLite

Le projet utilise SQLite via le module intégré `bun:sqlite` de Bun. Le fichier de base de données est `tns.db` dans le `dbPath` configuré (défaut `./worlds/{active}`).

**Tables :**
- `entities` — Entités du monde avec recherche plein texte FTS5
- `embeddings` — Embeddings vectoriels pour la recherche sémantique
- `memories` — Souvenirs de jeu de rôle avec FTS5
- `agent_prompts` — Prompts d'agents par monde + langue
- `ui_translations` — Chaînes de traduction UI par langue + page

### Stockage en fichiers JSON (repli)

Les fichiers JSON restent un repli pendant la migration :

```
conf/
  settings.json          — Paramètres applicatifs (LLM, serveur, langue, etc.)
  agents.json            — Affectations globales modèle/fournisseur des agents
worlds/{active}/
  agents/{agentId}.json  — Prompts d'agents par monde (repli)
```
