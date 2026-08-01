# Wikipedia RAG — Guide Utilisateur

Wikipedia RAG (Retrieval-Augmented Generation) enrichit automatiquement les mondes de jeu avec des connaissances réelles de Wikipedia. Lorsque vous créez un monde, le système recherche des sujets pertinents et construit une base de connaissances que les agents utilisent pour des narratives précises et détaillées.

## Comment ça fonctionne

### Recherche automatique

Lors de la création d'un monde, le système :

1. **Extrait les mots-clés** de la description du monde (ex. "médiéval", "chevaliers", "Angleterre")
2. **Recherche dans Wikipedia** des articles pertinents
3. **Parse les articles** — extrait le texte, les sections, les catégories
4. **Découpe en chunks** — divise en morceaux de ~500 tokens avec chevauchement
5. **Construit l'index RAG** — stocke les chunks pour les requêtes des agents

### Scénario d'exemple

Vous voulez un monde de **chevaliers médiévaux** avec des références littéraires (Ivanhoe, Quentin Durward) :

```
Utilisateur : "Je veux un monde de chevaliers et du Moyen Âge"
```

Le système recherche automatiquement :
- **Géographie** — châteaux, villes, routes commerciales dans l'Angleterre médiévale
- **Vie quotidienne** — nourriture, vêtements, artisanats, structure sociale
- **Armes et armures** — épées, boucliers, cotte de mailles, armure de plaques
- **Souverains et commandants** — rois, seigneurs, leurs caractères et dates
- **Catastrophes** — pestes, incendies, tremblements de terre de l'époque

Toutes ces connaissances sont stockées dans l'index RAG et utilisées par les agents pour générer des narratives précises et détaillées.

### Enrichissement en inactivité

Quand un joueur est inactif plus d'1 heure, le système continue la recherche en arrière-plan :
- Recherche des sujets liés au monde
- Ajoute plus de détails à l'index RAG
- Les prochaines réponses des agents utilisent les nouvelles connaissances

## Suivi de progression

### Interface web

La progression en temps réel est disponible via SSE (Server-Sent Events) :

```
GET /api/wiki/research/{worldId}/progress
```

Étapes de progression :
1. **Génération du monde** — LLM crée le cadre du monde
2. **Recherche Wikipedia** — Téléchargement et parsing des articles
3. **Construction RAG** — Création de l'index vectoriel

### Progression CLI

Barre de progression dans le terminal pendant la création du monde :

```
[Étape 2/3 : Recherche Wikipedia] Recherche de la chevalerie médiévale...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Actuel : Chevalier
  → Erreurs : 1 (ignoré : Châteaux_en_Angleterre)
```

### Boutons dans le chat

Dans l'interface web, vous pouvez contrôler la recherche :
- **🌍 Rechercher Wikipedia** — Démarrer la recherche
- **⏸ Pause** — Mettre en pause la recherche
- **▶ Continuer** — Reprendre la recherche

## Points d'accès API

| Méthode | Chemin | Description |
|---------|--------|-------------|
| `GET` | `/api/wiki/research/{worldId}/progress` | Flux SSE de progression |
| `POST` | `/api/wiki/research/{worldId}` | Démarrer la recherche |
| `POST` | `/api/wiki/research/{worldId}/pause` | Mettre en pause la recherche |
| `POST` | `/api/wiki/research/{worldId}/resume` | Reprendre la recherche |
| `GET` | `/api/wiki/research/{worldId}/status` | Obtenir le statut actuel |

## Intégration MCP

Wikipedia RAG est disponible comme outil MCP pour les agents :

### Wiki Search Tool

```typescript
// Rechercher des connaissances pertinentes
const results = await wikiSearch({
  query: "chevalerie médiévale",
  worldId: "my-world",
  limit: 10
});
```

Retourne :
```json
[
  {
    "article": "Chevalier",
    "section": "Histoire",
    "text": "Le concept de chevalerie est originaire de la période médiévale...",
    "score": 0.85
  }
]
```

### Utilisation dans les agents

Les agents utilisent automatiquement RAG lors de la génération de réponses :
- **Dramaturge** — Utilise le contexte historique pour les patterns narratifs
- **Validateur** — Vérifie les faits contre les données Wikipedia
- **Styliste** — Enrichit les descriptions avec des détails réels
- **Acteur** — Fournit des connaissances NPC précises sur le monde

## Configuration

### Politique de réessai

- **5 tentatives** par article
- **2 minutes timeout** par tentative
- **Backoff exponentiel** : 5s → 10s → 20s → 40s → 80s

### Dégradation élégante

Si Wikipedia n'est pas disponible :
- La création du monde continue sans données Wikipedia
- Les agents utilisent uniquement les connaissances générées par LLM
- La recherche est relancée en arrière-plan

## Structure des fichiers

```
src/services/
├── wikipedia-researcher.ts      # Client Wikipedia API
├── wiki-rag-builder.ts          # Découpage des articles
├── idle-research-scheduler.ts   # Enrichissement en arrière-plan
└── world-creation-progress.ts   # Suivi de progression

src/mcp/wiki/
├── index.ts                     # Exportations du module
└── wiki-search.ts               # Outil de recherche MCP

src/routes/
└── wiki-research.ts             # Points d'accès SSE

src/utils/
└── progress-bar.ts              # Barre de progression CLI
```

## Dépannage

| Problème | Solution |
|----------|----------|
| La recherche ne démarre pas | Vérifiez l'accessibilité de l'API Wikipedia |
| Progression bloquée | Vérifiez l'onglet Système → Journaux d'opérations |
| Les articles ne chargent pas | La politique de réessai gère les pannes temporaires |
| RAG non utilisé par les agents | Assurez-vous que `enableWikipediaResearch()` a été appelé |
| "Authentification requise" | Configurez `AUTH_PASSWORD` dans env ou Paramètres |

## Détails techniques

### Stratégie de chunking

Les articles sont divisés en chunks de ~1500 caractères (~500 tokens) :
- **Chevauchement** : 150 caractères entre les chunks
- **Sections** : Chaque section est chunkée indépendamment
- **Métadonnées** : Chaque chunk stocke le titre de l'article, la section, les catégories

### Algorithme de recherche

L'outil de recherche wiki utilise la correspondance de mots-clés :
1. Divise la requête en mots
2. Vérifie chaque chunk pour la présence de mots
3. Calcule le score de pertinence (correspondances / total de mots)
4. Retourne les meilleurs résultats triés par score

### Stockage

- **SQLite** : Métadonnées des articles et texte des chunks
- **FAISS** : Embeddings vectoriels pour la recherche sémantique
- **Isolation par monde** : Chaque monde a son propre index RAG
