# MCP Console — Benutzerhandbuch

Die MCP Console ist eine webbasierte Verwaltungsoberflache fur alle TrueNeverStory-Datenbanken. Erreichbar unter `/mcp.html` im MCP-Modus.

## Schnellstart

### MCP-Modus starten

```bash
TNS_MCP_MODE=1 bun run src/index.ts
```

Offnen Sie `http://localhost:8000` in Ihrem Browser. Wenn ein Passwort konfiguriert ist, werden Sie zur Login-Seite weitergeleitet.

### Passwortschutz

Der MCP-Modus verwendet dasselbe Passwort wie der Hauptspielserver. Konfigurieren Sie es uber:
- **Umgebungsvariable:** `AUTH_PASSWORD=ihr_passwort`
- **Einstellungsseite:** Einstellungen → Authentifizierungspasswort

Wenn kein Passwort konfiguriert ist, lauft der MCP-Modus ohne Authentifizierung (geeignet fur lokale Entwicklung).

## Tab-Ubersicht

| Tab | Zweck |
|-----|-------|
| **Dashboard** | Datenbankstatus-Ubersicht (Vorhandensein, GroBe) |
| **Bibel** | Verse suchen, Zeichen, Bootstrap/Kompaktierung |
| **Gutenberg** | Stile suchen, Delexifizierung, Korpus herunterladen/konvertieren |
| **Katalog** | Bucherkatalog fur Stillerstellung verwalten |
| **Wikipedia** | Artikel suchen, Fakten verifizieren |
| **Literatur** | Quest-Vorlagen, Kompilierung/Kompaktierung |
| **Okonomie** | Okonomische Phase, Dilemma-Generierung |
| **System** | Laufzeit, Speicher, Operationsprotokolle |

## Katalog — Lieblingsautoren herunterladen

Der Katalog-Tab ermoglicht es Ihnen, eine personliche Bibliothek aus dem Project Gutenberg aufzubauen, um die Schreibqualitat des Stilisten-Agenten zu verbessern.

### Schritt 1: Katalog erstellen

Geben Sie Autorennamen (kommagetrennt) ein und klicken Sie auf **Katalog erstellen**:

```
Mark Twain, Jack London, Edgar Allan Poe
```

Oder geben Sie ein Thema ein (z.B. `adventure`, `romance`, `gothic`) um Autoren zu entdecken.

Fur einen schnellen Start klicken Sie auf **Beliebte 500**, um die meistheruntergeladenen Bucher zu laden.

### Schritt 2: Durchsuchen und filtern

- **Suche** — Volltextsuche uber Titel, Autoren und Themen
- **Filter** — nach Autorenname, Geburts-/Todesjahr, Mindestanzahl herunterladungen
- **Sortierung** — klicken Sie auf Spaltenuberschriften
- **Paginierung** — Navigation mit Zuruck/Vorwarts-Schaltflachen

### Schritt 3: Bucher auswahlen

- **Einzeln** — Kontrollkastchen neben jedem Buch anklicken
- **Alle auf Seite** — Kopfzeilen-Kontrollkastchen anklicken
- **Alle nach Filter** — auf « Alle auswahlen » klicken
- **Auswahl aufheben** — auf « Alle abwahlen » klicken

### Schritt 4: Auswahl herunterladen

Klicken Sie auf **Auswahl herunterladen**, um die Volltexte abzurufen. Der Prozess lauft im Hintergrund mit Fortschrittsanzeige.

Nach dem Herunterladen extrahiert der Stilist-Agent automatisch Schreibmuster (Wortschatz, Satzstrukturen, Stimmungstags) aus den Texten jedes Autors.

### Wie es das Schreiben verbessert

Die heruntergeladenen Texte werden vom Gutenberg-Parser verarbeitet, der:
1. **Delexifiziert** — ersetzt Eigennamen durch Platzhalter zur Strukturerhaltung
2. **Wortschatz extrahiert** — charakteristische Wortwahlen jedes Autors
3. **Satzenmuster extrahiert** — haufige syntaktische Strukturen
4. **Stimmungstags ableitet** — dunkel, hell, romantisch, geheimnisvoll, etc.

Der Stilist-Agent verwendet diese Muster dann bei der Generierung von Narrativprosa und passt Stimmung und Stil an die gewahlten Autoren an.

## API-Endpunkte

Alle Endpunkte befinden sich unter `/mcp/`:

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `GET` | `/mcp/status` | Systemstatus und Datenbankinfo |
| `GET` | `/mcp/gutenberg/catalog/stats` | Katalogstatistiken |
| `GET` | `/mcp/gutenberg/catalog` | Paginierte Katalogliste |
| `GET` | `/mcp/gutenberg/catalog/search?q=` | Volltextsuche |
| `GET` | `/mcp/gutenberg/catalog/filter?author=&year_from=&year_to=&min_downloads=&subject=` | Filterung |
| `POST` | `/mcp/gutenberg/catalog/build` | Katalogerstellung starten |
| `POST` | `/mcp/gutenberg/catalog/select` | Einzelbuchauswahl umschalten |
| `POST` | `/mcp/gutenberg/catalog/select-all` | Alle auswahlen |
| `POST` | `/mcp/gutenberg/catalog/deselect-all` | Alle abwahlen |
| `POST` | `/mcp/gutenberg/download-selected` | Auswahl herunterladen |

## Fehlerbehebung

| Problem | Losung |
|---------|--------|
| Katalog ist leer | Erst Katalog erstellen (Autoren eingeben → Katalog erstellen) |
| Kontrollkastchen setzt zuruck | Server lauft? Browser-Konsole prufen |
| « Authentifizierung erforderlich » | `AUTH_PASSWORD` in Env oder Einstellungen setzen |
| Download hangt | System-Tab → Operationsprotokolle prufen |
| Stile erscheinen nicht | Gutenberg-Konvertierung nach Download ausfuhren |
