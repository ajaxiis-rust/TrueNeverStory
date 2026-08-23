# Guide de migration : JSON vers SQLite

Ce guide couvre la migration des données du monde depuis les fichiers JSON vers SQLite, ainsi que la structure de stockage utilisée par TrueNeverStory.

## Vue d'ensemble

TrueNeverStory stocke les données du monde dans **SQLite** via la classe `WorldStore` (`src/store/world-store.ts`). Le fichier de base de données est `tns.db`, créé dans le répertoire du monde (`<worldPath>/tns.db`) avec le mode de journalisation WAL activé.

Les fichiers JSON d'origine restent dans le répertoire du monde en tant que source de migration et ne sont jamais supprimés — ils servent de secours et d'enregistrement historique.

## Migration v0.33.4 : Compilateur littéraire et modèles économiques

La version v0.33.4 ajoute le compilateur littéraire et les modèles économiques. Aucune migration requise — ce sont des fonctionnalités additives qui étendent le pipeline State-First existant.

## Migration v0.33.4 : Pipeline State-First

### Ce qui a changé

La version v0.33.4 introduit une architecture de pipeline state-first. Deux systèmes d'agents coexistent désormais :

1. **Les Big Six (AgentV2)** — le pipeline de prose narrative (`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`), enregistrés dans `AgentRegistryV2`.
2. **Agents configurés (`DEFAULT_AGENTS`)** — les agents pilotés par configuration dans `src/services/agent-config.ts` (`director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation`), qui alimentent l'interface Settings/Providers et quelques sous-systèmes.

**Ancien pipeline :**
```
User Intent → Agent Selection → Agent Execution → Response
```

**Nouveau pipeline :**
```
User Intent → Simulation → Pattern Selection (Dramaturg) → Fact Check (Validator) → Style Render (Stylist) → NPC Dialogue (Actor) → Linting (Censor) → Memory Update (Chronicler)
```

**Agents supprimés :**

| Supprimé | Remplacé par |
|---------|-------------|
| `narrator`, `scene` | `stylist` (génération de prose) |
| `historian` | `validator` (vérification des faits) |
| `cartographer`, `lorekeeper`, `merchant`, `quest-giver` | (abandonnés) |
| `npc` | `actor` (dialogue des PNJ) |

`villain`, `social-sim`, `researcher` et `director` restent disponibles en tant qu'agents configurés. `crafter` reste un sous-système d'artisanat.

**Compatibilité ascendante :** Les identifiants d'agents supprimés (`@narrator`, `@npc`, `@scene`, `@director`) n'existent plus et ne se résolvent pas. Les `@mentions` du chat acheminent uniquement vers les gestionnaires configurés (`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`).

### Intégration MCP

La v0.33.4 introduit les outils Model Context Protocol (MCP) pour l'accès à des connaissances externes :

| Serveur MCP | Outils | Objectif |
|------------|-------|---------|
| Bible Parser | `search_verses`, `get_pattern`, `get_archetype` | Motifs narratifs issus des textes bibliques |
| Gutenberg Parser | `get_style_pattern`, `apply_style` | Motifs stylistiques issus de la littérature |
| Wikipedia Tools | `verify_fact`, `get_context` | Vérification historique des faits |

**Configuration :**

```typescript
// In conf/settings.json
{
  "mcpServers": {
    "bible": { "enabled": true, "dbPath": "./data/bible.db" },
    "gutenberg": { "enabled": true, "dbPath": "./data/styles.db" },
    "wikipedia": { "enabled": true }
  }
}
```

### Nouvelles dépendances

| Dépendance | Statut | Objectif |
|------------|--------|---------|
| Zod | Déjà dans le projet | Validation de schéma |
| Mojo FFI | Déjà dans le projet | Noyaux de calcul |
| TranslationService | Aucune dépendance externe | Traductions de l'interface |

### Changements bloquants

- **Flux interne de `RoleplayEngine` réécrit** — Le pipeline suit désormais Simulation → Pattern → Style → Dialogue → Lint → Memory
- **`AgentV2.process()` remplace `generateResponse()`** — Nouvelle signature : `process(intent, simulation, context, pattern?)`
- **`createRoleplayEngine()` nécessite de nouvelles dépendances** — Références au serveur MCP, AgentRegistryV2, EventBus
- **`getLanguageInstruction()` supprimé** — la gestion des langues a été déplacée vers `TranslationService` à la frontière de sortie

---

## Structure de stockage

### Base de données SQLite

Le constructeur `WorldStore` ouvre (et crée si absent) un fichier `tns.db` dans le répertoire du monde :

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");
// Opens worlds/my-world/tns.db with:
//   PRAGMA journal_mode = WAL
//   PRAGMA synchronous = NORMAL
```

**Tables créées à l'initialisation (`CREATE TABLE IF NOT EXISTS`) :**

| Table | Objectif |
|-------|---------|
| `quests` | Données de quêtes (`id`, `title`, `description`, `giver`, `objectives`, `status`, horodatages) |
| `npc_memories` | Mémoires à court et long terme des PNJ, indexées par `npc_uid` + `memory_type` |
| `story_arcs` | Données d'arc du planificateur d'histoire (un blob JSON par ligne) |
| `world_frame` | Paires clé/valeur du cadre du monde |
| `director_state` | Paires clé/valeur de l'état du directeur |
| `villains` | Données des antagonistes (blob JSON par ligne) |

### Fichiers JSON (source de migration)

Les fichiers JSON d'origine se trouvent dans le même répertoire du monde et sont lus comme source de migration. Ils ne sont jamais supprimés après la migration :

| Fichier JSON | Migré vers la table |
|-----------|---------------------|
| `worlds/{name}/quests.json` | `quests` |
| `worlds/{name}/npc_profiles.json` | `npc_memories` |
| `worlds/{name}/world_frame.json` | `world_frame` |
| `worlds/{name}/story_planner.json` | `story_arcs` |
| `worlds/{name}/director_state.json` | `director_state` |
| `worlds/{name}/villains.json` | `villains` |

## Processus de migration

### Déclenchement de la migration

La migration s'exécute à la demande via le point de terminaison HTTP (il n'y a pas de migration automatique au démarrage) :

```typescript
const store = new WorldStore("worlds/my-world");

const result = await store.migrate();
// result = { migrated: ["quests", "npc_profiles", ...], errors: [] }

store.close();
```

La méthode `migrate()` migre chaque source de données indépendamment dans son propre `try/catch`, de sorte qu'un échec dans une source n'interrompt pas les autres. Chaque source migrée avec succès est ajoutée à `migrated` ; tout échec est consigné dans `errors`.

**Sources migrées (dans l'ordre) :** `quests`, `npc_profiles`, `world_frame`, `story_planner`, `director_state`, `villains`.

Si un fichier source JSON est manquant ou non analysable, cette source est ignorée silencieusement (l'helper de lecture renvoie `null`).

### Migration des chemins hérités

Au démarrage (`src/index.ts`), si le répertoire `WORLDS_ROOT` n'existe pas, il est créé et un répertoire hérité `WORLD_DB_PATH` (par exemple `world_db/`) est renommé en `worlds/default/` :

```
world_db/  →  worlds/default/
```

## API WorldStore

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");

// Migration
const result = await store.migrate();           // { migrated: string[], errors: string[] }

// Quest CRUD
const quests = store.getQuests();               // QuestData[]
const quest = store.getQuest(id);               // QuestData | null
store.upsertQuest(quest);                       // insert or replace
const removed = store.deleteQuest(id);          // boolean

// NPC memories
const memories = store.getNPCMemories(npcUid);              // all memory types
const short = store.getNPCMemories(npcUid, "short_term");   // filtered by type
store.addNPCMemory(npcUid, memory);                         // default type "short_term"

// World frame
const frame = store.getWorldFrame();            // Record<string, string>
store.setWorldFrame(key, value);

// Stats
const stats = store.getStats();                 // { quests, memories, worldFrame }

store.close();
```

## Points de terminaison API

Le routeur (`src/routes/world-store.ts`) est monté sous `/api`. Chaque point de terminaison accepte un paramètre de requête optionnel `?world=` pour cibler un monde spécifique (par défaut le monde actif) :

| Méthode | Chemin | Description |
|--------|------|-------------|
| `POST` | `/api/world-store/migrate` | Migre les fichiers JSON vers SQLite ; renvoie `{ status, world, migrated, errors }` |
| `GET` | `/api/world-store/stats` | Renvoie `{ world, stats }` (comptages de quêtes, mémoires, clés du cadre du monde) |
| `GET` | `/api/world-store/quests` | Liste les quêtes depuis SQLite |
| `GET` | `/api/world-store/npc-memories/:uid` | Mémoires de PNJ (`?type=short_term\|long_term_episodic`) |
| `GET` | `/api/world-store/frame` | Paires clé/valeur du cadre du monde |

## Retour en arrière

Si la migration échoue ou si vous devez revenir en arrière :

1. Les données SQLite sont isolées dans `worlds/{name}/tns.db`
2. Les fichiers JSON d'origine restent dans `worlds/{name}/`
3. Supprimez `worlds/{name}/tns.db` pour revenir à un état JSON uniquement
4. Relancez `POST /api/world-store/migrate` pour migrer à nouveau depuis le JSON

## Dépannage

### Erreur « Table already exists »

C'est normal — les tables sont créées avec `IF NOT EXISTS`.

### Données manquantes après la migration

Vérifiez que le fichier source JSON existe dans le répertoire du monde et qu'il s'agit d'un JSON valide. Les fichiers non analysables sont ignorés silencieusement et signalés uniquement si l'analyse lève une exception — inspectez le tableau `errors` du résultat de migration pour plus de détails.

### Performances

- Le mode WAL de SQLite est activé par défaut dans `WorldStore`
- `PRAGMA synchronous = NORMAL` est défini pour un équilibre entre durabilité et vitesse
- Exécutez périodiquement `PRAGMA optimize` sur les grandes bases de données
