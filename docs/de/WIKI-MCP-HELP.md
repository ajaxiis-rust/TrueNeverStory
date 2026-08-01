# Wikipedia RAG — Benutzerhandbuch

Wikipedia RAG (Retrieval-Augmented Generation) reichert Spielwelten automatisch mit realem Wissen aus Wikipedia an. Wenn Sie eine Welt erstellt, erforscht das System relevante Themen und erstellt eine Wissensbasis, die von Agenten für präzise und detaillierte Narrative verwendet wird.

## So funktioniert es

### Automatische Recherche

Bei der Welterstellung führt das System folgende Schritte aus:

1. **Extrahiert Schlüsselwörter** aus der Weltbeschreibung (z.B. "mittelalterlich", "Ritter", "England")
2. **Sucht in Wikipedia** nach relevanten Artikeln
3. **Analysiert Artikel** — extrahiert Text, Abschnitte, Kategorien
4. **Teilt in Chunks** — zerlegt in Stücke von ~500 Token mit Überlappung
5. **Erstellt RAG-Index** — speichert Chunks für Agentenabfragen

### Beispielszenario

Sie möchten eine **mittelalterliche Ritterwelt** mit literarischen Verweisen (Ivanhoe, Quentin Durward):

```
Benutzer: "Ich möchte eine Welt der Ritter und des Mittelalters"
```

Das System erforscht automatisch:
- **Geographie** — Burgen, Städte, Handelsrouten im mittelalterlichen England
- **Alltagsleben** — Essen, Kleidung, Handwerke, Sozialstruktur
- **Waffen & Rüstungen** — Schwerter, Schilde, Kettenhemd, Plattenrüstung
- **Herrscher & Feldherren** — Könige, Herren, ihre Charaktere und Daten
- **Katastrophen** — Pest, Brände, Erdbeben der Epoche

All dieses Wissen wird im RAG-Index gespeichert und von Agenten verwendet, um präzise und detaillierte Narrative zu generieren.

### Leerlauf-Anreicherung

Wenn ein Spieler länger als 1 Stunde inaktiv ist, forscht das System im Hintergrund weiter:
- Erforscht themenbezogene Themen
- Fügt dem RAG-Index weitere Details hinzu
- Die nächsten Agentenantworten verwenden das neue Wissen

## Fortschrittsverfolgung

### Web-UI

Echtzeit-Fortschritt ist über SSE (Server-Sent Events) verfügbar:

```
GET /api/wiki/research/{worldId}/progress
```

Fortschrittsphasen:
1. **Weltgenerierung** — LLM erstellt den Weltrahmen
2. **Wikipedia-Recherche** — Artikel abrufen und analysieren
3. **RAG erstellen** — Vektorindex erstellen

### CLI-Fortschritt

Fortschrittsbalken im Terminal bei der Welterstellung:

```
[Phase 2/3: Wikipedia-Recherche] Erforsche mittelalterliches Rittertum...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Aktuell: Ritter
  → Fehler: 1 (übersprungen: Burgen_in_England)
```

### Chat-Schaltflächen

In der Web-UI können Sie die Recherche steuern:
- **🌍 Wikipedia erforschen** — Recherche starten
- **⏸ Pause** — Recherche pausieren
- **▶ Fortsetzen** — Recherche fortsetzen

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `GET` | `/api/wiki/research/{worldId}/progress` | SSE-Fortschrittsstrom |
| `POST` | `/api/wiki/research/{worldId}` | Recherche starten |
| `POST` | `/api/wiki/research/{worldId}/pause` | Recherche pausieren |
| `POST` | `/api/wiki/research/{worldId}/resume` | Recherche fortsetzen |
| `GET` | `/api/wiki/research/{worldId}/status` | Aktuellen Status abrufen |

## MCP-Integration

Wikipedia RAG ist als MCP-Tool für Agenten verfügbar:

### Wiki Search Tool

```typescript
// Nach relevantem Wissen suchen
const results = await wikiSearch({
  query: "mittelalterliches Rittertum",
  worldId: "my-world",
  limit: 10
});
```

Gibt zurück:
```json
[
  {
    "article": "Ritter",
    "section": "Geschichte",
    "text": "Das Konzept des Rittertums entstand im mittelalterlichen Zeitraum...",
    "score": 0.85
  }
]
```

### Verwendung in Agenten

Agenten verwenden automatisch RAG bei der Antwortgenerierung:
- **Dramaturg** — Verwendet historischen Kontext für Narrative
- **Validator** — Überprüft Fakten gegen Wikipedia-Daten
- **Stylist** — Reichert Beschreibungen mit realen Details an
- **Schauspieler** — Bietet präzises NPC-Wissen über die Welt

## Konfiguration

### Wiederholungsrichtlinie

- **5 Versuche** pro Artikel
- **2 Minuten Timeout** pro Versuch
- **Exponentieller Backoff**: 5s → 10s → 20s → 40s → 80s

### Graceful Degradation

Wenn Wikipedia nicht verfügbar ist:
- Welterstellung wird ohne Wikipedia-Daten fortgesetzt
- Agenten verwenden nur LLM-generiertes Wissen
- Recherche wird im Hintergrund wiederholt

## Dateistruktur

```
src/services/
├── wikipedia-researcher.ts      # Wikipedia API Client
├── wiki-rag-builder.ts          # Artikel-Chunking
├── idle-research-scheduler.ts   # Hintergrund-Anreicherung
└── world-creation-progress.ts   # Fortschrittsverfolgung

src/mcp/wiki/
├── index.ts                     # Modul-Exporte
└── wiki-search.ts               # MCP-Suchtool

src/routes/
└── wiki-research.ts             # SSE-Endpunkte

src/utils/
└── progress-bar.ts              # CLI-Fortschrittsbalken
```

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| Recherche startet nicht | Überprüfen Sie die Wikipedia API-Erreichbarkeit |
| Fortschritt hängt | Überprüfen Sie System-Tab → Operationsprotokolle |
| Artikel werden nicht geladen | Wiederholungsrichtlinie handhabt temporäre Fehler |
| RAG wird nicht von Agenten verwendet | Stellen Sie sicher, dass `enableWikipediaResearch()` aufgerufen wurde |
| "Authentifizierung erforderlich" | Setzen Sie `AUTH_PASSWORD` in env oder Einstellungen |

## Technische Details

### Chunking-Strategie

Artikel werden in Chunks von ~1500 Zeichen (~500 Token) aufgeteilt:
- **Überlappung**: 150 Zeichen zwischen Chunks
- **Abschnitte**: Jeder Abschnitt wird unabhängig gechunkt
- **Metadaten**: Jeder Chunk speichert Artikelüberschrift, Abschnitt, Kategorien

### Suchalgorithmus

Das Wiki-Suchtool verwendet Schlüsselwortabgleich:
1. Teilt die Abfrage in Wörter auf
2. Überprüft jeden Chunk auf Wortvorkommen
3. Berechnet den Relevanz-Score (Übereinstimmungen / Gesamtwörter)
4. Gibt Top-Ergebnisse sortiert nach Score zurück

### Speicherung

- **SQLite**: Artikel-Metadaten und Chunk-Text
- **FAISS**: Vektor-Embeddings für semantische Suche
- **Weltisolierung**: Jede Welt hat ihren eigenen RAG-Index
