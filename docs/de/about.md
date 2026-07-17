# Über TrueNeverStory — Design-Begründung

## Sprachstrategie: English inside, translate at boundary

### Warum Englisch für die Agentenverarbeitung

TrueNeverStory verwendet eine **„English inside, translate at boundary"-Architektur** aus mehreren kritischen Gründen:

1. **LLM-Qualität** — Große Sprachmodelle arbeiten am besten auf Englisch, ihrer primären Trainingssprache. Die Verwendung von Englisch für die interne Verarbeitung gewährleistet:
   - Konsistentere Erzählqualität
   - Besseres Verständnis komplexer Prompts
   - Weniger Halluzinationen und Stilinkonsistenzen
   - Zugang zum gesamten Spektrum literarischer Referenzen

2. **Token-Ökonomie** — Englisch ist typischerweise 20-40% token-effizienter als andere Sprachen für denselben semantischen Inhalt. Das bedeutet:
   - Mehr Kontext passt ins Prompt-Fenster
   - Niedrigere API-Kosten pro Anfrage
   - Schnellere Verarbeitungszeiten

3. **Literarischer Reichtum** — Die Quellmaterialien (Bibel, Gutenberg-Klassiker) sind primär auf Englisch oder haben kanonische englische Übersetzungen. Die Verarbeitung auf Englisch bewahrt:
   - Direkten Zugang zu archetypischen Mustern
   - Stilistische Authentizität aus Quelltexten
   - Nuancierte emotionale und thematische Inhalte

### Übersetzungspipeline

```
Benutzereingabe (beliebige Sprache)
    ↓
TranslationService.translateToEnglish()
    ↓
Absichtsparsing (Englisch)
    ↓
Agentenverarbeitung (Englisch)
    ↓
Antwortgenerierung (Englisch)
    ↓
TranslationService.translate()
    ↓
Benutzerausgabe (Originalsprache)
```

**Wesentliche Designentscheidungen:**
- Übersetzung erfolgt **einmal bei der Eingabe** und **einmal bei der Ausgabe**
- Alle internen Zustände, Speicher und Verarbeitung bleiben auf Englisch
- Agenten sehen oder produzieren nie direkt nicht-englischen Text
- UI-Übersetzungen sind getrennt von Inhaltsübersetzungen (i18n vs TranslationService)

---

## Literarische Datenbankarchitektur: Token-Ökonomie durch Vorverarbeitung

### Das Problem

Die Generierung reicher, literarischer Narrative von Grund auf erfordert:
- Große Prompts mit Stilbeispielen
- Mehrere LLM-Aufrufe für verschiedene Aspekte (Handlung, Stil, Emotion)
- Hohen Token-Verbrauch für qualitative Ergebnisse

### Die Lösung: Offline-Literaturkompilierung

TrueNeverStory verarbeitet literarische Quellen **vor dem Deployment** in strukturierte SQLite-Datenbanken:

```
Quelltexte → LiteraryCompiler → SQLite-Datenbanken → Runtime-Abfragen
     ↓              ↓                    ↓                ↓
  Bible.db    4-Pass-Parser      FTS5-indexierte    Millisekunden-
  Gutenberg   (dramaturgisch,    Quest-Vorlagen     Abfragen
  Klassiker   stilistisch,       Stilmuster
              emotional,
              Metadaten)
```

### Datenbanktypen

| Datenbank | Quelle | Inhalt | Zweck |
|-----------|--------|--------|-------|
| `bible.db` | Biblische Texte | Quest-Vorlagen, Archetypen, moralische Dilemmata | Narrative Struktur |
| `gutenberg.db` | Project Gutenberg | Stilmuster, sensorische Beschreibungen, Tempo | Literarische Qualität |
| `literary.db` | Kompilierte Ausgabe | Vereinigte Vorlagen mit FTS5-Suche | Runtime-Zugang |

### Token-Einsparungen

**Ohne Vorverarbeitung:**
```
Prompt: "Generiere einen Quest über Verrat im Stil alter epischer Literatur..."
Tokens: ~500-800 für Prompt + ~300-500 für Antwort = ~800-1300 Tokens
```

**Mit Vorverarbeitung:**
```
Abfrage: db.queryTemplates({ archetype: 'betrayal', mood: 'epic' })
Tokens: ~50 für Abfrage + ~200-300 für Antwort = ~250-350 Tokens
```

**Einsparungen: 60-75% Reduktion des Token-Verbrauchs pro narrativelem Element.**

---

## Reichhaltige literarische Quellen

### Biblische Archetypen

Die Bibel bietet **zeitgeprüfte narrative Strukturen**, die über Kulturen hinweg resonieren:

| Archetyp | Quelle | Muster | Moderne Anwendung |
|----------|--------|--------|-------------------|
| **Flucht** | Exodus 14 | Führer → Tyrann → Hindernis → Intervention → Freiheit | Rebellion-Quests, Ausbruchszenarien |
| **Gericht** | 1. Könige 3 | Streit → Weiser Herrscher → Verborgene Wahrheit → Gerechtigkeit | Hofintrigen, moralische Dilemmata |
| **Erbschaft** | Lukas 15 | Verlorener → Verschwendet → Rückkehr → Annahme | Erlösungsbögen, Familiendrama |
| **Aufstieg-Fall-Aufstieg** | Genesis 37-50 | Bevorzugter → Verrat → Leiden → Aufstieg → Versöhnung | Charakterentwicklungsbögen |
| **Ausdauer** | Hiob | Leiden → Zweifel → Beharrlichkeit → Wiederherstellung | Spielerentschlossenheit testen |
| **Befreiung** | Richter | Unterdrückung → Ruf → Sammlung → Sieg | Kriegskampagnen, Revolutionsgeschichten |

**Warum biblische Muster funktionieren:**
- **Universelle Erkennung** — Spieler verstehen diese Strukturen intuitiv
- **Moralische Komplexität** — Biblische Narrative haben selten einfache Gut/Böse-Teilungen
- **Emotionale Tiefe** — Themen von Verlust, Hoffnung, Verrat, Erlösung
- **Skalierbares Drama** — Funktioniert für intime Geschichten und epische Kampagnen

### Gutenberg-Stilmuster

Project Gutenberg bietet **Jahrhunderte literarischen Handwerks**:

| Ära | Autoren | Stilelemente | Anwendungsfall |
|-----|---------|--------------|----------------|
| **Gotik** | Poe, Shelley, Stoker | Dunkle Atmosphäre, sensorische Angst, psychologische Spannung | Horror, Mystery |
| **Viktorianisch** | Dickens, Brontës | Sozialkommentar, detaillierte Beschreibungen, moralische Komplexität | Soziale Intrigen |
| **Episch** | Homer, Milton | Großes Epos, heroische Sprache, mythischer Resonanz | Kriege, Quests |
| **Romantisch** | Byron, Keats | Emotionale Intensität, Naturbilder, Leidenschaft | Liebesgeschichten, persönliches Drama |

**Dexifizierungsprozess:**
1. Strukturelle Muster extrahieren (Satzlänge, Rhythmus, Vokabular)
2. Charakternamen und spezifische Referenzen entfernen
3. Sensorische Marker und emotionalen Ton bewahren
4. Wiederverwendbare Vorlagen mit Variablen erstellen

---

## NPC-Individualität und Charakter

### Mehrschichtiges Charaktersystem

Jeder NPC hat **vier Tiefebenen**:

```
L1: Grundinformationen (Name, Rolle, Standort)
    ↓
L2: Persönlichkeit (Eigenschaften, Marotten, Sprachmuster)
    ↓
L3: Verborgene Motivationen (geheime Ziele, Ängste, Wünsche)
    ↓
L4: Dynamischer Zustand (Beziehungen, Erinnerungen, emotionaler Zustand)
```

### Charakterquellen

| Quelle | Beitrag | Beispiel |
|--------|---------|----------|
| **Biblische Archetypen** | Moralische Rahmen, Loyalitätsmuster | Ruths Loyalität, Davids Ehrgeiz |
| **Gutenberg-Charaktere** | Sprachmuster, soziale Verhaltensweisen | Dickens' Sozialkletterer, Brontës' leidenschaftliche Seelen |
| **Historische Muster** | Politische Verhaltensweisen, Fraktionsdynamik | Hofintrigen, Gildenpolitik |
| **Psychologische Modelle** | Persönlichkeitskonsistenz, emotionale Reaktionen | Big-Five-Eigenschaften, Bindungsstile |

### NPC-Speichersystem

```
Kurzzeit: Letzte 3 Interaktionen (sofortiger Kontext)
    ↓
Mittelzeit: Bedeutsame Ereignisse (Beziehungsänderungen)
    ↓
Langzeit: Kerinnerungen (prägende Erfahrungen)
    ↓
Semantisch: Embedding-basierte Erinnerung (kontextueller Speicher)
```

**Speichereinflüsse:**
- Dialogton und Vokabular
- Vertrauensniveau und Hilfsbereitschaft
- Begrüßungsstil (warm, kalt, ängstlich)
- Themenverfügbarkeit (persönlich, Fraktion, Quest)

### Wirtschaftliche und soziale Verhaltensweisen

NPCs haben **realistische wirtschaftliche Verhaltensweisen** basierend auf historischen Mustern:

| Verhalten | Quelle | Implementierung |
|-----------|--------|-----------------|
| **Handel** | Mittelalterliche Kaufmannsgilden | Angebot/Nachfrage, rufbasierte Preisgestaltung |
| **Handwerk** | Historische Handwerkerwerkstätten | Fertigkeitsstufen, Materialqualität, Zeitaufwand |
| **Soziale Dynamik** | Feudale Hierarchie | Herr/Vasall-Beziehungen, Fraktionsloyalität |
| **Politische Intrigen** | Hofpolitik | Geheime Allianzen, Informationshandel |

---

## Handlungswendemechanik

### Narrative Musterwahl

Wenn der Spieler eine Aktion ausführt, analysiert das System:

1. **Analysiert die Absicht** — Was versucht der Spieler zu tun?
2. **Simuliert das Ergebnis** — Was würde realistisch passieren?
3. **Wählt den Archetyp** — Welches biblische/literarische Muster passt?
4. **Wendet den Stil an** — Welche literarische Epoche/Stimmung passt?
5. **Generiert Prosa** — Kombiniert Muster + Stil + Kontext

### Beispiel: Spieler verrät einen Verbündeten

```
Absicht: Verrat
Simulation: Beziehung zerstört, Fraktionsspannung steigt
Archetyp: Genesis 37 (Joseph von Brüdern verkauft)
Stil: Viktorianisches soziales Drama
Ergebnis: Narrativ, das die Folgen des Verrats mit dickensscher sozialer Detailierung erforscht
```

### Dynamische Schwierigkeit

Quest-Vorlagen enthalten **moralische Mehrdeutigkeitswerte** (0-1):
- 0.0 — Klares Gut/Böse (Kindergeschichten)
- 0.5 — Komplexe Entscheidungen (Standard-RPG)
- 1.0 — Keine klare richtige Antwort (reife Narrative)

---

## Leistungsarchitektur

### Warum Vorverarbeitung gewinnt

| Ansatz | Latenz | Token-Kosten | Qualität |
|--------|--------|--------------|----------|
| **On-the-fly LLM** | 2-5 Sekunden | Hoch | Variabel |
| **Vorverarbeitete DB** | <100ms | Minimal | Konsistent |
| **Hybrid (TNS)** | <100ms + Polierung | Niedrig | Hoch |

### Der Hybridansatz

1. **DB-Abfrage** — Strukturierte Vorlage abrufen (Millisekunde)
2. **Variablensubstitution** — Kontext einfügen (Mikrosekunde)
3. **Stilanwendung** — Literarische Muster anwenden (Millisekunde)
4. **LLM-Polierung** — Finale Prosaerzeugung (optional, für kritische Momente)

Das gibt uns **Datenbankgeschwindigkeit** mit **LLM-Qualität**, wo es wichtig ist.

---

## Zukünftige Erweiterungen

### Zusätzliche literarische Quellen

| Quelle | Potenzial | Status |
|--------|-----------|--------|
| **Shakespeare** | Dramamuster, Monologstile | Geplant |
| **Mythologie** (griechisch, nordisch, keltisch) | Heldenreise, göttliche Intervention | Geplant |
| **Historische Chroniken** | Politische Intrigen, Kriegsnarrative | Geplant |
| **Volksmärchen** | Moralische Lektionen, kulturelle Muster | Geplant |

### Verbesserte NPC-Systeme

| Feature | Beschreibung | Status |
|---------|--------------|--------|
| **Kulturelle Hintergründe** | Regionsspezifische Verhaltensweisen und Sprache | In Bearbeitung |
| **Generationengedächtnis** | Familiengeschichten, vererbte Ressentiments | Geplant |
| **Wirtschaftliche Spezialisierung** | Gildenspezifischer Handel und Handwerk | In Bearbeitung |
| **Politische Fraktionen** | Dynamische Allianz- und Rivalitätssysteme | Aktiv |

---

## Weltdesign und Wirtschaft

### Feudale Hierarchie

TrueNeverStory implementiert ein **10-stufiges feudales Rangsystem**, das Vermögen, Steuern, Privilegien und soziale Interaktionen steuert:

| Rang | Min. Vermögen | Wachen | Basissteuer | Gehalt | Kann Bestechung geben | Kann Bestechung nehmen |
|------|---------------|--------|-------------|--------|----------------------|----------------------|
| **Sklave** | 0 | 0 | 100% | 0 | Nein | Nein |
| **Bauer** | 0 | 0 | 90% | 0 | Ja | Nein |
| **Baronet** | 100.000 | 50 | 30% | 0 | Ja | Ja |
| **Baron** | 500.000 | 200 | 28% | 0 | Ja | Ja |
| **Vicomte** | 2.000.000 | 1.000 | 25% | 0 | Ja | Ja |
| **Graf** | 10.000.000 | 5.000 | 22% | 0 | Ja | Ja |
| **Marquis** | 50.000.000 | 20.000 | 20% | 0 | Ja | Ja |
| **Herzog** | 200.000.000 | 100.000 | 18% | 0 | Ja | Ja |
| **König** | 1.000.000.000 | 500.000 | 15% | 0 | Ja | Ja |
| **Kaiser** | 10.000.000.000 | 2.000.000 | 10% | 0 | Ja | Ja |

**Schlüsselregeln:**
- **Sklaven** können nicht an der Bestechungsökonomie teilnehmen (kein freier Wille)
- **Bauern** können Bestechung geben, aber nicht empfangen (keine Macht)
- **Höhere Ränge** zahlen niedrigere Steuern (Machtrabatt), haben aber höhere Unterhaltskosten
- **Vermögensschwellen** müssen für Beförderungen erreicht werden

### Steuersystem

Das Steuersystem ist **dynamisch** und wird von mehreren Faktoren beeinflusst:

```
Effektive Steuer = Basissteuer × (1 - Machtrabatt - Beliebtheitsrabatt)
```

**Komponenten:**
- **Basissteuer** — Definiert durch Rang (90% für Bauern, 10% für Kaiser)
- **Machtrabatt** — Bis zu 90% Reduzierung basierend auf politischer Macht (Macht / 10.000)
- **Beliebtheitsrabatt** — Bis zu 30% Reduzierung basierend auf öffentlicher Zustimmung (Beliebtheit / 3.000)

**Steuerverlauf:**
```
NPC-Einkommen → Steuerberechnung → Schatzsammlung → Schatz des Lords
     ↓              ↓                  ↓                  ↓
  Rang-         Dynamische         Pro-Runden-        Feudale
  basiertes     Sätze              Verarbeitung       Kettenakkumulation
  Gehalt                           mit Loyalitätsprüfungen
```

**Folgen hoher Steuern:**
- **Verratsrisiko** = (Steuerlast + Bestechungen) / Einkommen × (1 - Loyalität / 1000)
- Hohe Steuerlast erhöht Aufstandswahrscheinlichkeit
- Loyalität wirkt als Puffer gegen Verrat

### Bestechungsökonomie

Bestechungen sind eine **Wirtschaftsmechanik erster Klasse**, die Politik, Loyalität und Machtdynamiken beeinflusst:

**Bestechungstypen:**
| Typ | Zweck | Risikolevel |
|-----|-------|-------------|
| **Schutz** | Bestrafung oder Verfolgung vermeiden | Mittel |
| **Gefallen** | Bevorzugte Behandlung erhalten | Niedrig |
| **Schweigen** | Geheimnisse verbergen | Hoch |
| **Zugang** | Eingeschränkte Bereiche oder Personen erreichen | Mittel |
| **Beförderung** | Rang oder Position aufsteigen | Hoch |
| **Befreiung** | Steuern oder Verpflichtungen vermeiden | Sehr hoch |

**Bestechungsrisikoformel:**
```
Risiko = Basisrisiko (10%) + Summenrisiko (Summe / 10.000) + Zeugenrisiko (Zeugen × 15%) - Fähigkeit des Empfängers (Intrigen × 0,1%)
```

**Risikofaktoren:**
- **Summe** — Größere Bestechungen sind riskanter
- **Zeugen** — Mehr Beobachter erhöhen Entdeckungschance
- **Intrigen des Empfängers** — Fähige Beamte können Korruption verbergen
- **Bestechungstyp** — Einige Typen sind inhärent riskanter

**Wirtschaftliche Auswirkungen:**
- Bestechungen **reduzieren Loyalität** (Korruption untergräbt Vertrauen)
- Bestechungen **erhöhen Vermögen** für Empfänger
- Bestechungen **erhöhen Macht** (1% der Bestechungssumme konvertiert zu Macht)
- Bestechungen **reduzieren Beliebtheit** (Öffentlichkeit missbilligt Korruption)

### Wirtschaftszyklen (Joseph-Modell)

Basierend auf dem **biblischen Modell Josephs** (Genesis 41) durchläuft die Wirtschaft drei Phasen:

**Phasenzyklus:**
```
Überfluss (30 Tage) → Übergang (10 Tage) → Hungersnot (20 Tage) → Überfluss...
```

**Phaseneffekte:**
| Phase | Preisänderung | Reserveänderung | Narrative Ereignisse |
|-------|---------------|-----------------|---------------------|
| **Überfluss** | 0,8× (günstig) | +20% pro Runde | Ernte, Handelsbooms |
| **Übergang** | 1,0× (normal) | Stabil | Marktunsicherheit |
| **Hungersnot** | 2,0× (teuer) | -30% pro Runde | Dürre, Pest, Krieg |

**Strategische Implikationen:**
- **Reserven speichern** während Überfluss für Hungersnot-Überleben
- **Preisplanung** erfordert Vorwegnahme von Phasenübergängen
- **Spielerentscheidungen** können Phasendauer und -schwere beeinflussen

### Jubiläumssystem

Alle **50 Jahre** löst ein **Jubiläumsereignis** massive wirtschaftliche Resets aus:

**Jubiläumseffekte:**
1. **Schuldenerlass** — Alle ausstehenden Schulden werden erlassen
2. **Landrückgabe** — Alle verpfändeten Lande kehren zu Besitzern zurück
3. **Loyalitätsbonus** — +30% Loyalitätsbonus für alle NPC (hält 10 Tage)

**Historische Basis:**
Basierend auf dem **biblischen Jubiläum** (Levitikus 25), das dauerhafte Armut verhinderte und soziale Mobilität aufrechterhielt.

**Strategische Implikationen:**
- **Schuldenzeitpunkt** — Verleihen Sie nicht nahe Jubiläumsjahren
- **Landerwerb** — Temporärer Besitz schafft interessante Dynamiken
- **Soziale Stabilität** — Jubiläum verhindert extreme Vermögenskonzentration

### Fraktionssteuerdilemmata

Wenn zwei Fraktionen konfligierende Steueransprüche haben, generiert das System **moralische Dilemmata** für den Spieler:

**Dilemmagenerierung:**
- 30% Chance pro Wirtschaftsrunde
- Mindestens 30 Tage Cooldown zwischen Dilemmata
- Steuerbeträge reichen von 100 bis 1.000 Gold

**Spielerentscheidungen:**
| Entscheidung | Fraktion A Loyalität | Fraktion B Loyalität | Ruf |
|--------------|---------------------|---------------------|-----|
| **Fraktion A zahlen** | +50 | -30 | Neutral |
| **Fraktion B zahlen** | -30 | +50 | Neutral |
| **Beide ablehnen** | -20 | -20 | -10 (unzuverlässig) |

**Narrative Integration:**
Jedes Dilemma generiert eine kontextuelle Geschichte, die den Konflikt erklärt und den Spieler zwingt, bedeutungsvolle politische Entscheidungen zu treffen.

### Fraktionsarbeitsregeln

Jede Fraktion kann **individuelle Arbeitspolitiken** festlegen, die Löhne und Loyalität beeinflussen:

**Arbeitsregelparameter:**
- **Feste Löhne** — Ja/Nein (vorhersehbar vs. leistungsbasiert)
- **Lohnhöhe** — Basislohn pro Arbeitsperiode
- **Loyalitätsmodifikator** — Bonus/Strafe für Arbeiterloyalität

**Lohnberechnung:**
```
Endlohn = Basislohn × Gearbeitete Stunden × Produktivität × Fraktionsmodifikator
```

**Loyalitätskonflikte:**
Wenn NPC für mehrere Fraktionen arbeiten, können Loyalitätskonflikte entstehen:
- **Doppelloyalität** reduziert Effektivität
- **Fraktionswechsel** hat Rufkosten
- **Arbeitsstillstände** treten während Konflikten auf

### Sklavenökonomie

Ein **moralisch komplexes** System, das historische Machtdynamiken widerspiegelt:

**Sklaveneigenschaften:**
- **Gesundheit** — Physischer Zustand (beeinflusst Wert)
- **Erfahrung** — Fähigkeiten und Wissen (erhöht Wert)
- **Laster** — Gier, Zorn, Faulheit (reduziert Wert)
- **Familie** — Sklaven können Familien haben (schafft Verpflichtungen)

**Sklavenwertformel:**
```
Wert = 100 + (Erfahrung × 0,1) + (Gesundheit × 0,05) - Lasterstrafen
```

**Sklavenlebenszyklus:**
1. **Versklavung** — Durch Schulden, Gefangennahme oder Geburt
2. **Arbeit** — Produziert Güter (300-1000 Einheiten pro Runde)
3. **Rebellion** — Möglich wenn Wachen schwach sind (Stärkeverhältnis bestimmt Erfolg)
4. **Befreiung** — Kostet 200 Gold, gewährt Bauer-Status

**Ethische Überlegungen:**
- System ist entworfen **moralisch unbequem** zu sein
- Spielerentscheidungen haben **reale Konsequenzen** für Sklaven-NPC
- **Rebellionsmechanik** stellt sicher, dass Sklaverei nie "sicher" ist
- **Befreiungswege** bieten Möglichkeiten zur moralischen Erlösung

### Integration mit sozialem Graphen

Die Wirtschaft integriert sich mit dem **sozialen Graphen** für realistische Machtdynamiken:

**Feudale Beziehungen:**
```
Vasall → Lord (Steuer + militärische Verpflichtung)
  ↓
Befehlskette (mehrere Ebenen)
  ↓
Steuerverlaufsakkumulation (gesammelte Steuern)
```

**Fraktionswirtschaft:**
- **Wirtschaftsfraktionen** kontrollieren Handel und Ressourcen
- **Militärfraktionen** bieten Sicherheit (gegen Bezahlung)
- **Religionsfraktionen** beeinflussen moralische Entscheidungen
- **Kriminelle Fraktionen** operieren außerhalb legaler Wirtschaft

**Rufsystem:**
- **Öffentliche Zustimmung** beeinflusst Steuersätze
- **Fraktionsposition** bestimmt Zugang zu Ressourcen
- **Persönlicher Ruf** beeinflusst Bestechungserfolgsraten

### Wirtschaftsdatenbank

Alle Wirtschaftsdaten werden in einer dedizierten **SQLite-Datenbank** (`economic.db`) gespeichert:

**Tabellen:**
- `economic_cycles` — Phasenverfolgung mit Preisänderungen
- `jubilee_events` — Historische Jubiläumsaufzeichnungen
- `faction_labor_rules` — Per-Fraktion Lohnpolitik
- `faction_dilemmas` — Steuerstreitigkeiten-Historie

**Leistung:**
- **Indizierte Abfragen** für schnelle Wirtschaftsberechnungen
- **Stapelverarbeitung** für NPC-Operationen (Alterungsverfall, Lasterverfall, Steuern, Loyalität)
- **Mojo-Kerne** für rechenintensive Operationen (5× Beschleunigung)

---

## Zusammenfassung

Die Architektur von TrueNeverStory kombiniert:

1. **Englisch-zuerst-Verarbeitung** für LLM-Qualität und Token-Effizienz
2. **Vorverarbeitete literarische Datenbanken** für sofortigen Zugang zu reichen narrativen Mustern
3. **Mehrschichtige NPC-Systeme** für glaubwürdige, einprägsame Charaktere
4. **Hybride Generation**, die Geschwindigkeit und Qualität balanciert

Das Ergebnis ist ein System, das **Narrative literarischer Qualität** auf **Datenbankgeschwindigkeit** generieren kann, während es **tiefe Charakterkonsistenz** und **bedeutungsvolle Spielerentscheidungen** beibehält.
