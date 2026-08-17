# Plugin-Entwicklungshandbuch

Dieses Handbuch erklärt, wie man Plugins für TrueNeverStory erstellt.

## Plugin-Schnittstelle

Ein Plugin muss die `Plugin`-Schnittstelle implementieren:

```typescript
import { Plugin } from "../plugins/plugin-interface";

const myPlugin: Plugin = {
  id: "my-plugin",           // Eindeutiger Bezeichner
  name: "My Plugin",         // Menschenlesbarer Name
  version: "1.0.0",          // Semantische Version
  description: "Does stuff", // Optionale Beschreibung
  author: "Your Name",       // Optionaler Autor

  // Von diesem Plugin bereitgestellte Agenten
  agents: [
    {
      id: "my-agent",
      name: "My Agent",
      description: "An agent that does things",
      config: { temperature: 0.7 },
    },
  ],

  // Von diesem Plugin bereitgestellte Routen
  routes: [
    { path: "/my-endpoint", method: "GET" },
    { path: "/my-endpoint", method: "POST" },
  ],

  // Hooks, auf die sich dieses Plugin abonniert
  hooks: ["onTurnStart", "onWorldCreate"],

  // Lebenszyklus-Callbacks
  onRegister: () => {
    console.log("Plugin registered!");
  },

  onUnregister: () => {
    console.log("Plugin unregistered!");
  },
};
```

## Plugin-Lebenszyklus

1. **Registrierung:** `pluginManager.register(plugin)` — ruft den `onRegister`-Hook auf
2. **Aktiv:** Plugin-Agenten und -Routen sind verfügbar
3. **Abmeldung:** `pluginManager.unregister(pluginId)` — ruft den `onRegister`-Hook auf

## Verfügbare Hooks

| Hook | Wann er ausgelöst wird |
|------|----------------------|
| `onTurnStart` | Vor jeder Zugverarbeitung |
| `onTurnEnd` | Nach jeder Zugverarbeitung |
| `onWorldCreate` | Wenn eine neue Welt erstellt wird |
| `onWorldDestroy` | Wenn eine Welt zerstört wird |
| `onEntityAdd` | Wenn eine neue Entität hinzugefügt wird |

## Beispiel: Researcher-Addon-Plugin

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

## Plugin registrieren

```typescript
import { pluginManager } from "../routes/plugins";
import { myPlugin } from "./my-plugin";

pluginManager.register(myPlugin);
```

## API-Verwaltung

- `GET /api/plugins` — Alle Plugins auflisten
- `GET /api/plugins/:id` — Plugindetails abrufen
- `GET /api/plugins/:id/capabilities` — Fähigkeiten abrufen
- `GET /api/plugins/agents/all` — Alle Plugin-Agenten abrufen
- `GET /api/plugins/routes/all` — Alle Plugin-Routen abrufen

## Best Practices

1. **Eindeutige IDs:** Verwende beschreibende, eindeutige Plugin-IDs (z.B. `my-org/my-plugin`)
2. **Version:** Befolge semantische Versionierung (MAJOR.MINOR.PATCH)
3. **Minimale Hooks:** Nur benötigte Hooks abonnieren
4. **Aufräumen:** `onUnregister` implementieren, um Ressourcen freizugeben
5. **Fehlerbehandlung:** Plugin-Fehler dürfen den Host nicht abstürzen lassen
