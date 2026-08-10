# MCP Console — Guide utilisateur

La Console MCP est une interface web de gestion pour toutes les bases de donnees de TrueNeverStory. Accedez-y via `/mcp.html` en mode MCP.

## Demarrage rapide

### Lancer le mode MCP

```bash
TNS_MCP_MODE=1 bun run src/index.ts
```

Ouvrez `http://localhost:8000` dans votre navigateur. Si un mot de passe est configure, vous serez redirige vers la page de connexion.

### Protection par mot de passe

Le mode MCP utilise le meme mot de passe que le serveur de jeu principal. Configurez-le via :
- **Variable d'environnement :** `AUTH_PASSWORD=votre_mot_de_passe`
- **Page des parametres :** Parametres → Mot de passe d'authentification

Si aucun mot de passe n'est configure, le mode MCP fonctionne sans authentification (adapt au developpement local).

## Apercu des onglets

| Onglet | Utilite |
|--------|---------|
| **Tableau de bord** | Etat des bases de donnees (existence, taille) |
| **Bible** | Recherche de versets, personnages, bootstrap/compactage |
| **Gutenberg** | Recherche de styles, delexification, telechargement/conversion du corpus |
| **Catalogue** | Creation et gestion du catalogue de livres pour l'apprentissage du style |
| **Wikipedia** | Recherche d'articles, verification de faits |
| **Litterature** | Modeles de quetes, compilation/compactage |
| **Economie** | Phase economique, generation de dilemmes |
| **Systeme** | Temps de fonctionnement, memoire, journaux d'operations |

## Catalogue — Telecharger vos auteurs preferes

L'onglet Catalogue vous permet de creer une bibliotheque personnelle depuis Project Gutenberg pour ameliorer la qualite d'ecriture de l'agent Stylisateur.

### Etape 1 : Creer un catalogue

Entrez les noms d'auteurs (separes par des virgules) et cliquez sur **Creer le catalogue** :

```
Mark Twain, Jack London, Edgar Allan Poe
```

Ou entrez un sujet (par ex. `adventure`, `romance`, `gothic`) pour decouvrir des auteurs.

Pour un demarrage rapide, cliquez sur **Populaire 500** pour charger les livres les plus telecharges.

### Etape 2 : Parcourir et filtrer

- **Recherche** — recherche plein texte sur les titres, auteurs et sujets
- **Filtre** — par nom d'auteur, plage d'annees de naissance/deces, nombre minimum de telechargements
- **Tri** — cliquez sur les en-tetes de colonnes
- **Pagination** — navigation avec les boutons Prec./Suiv.

### Etape 3 : Selectionner des livres

- **Individuel** — cochez les cases a cote de chaque livre
- **Toute la page** — cochez la case d'en-tete
- **Tous les resultats du filtre** — cliquez sur « Tout selectionner »
- **Deselectionner** — cliquez sur « Tout deselectionner »

### Etape 4 : Telecharger la selection

Cliquez sur **Telecharger la selection** pour recuperer les textes complets. Le processus s'execute en arriere-plan avec suivi de progression.

Apres le telechargement, l'agent Stylisateur extrait automatiquement les modeles d'ecriture (vocabulaire, structures de phrases, etiquettes emotionnelles) des textes de chaque auteur.

### Comment cela ameliore l'ecriture

Les textes telecharges sont traites par le parseur Gutenberg qui :
1. **Delexifie** — remplace les noms propres par des placeholders pour preserver la structure
2. **Extrait le vocabulaire** — identifie les choix lexicaux caracteristiques de chaque auteur
3. **Extrait les modeles de phrases** — structures syntaxiques courantes
4. **Inferre les etiquettes emotionnelles** — sombre, lumineux, romantique, mysterieux, etc.

L'agent Stylisateur utilise ensuite ces modeles lors de la generation de prose narrative, en adaptant l'atmosphere et le style aux auteurs choisis.

## Points de terminaison API

Tous les points de terminaison sont sous `/mcp/` :

| Methode | Chemin | Description |
|---------|--------|-------------|
| `GET` | `/mcp/status` | Etat du systeme et infos BDD |
| `GET` | `/mcp/gutenberg/catalog/stats` | Statistiques du catalogue |
| `GET` | `/mcp/gutenberg/catalog` | Liste paginee du catalogue |
| `GET` | `/mcp/gutenberg/catalog/search?q=` | Recherche plein texte |
| `GET` | `/mcp/gutenberg/catalog/filter?author=&year_from=&year_to=&min_downloads=&subject=` | Filtrage |
| `POST` | `/mcp/gutenberg/catalog/build` | Lancer la construction du catalogue |
| `POST` | `/mcp/gutenberg/catalog/select` | Basculer la selection d'un livre |
| `POST` | `/mcp/gutenberg/catalog/select-all` | Tout selectionner |
| `POST` | `/mcp/gutenberg/catalog/deselect-all` | Tout deselectionner |
| `POST` | `/mcp/gutenberg/download-selected` | Telecharger la selection |
| `POST` | `/mcp/gutenberg/process` | Declencher le pipeline de traitement Gutenberg |

### POST /mcp/gutenberg/process

Declenche le pipeline de traitement Gutenberg depuis la Console MCP.

**Corps de la requete :**
```json
{
  "phase": "all"  // "v1" | "v2" | "all"
}
```

**Reponse (flux SSE) :**
```json
{"phase":"parse","pct":10,"message":"Parsed 45/59 books"}
{"phase":"compile","pct":50,"message":"Running DramaturgicPass..."}
{"phase":"analyze","pct":75,"message":"Analyzing chunks..."}
{"phase":"done","pct":100,"message":"Pipeline complete"}
```

**Phases :**
- `v1` — Phase A uniquement (basee sur des regles, pas de LLM) : parse → compile → done
- `v2` — Phase B uniquement (LLM) : analyze → extract → done  
- `all` — Les deux phases sequentiellement

## Depannage

| Probleme | Solution |
|----------|----------|
| Catalogue vide | Creer d'abord un catalogue (entrez des auteurs → Creer le catalogue) |
| Case a cocher se reinitialise | Verifiez que le serveur fonctionne ; consultez la console du navigateur |
| « Authentification requise » | Definissez `AUTH_PASSWORD` dans les env ou les parametres |
| Telechargement bloque | Consultez l'onglet Systeme → Journaux d'operations |
| Styles non apparus | Lancez la Conversion Gutenberg apres le telechargement |
