# Agenten-Referenz

TrueNeverStory verwendet eine Multi-Agenten-Architektur, bei der jeder Agent einen bestimmten Aspekt der Erzählung übernimmt. Jeder Agent hat seine eigene LLM-Konfiguration, System-Prompts und Benutzervorlagen.

## Globale Variablen

Diese Variablen sind für die meisten Agenten über den Weltzustandskontext verfügbar:

| Variable | Beschreibung |
|----------|-------------|
| `{world_name}` | Name der aktuellen Welt (aus world_frame.json) |
| `{time}` | Aktuelle Story-Zeit (ISO-String) |
| `{location}` | Aktueller Standort des Charakters |
| `{character}` | Name des aktiven Charakters |
| `{role}` | Rolle des Benutzers (Protagonist, Beobachter usw.) |
| `{rules}` | Weltregeln (Magiegesetze, soziale Normen usw.) |
| `{timeline}` | Letzte Welt-Ereignisse (letzte 5 vom Chronisten) |
| `{memories}` | Letzte Rollenspiel-Erinnerungen |
| `{facts}` | Etablierte Welt-Fakten |
| `{npcs}` | Namen nahegelegener NPCs |
| `{history}` | Letzte Gesprächshistorie (letzte 3 Austausche) |
| `{events}` | Letzte Ereignisse (kontextabhängig, letzte 3-5) |
| `{world_state}` | Zusammenfassung des aktuellen Weltzustands |
| `{world_context}` | Weltkontext für Recherchen |

## Agenten

### Erzähler (`narrator`)

**Beschreibung:** Haupt-Geschichtenerzähler. Generiert Weltnarrativ aus dem Story-Kontext.

**Vorlagen-Variablen:**
`{world_name}` `{time}` `{location}` `{character}` `{role}` `{rules}` `{timeline}` `{memories}` `{facts}` `{npcs}` `{history}`

**System-Prompt:** Definiert den Erzähler als versierten Geschichtenerzähler. Schreibt lebendige, immersive Prosa in zweiter/dritter Person. Bricht nie die Charakterrolle.

**Temperatur:** 0.8 | **Max. Tokens:** 4096 | **Priorität:** 10 (höchste)

---

### Regisseur (`director`)

**Beschreibung:** Handlungsbeat-Injektion. Integriert dramatische Momente in die Erzählung.

**Vorlagen-Variablen:**
`{narrative}` `{beat}`

| Variable | Beschreibung |
|----------|-------------|
| `{narrative}` | Aktueller narrativer Text zum Injizieren des Beats |
| `{beat}` | Handlungsbeat-Beschreibung (auslösendes Ereignis, Enthüllung, Rückschlag usw.) |

**Temperatur:** 0.7 | **Max. Tokens:** 2048 | **Priorität:** 8

---

### Szenen-Generator (`scene`)

**Beschreibung:** Szenenübergänge beim Wechsel der Charaktere zwischen Orten.

**Vorlagen-Variablen:**
`{character}` `{origin}` `{destination}` `{rules}` `{events}`

| Variable | Beschreibung |
|----------|-------------|
| `{origin}` | Aktueller Standort (woher der Charakter geht) |
| `{destination}` | Zielort (wohin der Charakter geht) |

**Temperatur:** 0.8 | **Max. Tokens:** 2048 | **Priorität:** 7

---

### NPC-Agent (`npc`)

**Beschreibung:** NPC-Dialoge und Reaktionen. Spielt einzelne Charaktere.

**Vorlagen-Variablen:**
`{npc_name}` `{npc_personality}` `{player}` `{location}` `{relationship}` `{events}` `{line}`

| Variable | Beschreibung |
|----------|-------------|
| `{npc_name}` | Name des NPCs, der gespielt wird |
| `{npc_personality}` | NPC-Persönlichkeitsmerkmale (aus Entity-Profil) |
| `{player}` | Name des Spieler-Charakters |
| `{relationship}` | Beziehung zum Spieler (Freund, neutral, Feind usw.) |
| `{line}` | Was der Spieler zum NPC gesagt hat |

**Temperatur:** 0.7 | **Max. Tokens:** 1024 | **Priorität:** 9

---

### Chronist (`chronicler`)

**Beschreibung:** Zeitachsen-Verwaltung. Fasst Ereignisse zusammen und pflegt die Weltgeschichte.

**Vorlagen-Variablen:**
`{events}` `{timeline}`

| Variable | Beschreibung |
|----------|-------------|
| `{events}` | Neue Ereignisse zum Chroniken (letzte Aktionen, Bewegungen, Dialoge) |
| `{timeline}` | Bestehende Zeitachse als Kontext |

**Temperatur:** 0.5 | **Max. Tokens:** 1024 | **Priorität:** 5

---

### Story-Planer (`story-planner`)

**Beschreibung:** Handlungsstrang-Planung. Plant Quests und Handlungsentwicklungen.

**Vorlagen-Variablen:**
`{world_state}` `{characters}` `{events}` `{quests}`

| Variable | Beschreibung |
|----------|-------------|
| `{characters}` | Aktive Charaktere in der Welt |
| `{quests}` | Derzeit aktive Quests |

**Ausgabeformat:**
```json
{"arc": "Beschreibung", "quests": [{"title": "", "description": "", "objectives": [""]}], "hooks": [""]}
```

**Temperatur:** 0.7 | **Max. Tokens:** 2048 | **Priorität:** 6

---

### Soziale Simulation (`social-sim`)

**Beschreibung:** Soziale Dynamik. Simuliert NPC-Beziehungen und Interaktionen.

**Vorlagen-Variablen:**
`{characters}` `{relationships}` `{context}`

| Variable | Beschreibung |
|----------|-------------|
| `{relationships}` | Aktueller Beziehungsgraph zwischen Charakteren |
| `{context}` | Sozialer Kontext (Begegnung, Konflikt, Allianz usw.) |

**Temperatur:** 0.6 | **Max. Tokens:** 1024 | **Priorität:** 4

---

### Schurken-Manager (`villain`)

**Beschreibung:** Antagonisten-Management. Plant Schurken-Züge und böse Pläne.

**Vorlagen-Variablen:**
`{villain}` `{world_state}` `{recent_actions}`

| Variable | Beschreibung |
|----------|-------------|
| `{villain}` | Schurken-Profil (Persönlichkeit, Ziele, Fähigkeiten) |
| `{recent_actions}` | Letzte Schurken-Aktionen in der Welt |

**Temperatur:** 0.8 | **Max. Tokens:** 2048 | **Priorität:** 6

---

### Forscher (`researcher`)

**Beschreibung:** Faktencheck, Realismusvalidierung und Weltbau-Recherche.

**Vorlagen-Variablen:**
`{task}` `{world_context}`

| Variable | Beschreibung |
|----------|-------------|
| `{task}` | Recherche-Aufgabe (Rezept-Überprüfung, Charakter-Validierung, Szenen-Anreicherung, Faktencheck) |

**Ausgabeformat:**
```json
{"verdict": "plausible|questionable|unrealistic", "confidence": 0.0-1.0, "issues": [], "suggestions": [], "enrichedDetails": ""}
```

**Temperatur:** 0.3 | **Max. Tokens:** 2048 | **Priorität:** 3 (niedrigste)

---

## Temperatur-Leitfaden

| Wert | Effekt | Verwenden für |
|------|--------|---------------|
| 0.1 - 0.3 | Fokussiert, deterministisch | Recherche, Faktencheck |
| 0.4 - 0.6 | Ausgewogen | Chronist, soziale Simulation |
| 0.7 - 0.8 | Kreativ | Narrativ, NPC-Dialoge, Schurken-Pläne |

## @agent im Chat verwenden

Senden Sie eine private Nachricht an einen beliebigen Agenten aus dem Chat:

```
@narrator Beschreibe die Atmosphäre des alten Waldes bei Dämmerung
@director Schlage einen dramatischen Plot-Twist vor
@researcher Ist dieses mittelalterliche Schwert historisch korrekt?
@chronicler Fasse zusammen, was in der letzten Stunde passiert ist
```

Antworten werden mit einem blauen linken Rand und dem Agentennamen in Klammern markiert.

### Sprachanweisungs-Injektion

LLM-Antworten passen sich automatisch der ausgewählten UI-Sprache an. Die Sprachanweisung wird bei der Welt-Erstellung via `seedWorldAgents()` in die Agenten-Prompts eingebettet und zur Laufzeit durch `getLanguageInstruction()` angehängt:

| Sprache | Eingefügter Text |
|---------|-----------------|
| en | `IMPORTANT: Always respond in English.` |
| ru | `ВАЖНО: Всегда отвечай на русском языке.` |
| de | `WICHTIG: Antworte immer auf Deutsch.` |
| fr | `IMPORTANT: Réponds toujours en français.` |
| es | `IMPORTANTE: Responde siempre en español.` |
| ja | `重要：常に日本語で回答してください。` |
| zh | `重要：请始终用中文回复。` |

Bei der World-Erstellung schreibt `seedWorldAgents()` alle 14 Agenten mit der Sprachanweisung, die an den System-Prompt angehängt wird. Dies stellt sicher, dass neue Welten mit ordnungsgemäßer Sprachisolation starten. Die Laufzeit-Funktion `getLanguageInstruction()` wird von `dialogue-context.ts` für dynamische NPC-Dialoge verwendet.

### API-Endpunkte für Prompts

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/api/agents` | Alle Agenten auflisten (akzeptiert `?world=`) |
| `GET` | `/api/agents/:id` | Einzelne Agenten-Konfiguration abrufen (akzeptiert `?world=`) |
| `PUT` | `/api/agents/:id` | Agenten-Konfiguration aktualisieren (akzeptiert `?world=`) |
| `PUT` | `/api/agents/:id/prompts` | Prompts aktualisieren (akzeptiert `?world=`) |
| `GET` | `/api/agents/:id/prompts/:lang` | Prompts für eine bestimmte Sprache abrufen |
| `PUT` | `/api/agents/:id/prompts/:lang` | Prompts für eine bestimmte Sprache erstellen/aktualisieren |

**Abfrageparameter:**
- `world` — optional, Standard ist die aktive Welt aus den Einstellungen. Alle Agenten-Endpunkte unterstützen `?world=` für weltweite Operationen ohne Umschaltung der aktiven Welt.

## Priorität

Agenten mit höherer Priorität werden zuerst verarbeitet, wenn mehrere LLM-Anfragen in der Warteschlange stehen.

| Agent | Priorität |
|-------|-----------|
| narrator | 10 (höchste) |
| npc | 9 |
| director | 8 |
| scene | 7 |
| story-planner | 6 |
| villain | 6 |
| chronicler | 5 |
| social-sim | 4 |
| researcher | 3 (niedrigste) |

---

## Spezialisierte Agenten (v0.26.0)

Die folgenden spezialisierten Agenten sind jetzt in `RoleplayEngine` eingebunden und über `engine.<agent>` verfügbar:

| Agent | Feld | Zweck |
|-------|------|-------|
| **CartographerAgent** | `engine.cartographer` | Standort-/Geographie-Informationen — Entfernungen, Wege, Terrain, Sehenswürdigkeiten |
| **HistorianAgent** | `engine.historian` | Weltgeschichte, Chronologie, vergangene Ereignisse, Lore-Erzählung |
| **LorekeeperAgent** | `engine.lorekeeper` | Weltfakten, Magiesystem-Regeln, Rasseninformationen, etablierter Kanon |
| **MerchantAgent** | `engine.merchant` | Händler-Handel, Preisgestaltung, Inventarverwaltung |
| **QuestGiverAgent** | `engine.questGiver` | Quest-Generierung basierend auf Weltzustand, Spielerniveau, Handlungsfäden |

Jeder Spezialagent akzeptiert nur `LLMQueue` als Abhängigkeit und generiert Text über eigene Prompts.

---

## Dialog-System (v0.26.0)

Neues `DialogueManager` + `DialogueContext` für strukturierte NPC-Gespräche:

| Funktion | Beschreibung |
|----------|-------------|
| **Sitzungsverwaltung** | Begrüßung → Aktiv → Verabschiedung Lebenszyklus |
| **Beziehungsbewusstsein** | Begrüßungen und Themenauswahl für Freunde/Neutrale/Feinde |
| **Feudale Hierarchie** | Besondere Begrüßungen für Lord/Vasallen |
| **Themenbasierte Auswahl** | persönlich, Fraktion, Quest, Handel, Kampf, Handwerk, Gerüchte, Klatsch usw. |
| **Gedächtnisaufzeichnung** | Dialogzusammenfassungen werden im Langzeitgedächtnis des NPC gespeichert |

Zugang über `engine.dialogueManager` (erfordert `npcRuntime`).
