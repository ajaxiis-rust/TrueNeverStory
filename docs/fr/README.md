# TrueNeverStory

### Écris ton livre en jouant.

TrueNeverStory est un moteur de narration interactive propulsé par l'IA avec une **architecture State-First**. Chaque PNJ se souvient, chaque action a un résultat déterministe, et l'histoire ne s'arrête jamais. Joue un personnage, explore un monde vivant, et regarde tes choix façonner le récit — ou laisse le monde évoluer seul.

Construit sur TypeScript (Bun + Hono) avec des noyaux de calcul C FFI pour les opérations critiques.

**[English](../../README.md) | [Русский](../ru/README.md) | [Deutsch](../de/README.md) | [Español](../es/README.md) | [日本語](../ja/README.md) | [中文](../zh/README.md)**

---

## Ce que c'est

Tu joues un personnage dans un monde vivant en permanence. Chacune de tes actions est découpée en une intention structurée, simulée de façon déterministe, puis rendue en prose par un pipeline d'agents IA spécialisés. La langue interne du moteur est l'anglais ; la traduction se fait à la frontière de sortie, si bien que l'histoire parle toujours ta langue.

- **State-First** — la simulation s'exécute avant l'écriture, donc les résultats sont déterministes et reproductibles.
- **Six agents, un conteur** — Dramaturg (archétypes), Validator (faits), Stylist (prose), Actor (PNJ), Censor (style), Chronicler (mémoire).
- **La littérature comme code** — la Bible comme archétypes narratifs, Gutenberg comme styles de prose, Wikipédia comme vérification des faits, branchés via des outils MCP.

## Fonctionnalités

| Domaine | Description |
|---------|-------------|
| **Pipeline State-First** | Simulation déterministe → mutation d'état → prose contrainte |
| **Monde vivant** | Personnages, lieux, factions dans un graphe de connaissances à lookups O(1) |
| **Mémoire & RAG** | Mémoire vectorielle avec recherche hybride FTS5 + dense + RRF (BGE-M3) |
| **Système de probabilité** | Résultats déterministes pour le combat, la persuasion, la furtivité, la romance |
| **Économie des PNJ** | Hiérarchie féodale (10 rangs), impôts, production alimentaire, système familial |
| **Moteur de règles** | 14 systèmes sociaux/économiques avec matrice de synergie |
| **Multi-monde** | Mondes isolés avec événements et portails inter-mondes |
| **Streaming temps réel** | WebSocket + SSE avec progression heartbeat |
| **i18n** | EN, RU, DE, FR, ES, JA, ZH |
| **Système de plugins** | Hooks de cycle de vie et API |
| **Feature flags** | Déploiement progressif, ciblage par pourcentage |

## Démarrage rapide

**Aucun Bun, Node.js ou runtime requis.** Télécharge et lance, c'est tout.

### 1. Télécharger

Récupère la dernière version pour ta plateforme depuis [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest) :

| Plateforme | Fichier |
|------------|---------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Lancer

Le lanceur détecte automatiquement ton fournisseur LLM (Ollama, LM Studio, OpenAI, llama.cpp), configure `.env` et démarre le serveur.

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

### 3. Ouvrir

Va sur **http://localhost:8000** — mot de passe : **`changeme`** (à changer dans les réglages après la première connexion).

C'est tout. Aucune configuration de base de données, aucune installation de paquets, aucun fichier de configuration à éditer.

## Configurer le LLM

Ouvre la page **Réglages** ou édite `.env`. Fonctionne avec Ollama, LM Studio, vLLM, OpenAI, Anthropic, Google et toute API compatible OpenAI. Voir [HARDWARE.md](HARDWARE.md) et [PROVIDER-RATE-LIMITING.md](../en/PROVIDER-RATE-LIMITING.md).

## Documentation

| Document | Contenu |
|----------|---------|
| [ARCHITECTURE.md](../en/ARCHITECTURE.md) | Conception du système, pipeline, services |
| [API.md](API.md) | Endpoints HTTP et WebSocket |
| [AGENTS.md](AGENTS.md) | Référence des agents (les Big Six) |
| [DEV.README.md](DEV.README.md) | Guide développeur — setup, commandes, DI |
| [COMPILE.md](../en/COMPILE.md) | Builds binaires et cross-compilation |
| [CHANGELOG.md](../en/CHANGELOG.md) | Historique des versions |
| [about.md](about.md) | Règles du monde et économie |
| [MIGRATION.md](../en/MIGRATION.md) | Notes de migration de version |
| [security-audit.md](../en/security-audit.md) | Résultats de l'audit de sécurité |

## Construire depuis les sources

Nécessite [Bun](https://bun.sh) v1.0+.

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev        # http://localhost:8000
```

Commandes : `bun run dev` (rechargement à chaud), `bun run start` (production), `bun run lint` (vérification des types), `bun test` (suite de tests). Voir [COMPILE.md](../en/COMPILE.md) pour les releases binaires.

## Licence

MIT
