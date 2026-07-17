# À propos de TrueNeverStory — Justification du design

## Stratégie linguistique : English inside, translate at boundary

### Pourquoi l'anglais pour le traitement des agents

TrueNeverStory utilise une architecture **« English inside, translate at boundary »** pour plusieurs raisons critiques :

1. **Qualité LLM** — Les grands modèles de langage fonctionnent mieux en anglais, leur langue d'entraînement principale. L'utilisation de l'anglais pour le traitement interne garantit :
   - Une qualité narrative plus cohérente
   - Une meilleure compréhension des prompts complexes
   - Moins d'hallucinations et d'incohérences de style
   - L'accès à toute l'étendue des références littéraires

2. **Économie de tokens** — L'anglais est généralement 20-40% plus efficace en tokens que d'autres langues pour le même contenu sémantique. Cela signifie :
   - Plus de contexte tient dans la fenêtre de prompt
   - Des coûts API inférieurs par requête
   - Des temps de traitement plus rapides

3. **Richesse littéraire** — Les documents sources (Bible, classiques de Gutenberg) sont principalement en anglais ou ont des traductions anglaises canoniques. Le traitement en anglais préserve :
   - L'accès direct aux schémas archétypaux
   - L'authenticité stylistique des textes sources
   - Le contenu émotionnel et thématique nuancé

### Pipeline de traduction

```
Entrée utilisateur (n'importe quelle langue)
    ↓
TranslationService.translateToEnglish()
    ↓
Analyse d'intention (anglais)
    ↓
Traitement par les agents (anglais)
    ↓
Génération de réponse (anglais)
    ↓
TranslationService.translate()
    ↓
Sortie utilisateur (langue originale)
```

**Décisions clés :**
- La traduction se produit **une fois à l'entrée** et **une fois à la sortie**
- Tout l'état interne, la mémoire et le traitement restent en anglais
- Les agents ne voient ou ne produisent jamais directement de texte non anglais
- Les traductions UI sont séparées des traductions de contenu (i18n vs TranslationService)

---

## Architecture de base de données littéraire : économie de tokens par pré-traitement

### Le problème

La génération de riches récits à partir de zéro nécessite :
- De grands prompts avec des exemples de style
- Plusieurs appels LLM pour différents aspects (intrigue, style, émotion)
- Une consommation élevée de tokens pour un résultat de qualité

### La solution : compilation littéraire hors ligne

TrueNeverStory pré-traite les sources littéraires en bases de données SQLite structurées **avant le déploiement** :

```
Textes sources → LiteraryCompiler → Bases SQLite → Requêtes runtime
     ↓              ↓                    ↓              ↓
  Bible.db    Parser 4 passes      Indexées FTS5    Requêtes en
  Gutenberg   (dramaturgique,      modèles de quête millisecondes
  Classiques  stylistique,         modèles de style
              émotionnel,
              métadonnées)
```

### Types de bases de données

| Base de données | Source | Contenu | But |
|-----------------|--------|---------|-----|
| `bible.db` | Textes bibliques | Modèles de quête, archétypes, dilemmes moraux | Structure narrative |
| `gutenberg.db` | Project Gutenberg | Modèles de style, descriptions sensorielles, rythme | Qualité littéraire |
| `literary.db` | Sortie compilée | Modèles unifiés avec recherche FTS5 | Accès runtime |

### Économie de tokens

**Sans pré-traitement :**
```
Prompt : "Génère une quête sur la trahison dans le style de la littérature épique ancienne..."
Tokens : ~500-800 pour le prompt + ~300-500 pour la réponse = ~800-1300 tokens
```

**Avec pré-traitement :**
```
Requête : db.queryTemplates({ archetype: 'betrayal', mood: 'epic' })
Tokens : ~50 pour la requête + ~200-300 pour la réponse = ~250-350 tokens
```

**Économies : réduction de 60-75% de l'utilisation de tokens par élément narratif.**

---

## Sources littéraires riches

### Archétypes bibliques

La Bible fournit des **structures narratives éprouvées** qui résonnent à travers les cultures :

| Archétype | Source | Schéma | Application moderne |
|-----------|--------|--------|---------------------|
| **Évasion** | Exode 14 | Leader → Tyran → Obstacle → Intervention → Liberté | Quêtes de rébellion, scénarios d'évasion |
| **Jugement** | 1 Rois 3 | Dispute → Souverain sage → Vérité cachée → Justice | Intrigues de cour, dilemmes moraux |
| **Héritage** | Luc 15 | Prodigue → Gaspille → Retour → Acceptance | Arcs de rédemption, drame familial |
| **Ascension-Chute-Ascension** | Genèse 37-50 | Favorisé → Trahi → Souffrance → Ascension → Réconciliation | Arcs de développement de personnage |
| **Endurance** | Job | Souffrance → Doute → Persévérance → Restauration | Tester la résolution du joueur |
| **Libération** | Juges | Oppression → Appel → Rassemblement → Victoire | Campagnes de guerre, histoires de révolution |

**Pourquoi les schémas bibliques fonctionnent :**
- **Reconnaissance universelle** — Les joueurs comprennent intuitivement ces structures
- **Complexité morale** — Les récits bibliques ont rarement de simples divisions bien/mal
- **Profondeur émotionnelle** — Thèmes de perte, espoir, trahison, rédemption
- **Drama évolutif** — Fonctionne pour les histoires intimes et les campagnes épiques

### Modèles de style Gutenberg

Project Gutenberg offre **des siècles d'artisanat littéraire** :

| Époque | Auteurs | Éléments de style | Cas d'utilisation |
|--------|---------|-------------------|-------------------|
| **Gothique** | Poe, Shelley, Stoker | Atmosphère sombre, terreur sensorielle, tension psychologique | Horreur, mystère |
| **Victorien** | Dickens, Brontës | Commentaire social, descriptions détaillées, complexité morale | Intrigues sociales |
| **Épique** | Homer, Milton | Grande échelle, langage héroïque, résonance mythique | Guerres, quêtes |
| **Romantique** | Byron, Keats | Intensité émotionnelle, images de nature, passion | Histoires d'amour, drame personnel |

**Processus de délexicalisation :**
1. Extraire les schémas structurels (longueur de phrase, rythme, vocabulaire)
2. Supprimer les noms de personnages et références spécifiques
3. Préserver les marqueurs sensoriels et le ton émotionnel
4. Créer des modèles réutilisables avec des variables

---

## Individualité et personnalité des PNJ

### Système de personnage à plusieurs couches

Chaque PNJ a **quatre niveaux de profondeur** :

```
L1 : Informations de base (nom, rôle, emplacement)
    ↓
L2 : Personnalité (traits, manies, modèles de discours)
    ↓
L3 : Motivations cachées (objectifs secrets, peurs, désirs)
    ↓
L4 : État dynamique (relations, souvenirs, état émotionnel)
```

### Sources de personnages

| Source | Contribution | Exemple |
|--------|--------------|---------|
| **Archétypes bibliques** | Cadres moraux, modèles de loyauté | Loyauté de Ruth, ambition de David |
| **Personnages Gutenberg** | Modèles de discours, comportements sociaux | Les parvenus de Dickens, les âmes passionnées des Brontë |
| **Modèles historiques** | Comportements politiques, dynamique des factions | Intrigues de cour, politique des guildes |
| **Modèles psychologiques** | Cohérence de personnalité, réponses émotionnelles | Traits Big Five, styles d'attachement |

### Système de mémoire des PNJ

```
Court terme : 3 dernières interactions (contexte immédiat)
    ↓
Moyen terme : Événements significatifs (changements de relation)
    ↓
Long terme : Souvenirs fondamentaux (expériences formatrices)
    ↓
Sémantique : Rappel basé sur les embeddings (mémoire contextuelle)
```

**Influences de la mémoire :**
- Ton et vocabulaire du dialogue
- Niveau de confiance et volonté d'aider
- Style de salutation (chaud, froid, effrayé)
- Disponibilité des sujets (personnel, faction, quête)

### Comportements économiques et sociaux

Les PNJ ont des **comportements économiques réalistes** basés sur des modèles historiques :

| Comportement | Source | Implémentation |
|--------------|--------|----------------|
| **Commerce** | Guildes de marchands médiévaux | Offre/demande, prix basés sur la réputation |
| **Artisanat** | Ateliers d'artisans historiques | Niveaux de compétence, qualité des matériaux, investissement en temps |
| **Dynamique sociale** | Hiérarchie féodale | Relations seigneur/vassal, loyauté de faction |
| **Intrigues politiques** | Politique de cour | Alliances secrètes, commerce d'informations |

---

## Mécanique des retournements de situation

### Sélection du schéma narratif

Lorsque le joueur effectue une action, le système :

1. **Analyse l'intention** — Que le joueur essaie-t-il de faire ?
2. **Simule le résultat** — Que se passerait-il réaliste ?
3. **Sélectionne l'archétype** — Quel schéma biblique/littéraire convient ?
4. **Applique le style** — Quelle époque/humeur littéraire correspond ?
5. **Génère la prose** — Combine schéma + style + contexte

### Exemple : Le joueur trahit un allié

```
Intention : trahison
Simulation : Relation détruite, tension de faction augmente
Archétype : Genèse 37 (Joseph vendu par ses frères)
Style : Drame social victorien
Résultat : Récit explorant les conséquences de la trahison avec le détail social dickensien
```

### Difficulté dynamique

Les modèles de quête incluent des **scores d'ambiguïté morale** (0-1) :
- 0.0 — Bien/mal clair (histoires pour enfants)
- 0.5 — Choix complexes (RPG standard)
- 1.0 — Pas de bonne réponse (récits matures)

---

## Architecture de performance

### Pourquoi le pré-traitement gagne

| Approche | Latence | Coût en tokens | Qualité |
|----------|---------|----------------|---------|
| **LLM à la volée** | 2-5 secondes | Élevé | Variable |
| **DB pré-traitée** | <100ms | Minimal | Cohérent |
| **Hybride (TNS)** | <100ms + polissage | Faible | Élevé |

### L'approche hybride

1. **Requête DB** — Obtenir le modèle structuré (milliseconde)
2. **Substitution de variables** — Remplir le contexte (microseconde)
3. **Application du style** — Appliquer les modèles littéraires (milliseconde)
4. **Polissage LLM** — Génération de prose finale (optionnel, pour les moments critiques)

Cela nous donne la **vitesse de base de données** avec la **qualité LLM** là où c'est important.

---

## Extensions futures

### Sources littéraires supplémentaires

| Source | Potentiel | Statut |
|--------|-----------|--------|
| **Shakespeare** | Modèles dramatiques, styles de monologue | Planifié |
| **Mythologie** (grecque, nordique, celtique) | Voyage du héros, intervention divine | Planifié |
| **Chroniques historiques** | Intrigues politiques, récits de guerre | Planifié |
| **Contes populaires** | Leçons morales, modèles culturels | Planifié |

### Systèmes PNJ améliorés

| Fonctionnalité | Description | Statut |
|----------------|-------------|--------|
| **Contextes culturels** | Comportements et discours spécifiques à la région | En cours |
| **Mémoire générationnelle** | Histoires familiales, griefs hérités | Planifié |
| **Spécialisation économique** | Commerce et artisanat spécifiques aux guildes | En cours |
| **Factions politiques** | Systèmes dynamiques d'alliance et de rivalité | Actif |

---

## Règles du monde et économie

### Hiérarchie féodale

TrueNeverStory implémente un **système de rang féodal à 10 niveaux** qui régit la richesse, les taxes, les privilèges et les interactions sociales :

| Rang | Richesse min. | Gardes | Taxe de base | Salaire | Peut donner des pots-de-vin | Peut recevoir des pots-de-vin |
|------|---------------|--------|--------------|---------|----------------------------|------------------------------|
| **Esclave** | 0 | 0 | 100% | 0 | Non | Non |
| **Paysan** | 0 | 0 | 90% | 0 | Oui | Non |
| **Baronnet** | 100 000 | 50 | 30% | 0 | Oui | Oui |
| **Baron** | 500 000 | 200 | 28% | 0 | Oui | Oui |
| **Vicomte** | 2 000 000 | 1 000 | 25% | 0 | Oui | Oui |
| **Comte** | 10 000 000 | 5 000 | 22% | 0 | Oui | Oui |
| **Marquis** | 50 000 000 | 20 000 | 20% | 0 | Oui | Oui |
| **Duc** | 200 000 000 | 100 000 | 18% | 0 | Oui | Oui |
| **Roi** | 1 000 000 000 | 500 000 | 15% | 0 | Oui | Oui |
| **Empereur** | 10 000 000 000 | 2 000 000 | 10% | 0 | Oui | Oui |

**Règles clés :**
- **Les esclaves** ne peuvent pas participer à l'économie des pots-de-vin (pas de libre arbitre)
- **Les paysans** peuvent donner des pots-de-vin mais pas en recevoir (pas de pouvoir)
- **Les rangs supérieurs** paient des taxes plus faibles (ristourne de pouvoir) mais ont des coûts d'entretien plus élevés
- **Les seuils de richesse** doivent être atteints pour la promotion de rang

### Système fiscal

Le système fiscal est **dynamique** et influencé par plusieurs facteurs :

```
Taxe effective = Taxe de base × (1 - Ristourne de pouvoir - Ristourne de popularité)
```

**Composants :**
- **Taxe de base** — Définie par le rang (90% pour les paysans, 10% pour les empereurs)
- **Ristourne de pouvoir** — Jusqu'à 90% de réduction basée sur le pouvoir politique (pouvoir / 10 000)
- **Ristourne de popularité** — Jusqu'à 30% de réduction basée sur l'approbation publique (popularité / 3 000)

**Flux fiscal :**
```
Revenu NPC → Calcul fiscal → Collecte du trésor → Trésor du seigneur
     ↓              ↓              ↓                  ↓
  Basé sur     Taux           Traitement par     Accumulation
  le rang      dynamiques     tour avec          le long de
  salaire                     vérifications      la chaîne
                              de loyauté         féodale
```

**Conséquences des hautes taxes :**
- **Risque de trahison** = (Charge fiscale + Pots-de-vin) / Revenu × (1 - Loyauté / 1000)
- La charge fiscale élevée augmente la probabilité de rébellion
- La loyauté agit comme un tampon contre la trahison

### Économie des pots-de-vin

Les pots-de-vin sont une **mécanique économique de première classe** qui influence la politique, la loyauté et les dynamiques de pouvoir :

**Types de pots-de-vin :**
| Type | But | Niveau de risque |
|------|-----|------------------|
| **Protection** | Éviter punition ou persécution | Moyen |
| **Faveur** | Obtenir un traitement préférentiel | Faible |
| **Silence** | Garder les secrets cachés | Élevé |
| **Accès** | Atteindre des zones ou personnes restreintes | Moyen |
| **Promotion** | Avancer en rang ou position | Élevé |
| **Exemption** | Éviter taxes ou obligations | Très élevé |

**Formule de risque de pot-de-vin :**
```
Risque = Risque de base (10%) + Risque de montant (montant / 10 000) + Risque de témoins (témoins × 15%) - Compétence du receveur (intrigues × 0,1%)
```

**Facteurs de risque :**
- **Montant** — Les pots-de-vin plus importants sont plus risqués
- **Témoins** — Plus d'observateurs augmentent les chances de détection
- **Intrigues du receveur** — Les officiels qualifiés peuvent cacher la corruption
- **Type de pot-de-vin** — Certains types sont intrinsèquement plus risqués

**Impact économique :**
- Les pots-de-vin **réduisent la loyauté** (la corruption érode la confiance)
- Les pots-de-vin **augmentent la richesse** des receveurs
- Les pots-de-vin **augmentent le pouvoir** (1% du montant converti en pouvoir)
- Les pots-de-vin **réduisent la popularité** (le public désapprouve la corruption)

### Cycles économiques (Modèle de Joseph)

Basé sur le **modèle biblique de Joseph** (Genèse 41), l'économie traverse trois phases :

**Cycle de phases :**
```
Abondance (30 jours) → Transition (10 jours) → Famine (20 jours) → Abondance...
```

**Effets de phase :**
| Phase | Modificateur de prix | Changement de réserve | Événements narratifs |
|-------|---------------------|----------------------|---------------------|
| **Abondance** | 0,8× (bon marché) | +20% par tour | Récolte, booms commerciaux |
| **Transition** | 1,0× (normal) | Stable | Incertitude du marché |
| **Famine** | 2,0× (cher) | -30% par tour | Sécheresse, peste, guerre |

**Implications stratégiques :**
- **Stockez des réserves** pendant l'abondance pour survivre à la famine
- **La planification des prix** nécessite d'anticiper les transitions de phase
- **Les décisions du joueur** peuvent influencer la durée et la sévérité des phases

### Système de jubilé

Tous les **50 ans**, un **événement de jubilé** déclenche une réinitialisation économique massive :

**Effets du jubilé :**
1. **Annulation des dettes** — Toutes les dettes impayées sont annulées
2. **Retour des terres** — Toutes les terres hypothéquées retournent aux propriétaires
3. **Bonus de loyauté** — +30% de bonus de loyauté pour tous les PNJ (dure 10 jours)

**Base historique :**
Basé sur le **jubilé biblique** (Lévitique 25), qui empêchait la pauvreté permanente et maintenait la mobilité sociale.

**Implications stratégiques :**
- **Timing des dettes** — Évitez de prêter près des années de jubilé
- **Acquisition de terres** — La possession temporaire crée des dynamiques intéressantes
- **Stabilité sociale** — Le jubilé empêche la concentration extrême de richesse

### Dilemmes fiscaux de faction

Lorsque deux factions ont des revendications fiscales conflictuelles, le système génère des **dilemmes moraux** pour le joueur :

**Génération de dilemmes :**
- 30% de chance par tour économique
- Minimum 30 jours de cooldown entre les dilemmes
- Les montants fiscaux vont de 100 à 1 000 pièces d'or

**Choix du joueur :**
| Choix | Loyauté Faction A | Loyauté Faction B | Réputation |
|-------|-------------------|-------------------|------------|
| **Payer Faction A** | +50 | -30 | Neutre |
| **Payer Faction B** | -30 | +50 | Neutre |
| **Refuser les deux** | -20 | -20 | -10 (peu fiable) |

**Intégration narrative :**
Chaque dilemme génère une histoire contextuelle expliquant le conflit, forçant le joueur à faire des choix politiques significatifs.

### Règles de travail de faction

Chaque faction peut définir des **politiques de travail individuelles** qui affectent les salaires et la loyauté :

**Paramètres des règles de travail :**
- **Salaires fixes** — Oui/Non (prévisible vs. basé sur la performance)
- **Montant du salaire** — Salaire de base par période de travail
- **Modificateur de loyauté** — Bonus/malus à la loyauté des travailleurs

**Calcul du salaire :**
```
Salaire final = Salaire de base × Heures travaillées × Productivité × Modificateur de faction
```

**Conflits de loyauté :**
Lorsque les PNJ travaillent pour plusieurs factions, des conflits de loyauté peuvent survenir :
- **Double loyauté** réduit l'efficacité
- **Changement de faction** a des coûts de réputation
- **Arrêts de travail** surviennent pendant les conflits

### Économie des esclaves

Un système **moralement complexe** qui reflète les dynamiques de pouvoir historiques :

**Propriétés des esclaves :**
- **Santé** — Condition physique (affecte la valeur)
- **Expérience** — Compétences et connaissances (augmente la valeur)
- **Vices** — Avidité, colère, paresse (réduit la valeur)
- **Famille** — Les esclaves peuvent avoir des familles (crée des obligations)

**Formule de valeur d'esclave :**
```
Valeur = 100 + (Expérience × 0,1) + (Santé × 0,05) - Pénalités de vices
```

**Cycle de vie des esclaves :**
1. **Asservissement** — Par dette, capture ou naissance
2. **Travail** — Produit des biens (300-1000 unités par tour)
3. **Rébellion** — Possible si les gardes sont faibles (ratio de force détermine le succès)
4. **Libération** — Coûte 200 pièces d'or, accorde le statut de paysan

**Considérations éthiques :**
- Le système est conçu pour être **moralement inconfortable**
- Les choix du joueur ont des **conséquences réelles** pour les PNJ esclaves
- **Mécanique de rébellion** garantit que l'esclavage n'est jamais "sûr"
- **Chemins de libération** offrent des opportunités de rédemption morale

### Intégration avec le graphe social

L'économie s'intègre avec le **graphe social** pour des dynamiques de pouvoir réalistes :

**Relations féodales :**
```
Vassal → Seigneur (taxe + obligation militaire)
  ↓
Chaîne de commandement (plusieurs niveaux)
  ↓
Accumulation du flux fiscal (taxes collectées)
```

**Économie de faction :**
- **Factions économiques** contrôlent le commerce et les ressources
- **Factions militaires** fournissent la sécurité (contre paiement)
- **Factions religieuses** influencent les choix moraux
- **Factions criminelles** opèrent en dehors de l'économie légale

**Système de réputation :**
- **Approbation publique** affecte les taux fiscaux
- **Position de faction** détermine l'accès aux ressources
- **Réputation personnelle** influence les taux de réussite des pots-de-vin

### Base de données économique

Toutes les données économiques sont stockées dans une **base de données SQLite** dédiée (`economic.db`) :

**Tables :**
- `economic_cycles` — Suivi de phase avec modificateurs de prix
- `jubilee_events` — Enregistrements historiques des jubilés
- `faction_labor_rules` — Politique salariale par faction
- `faction_dilemmas` — Historique des litiges fiscaux

**Performance :**
- **Requêtes indexées** pour des calculs économiques rapides
- **Traitement par lots** pour les opérations PNJ (décroissance d'âge, décroissance de vice, taxes, loyauté)
- **Noyaux Mojo** pour les opérations intensives en calcul (5× accélération)

---

## Résumé

L'architecture de TrueNeverStory combine :

1. **Traitement en anglais** pour la qualité LLM et l'efficacité des tokens
2. **Bases de données littéraires pré-traitées** pour un accès instantané à des modèles narratifs riches
3. **Systèmes PNJ à plusieurs couches** pour des personnages crédibles et mémorables
4. **Génération hybride** équilibrant vitesse et qualité

Le résultat est un système capable de générer des **récits de qualité littéraire** à des **vitesses de base de données** tout en maintenant une **cohérence profonde des personnages** et des **choix significatifs pour le joueur**.
