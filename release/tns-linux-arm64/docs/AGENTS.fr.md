# Référence des agents

TrueNeverStory utilise une architecture multi-agents où chaque agent gère un aspect spécifique du récit. Chaque agent a sa propre configuration LLM, ses prompts système et ses modèles utilisateur.

## Variables globales

Ces variables sont disponibles pour la plupart des agents via le contexte de l'état du monde :

| Variable | Description |
|----------|-------------|
| `{world_name}` | Nom du monde actuel (depuis world_frame.json) |
| `{time}` | Heure actuelle de l'histoire (chaîne ISO) |
| `{location}` | Lieu actuel du personnage |
| `{character}` | Nom du personnage actif |
| `{role}` | Rôle de l'utilisateur (protagoniste, observateur, etc.) |
| `{rules}` | Règles du monde (lois magiques, normes sociales, etc.) |
| `{timeline}` | Événements récents du monde (5 derniers du chroniqueur) |
| `{memories}` | Souvenirs récents du jeu de rôle |
| `{facts}` | Faits établis du monde |
| `{npcs}` | Noms des PNJ à proximité |
| `{history}` | Historique récent de la conversation (3 derniers échanges) |
| `{events}` | Événements récents (selon le contexte, 3-5 derniers) |
| `{world_state}` | Résumé de l'état actuel du monde |
| `{world_context}` | Contexte du monde pour la recherche |

## Agents

### Narrateur (`narrator`)

**Description :** Conteur principal. Génère le récit du monde à partir du contexte de l'histoire.

**Variables du modèle :**
`{world_name}` `{time}` `{location}` `{character}` `{role}` `{rules}` `{timeline}` `{memories}` `{facts}` `{npcs}` `{history}`

**Prompt système :** Définit le narrateur comme un conteur habile. Écrit une prose vivante et immersive à la deuxième/troisième personne. Ne sort jamais du rôle.

**Température :** 0.8 | **Jetons max :** 4096 | **Priorité :** 10 (la plus haute)

---

### Réalisateur (`director`)

**Description :** Injection de battements narratifs. Intègre des moments dramatiques dans le récit.

**Variables du modèle :**
`{narrative}` `{beat}`

| Variable | Description |
|----------|-------------|
| `{narrative}` | Texte narratif actuel où injecter le battement |
| `{beat}` | Description du battement narratif (incident déclencheur, révélation, revers, etc.) |

**Température :** 0.7 | **Jetons max :** 2048 | **Priorité :** 8

---

### Générateur de scènes (`scene`)

**Description :** Transitions de scène lors des déplacements entre lieux.

**Variables du modèle :**
`{character}` `{origin}` `{destination}` `{rules}` `{events}`

| Variable | Description |
|----------|-------------|
| `{origin}` | Lieu actuel (d'où part le personnage) |
| `{destination}` | Lieu cible (où va le personnage) |

**Température :** 0.8 | **Jetons max :** 2048 | **Priorité :** 7

---

### Agent PNJ (`npc`)

**Description :** Dialogues et réactions des PNJ. Incarne des personnages individuels.

**Variables du modèle :**
`{npc_name}` `{npc_personality}` `{player}` `{location}` `{relationship}` `{events}` `{line}`

| Variable | Description |
|----------|-------------|
| `{npc_name}` | Nom du PNJ joué |
| `{npc_personality}` | Traits de personnalité du PNJ (depuis le profil de l'entité) |
| `{player}` | Nom du personnage du joueur |
| `{relationship}` | Relation avec le joueur (ami, neutre, ennemi, etc.) |
| `{line}` | Ce que le joueur a dit au PNJ |

**Température :** 0.7 | **Jetons max :** 1024 | **Priorité :** 9

---

### Chroniqueur (`chronicler`)

**Description :** Gestion de la chronologie. Résume les événements et maintient l'historique du monde.

**Variables du modèle :**
`{events}` `{timeline}`

| Variable | Description |
|----------|-------------|
| `{events}` | Nouveaux événements àchroniquer (actions, déplacements, dialogues récents) |
| `{timeline}` | Chronologie existante pour le contexte |

**Température :** 0.5 | **Jetons max :** 1024 | **Priorité :** 5

---

### Planificateur d'histoire (`story-planner`)

**Description :** Planification des arcs narratifs. Planifie les quêtes et les développements de l'intrigue.

**Variables du modèle :**
`{world_state}` `{characters}` `{events}` `{quests}`

| Variable | Description |
|----------|-------------|
| `{characters}` | Personnages actifs dans le monde |
| `{quests}` | Quêtes actuellement actives |

**Format de sortie :**
```json
{"arc": "description", "quests": [{"title": "", "description": "", "objectives": [""]}], "hooks": [""]}
```

**Température :** 0.7 | **Jetons max :** 2048 | **Priorité :** 6

---

### Simulateur social (`social-sim`)

**Description :** Dynamique sociale. Simule les relations et interactions entre PNJ.

**Variables du modèle :**
`{characters}` `{relationships}` `{context}`

| Variable | Description |
|----------|-------------|
| `{relationships}` | Graphe actuel des relations entre personnages |
| `{context}` | Contexte social (rencontre, conflit, alliance, etc.) |

**Température :** 0.6 | **Jetons max :** 1024 | **Priorité :** 4

---

### Gestionnaire de méchants (`villain`)

**Description :** Gestion des antagonistes. Planifie les actions des méchants et leurs intrigues.

**Variables du modèle :**
`{villain}` `{world_state}` `{recent_actions}`

| Variable | Description |
|----------|-------------|
| `{villain}` | Profil du méchant (personnalité, objectifs, capacités) |
| `{recent_actions}` | Actions récentes du méchant dans le monde |

**Température :** 0.8 | **Jetons max :** 2048 | **Priorité :** 6

---

### Chercheur (`researcher`)

**Description :** Vérification des faits, validation du réalisme et recherche pour la construction du monde.

**Variables du modèle :**
`{task}` `{world_context}`

| Variable | Description |
|----------|-------------|
| `{task}` | Tâche de recherche (vérification de recette, validation de personnage, enrichissement de scène, vérification de fait) |

**Format de sortie :**
```json
{"verdict": "plausible|questionable|unrealistic", "confidence": 0.0-1.0, "issues": [], "suggestions": [], "enrichedDetails": ""}
```

**Température :** 0.3 | **Jetons max :** 2048 | **Priorité :** 3 (la plus basse)

---

## Guide de température

| Valeur | Effet | À utiliser pour |
|--------|-------|-----------------|
| 0.1 - 0.3 | Focalisé, déterministe | Recherche, vérification de faits |
| 0.4 - 0.6 | Équilibré | Chroniqueur, simulation sociale |
| 0.7 - 0.8 | Créatif | Récit, dialogues PNJ, intrigues des méchants |

## Utiliser @agent dans le chat

Envoyez un message privé à n'importe quel agent depuis le chat :

```
@narrator Décris l'atmosphère de la forêt ancienne au crépuscule
@director Suggère un rebondissement dramatique
@researcher Cette arme médiévale est-elle historiquement exacte ?
@chronicler Résume ce qui s'est passé la dernière heure
```

Les réponses sont marquées d'une bordure bleue à gauche et du nom de l'agent entre crochets.

### Injection d'instruction linguistique

Les réponses LLM correspondent automatiquement à la langue de l'interface sélectionnée. L'instruction linguistique est intégrée dans les prompts des agents lors de la création du monde via `seedWorldAgents()`, et également ajoutée en temps d'exécution par `getLanguageInstruction()` :

| Langue | Texte injecté |
|--------|---------------|
| en | `IMPORTANT: Always respond in English.` |
| ru | `ВАЖНО: Всегда отвечай на русском языке.` |
| de | `WICHTIG: Antworte immer auf Deutsch.` |
| fr | `IMPORTANT: Réponds toujours en français.` |
| es | `IMPORTANTE: Responde siempre en español.` |
| ja | `重要：常に日本語で回答してください。` |
| zh | `重要：请始终用中文回复。` |

Lors de la création du monde, `seedWorldAgents()` écrit les 14 agents avec l'instruction linguistique ajoutée au prompt système. Cela garantit que les nouveaux mondes commencent avec une isolation linguistique appropriée. La fonction d'exécution `getLanguageInstruction()` est utilisée par `dialogue-context.ts` pour les dialogues PNJ dynamiques.

### Points de terminaison API pour les prompts

| Méthode | Chemin | Description |
|---------|--------|-------------|
| `GET` | `/api/agents` | Lister tous les agents (accepte `?world=`) |
| `GET` | `/api/agents/:id` | Obtenir la configuration d'un agent (accepte `?world=`) |
| `PUT` | `/api/agents/:id` | Mettre à jour la configuration d'un agent (accepte `?world=`) |
| `PUT` | `/api/agents/:id/prompts` | Mettre à jour les prompts (accepte `?world=`) |
| `GET` | `/api/agents/:id/prompts/:lang` | Obtenir les prompts pour une langue spécifique |
| `PUT` | `/api/agents/:id/prompts/:lang` | Créer ou mettre à jour les prompts pour une langue spécifique |

**Paramètres de requête :**
- `world` — optionnel, par défaut le monde actif des paramètres. Tous les points de terminaison des agents supportent `?world=` pour les opérations par monde sans changer le monde actif.

## Priorité

Les agents avec une priorité plus élevée sont traités en premier lorsque plusieurs requêtes LLM sont en file d'attente.

| Agent | Priorité |
|-------|----------|
| narrator | 10 (la plus haute) |
| npc | 9 |
| director | 8 |
| scene | 7 |
| story-planner | 6 |
| villain | 6 |
| chronicler | 5 |
| social-sim | 4 |
| researcher | 3 (la plus basse) |
