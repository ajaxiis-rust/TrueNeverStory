# TrueNeverStory v0.26.0

### Ecris ton livre en jouant.

TrueNeverStory est un moteur de narration interactive propulse par l'IA avec une **architecture State-First**. Chaque PNJ se souvient, chaque action a un resultat deterministe, et l'histoire ne s'arrete jamais. Joue un personnage, explore un monde vivant, et regarde tes choix faconner le recit — ou laisse le monde evoluer seul.

Construit sur TypeScript (Bun + Hono) avec des noyaux de calcul C FFI pour les operations critiques.

**[English](README.md) | [Русский](README.ru.md) | [Deutsch](README.de.md) | [Espanol](README.es.md) | [日本語](README.ja.md) | [中文](README.zh.md)**

---

## Nouveautes de v0.26.0

### Optimisation de la BD Biblique
- **Recherche FTS5** — remplacement de `LIKE '%query%'` par `MATCH` FTS5 pour des requetes textuelles en O(1) (avec fallback sur LIKE)
- **Parcours de graphe par lot** — `getRelatedVerses()` utilise maintenant des requetes `IN (...)` par lot au lieu de N requetes separees (N+1 → 1)
- **Index des versets** — ajout de `idx_verses_book_chapter` pour accelerer les requetes filtrees
- **Systeme de personnages** — nouveau `CharacterDB` avec 3 tables : `bible_characters`, `bible_character_edges`, `bible_character_mentions`
- **Dictionnaire de noms** — 40+ personnages bibliques avec variantes multilingues (EN/RU/HE/EL)
- **Outils MCP pour personnages** — `searchCharacters`, `getCharacter`, `getCharacterEdges`, `getVerseCharacters`
- **Nettoyage git** — suppression de 177 Mo de sources brutes et 59 Mo de BD compilees du suivi de versions
- **Scripts de build** — `download-sources.sh` + `bootstrap-bible-db.ts` pour la configuration du client

---

## Nouveautes de v0.26.0

### Pipeline State-First
Le moteur traite maintenant les actions **de maniere deterministe avant de generer du texte** :
1. **Intent Parser** — Intents structures validates par Zod remplacement du routage regex
2. **Moteur de simulation** — Mojo FFI calcule les resultats avant la generation de prose
3. **State Mutator** — EntityStore mis a jour immediatement apres la logique
4. **Context Builder** — Contexte de jeu partage pour tous les agents
5. **Generation de prose** — LLM genere du texte contraint par les resultats de simulation

### Integration MCP (Litterature-en-Code)
- **Bible comme stdlib** — Motifs bibliques comme archetypes narratifs (SQLite + MCP)
- **Gutenberg comme CSS de style** — Motifs stylistiques delexifies pour le rendu de prose
- **Wikipedia comme validateur** — Verification historique via connaissances externes

### Les Six Grands Agents
14 agents consolides en 6 roles specialises :

| Agent | Role | Description |
|-------|------|-------------|
| **Dramaturge** | L'Architecte | Selectionne les motifs narratifs parmi les archetypes bibliques |
| **Validateur** | Le Verificateur | Verifie les faits via Wikipedia MCP |
| **Styliste** | Le Narrateur | Rend la prose avec les motifs stylistiques Gutenberg |
| **Acteur** | Ensemble PNJ | Gere les dialogues PNJ avec motivations cachees L3 |
| **Censeur** | Linter | Supprime les cliches IA et enforce la coherence stylistique |
| **Chroniqueur** | Memoire du monde | Met a jour la chronologie et l'etat du monde |

### Systeme Heartbeat
Indicateurs de progression en temps reel dans l'interface chat :
- "Analyse de votre entree..."
- "Lancement des des..."
- "Resultat : Succes (73%)"
- "Tissage du recit..."
- "Termine"

### Interlingua (anglais comme langue interne)
Toutes les operations agent-a-agent et agent-a-MCP utilisent l'anglais pour l'efficacite des tokens et la precision. La traduction se fait a la frontiere de sortie.

---

## Fonctionnalites

| Fonctionnalite | Description |
|----------------|-------------|
| **Pipeline State-First** | Simulation deterministe -> mutation d'etat -> generation de prose contrainte |
| **6 agents IA** | Dramaturge, Validateur, Styliste, Acteur, Censeur, Chroniqueur |
| **Integration MCP** | Motifs bibliques, styles Gutenberg, validation Wikipedia |
| **Monde vivant** | Personnages, lieux, objets, factions — tous connectes dans un graphe de connaissances O(1) |
| **Memoire & RAG** | Recherche vectorielle (BGE-M3 + SQLite hybride FTS5/dense/RRF) |
| **Systeme de probabilite** | Resultats deterministes pour combat, persuasion, discretions, romance |
| **Romance & Social** | Gestion des relations, factions, alliances, hierarchie feodale, dialogues PNJ |
| **Systeme de quetes** | Generation dynamique, objectifs, recompenses, chaines, limites de temps |
| **Inventaire & Commerce** | Objets avec rarete, stats, equipement, or, commerce avec PNJ |
| **Economie PNJ** | Hierarchie feodale (10 rangs), impots, production alimentaire, systeme familial, 34 archetypes |
| **Moteur de regles** | 14 systemes sociaux/economiques predefinies (feodalisme, democratie, anarchie, etc.) avec matrice de synergie |
| **Multi-mondes** | Execution isolee des mondes avec surveillance des ressources (memoire, CPU, tokens) |
| **Inter-mondes** | Communication d'evenements entre mondes avec portails et memoire partagee |
| **Systeme de plugins** | Architecture extensible avec gestionnaire de plugins, hooks de cycle de vie et API |
| **Feature flags** | Tests A/B, deploiement progressif, ciblage par pourcentage |
| **Versioning API** | Points d'entree v1/v2 avec en-tetes de depreciation |
| **Streaming temps reel** | WebSocket + SSE pour la diffusion du recit avec progression heartbeat |
| **i18n (7 langues)** | EN, RU, DE, FR, ES, JA, ZH — UI, prompts, noms d'agents |
| **Auth par mot de passe** | Sessions HttpOnly cookies, protection CSRF, sessions SQLite |
| **Stockage SQLite** | Entites, embeddings, memoire, prompts, traductions |
| **Circuit Breaker** | Basculage automatique des fournisseurs LLM avec chaine de secours |
| **Journalisation structuree** | ID de trace, ID de correlation, metriques pour le debogage multi-agents |

---

## Plateformes supportees

| Plateforme | Statut | Notes |
|------------|:------:|-------|
| Linux x86_64 | ✅ | Support complet, noyaux FFI |
| Linux ARM64 | ✅ | Support complet, noyaux FFI |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

Le serveur detecte automatiquement les noyaux FFI — fallback en TypeScript pur si indisponible.

---

## Demarrage rapide

**Pas besoin de Bun, Node.js ou autre runtime.** Telecharge et lance.

### 1. Telecharger

Derniere release sur [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Plateforme | Fichier |
|------------|---------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Lancer

Le lanceur detecte automatiquement votre fournisseur LLM (Ollama, LM Studio, OpenAI, llama.cpp), configure `.env` et lance le serveur.

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x startgame.sh
./startgame.sh

# Windows (PowerShell)
# Extraire tns-windows-x64.zip, puis :
.\startgame.ps1
```

**Options de lancement :**
```bash
./startgame.sh --local    # CORS=localhost uniquement (securise pour le dev)
./startgame.sh --remote   # CORS=* (par defaut, acces externe autorise)
```

**Depuis les sources (requis Bun) :**
```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
./startgame.sh            # Linux/macOS
.\startgame.ps1           # Windows PowerShell
```

### 3. Ouvrir

**http://localhost:8000** — mot de passe : **`changeme`**

Changez le mot de passe apres la premiere connexion.

---

## Configurer le LLM

Ouvrez **Parametres** ou editez `.env` :

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

### LM Studio

```
WORLD_LLM_BASE_URL=http://localhost:1234/v1
WORLD_LLM_API_KEY=lm-studio
WORLD_LLM_MODEL=your-model
```

Fonctionne aussi avec vLLM, Anthropic, Google et toute API compatible OpenAI.

---

## Structure du projet

```
TrueNeverStory/
├── src/
│   ├── config/           # Configuration validee par Zod
│   ├── lib/              # Client LLM, SQLite, operations vectorielles, session store, circuit breaker, feature flags
│   ├── memory/           # WorldMemory, pipeline cognitif, extraction d'entites
│   ├── middleware/        # Auth, rate limiter, en-tetes securite, CORS, logger
│   ├── models/           # Entity, chat, probability, romance, quest, item, intent, simulation, heartbeat
│   ├── mcp/              # Serveur MCP, parseurs Bible/Gutenberg, outils Wikipedia
│   ├── plugins/          # Interface et gestionnaire de plugins
│   ├── routes/           # Routes API (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # Moteur de regles (14 regles, matrice synergie, dependances tech)
│   ├── services/         # 60+ services (moteur de jeu, agents, economie, isolation mondes, bus inter-mondes)
│   │   ├── agents/       # Nouveaux agents v0.26.0 (Dramaturge, Validateur, Styliste, Acteur, Censeur, Chroniqueur)
│   │   └── ...
│   ├── intelligence/     # Analyse graphe, detection doublons, systeme de recommandation
│   ├── i18n/             # Pack de langues (7 langues)
│   ├── store/            # EntityStore avec NameIndex O(1), WorldStore
│   └── utils/            # Logger, hash, sanitize, template resolver
├── mojo/kernels/         # Noyaux C FFI (compiles via Zig)
├── public/               # Interface web (style terminal avec progression heartbeat)
├── worlds/               # Donnees mondes (SQLite, entites, sessions)
├── conf/                 # Configuration
└── tests/                # Suite de tests
```

---

## Architecture : Pipeline State-First

```
Entree du joueur
  │
  ▼
Intent Parser (validation Zod)
  │
  ▼
Moteur de simulation (Mojo FFI)
  │ resultat, probabilite, modifications d'etat
  ▼
State Mutator (EntityStore L1-L3)
  │
  ▼
Context Builder (etat de jeu partage)
  │
  ▼
Dramaturge (selection de motifs bibliques via MCP)
  │
  ▼
Styliste (rendu de style Gutenberg via MCP)
  │
  ▼
Censeur (suppression des cliches IA)
  │
  ▼
Service de traduction (anglais -> langue de l'utilisateur)
  │
  ▼
Reponse a l'utilisateur
```

---

## API

### Authentification

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/login` | Page de connexion |
| POST | `/login` | Authentification (`password=...`) |
| POST | `/logout` | Deconnexion |

### Chat & Jeu de role

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/chat/setup` | Initialiser la session (personnage, lieu, role) |
| POST | `/api/chat/message` | Envoyer un message, obtenir le recit |
| POST | `/api/chat/stream` | Streaming SSE avec heartbeat |
| GET | `/api/chat/session` | Etat de la session |
| GET | `/api/chat/history` | Historique |

### Entites & Graphe

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/entity/:uid` | Details entite |
| GET | `/api/neighbors/:uid` | Voisins avec parcours en profondeur |
| GET | `/api/path?source=&target=` | Plus court chemin entre entites |
| GET | `/api/search?q=` | Recherche par nom ou semantique |
| GET | `/api/graph/summary` | Statistiques graphe |

### Agents & i18n

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/agents` | Configurations agents |
| PUT | `/api/agents/:id` | Mettre a jour agent |
| PUT | `/api/agents/:id/prompts/:lang` | Prompts par langue |
| GET | `/api/i18n/translations/:lang/:page` | Traductions |
| PUT | `/api/i18n/translations` | Upsert traductions |

### Moteur de regles

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/rules` | Regles disponibles |
| GET | `/api/rules/:id` | Details regle |
| POST | `/api/rules/validate` | Valider JSON regle |

### Inter-mondes

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/cross-world/status` | Statut inter-mondes |
| POST | `/api/cross-world/enable` | Activer |
| POST | `/api/cross-world/disable` | Desactiver |
| GET | `/api/cross-world/portals` | Lister portails |
| POST | `/api/cross-world/portals` | Creer portail |
| DELETE | `/api/cross-world/portals/:id` | Supprimer portail |
| GET | `/api/cross-world/events` | Journal evenements |

### Plugins

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/plugins` | Plugins enregistres |
| GET | `/api/plugins/:id` | Details plugin |
| GET | `/api/plugins/:id/capabilities` | Capacites plugin |

### Feature Flags

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/feature-flags` | Feature flags |
| PUT | `/api/feature-flags/:id` | Mettre a jour flag |

### Systeme

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/system/pause` | Pause du traitement en arriere-plan |
| POST | `/api/system/resume` | Reprise du traitement en arriere-plan |
| GET | `/api/health` | Verification sante |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Streaming jeu de role temps reel avec heartbeat |

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
  -d '{"content": "Je sors mon epee et fais face au dragon"}'

# Rechercher entites
curl -b cookies.txt "http://localhost:8000/api/search?q=dragon"

# Regles disponibles
curl -b cookies.txt "http://localhost:8000/api/rules"

# Creer portail inter-mondes
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

### Streaming SSE avec Heartbeat

```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: 'J'explore les ruines anciennes' }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));
    
    if (event.type === 'heartbeat') {
      console.log(`Progression : ${event.message} (${event.progress * 100}%)`);
    } else if (event.type === 'chunk') {
      process.stdout.write(event.content);
    }
  }
}
```

---

## Pour les developpeurs

Documentation complete : [DEV.README.fr.md](docs/DEV.README.fr.md)

### Pre-requis

- [Bun](https://bun.sh) v1.0+

### Installation

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

Ouvrir http://localhost:8000

### Commandes

| Commande | Description |
|----------|-------------|
| `bun run dev` | Developpement avec hot reload |
| `bun run start` | Mode production |
| `bun run lint` | Verification de types |
| `bun test` | Tests |
| `bun run build` | Build |

---

## Compilation de releases binaires

Cross-compilation via Zig pour toutes les plateformes :

```bash
cd mojo/kernels
./build.sh native           # Plateforme actuelle
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # Toutes les cibles
```

Compiler le binaire serveur :

```bash
bun build --compile --outfile tns-server src/index.ts
```

Voir [COMPILE.md](docs/COMPILE.md). GitHub Actions construit toutes les plateformes automatiquement lors du push de tag.

---

## Derniers changements

### v0.26.0 — Optimisation de la BD Biblique

**Performances :**
- Recherche FTS5 avec fallback sur LIKE — O(n) → O(1) pour les requetes textuelles
- Parcours de graphe par lot — N+1 → 1 requetes SQL pour les relations entre versets
- Index des versets + methode VACUUM pour la compactation de la BD

**Fonctionnalites :**
- Systeme de personnages (CharacterDB avec 3 tables SQLite)
- Dictionnaire de noms bibliques (40+ personnages, variantes EN/RU/HE/EL)
- Outils MCP : recherche, obtention, liens, mentions, personnages de versets
- Support gzip pour les fichiers sources de la Bible
- Scripts de telechargement et bootstrap pour la configuration du client

**Maintenance :**
- Suppression de 177 Mo de sources et 59 Mo de BD compilees du suivi git
- Ajout de .gitignore pour les sources et la BD compilee

### v0.26.0 — Literary Compiler & Modeles economiques

**Literary Compiler (Phases 0-6):**
- 4 passes d'analyse hors-ligne : Dramaturgique, Stylistique, Emotionnelle, Metadonnees
- Schema SQL avec FTS5 pour la recherche de modeles de quetes
- Linter pour la validation, deduplication et detection de cliches
- Prompt anti-moralisation pour l'agent Styliste

**Modeles economiques:**
- JubileeManager — reinitialisation des dettes tous les 50 ans, retour des terres, boost de loyaute
- FactionTaxDilemma — conflits fiscaux auto-generes entre factions avec choix du joueur
- FactionLaborRules — salaires fixes/proportionnels par faction, detection de conflits de loyaute
- EconomicCycles — modele de Joseph avec phases d'abondance/transition/famine

**Integration economique:**
- Facade EconomicService pour les 4 modeles economiques
- Integration DirectorLoop : transitions de cycle, evenements jubile, generation de dilemmes
- Integration NPC-Economy avec calcul des salaires selon les regles de travail
- 7 nouveaux outils MCP : get_economic_phase, get_price_modifier, calculate_price, get_wage, generate_dilemma, check_jubilee, get_jubilee_info

**Corrections:**
- Suppression de la dependance `better-sqlite3` inutilisee (le projet utilise `bun:sqlite`)
- Noms de factions hardcodes dans les options de dilemme corriges — utilise les vrais noms
- Liste de factions hardcodee dans DirectorLoop corrige — lit depuis la config du monde
- Approximation de l'annee corrigee — utilise `getFullYear()` au lieu du calcul manuel

### v0.26.0 — Architecture State-First

**Refactoring du moteur principal :**
- Intent Parser avec schemas Zod (6 types d'intents : mouvement, dialogue, action, commande, observation, meta)
- Moteur de simulation avec outcomes deterministes Mojo FFI
- State Mutator pour les mises a jour immediates d'EntityStore
- Context Builder pour l'etat de jeu partage
- Refactoring de RoleplayEngine comme orchestrateur leger

**Integration MCP :**
- Serveur MCP TNS avec outils Bible, Gutenberg et Wikipedia
- Parseur Bible pour bases de donnees SQLite externes avec recherche FTS
- Parseur Gutenberg avec extraction de style et delexification
- Validateur Wikipedia pour verification historique

**Consolidation des agents :**
- 14 agents -> 6 roles specialises (Dramaturge, Validateur, Styliste, Acteur, Censeur, Chroniqueur)
- AgentRegistryV2 pour la gestion du cycle de vie
- Integration d'outils MCP pour chaque agent

**Systeme Heartbeat :**
- Indicateurs de progression en temps reel via SSE
- Composant frontend HeartbeatUI
- Barre de progression avec messages par etape

**Interlingua :**
- Anglais comme langue interne pour toutes les operations
- TranslationService a la frontiere de sortie

**Corrections de bugs :**
- Toutes les erreurs TypeScript corrigees (0 erreur)
- Types de parametres de requete SQLite corriges
- Incompatibilites de signature LLMQueue corrigees

### v0.22.2 — Theme Builder

- Page de constructeur de themes autonome a `/theme-builder`
- 8 themes predefinis : Dracula, Nord, Monokai, Solarized, Gruvbox, Tokyo Night, One Dark, Catppuccin
- Controles de selection de couleur pour 14 variables CSS (arriere-plans, bordures, textes, accents)
- Selecteurs de polices pour mono, body et display
- Panneau de previsualisation en direct avec tous les composants UI
- Export/import de themes en fichiers JSON
- Lien de navigation depuis la page des parametres

### v0.22.2 — Correction systeme de themes

- Correction de `theme-custom.css` — syntaxe des variables CSS corrigee (utilisait `var()` au lieu de `--name: value`)
- Variables manquantes `--accent-subtle`, `--success-subtle`, `--warning-subtle`, `--interactive-subtle` ajoutees au theme personnalise
- Les 5 themes (Sombre, Clair, Terminal, Cyberpunk, Personnalise) fonctionnent maintenant correctement via les boutons selecteurs

### v0.20.4 — Fix graphe monde + modal statistiques + injection langue + themes

- Correction de `buildRelationships()` mort — construction heuristique automatique des relations au demarrage
- Nouvel endpoint `GET /worlds/:name/detail` pour les statistiques du monde
- Nouvelle modal de statistiques avec listes d'entites, regles et details de personnages
- Injection de langue — les reponses LLM correspondent a la langue de l'interface (7 langues)
- Systeme de themes — 5 themes integres (Sombre, Clair, Terminal, Cyberpunk, Personnalise) + constructeur

### v0.20.1 — Correction du moteur de regles pour binaire

- Correction du crash de `/api/rules` dans le binaire Bun compile
- Remplacement de `import.meta.dir` par `process.cwd()` pour la resolution des repertoires de regles
- Resolution de l'erreur ENOENT (`/$bunfs/root/../rules/social`) dans le binaire compile
- Fichiers concernes : `src/routes/rules.ts` et `src/rules/rules-engine.ts`

### v0.20.0 — Ameliorations architecturales

Refonte architecturale complete en 5 etapes :

**Etape 1-2 :**
- Separation NarrativeService (Bootstrapper + Facade + Service)
- Modele d'agents unifie avec interface et classe de base
- Event Sourcing avec evenements de domaine et snapshots
- Circuit Breaker pour LLM avec basculage automatique
- Registre d'agents avec 4 types de sources
- Journalisation structuree avec trace IDs et correlation

**Etape 3 :**
- Moteur de regles — 14 systemes predefinis
- Matrice de synergie, dependances technologiques, modificateurs de bonheur
- Validateur de regles et derive culturelle
- Feature flags avec tests A/B et deploiement progressif
- Versioning API (v1/v2)
- WorldStore — migration SQLite

**Etape 4 :**
- Isolation multi-mondes avec surveillance des ressources
- Communication inter-mondes avec portails et evenements
- Systeme de plugins avec gestionnaire et hooks

**Etape 5 :**
- Mise a jour de la documentation

→ [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | [MIGRATION.md](docs/MIGRATION.md)

### v0.15.0 — Renforcement de la securite

- Sessions SQLite
- Validation token WebSocket
- Protection path traversal
- Protection CSRF
- Secure cookie, CSP renforce

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

---

## Licence

---

**Projet :** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
