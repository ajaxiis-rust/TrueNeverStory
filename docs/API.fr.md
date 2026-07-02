# TrueNeverStory — Référence API

REST API pour la plateforme de création de mondes et de jeu de rôle TrueNeverStory. Tous les points de terminaison retournent du JSON sauf indication contraire.

**URL de base :** `http://localhost:8000`

---

## Table des matières

- [Santé](#santé)
- [Chat & Jeu de rôle](#chat--jeu-de-rôle)
- [Mondes](#mondes)
- [Entités & Graphe](#entités--graphe)
- [Sessions](#sessions)
- [Branches](#branches)
- [Probabilité](#probabilité)
- [Romance](#romance)
- [Quêtes](#quêtes)
- [Mémoire](#mémoire)
- [Maintenance](#maintenance)
- [Agents](#agents)
- [Fournisseurs & Modèles](#fournisseurs--modèles)
- [Paramètres](#paramètres)
- [Lancement](#lancement)

---

## Santé

### `GET /health`
Vérification de santé.

**Réponse :** `{ status: "ok", engine_ready: boolean, uptime: number }`

### `GET /system-check`
État du système avec version de Node et informations de plateforme.

**Réponse :** `{ ok: boolean, message: string, node_version: string, platform: string }`

---

## Chat & Jeu de rôle

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
Envoyer un message du joueur, obtenir une réponse narrative.

**Requête :** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**Réponse :** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
Flux SSE pour la livraison progressive du récit. Corps de requête identique à `/chat/message`.

**Réponse :** Flux Server-Sent Events :
- `event: start` — état de la session
- `event: chunk` — fragment du récit
- `event: agent` — réponse de l'agent (pour les mentions `@agent`)
- `event: done` — état final
- `event: error` — message d'erreur
- `data: [DONE]` — marqueur de fin de flux

### `POST /chat/agent`
Envoyer un message privé à un agent spécifique.

**Requête :** `{ agentId: string, message: string }`

**Réponse :** `{ narrative, agent_id, agent_name, location, story_time, active_character, success, error? }`

### `GET /chat/session`
Obtenir l'état actuel de la session.

**Réponse :** `{ active_character, current_location, current_time, session_id }`

### `GET /chat/history?limit=20`
Obtenir l'historique des conversations récentes.

**Réponse :** Tableau de `{ user: string, assistant: string, timestamp: string }`

---

## Mondes

### `GET /worlds`
Lister tous les mondes disponibles.

**Réponse :** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
Nom du monde actif (requête légère).

**Réponse :** `{ active: string }`

### `POST /worlds`
Créer un nouveau monde.

**Requête :** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

**Réponse :** `{ status: "created", world }`

### `GET /worlds/:name`
Détails du monde et données du frame.

### `PUT /worlds/:name`
Mettre à jour les champs du world frame.

### `DELETE /worlds/:name`
Supprimer un monde.

### `POST /worlds/:name/switch`
Changer de monde actif.

### `POST /worlds/:name/chapters/generate`
Générer un chapitre littéraire à partir des données de session.

**Requête :** `{ sessionId?: string, prompt?: string }`

### `GET /worlds/:name/chapters`
Lister les chapitres générés.

### `GET /worlds/:name/chapters/:filename`
Contenu d'un chapitre.

---

## Entités & Graphe

### `GET /entity/:uid?layers=l1,l2,l3`
Détails d'une entité par UID.

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
Voisins de l'entité avec traversal du graphe. Direction : `out`, `in` ou `both`.

### `GET /path?source=Character:Kaelen&target=Location:Village`
Trouver le plus court chemin entre deux entités.

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
Rechercher des entités par nom ou similarité sémantique.

**Réponse :** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
Statistiques du graphe (nombre de nœuds/arêtes, info de branche).

### `GET /graph/d3?mode=relationships`
Données du graphe pour la visualisation d3-force. Mode : `relationships` ou `crafting`.

**Réponse :** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## Sessions

### `GET /sessions`
Lister tous les historiques de sessions.

### `GET /sessions/list`
Lister les sessions de jeu disponibles.

**Réponse :** `{ sessions: array, count: number }`

### `GET /sessions/:sessionId/history`
Historique des conversations d'une session.

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
Créer une nouvelle branche du monde (snapshots git-like).

### `POST /branch/switch?name=my-branch`
Changer de branche active.

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
Lister les modificateurs actifs d'une entité.

---

## Romance

### `GET /romance/:character1/:character2`
Statut de la relation romantique.

**Réponse :** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
Tenter une action romantique. Actions : `attraction`, `confess`, `date`, `kiss`, `propose`, `breakup`.

**Requête :** `{ character, target, location?, message? }`

**Réponse :** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
Toutes les relations romantiques d'un personnage.

---

## Quêtes

### `GET /quests`
Lister toutes les quêtes avec progression.

### `GET /quest/:questId`
Détails d'une quête.

---

## Mémoire

### `POST /memory/forget?older_than=30&min_importance=0.2`
Oublier les anciens souvenirs de faible importance.

### `POST /memory/summarise?tag=keyword`
Résumer les souvenirs par tag ou UID de nœud.

### `GET /memory/export?fmt=json`
Exporter tous les souvenirs.

### `POST /memory/import`
Importer des souvenirs depuis le corps.

**Requête :** `{ data: MemoryEntry[] }`

### `POST /memory/update/:entryId`
Mettre à jour une entrée de mémoire.

**Requête :** `{ content: string }`

### `GET /memory/stats`
Statistiques du système de mémoire.

### `POST /memory/rebuild`
Reconstruire l'index vectoriel FAISS.

### `GET /memory/retrieve?q=keyword&top_k=10`
Recherche sémantique sur les souvenirs.

---

## Maintenance

### `POST /maintenance/run?full=true`
Exécuter la maintenance mémoire (élagage, clustering, archivage).

### `GET /maintenance/status`
Statistiques de mémoire et de maintenance.

### `POST /maintenance/rebuild-index`
Reconstruire l'index vectoriel.

### `POST /maintenance/clean-orphans`
Nettoyer les embeddings orphelins.

---

## Agents

### `GET /agents`
Lister tous les agents configurés.

### `GET /agents/:id`
Configuration d'un agent.

### `PUT /agents/:id`
Mettre à jour la configuration d'un agent (modèle, température, prompts, etc.). Limite : 30 requêtes/min/IP.

### `PUT /agents/:id/prompts`
Mettre à jour uniquement les prompts d'un agent.

### `POST /agents/:id/reset`
Réinitialiser un agent aux paramètres par défaut.

### `GET /agents/providers/options`
Options de fournisseurs/modèles disponibles pour l'affectation aux agents.

---

## Fournisseurs & Modèles

### `GET /providers`
Lister tous les fournisseurs LLM.

### `POST /providers`
Ajouter un fournisseur.

### `GET /providers/models`
Lister tous les modèles des fournisseurs.

### `POST /providers/health`
Déclencher une vérification de santé de tous les fournisseurs.

### `POST /providers/assign`
Affecter un fournisseur+modèle à un agent.

**Requête :** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `DELETE /providers/assign/:agentId`
Supprimer l'affectation de fournisseur d'un agent.

### `GET /providers/:id`
Détails du fournisseur et modèles disponibles.

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
Parcourir le système de fichiers pour les modèles.

---

## Paramètres

### `GET /settings`
Paramètres actuels (clés API masquées).

### `PUT /settings`
Mettre à jour les paramètres. Les mots de passe sont automatiquement hashés, les clés masquées ignorées.

### `POST /settings/reset`
Réinitialiser aux paramètres par défaut.

### `GET /languages`
Lister les langues d'interface disponibles (EN, RU, DE, FR, ES, JA, ZH).

---

## Lancement

### `POST /launch`
Créer une nouvelle session de jeu avec génération de personnage.

**Requête :** `{ hints?: string, isekai?: boolean, starting_age?: number }`

**Réponse :** `{ status: "success", session_id, character_name, opening_narrative, url }`

### `POST /continue`
Reprendre une session existante.

**Requête :** `{ session_id: string }`

**Réponse :** `{ status: "success", session_id, character_name, url }`

---

## WebSocket

### `GET /ws/roleplay/:sessionId`
Point de terminaison WebSocket pour le jeu de rôle en temps réel. Messages en JSON :

**Client → Serveur :** `{ type: "message", content: string }`
**Serveur → Client :** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## Authentification

Lorsque l'authentification par mot de passe est activée, les sessions utilisent des cookies HttpOnly. Incluez `credentials: "include"` dans les appels fetch.

---

*Généré : 2026-06-27 | TrueNeverStory v0.10.0*
