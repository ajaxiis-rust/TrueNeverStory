# Guía de desarrollo de plugins

Esta guía explica cómo crear plugins para TrueNeverStory.

## Interfaz del plugin

Un plugin debe implementar la interfaz `Plugin`:

```typescript
import { Plugin } from "../plugins/plugin-interface";

const myPlugin: Plugin = {
  id: "my-plugin",           // Identificador único
  name: "My Plugin",         // Nombre legible
  version: "1.0.0",          // Versión semántica
  description: "Does stuff", // Descripción opcional
  author: "Your Name",       // Autor opcional

  // Agentes proporcionados por este plugin
  agents: [
    {
      id: "my-agent",
      name: "My Agent",
      description: "An agent that does things",
      config: { temperature: 0.7 },
    },
  ],

  // Rutas proporcionadas por este plugin
  routes: [
    { path: "/my-endpoint", method: "GET" },
    { path: "/my-endpoint", method: "POST" },
  ],

  // Hooks a los que se suscribe este plugin
  hooks: ["onTurnStart", "onWorldCreate"],

  // Callbacks del ciclo de vida
  onRegister: () => {
    console.log("Plugin registered!");
  },

  onUnregister: () => {
    console.log("Plugin unregistered!");
  },
};
```

## Ciclo de vida del plugin

1. **Registro:** `pluginManager.register(plugin)` — llama al hook `onRegister`
2. **Activo:** Los agentes y rutas del plugin están disponibles
3. **Desregistro:** `pluginManager.unregister(pluginId)` — llama al hook `onUnregister`

## Hooks disponibles

| Hook | Cuándo se activa |
|------|-----------------|
| `onTurnStart` | Antes de cada procesamiento de turno |
| `onTurnEnd` | Después de cada procesamiento de turno |
| `onWorldCreate` | Cuando se crea un nuevo mundo |
| `onWorldDestroy` | Cuando se destruye un mundo |
| `onEntityAdd` | Cuando se añade una nueva entidad |

## Ejemplo: Plugin Researcher Addon

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

## Registrar un plugin

```typescript
import { pluginManager } from "../routes/plugins";
import { myPlugin } from "./my-plugin";

pluginManager.register(myPlugin);
```

## Gestión mediante API

- `GET /api/plugins` — Listar todos los plugins
- `GET /api/plugins/:id` — Obtener detalles de un plugin
- `GET /api/plugins/:id/capabilities` — Obtener capacidades
- `GET /api/plugins/agents/all` — Obtener todos los agentes de plugins
- `GET /api/plugins/routes/all` — Obtener todas las rutas de plugins

## Mejores prácticas

1. **ID únicos:** Use ID de plugin descriptivos y únicos (ej. `my-org/my-plugin`)
2. **Versión:** Siga el versionado semántico (MAJOR.MINOR.PATCH)
3. **Hooks mínimos:** Solo suscríbase a los hooks necesarios
4. **Limpieza:** Implemente `onUnregister` para liberar recursos
5. **Manejo de errores:** Los errores del plugin no deben colgar el host
