# TrueNeverStory v0.20.3

### Écris ton livre en jouant.

TrueNeverStory est un moteur de narration interactive propulsé par l'IA. Chaque PNJ se souvient, chaque action a une chance, et l'histoire ne s'arrête jamais. Joue un personnage, explore un monde vivant, et regarde tes choix façonner le récit — ou laisse le monde évoluer seul.

Construit sur TypeScript (Bun + Hono) avec des noyaux de calcul C FFI pour les opérations critiques.

**[English](README.md) | [Русский](README.ru.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [日本語](README.ja.md) | [中文](README.zh.md)**

---

## Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| **Monde vivant** | Personnages, lieux, objets, factions — tous connectés dans un graphe de connaissances O(1) |
| **14 agents IA** | Narrateur, Directeur, PNJ, Scène, Chroniqueur, Scénariste, Vilain, Chercheur, Historien, Cartographe, Marchand, Donneur de quêtes, Gardien du savoir, Sim. sociale |
| **Mémoire & RAG** | Recherche vectorielle (BGE-M3 + SQLite hybride FTS5/dense/RRF) |
| **Système de probabilité** | Résultats déterministes pour combat, persuasion, discrétion, romance |
| **Romance & Social** | Gestion des relations, factions, alliances, hiérarchie féodale, dialogues PNJ |
| **Système de quêtes** | Génération dynamique, objectifs, récompenses, chaînes, limites de temps |
| **Inventaire & Commerce** | Objets avec rareté, stats, équipement, or, commerce avec PNJ |
| **Économie PNJ** | Hiérarchie féodale (10 rangs), impôts, production alimentaire, système familial, 34 archétypes |
| **Moteur de règles** | 14 systèmes sociaux/économiques prédéfinis (féodalisme, démocratie, anarchie, etc.) avec matrice de synergie |
| **Multi-mondes** | Exécution isolée des mondes avec surveillance des ressources (mémoire, CPU, tokens) |
| **Inter-mondes** | Communication d'événements entre mondes avec portails et mémoire partagée |
| **Système de plugins** | Architecture extensible avec gestionnaire de plugins, hooks de cycle de vie et API |
| **Feature flags** | Tests A/B, déploiement progressif, ciblage par pourcentage |
| **Versioning API** | Points d'entrée v1/v2 avec en-têtes de dépréciation |
| **Streaming temps réel** | WebSocket + SSE pour la diffusion du récit |
| **i18n (7 langues)** | EN, RU, DE, FR, ES, JA, ZH |
| **Auth par mot de passe** | Sessions HttpOnly cookies, protection CSRF, sessions SQLite |
| **Stockage SQLite** | Entités, embeddings, mémoire, prompts, traductions |
| **Circuit Breaker** | Basculage automatique des fournisseurs LLM avec chaîne de secours |
| **Journalisation structurée** | ID de trace, ID de corrélation, métriques pour le débogage multi-agents |

---

## Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| **Monde vivant** | Personnages, lieux, objets, factions — tous connectés dans un graphe de connaissances O(1) |
| **14 agents IA** | Narrateur, Directeur, PNJ, Scène, Chroniqueur, Scénariste, Vilain, Chercheur, Historien, Cartographe, Marchand, Donneur de quêtes, Gardien du savoir, Sim. sociale |
| **Mémoire & RAG** | Recherche vectorielle (BGE-M3 + SQLite hybride FTS5/dense/RRF) |
| **Système de probabilité** | Résultats déterministes pour combat, persuasion, discrétion, romance |
| **Romance & Social** | Gestion des relations, factions, alliances, hiérarchie féodale, dialogues PNJ |
| **Système de quêtes** | Génération dynamique, objectifs, récompenses, chaînes, limites de temps |
| **Inventaire & Commerce** | Objets avec rareté, stats, équipement, or, commerce avec PNJ |
| **Économie PNJ** | Hiérarchie féodale (10 rangs), impôts, production alimentaire, système familial, 34 archétypes |
| **Moteur de règles** | 14 systèmes sociaux/économiques prédéfinis (féodalisme, démocratie, anarchie, etc.) avec matrice de synergie |
| **Multi-mondes** | Exécution isolée des mondes avec surveillance des ressources (mémoire, CPU, tokens) |
| **Inter-mondes** | Communication d'événements entre mondes avec portails et mémoire partagée |
| **Système de plugins** | Architecture extensible avec gestionnaire de plugins, hooks de cycle de vie et API |
| **Feature flags** | Tests A/B, déploiement progressif, ciblage par pourcentage |
| **Versioning API** | Points d'entrée v1/v2 avec en-têtes de dépréciation |
| **Streaming temps réel** | WebSocket + SSE pour la diffusion du récit |
| **i18n (7 langues)** | EN, RU, DE, FR, ES, JA, ZH |
| **Auth par mot de passe** | Sessions HttpOnly cookies, protection CSRF, sessions SQLite |
| **Stockage SQLite** | Entités, embeddings, mémoire, prompts, traductions |
| **Circuit Breaker** | Basculage automatique des fournisseurs LLM avec chaîne de secours |
| **Journalisation structurée** | ID de trace, ID de corrélation, métriques pour le débogage multi-agents |

---

## Plateformes supportées

| Plateforme | Statut | Notes |
|------------|:------:|-------|
| Linux x86_64 | ✅ | Support complet, noyaux FFI |
| Linux ARM64 | ✅ | Support complet, noyaux FFI |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

---

## Démarrage rapide

**Pas besoin de Bun, Node.js ou autre runtime.** Télécharge et lance.

### 1. Télécharger

Dernière release sur [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Plateforme | Fichier |
|------------|---------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Lancer

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

### 3. Ouvrir

**http://localhost:8000** — mot de passe : **`changeme`**

Changez le mot de passe après la première connexion.

---

## Configurer le LLM

Ouvrez **Paramètres** ou éditez `.env` :

### Ollama (local, gratuit)

```bash
ollama pull llama3
ollama serve
```

```
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
```

### OpenAI

```
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
```

Fonctionne aussi avec vLLM, Anthropic, Google et toute API compatible OpenAI.

---

## Structure du projet

```
TrueNeverStory/
├── src/
│   ├── config/           # Configuration validée par Zod
│   ├── lib/              # Client LLM, SQLite, opérations vectorielles, circuit breaker, feature flags
│   ├── memory/           # WorldMemory, pipeline cognitif
│   ├── middleware/        # Auth, rate limiter, en-têtes sécurité, logger
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── plugins/          # Interface et gestionnaire de plugins
│   ├── routes/           # Routes API (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # Moteur de règles (14 règles, matrice synergie, dépendances tech)
│   ├── services/         # 55+ services (moteur de jeu, agents, économie, isolation mondes, bus cross-world)
│   ├── intelligence/     # Analyse graphe, détection doublons
│   ├── i18n/             # Pack de langues (7 langues)
│   ├── store/            # EntityStore avec NameIndex O(1), WorldStore
│   └── utils/            # Logger, hash, sanitize, template resolver
├── mojo/kernels/         # Noyaux C FFI (compilés via Zig)
├── public/               # Interface web (style terminal)
├── worlds/               # Données mondes (SQLite, entités, sessions)
├── conf/                 # Configuration
└── tests/                # Suite de tests
```

---

## API

### Authentification

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/login` | Page de connexion |
| POST | `/login` | Authentification |
| POST | `/logout` | Déconnexion |

### Chat & Jeu de rôle

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/chat/setup` | Initialiser la session |
| POST | `/api/chat/message` | Envoyer un message |
| POST | `/api/chat/stream` | Streaming SSE |
| GET | `/api/chat/session` | État de la session |
| GET | `/api/chat/history` | Historique |

### Entités & Graphe

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/entity/:uid` | Détails entité |
| GET | `/api/neighbors/:uid` | Voisins avec parcours |
| GET | `/api/search?q=` | Recherche |
| GET | `/api/graph/summary` | Statistiques graphe |

### Agents & i18n

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/agents` | Configurations agents |
| PUT | `/api/agents/:id` | Mettre à jour agent |
| PUT | `/api/agents/:id/prompts/:lang` | Prompts par langue |
| GET | `/api/i18n/translations/:lang/:page` | Traductions |

### Moteur de règles

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/rules` | Règles disponibles |
| GET | `/api/rules/:id` | Détails règle |
| POST | `/api/rules/validate` | Valider JSON règle |

### Inter-mondes

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/cross-world/status` | Statut inter-mondes |
| POST | `/api/cross-world/enable` | Activer |
| POST | `/api/cross-world/disable` | Désactiver |
| GET | `/api/cross-world/portals` | Lister portails |
| POST | `/api/cross-world/portals` | Créer portail |
| DELETE | `/api/cross-world/portals/:id` | Supprimer portail |
| GET | `/api/cross-world/events` | Journal événements |

### Plugins

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/plugins` | Plugins enregistrés |
| GET | `/api/plugins/:id` | Détails plugin |
| GET | `/api/plugins/:id/capabilities` | Capacités plugin |

### Feature Flags

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/feature-flags` | Feature flags |
| PUT | `/api/feature-flags/:id` | Mettre à jour flag |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Streaming jeu de rôle temps réel |

---

## Exemples

### API

```bash
# Connexion
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# Initialiser session
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# Envoyer message
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Je sors mon épée et fais face au dragon"}'

# Règles disponibles
curl -b cookies.txt "http://localhost:8000/api/rules"

# Créer portail inter-mondes
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

---

## Pour les développeurs

Documentation complète : [DEV.README.fr.md](docs/DEV.README.fr.md)

### Prérequis

- [Bun](https://bun.sh) v1.0+

### Installation

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

### Commandes

| Commande | Description |
|----------|-------------|
| `bun run dev` | Développement avec hot reload |
| `bun run start` | Mode production |
| `bun run lint` | Vérification de types |
| `bun test` | Tests |
| `bun run build` | Build |

---

## Derniers changements

### v0.20.3 — Fix graphe monde + modal statistiques + injection langue + thèmes

- Correction de `buildRelationships()` mort — construction heuristique automatique des relations au démarrage
- Nouvel endpoint `GET /worlds/:name/detail` pour les statistiques du monde
- Nouvelle modal de statistiques avec listes d'entités, règles et détails de personnages
- Injection de langue — les réponses LLM correspondent à la langue de l'interface (7 langues)
- Système de thèmes — 5 thèmes intégrés (Sombre, Clair, Terminal, Cyberpunk, Personnalisé) + constructeur

### v0.20.1 — Correction du moteur de règles pour binaire

- Correction du crash de `/api/rules` dans le binaire Bun compilé
- Remplacement de `import.meta.dir` par `process.cwd()` pour la résolution des répertoires de règles
- Résolution de l'erreur ENOENT (`/$bunfs/root/../rules/social`) dans le binaire compilé
- Fichiers concernés : `src/routes/rules.ts` et `src/rules/rules-engine.ts`

### v0.20.0 — Améliorations architecturales

Refonte architecturale complète en 5 étapes :

**Étape 1-2 :**
- Séparation NarrativeService (Bootstrapper + Facade + Service)
- Modèle d'agents unifié avec interface et classe de base
- Event Sourcing avec événements de domaine et snapshots
- Circuit Breaker pour LLM avec basculage automatique
- Registre d'agents avec 4 types de sources
- Journalisation structurée avec trace IDs et corrélation

**Étape 3 :**
- Moteur de règles — 14 systèmes prédéfinis
- Matrice de synergie, dépendances technologiques, modificateurs de bonheur
- Validateur de règles et dérive culturelle
- Feature flags avec tests A/B et déploiement progressif
- Versioning API (v1/v2)
- WorldStore — migration SQLite

**Étape 4 :**
- Isolation multi-mondes avec surveillance des ressources
- Communication inter-mondes avec portails et événements
- Système de plugins avec gestionnaire et hooks

**Étape 5 :**
- Mise à jour de la documentation

→ [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | [MIGRATION.md](docs/MIGRATION.md)

### v0.15.0 — Renforcement de la sécurité

- Sessions SQLite
- Validation token WebSocket
- Protection path traversal
- Protection CSRF
- Secure cookie, CSP renforcé

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

---

## Licence

---

🔗 **Projet :** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
