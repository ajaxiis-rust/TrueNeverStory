# Guide de développement de plugins

Ce guide explique comment créer des plugins pour TrueNeverStory.

## Interface du plugin

Un plugin doit implémenter l'interface `Plugin` :

```typescript
import { Plugin } from "../plugins/plugin-interface";

const myPlugin: Plugin = {
  id: "my-plugin",           // Identifiant unique
  name: "My Plugin",         // Nom lisible
  version: "1.0.0",          // Version sémantique
  description: "Does stuff", // Description optionnelle
  author: "Your Name",       // Auteur optionnel

  // Agents fournis par ce plugin
  agents: [
    {
      id: "my-agent",
      name: "My Agent",
      description: "An agent that does things",
      config: { temperature: 0.7 },
    },
  ],

  // Routes fournies par ce plugin
  routes: [
    { path: "/my-endpoint", method: "GET" },
    { path: "/my-endpoint", method: "POST" },
  ],

  // Hooks auxquels ce plugin s'abonne
  hooks: ["onTurnStart", "onWorldCreate"],

  // Callbacks du cycle de vie
  onRegister: () => {
    console.log("Plugin registered!");
  },

  onUnregister: () => {
    console.log("Plugin unregistered!");
  },
};
```

## Cycle de vie du plugin

1. **Enregistrement :** `pluginManager.register(plugin)` — appelle le hook `onRegister`
2. **Actif :** Les agents et routes du plugin sont disponibles
3. **Désinscription :** `pluginManager.unregister(pluginId)` — appelle le hook `onUnregister`

## Hooks disponibles

| Hook | Quand il se déclenche |
|------|----------------------|
| `onTurnStart` | Avant chaque traitement de tour |
| `onTurnEnd` | Après chaque traitement de tour |
| `onWorldCreate` | Lorsqu'un nouveau monde est créé |
| `onWorldDestroy` | Lorsqu'un monde est détruit |
| `onEntityAdd` | Lorsqu'une nouvelle entité est ajoutée |

## Exemple : Plugin Researcher Addon

```typescript
import { Plugin } from "../plugins/plugin-interface";

export const researcherAddon: Plugin = {
  id: "researcher-addon",
  name: "Researcher Addon",
  version: "1.0.0",
  description: "Enhanced research capabilities",
  agents: [
    {
      id: "deep-researcher",
      name: "Deep Researcher",
      description: "Performs deep research with citations",
    },
  ],
  routes: [
    { path: "/research/deep", method: "POST" },
  ],
  hooks: ["onTurnStart"],
};
```

## Enregistrer un plugin

```typescript
import { pluginManager } from "../routes/plugins";
import { myPlugin } from "./my-plugin";

pluginManager.register(myPlugin);
```

## Gestion via API

- `GET /api/plugins` — Lister tous les plugins
- `GET /api/plugins/:id` — Obtenir les détails d'un plugin
- `GET /api/plugins/:id/capabilities` — Obtenir les capacités
- `GET /api/plugins/agents/all` — Obtenir tous les agents de plugins
- `GET /api/plugins/routes/all` — Obtenir toutes les routes de plugins

## Bonnes pratiques

1. **ID uniques :** Utilisez des ID de plugin descriptifs et uniques (ex. `my-org/my-plugin`)
2. **Version :** Suivez le versionnage sémantique (MAJOR.MINOR.PATCH)
3. **Hooks minimaux :** Ne souscrivez qu'aux hooks nécessaires
4. **Nettoyage :** Implémentez `onUnregister` pour libérer les ressources
5. **Gestion des erreurs :** Les erreurs de plugin ne doivent pas faire planter l'hôte
