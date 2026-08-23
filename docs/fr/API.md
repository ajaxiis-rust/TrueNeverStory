# Référence API TrueNeverStory

API REST pour la plateforme de construction de monde et de jeu de rôle TrueNeverStory. Tous les endpoints renvoient du JSON, sauf indication contraire.

**URL de base :** `http://localhost:8000`

---

## Table des matières

- [Santé](#santé)
- [Chat et jeu de rôle](#chat-et-jeu-de-rôle)
- [Mondes](#mondes)
- [Entités et graphe](#entités-et-graphe)
- [Sessions](#sessions)
- [Branches](#branches)
- [Probabilité](#probabilité)
- [Romance](#romance)
- [Quêtes](#quêtes)
- [Feedback](#feedback)
- [Moteur de règles](#moteur-de-règles)
- [Feature flags](#feature-flags)
- [Versionnement API](#versionnement-api)
- [Mémoire](#mémoire)
- [Maintenance](#maintenance)
- [Système](#système)
- [Agents](#agents)
- [Fournisseurs et modèles](#fournisseurs-et-modèles)
- [Paramètres](#paramètres)
- [Lancement](#lancement)
- [WebSocket](#websocket)
- [Authentification](#authentification)
- [Inter-mondes](#inter-mondes)
- [Plugins](#plugins)
- [Monitoring](#monitoring)
- [I18n](#i18n)
- [Stockage du monde](#stockage-du-monde)
- [Recherche Wiki](#recherche-wiki)

---

## Santé

### `GET /health`
Vérification de l'état de santé.

**Réponse :** `{ status: "ok", engine_ready: boolean, uptime: number, version: string }`

### `GET /system-check`
État du système avec version de Node et informations sur la plateforme.

**Réponse :** `{ ok: boolean, message: string, node_version: string, platform: string }`

---

## Chat et jeu de rôle

### `POST /chat/setup`
Initialiser ou mettre à jour la session de jeu de rôle active.

**Requête :**
```json
{
  "character": "Kaelen",
  "location": "Silverwood",
  "story_time": "2025-06-01T12:00:00Z",
  "role": "protagonist",
  "session_id": "default"
}
```

**Réponse :** `{ active_character, current_location, current_time, session_id }`

### `POST /chat/message`
Envoyer un message du joueur et obtenir une réponse narrative.

**Requête :** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**Réponse :** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
Endpoint SSE pour la livraison progressive du récit. Corps de requête identique à `/chat/message`.

**Réponse :** Flux Server-Sent Events :
- `event: start` — état de la session
- `event: chunk` — fragment de texte narratif
- `event: agent` — réponse de l'agent (pour les mentions `@agent`)
- `event: heartbeat` — commentaire keepalive (`: keepalive`)
- `event: done` — état final
- `event: error` — message d'erreur
- `data: [DONE]` — sentinelle de fin de flux

### `POST /chat/agent`
Envoyer un message privé à un agent spécifique.

**Requête :** `{ agentId: string, message: string }`

**Réponse :** `{ narrative, agent_id, agent_name, location, story_time, active_character, success, error? }`

### `GET /chat/session`
Obtenir l'état actuel de la session.

**Réponse :** `{ active_character, current_location, current_time, session_id }`

### `GET /chat/history?limit=20`
Obtenir l'historique récent de la conversation.

**Réponse :** Tableau de `{ user: string, assistant: string, timestamp: string }`

---

## Mondes

### `GET /worlds`
Lister tous les mondes disponibles.

**Réponse :** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
Obtenir le nom du monde actif (léger).

**Réponse :** `{ active: string }`

### `POST /worlds`
Créer un nouveau monde.

**Requête :** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

**Réponse :** `{ status: "created", world }`

### `GET /worlds/:name`
Obtenir les détails du monde et les données du frame.

### `PUT /worlds/:name`
Mettre à jour les champs du frame du monde.

### `DELETE /worlds/:name`
Supprimer un monde.

### `POST /worlds/:name/switch`
Changer le monde actif.

### `POST /worlds/:name/chapters/generate`
Générer un chapitre littéraire à partir des données de session.

**Requête :** `{ sessionId?: string, prompt?: string }`

### `GET /worlds/:name/chapters`
Lister les chapitres générés.

### `GET /worlds/:name/chapters/:filename`
Obtenir le contenu d'un chapitre.

### `GET /worlds/:name/detail`
Statistiques complètes du monde pour la modale de statistiques.

**Réponse :**
```json
{
  "name": "default",
  "title": "My World",
  "description": "...",
  "genre": "fantasy",
  "language": "en",
  "worldRules": [{ "name": "...", "description": "..." }],
  "magicSystem": "...",
  "entityCounts": { "Character": 5, "Location": 3, "Faction": 2, "Item": 8 },
  "totalEntities": 18,
  "characters": [{ "name": "...", "summary": "...", "tags": [], "relationships": [] }],
  "locations": [{ "name": "...", "summary": "..." }],
  "factions": [{ "name": "...", "summary": "..." }],
  "items": [{ "name": "...", "summary": "..." }],
  "sessionCount": 4,
  "eventCount": 42,
  "chapterCount": 3,
  "villainCount": 1,
  "hasFrame": true
}
```

---

## Entités et graphe

### `GET /entity/:uid?layers=l1,l2,l3`
Obtenir les détails d'une entité par UID.

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
Obtenir les voisins d'une entité avec parcours de graphe. Direction : `out`, `in` ou `both`.

### `GET /path?source=Character:Kaelen&target=Location:Village`
Trouver le chemin le plus court entre deux entités.

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
Rechercher des entités par nom ou similarité sémantique.

**Réponse :** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
Statistiques du graphe (nombre de nœuds/arêtes, informations sur les branches).

### `GET /graph/d3?mode=relationships`
Données du graphe formatées pour la visualisation d3-force. Mode : `relationships` ou `crafting`.

**Réponse :** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## Sessions

### `GET /sessions`
Lister tous les historiques de sessions.

### `GET /sessions/list`
Lister les sessions de jeu disponibles.

**Réponse :** `{ sessions: array, count: number }`

### `GET /sessions/:sessionId/history`
Obtenir l'historique de conversation d'une session.

### `GET /sessions/:sessionId/summarize`
Résumer une session.

### `POST /sessions/export`
Exporter une session en markdown.

**Requête :** `{ session_id?: string, messages: [{role, content, timestamp?}] }`

### `GET /sessions/exports`
Lister les fichiers markdown exportés.

### `GET /sessions/exports/:filename`
Charger un fichier exporté.

---

## Branches

### `POST /branch/create?name=my-branch&from_branch=main`
Créer une nouvelle branche de monde (snapshots de type git).

### `POST /branch/switch?name=my-branch`
Changer la branche active.

### `POST /branch/merge?name=my-branch`
Fusionner une branche dans main.

### `GET /branch/list`
Lister toutes les branches.

---

## Probabilité

### `GET /probability/:character/:profile?target=optional`
Obtenir la probabilité de succès d'une action de personnage.

Profils : `combat`, `persuasion`, `stealth`, `intimidation`, `deception`, `athletics`, `investigation`, `romance`, `generic`.

**Réponse :** `{ character, profile, probability: number }`

### `POST /probability/modifier`
Appliquer un modificateur de probabilité temporaire.

**Requête :** `{ entity: string, parameter: string, value: number, duration_seconds?: number }`

### `GET /probability/modifiers/:entity`
Lister les modificateurs actifs pour une entité.

---

## Romance

### `GET /romance/:character1/:character2`
Obtenir le statut de la relation amoureuse.

**Réponse :** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
Tenter une action romantique. Actions : `attraction`, `confess`, `date`, `kiss`, `propose`, `breakup`.

**Requête :** `{ character, target, location?, message? }`

**Réponse :** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
Obtenir toutes les relations amoureuses d'un personnage.

---

## Quêtes

### `GET /quests`
Lister toutes les quêtes avec progression.

### `GET /quest/:questId`
Obtenir les détails d'une quête.

---

## Feedback

### `POST /feedback`
Enregistrer une réaction like/dislike/neutre pour le dernier tour narratif.

**Requête :** `{ turnId: number, reaction: 'like'|'dislike'|'neutral', techniques: string[] }`

En cas de `dislike`, le moteur régénère le dernier tour et renvoie `{ ok, regenerated }`. Sinon renvoie `{ ok: true }`.

---

## Moteur de règles

### `GET /rules`
Lister les règles sociales/économiques du monde.

### `GET /rules/:id`
Obtenir les détails d'une règle par ID.

### `POST /rules/preview`
Aperçu des règles fusionnées avec modificateurs. Corps : `RulesConfig`.

### `POST /rules/check`
Vérifier si une action est autorisée. Corps : `{ config, action, superiorClass?, subordinateClass? }`.

---

## Feature flags

### `GET /feature-flags`
Lister tous les feature flags et leurs expositions.

### `GET /feature-flags/:id`
Obtenir un seul flag.

### `POST /feature-flags`
Créer un nouveau flag.

### `PUT /feature-flags/:id`
Mettre à jour un flag.

### `DELETE /feature-flags/:id`
Supprimer un flag.

### `POST /feature-flags/:id/check`
Vérifier si un flag est activé pour un contexte (utilisateur, etc.).

---

## Versionnement API

TrueNeverStory prend en charge deux versions d'API :

- **v1** — Enveloppe legacy pour la rétrocompatibilité
- **v2** — Version améliorée avec intégration du registre d'agents

Les routes legacy (tout sous `/api/*`) incluent des en-têtes de dépréciation :

- `X-API-Version: legacy`
- `Deprecation: true`
- `Sunset: 2026-12-31`

---

## Mémoire

### `POST /memory/forget?older_than=30&min_importance=0.2`
Oublier les anciens souvenirs peu importants.

### `POST /memory/summarise?tag=keyword`
Résumer les souvenirs par tag ou UID de nœud.

### `GET /memory/export?fmt=json`
Exporter tous les souvenirs.

### `POST /memory/import`
Importer des souvenirs depuis le corps.

**Requête :** `{ data: MemoryEntry[] }`

### `POST /memory/update/:entryId`
Mettre à jour un souvenir.

**Requête :** `{ content: string }`

### `GET /memory/stats`
Statistiques du système de mémoire.

### `POST /memory/rebuild`
Reconstruire l'index vectoriel FAISS.

### `GET /memory/retrieve?q=keyword&top_k=10`
Recherche sémantique dans les souvenirs.

---

## Maintenance

### `POST /maintenance/run?full=true`
Lancer la maintenance de la mémoire (élagage, clustering, archivage).

### `GET /maintenance/status`
Statistiques de mémoire et de maintenance.

### `POST /maintenance/rebuild-index`
Reconstruire l'index vectoriel.

### `POST /maintenance/clean-orphans`
Nettoyer les embeddings orphelins.

---

## Système

### `POST /system/pause`
Mettre en pause le moteur de jeu de rôle. N'accepte aucun paramètre.

### `POST /system/resume`
Reprendre le moteur de jeu de rôle. N'accepte aucun paramètre.

### `GET /system/status`
Obtenir le statut en cours/pause du moteur.

---

## Agents

### `GET /agents`
Lister tous les agents configurés.

**Paramètres de requête :** `world` — optionnel, filtrer par monde spécifique

### `GET /agents/:id`
Obtenir la configuration d'un agent.

**Paramètres de requête :** `world` — optionnel, charger depuis un monde spécifique

### `PUT /agents/:id`
Mettre à jour la configuration de l'agent (modèle, température, prompts, etc.). Limité : 30/min/IP.

**Paramètres de requête :** `world` — optionnel, sauvegarder dans un monde spécifique

### `PUT /agents/:id/prompts`
Mettre à jour uniquement les prompts d'un agent.

**Paramètres de requête :** `world` — optionnel, sauvegarder dans un monde spécifique

### `POST /agents/:id/reset`
Réinitialiser l'agent aux valeurs par défaut.

### `GET /agents/providers/options`
Obtenir les options de fournisseurs/modèles disponibles pour l'assignation d'agents.

### `GET /agents/:id/prompts/:lang`
Obtenir les prompts d'un agent pour une langue spécifique.

### `PUT /agents/:id/prompts/:lang`
Mettre à jour les prompts d'un agent pour une langue spécifique.

### `GET /agents/registry`
Lister tous les agents enregistrés (AgentRegistry).

### `GET /agents/registry/stats`
Obtenir les statistiques du registre.

### `GET /agents/registry/:id`
Obtenir un agent enregistré.

### `PUT /agents/registry/:id`
Mettre à jour un agent enregistré.

### `POST /agents/registry/:id/enable`
Activer un agent.

### `POST /agents/registry/:id/disable`
Désactiver un agent.

### `DELETE /agents/registry/:id`
Désinscrire un agent.

---

## Fournisseurs et modèles

### `GET /providers`
Lister tous les fournisseurs LLM.

### `POST /providers`
Ajouter un nouveau fournisseur.

### `GET /providers/models`
Lister tous les modèles chez les fournisseurs.

### `POST /providers/health`
Lancer une vérification de santé sur tous les fournisseurs.

### `POST /providers/assign`
Assigner un fournisseur+modèle à un agent.

**Requête :** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `GET /providers/assignments`
Lister toutes les assignations fournisseur-agent.

### `GET /providers/agents`
Lister les agents du gestionnaire de fournisseurs.

### `POST /providers/sync-from-agents`
Synchroniser les assignations depuis la configuration des agents.

### `GET /providers/reset`
Réinitialiser le gestionnaire de fournisseurs.

### `DELETE /providers/assign/:agentId`
Supprimer l'assignation de fournisseur d'un agent.

### `GET /providers/:id`
Obtenir les détails du fournisseur et les modèles disponibles.

### `PUT /providers/:id`
Mettre à jour la configuration du fournisseur.

### `DELETE /providers/:id`
Supprimer un fournisseur.

### `POST /providers/:id/default`
Définir le fournisseur par défaut.

### `POST /providers/:id/keys`
Ajouter une clé API.

### `DELETE /providers/:id/keys/:keyId`
Supprimer une clé API.

### `GET /models`
Lister tous les modèles installés et disponibles.

### `POST /models/install`
Installer un modèle.

**Requête :** `{ source: "ollama"|"gguf_url", name: string, backend: "ollama"|"llamacpp" }`

### `DELETE /models/:id`
Supprimer un modèle.

### `POST /models/import`
Importer un fichier modèle local.

### `POST /models/apply`
Appliquer un modèle aux paramètres.

### `GET /models/browse?path=/`
Parcourir le système de fichiers pour les fichiers de modèles.

---

## Paramètres

### `GET /settings`
Obtenir les paramètres actuels (clés API masquées).

### `PUT /settings`
Mettre à jour les paramètres. Les mots de passe sont hachés automatiquement, les clés masquées sont ignorées.

### `POST /settings/reset`
Réinitialiser aux valeurs par défaut.

### `GET /languages`
Lister les langues d'interface disponibles (EN, RU, DE, FR, ES, JA, ZH).

### `GET /llm-config`
Obtenir la configuration du serveur LLM.

### `PUT /llm-config`
Mettre à jour la configuration du serveur LLM.

### `POST /server/restart`
Redémarrer les serveurs LLM.

### `GET /server/status`
Vérifier le statut du serveur LLM.

---

## Lancement

### `POST /launch`
Créer une nouvelle session de jeu avec génération de personnage.

**Requête :** `{ hints?: string, isekai?: boolean, starting_age?: number, name?: string }`

- `name` — nom explicite du personnage (optionnel). Si fourni, la génération de nom par LLM est ignorée. Prend en charge les caractères non latins.

**Réponse :** `{ status: "success", session_id, character_name, opening_narrative, race, social_class, birthplace, initial_location }`

### `POST /continue`
Continuer une session existante.

**Requête :** `{ session_id: string }`

**Réponse :** `{ status: "success", session_id, character_name, restored: boolean }`

### `POST /snapshot`
Sauvegarder l'état actuel du jeu.

**Requête :** `{ session_id?: string }`

---

## WebSocket

### `GET /ws/*`
Endpoint WebSocket pour le jeu de rôle en temps réel. Le serveur accepte les mises à niveau WebSocket sur n'importe quel chemin `/ws/*`. Le contexte de session est déterminé par le type de message, pas par l'URL.

**Client → Serveur :** `{ type: "message", content: string }` ou `{ type: "setup", ... }`
**Serveur → Client :** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## Authentification

Lorsque l'authentification par mot de passe est activée, les sessions utilisent des cookies HttpOnly. Incluez `credentials: "include"` dans les appels fetch.

---

## Inter-mondes

### `GET /api/cross-world/status`
Obtenir le statut de la communication inter-mondes.

**Réponse :** `{ enabled: boolean, portals: number, eventLog: number }`

### `POST /api/cross-world/enable`
Activer la communication inter-mondes.

**Réponse :** `{ enabled: true }`

### `POST /api/cross-world/disable`
Désactiver la communication inter-mondes.

**Réponse :** `{ enabled: false }`

### `GET /api/cross-world/portals`
Lister les portails actifs entre les mondes.

**Réponse :** Tableau de `{ id, world1, world2, createdAt, active }`

### `POST /api/cross-world/portals`
Créer un portail entre deux mondes.

**Requête :** `{ world1: string, world2: string }`

**Réponse :** `{ id, world1, world2, createdAt, active }`

### `DELETE /api/cross-world/portals/:id`
Détruire un portail.

**Réponse :** `{ deleted: true }`

### `GET /api/cross-world/events?limit=50`
Obtenir le journal des événements inter-mondes.

**Réponse :** Tableau de `{ type, data, source, timestamp }`

---

## Plugins

### `GET /api/plugins`
Lister tous les plugins enregistrés.

**Réponse :** Tableau de `{ id, name, version, description, agents, routes, hooks }`

### `GET /api/plugins/:id`
Obtenir les détails d'un plugin.

**Réponse :** Objet plugin avec tous les détails.

### `GET /api/plugins/:id/capabilities`
Obtenir les capacités du plugin (nombre d'agents, routes, hooks).

**Réponse :** `{ agents: number, routes: number, hooks: number }`

### `GET /api/plugins/agents/all`
Obtenir tous les agents enregistrés par les plugins.

**Réponse :** Tableau de `{ id, name, description, config }`

### `GET /api/plugins/routes/all`
Obtenir toutes les routes enregistrées par les plugins.

**Réponse :** Tableau de `{ path, method, handler }`

---

## Monitoring

### `GET /monitoring/dashboard`
Données agrégées du tableau de bord de monitoring.

### `GET /monitoring/stats`
Statistiques légères pour le polling.

---

## I18n

### `GET /i18n/translations/:lang/:page`
Obtenir les traductions pour une langue et une page spécifiques.

### `GET /i18n/translations/:lang`
Obtenir toutes les traductions pour une langue.

### `PUT /i18n/translations`
Insérer/mettre à jour des traductions par lot.

### `DELETE /i18n/translations/:lang/:page/:key`
Supprimer une clé de traduction.

---

## Stockage du monde

### `POST /world-store/migrate`
Migrer les données JSON vers SQLite.

### `GET /world-store/stats`
Obtenir les statistiques de migration.

### `GET /world-store/quests`
Obtenir les quêtes depuis SQLite.

### `GET /world-store/npc-memories/:uid`
Obtenir les souvenirs des PNJ par UID d'entité.

### `GET /world-store/frame`
Obtenir le frame du monde depuis SQLite.

---

## Recherche Wiki

### `POST /api/wiki/research/:worldId`
Lancer une recherche Wikipedia pour un monde.

### `GET /api/wiki/research/:worldId/progress`
Flux SSE de progression pour la recherche en cours.

### `POST /api/wiki/research/:worldId/pause`
Mettre en pause la recherche en cours.

### `POST /api/wiki/research/:worldId/resume`
Reprendre la recherche en pause.

### `GET /api/wiki/research/:worldId/status`
Obtenir le statut de la recherche.

---

*Généré : 2026-07-31 | TrueNeverStory v0.33.4*
