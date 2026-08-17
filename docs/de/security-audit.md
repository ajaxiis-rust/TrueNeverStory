# TrueNeverStory — Sicherheitsaudit-Bericht

**Datum:** 2026-07-04  
**Version:** 0.14.0  
**Umfang:** Vollständige Sicherheitsüberprüfung der Codebasis  

---

## Zusammenfassung

TNS hat eine **solide Sicherheitsgrundlage** für sein Bedrohungsmodell (lokale/Einzelspieler-KI-Rollenspiel-Engine). Authentifizierung, SQL-Injection-Schutz, Prompt-Injection-Verteidigung und Eingabesäuberung sind gut implementiert. Die Hauptrisiken liegen in Randfällen: CSP-Richtlinie, statische Dateipfad-Traversal, WebSocket-Auth-Validierung und `Object.assign` Prototype-Pollution-Muster. Die meisten Probleme haben mittlere Schwere für lokale Bereitstellung, wären aber hohe Priorität für öffentliche Instanzen.

**Gesamtbewertung: MITTEL** — ausreichend für lokale Nutzung, Härtung für öffentliche Bereitstellung erforderlich.

---

## 1. Authentifizierung & Sitzungsverwaltung

### Stärken

| Kontrolle | Standort | Status |
|-----------|----------|--------|
| PBKDF2-Passwort-Hashing | `src/middleware/auth.ts:16-18` | 100k Iterationen, SHA-512, 64-Byte-Schlüssel |
| Sitzungstoken | `src/middleware/auth.ts:79-81` | `randomBytes(32)` — 256-Bit-Entropie |
| Cookie-Sicherheit | `src/middleware/auth.ts:230` | HttpOnly, SameSite=Lax |
| Login-Rate-Limiting | `src/middleware/auth.ts:56-77` | 5 Versuche/Min, 5-Minuten-Sperre |
| Auto-Hash bei Passwortänderung | `src/routes/settings.ts:190-196` | PBKDF2-Hash wird bei PUT generiert |

### Probleme

| Schweregrad | Problem | Standort | Beschreibung |
|-------------|---------|----------|--------------|
| **MITTEL** | In-Memory-Sitzungsspeicher | `auth.ts:13` | Sitzungen gehen bei Serverneustart verloren. Kein persistenter Sitzungsspeicher. Akzeptabel für lokale Einzelspieler-Nutzung; problematisch für Produktion. |
| **MITTEL** | Klartext-Passwort-Fallback | `auth.ts:40-41` | Wenn `AUTH_PASSWORD` ohne `AUTH_PASSWORD_HASH` gesetzt ist, wird das Passwort im Klartext verglichen. Beabsichtigter Legacy-Pfad, schwächt aber die Sicherheit bei fehlender Migration. |
| **NIEDRIG** | `x-forwarded-for` fälschbar | `auth.ts:193` | IP für Rate-Limiting kommt aus `x-forwarded-for`-Header, der ohne vertrauenswürdigen Proxy fälschbar ist. Hinter einem Reverse-Proxy in Ordnung; direkte Exposition ist fälschbar. |

---

## 2. SQL-Injection

### Stärken

**Alle SQLite-Abfragen verwenden parametrisierte Platzhalter (`?`).** Keine String-Interpolation in SQL.

- `src/lib/sqlite-store.ts` — Alle 30+ Abfragen verwenden `?`-Platzhalter
- FTS5-Abfragen gesäubert via `sanitizeFtsQuery()` in Zeile 990: entfernt Nicht-Wort-Zeichen
- FTS5 MATCH-Abfragen mit gesäuberten Tokens, verbunden durch `OR`

### Probleme

Keine gefunden. SQL-Injection ist gut gehandhabt.

---

## 3. Cross-Site Scripting (XSS)

### Frontend-Schutz

| Kontrolle | Standort | Status |
|-----------|----------|--------|
| DOMPurify | `public/static/vendor/purify.min.js` | Verfügbar für HTML-Säuberung |
| CSP-Header | `src/middleware/security-headers.ts:27-28` | Gesetzt aber schwach |

### Probleme

| Schweregrad | Problem | Standort | Beschreibung |
|-------------|---------|----------|--------------|
| **HOCH** | CSP erlaubt `unsafe-inline` | `security-headers.ts:27-28` | `script-src 'self' 'unsafe-inline'` erlaubt Inline-JavaScript-Ausführung. Eine XSS-Injection würde CSP vollständig umgehen. Sollte nonce-basiertes oder hash-basiertes CSP verwenden. |
| **MITTEL** | CSP erlaubt `unsafe-inline` für Styles | `security-headers.ts:28` | `style-src 'self' 'unsafe-inline'` — CSS-Injection möglich. |
| **NIEDRIG** | Login-Seiten-Fehlermeldung nicht gesäubert | `auth.ts:112` | `renderLoginPage(error)` interpoliert Fehlerstring in HTML ohne Escaping. Fehlermeldungen sind servergeneriert (kein Benutzereingabe), daher geringes Risiko. |

---

## 4. Pfad-Traversal

### Probleme

| Schweregrad | Problem | Standort | Beschreibung |
|-------------|---------|----------|--------------|
| **MITTEL** | Statische Dateibereitstellung ohne Pfadvalidierung | `src/app.ts:52` | `join(PUBLIC_DIR, c.req.path.replace(/^\//, ""))` — keine Prüfung, dass der aufgelöste Pfad innerhalb von PUBLIC_DIR bleibt. Honos `join()` verhindert `..`-Traversal möglicherweise nicht auf allen OS-Kombinationen. |
| **MITTEL** | Weltdateizugriff ohne Pfadvalidierung | `src/routes/worlds.ts:146,257` | `join(getConfig().WORLDS_ROOT, name)` wobei `name` aus URL-Parameter. Wenn `name` `../` enthält, könnte auf Dateien außerhalb des worlds-Verzeichnisses zugegriffen werden. |
| **NIEDRIG** | Snapshot-Pfad verwendet Benutzer-session_id | `src/routes/launch.ts:118` | `join(snapshotDir, \`${sessionId}.json\`)` — sessionId aus Request-Body. Wenn es `../` enthält, könnten beliebige `.json`-Dateien gelesen werden. |
| **NIEDRIG** | Kapiteldateizugriff | `src/routes/worlds.ts:253-264` | `join(getConfig().WORLDS_ROOT, name, "chapters", filename)` — filename aus URL-Parameter, keine Säuberung. |

---

## 5. Command Injection

### Stärken

| Kontrolle | Standort | Status |
|-----------|----------|--------|
| Backend-Installations-Whitelist | `src/routes/models.ts:58` | `name` validiert gegen `["ollama", "llamacpp"]` vor Verwendung im Pfad |
| Sicherer Ausdrucksevaluator | `src/services/probability-expression.ts` | Rekursiver Abstiegsparser statt `eval()`/`new Function()` |

### Probleme

| Schweregrad | Problem | Standort | Beschreibung |
|-------------|---------|----------|--------------|
| **NIEDRIG** | `execSync` für Installationsskripte | `src/routes/models.ts:71` | `execSync(\`bash "${scriptPath}"\`)` — scriptPath wird aus Whitelist-Name + festem Verzeichnis konstruiert, daher nicht direkt exploitbar. Aber das Muster ist fragil bei Erweiterung der Whitelist. |
| **NEDRIG** | `spawn` für llama-server | `src/routes/settings.ts:132` | Args kommen aus `loadLLMConfig()` (Konfigurationsdatei), nicht aus Benutzereingabe. Sicher, aber Konfigurationsdatei ist über API beschreibbar. |

### Keine unsicheren Muster gefunden

- Keine `eval()`-Nutzung im Produktionscode (nur in Tests zur `safeEval`-Verifikation)
- Keine `new Function()`-Nutzung
- `exec` importiert in `model-manager.ts:8`, aber grep fand keine tatsächlichen `exec()`-Aufrufe — nur `execSync` in routes/models.ts
- `child_process`-Nutzung ist auf spezifische, kontrollierte Kontexte beschränkt

---

## 6. Prototype Pollution

### Probleme

| Schweregrad | Problem | Standort | Beschreibung |
|-------------|---------|----------|--------------|
| **NIEDRIG** | `Object.assign` mit benutzerbeeinflussten Daten | Mehrere Dateien | Verwendet in `entity-store.ts:206-208`, `quest-manager.ts:78`, `entity-extractor.ts:62`, `provider-manager.ts:283`. Wenn Eingabeobjekte `__proto__`-Schlüssel enthalten, ist Prototype Pollution möglich. |

---

## 7. WebSocket-Sicherheit

### Probleme

| Schweregrad | Problem | Standort | Beschreibung |
|-------------|---------|----------|--------------|
| **MITTEL** | WS-Auth prüft nur Cookie-Vorhandensein | `src/index.ts:151-153` | `cookie.includes("bring_session=")` — prüft ob Cookie existiert, nicht ob Token gültig ist. Abgelaufener/ungültiger Token erlaubt trotzdem WebSocket-Upgrade. |
| **NIEDRIG** | Keine Eingabesäuberung bei WS-Nachrichten | `src/index.ts:229` | WS-Nachrichteninhalt geht direkt zu `engine.processInput()` ohne `sanitizeInput()`. REST-Routen säubern; WS nicht. |

---

## 8. Eingabevalidierung

### Stärken

| Kontrolle | Standort | Status |
|-----------|----------|--------|
| Zod-Schemavalidierung | `src/routes/chat.ts:35,61` | `zValidator("json", ChatMessageSchema)` an Chat-Endpunkten |
| Prompt-Injection-Säuberung | `src/utils/sanitize.ts` | 15+ Regex-Muster, max. Länge 8000 Zeichen |
| Benutzerinhalt-Wrapping | `src/utils/sanitize.ts:81-83` | `<user_message>`-Marker |

### Probleme

| Schweregrad | Problem | Standort | Beschreibung |
|-------------|---------|----------|--------------|
| **NIEDRIG** | Fehlende Validierung bei den meisten Routen | `src/routes/*.ts` | Die meisten API-Endpunkte verwenden `c.req.json().catch(() => ({}))` ohne Schemavalidierung. Nur Chat-Routen verwenden Zod. |
| **NIEDRIG** | Keine Typvalidierung bei Welterstellung | `src/routes/worlds.ts:67` | `body.name` ohne Längen-/Formatvalidierung verwendet. |

---

## 9. Fehlerbehandlung

### Stärken

| Kontrolle | Standort | Status |
|-----------|----------|--------|
| Generische 500-Nachrichten | `src/middleware/error-handler.ts:27` | `"Internal Server Error"` — keine Stacktraces ausgesperrt |
| API-Schlüssel-Maskierung | `src/routes/settings.ts:164-168` | GET settings maskiert `llmApiKey`, `embeddingApiKey`, `authPassword` |

### Probleme

| Schweregrad | Problem | Standort | Beschreibung |
|-------------|---------|----------|--------------|
| **NIEDRIG** | Fehlermeldungen in einigen Routen lecken Details | `src/routes/chat.ts:103`, `src/routes/worlds.ts:83,97,110,136` | `err.message` in JSON-Antwort. Kann interne Pfade oder Stack-Info bei einigen Fehlertypen exponieren. |

---

## 10. Abhängigkeits- & Konfigurationssicherheit

### Stärken

| Kontrolle | Standort | Status |
|-----------|----------|--------|
| `.env` in gitignore | `.gitignore:4` | Schließt `.env` und `.env.*` aus |
| Konfigurationsdateien in gitignore | `.gitignore:16-19` | `conf/settings.json`, `conf/providers.json`, `conf/llm-config.json`, `conf/agents.json` |
| Weltdaten in gitignore | `.gitignore:20-31` | Alle Weltdatenbanken, Sitzungshistorien, Profile ausgeschlossen |

### Probleme

| Schweregrad | Problem | Standort | Beschreibung |
|-------------|---------|----------|--------------|
| **NIEDRIG** | Hartcodierte Modellverzeichnisse | `src/routes/settings.ts:101` | `findModel()` durchsucht `/home/opc/prj/HIBRING/local-models` und `/home/opc/koboldcpp/models` — hartcodierte Pfade, nicht konfigurierbar. |

---

## 11. CORS-Konfiguration

| Schweregrad | Problem | Standort | Beschreibung |
|-------------|---------|----------|--------------|
| **MITTEL** | CORS hartcodiert auf localhost | `src/app.ts:38` | `origin: ["http://localhost:8000", "http://127.0.0.1:8000"]` — kein konfigurierbares CORS. Produktionsbereitstellungen hinter Reverse-Proxy brauchen manuelles Update. |

---

## 12. Sicherheitsheader

Alle vorhanden und korrekt:

| Header | Wert | Status |
|--------|------|--------|
| X-Content-Type-Options | `nosniff` | Korrekt |
| X-Frame-Options | `DENY` | Korrekt |
| X-XSS-Protection | `1; mode=block` | Korrekt (Legacy-Browser) |
| Referrer-Policy | `strict-origin-when-cross-origin` | Korrekt |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` | Korrekt |
| Content-Security-Policy | Siehe §3 oben | Vorhanden aber schwach (`unsafe-inline`) |

Fehlende Header (empfohlen):
- `Strict-Transport-Security` (HSTS) — nur relevant für HTTPS
- `X-Permitted-Cross-Domain-Policies: none`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

---

## 13. Prompt-Injection-Verteidigung

### Stärken

| Kontrolle | Standort | Status |
|-----------|----------|--------|
| Musterbasierte Säuberung | `src/utils/sanitize.ts:6-34` | 15+ Regex-Muster: Anweisungsüberschreibung, System-Prompt-Injection, Rollenentführung, Ausgabemanipulation, DAN-style Jailbreaks, Markdown/Code-Injection |
| Inhalts-Wrapping | `src/utils/sanitize.ts:81-83` | `<user_message>`-Marker |
| Max. Nachrichtenlänge | `src/utils/sanitize.ts:36` | 8000 Zeichen |
| Angewandt auf REST-Routen | `src/routes/chat.ts:66,129,165` | Alle Chat-Endpunkte säubern |
| Sicherer Ausdrucksevaluator | `src/services/probability-expression.ts:202` | Blockiert `import`, `require`, `eval`, `Function`, `this`, `global`, `process`, `window`, `document` |

### Probleme

| Schweregrad | Problem | Standort | Beschreibung |
|-------------|---------|----------|--------------|
| **MITTEL** | WebSocket-Nachrichten nicht gesäubert | `src/index.ts:229` | `engine.processInput(content)` ohne `sanitizeInput()`. REST-Routen säubern. |

---

## Empfehlungen (Prioritätsreihenfolge)

1. **CSP reparieren** — `unsafe-inline` durch nonce-basiertes oder hash-basiertes CSP ersetzen. Dies ist die wirkungsvollste Sicherheitsverbesserung.
2. **WebSocket-Nachrichten validieren** — `sanitizeInput()` auf WS-Nachrichteninhalt anwenden.
3. **WS-Sitzungstoken validieren** — Tokengültigkeit gegen Sitzungsspeicher prüfen.
4. **Pfad-Traversal-Prüfungen hinzufügen** — Für statische Dateien: `resolvedPath.startsWith(PUBLIC_DIR)` prüfen.
5. **`Strict-Transport-Security` hinzufügen** bei HTTPS-Bereitstellung.
6. **Hartcodierte Pfade entfernen** in `settings.ts:101`.
7. **Eingabevalidierung hinzufügen** zu Routen ohne Zod-Schemas.
8. **Persistente Sitzungen erwägen** — SQLite-basierte Sitzungen überleben Neustarts.

---

## Überprüfte Dateien

| Datei | Zweck |
|-------|-------|
| `src/middleware/auth.ts` | Authentifizierung, Sitzungen, Login-Rate-Limiting |
| `src/middleware/rate-limiter.ts` | IP-basiertes Rate-Limiting |
| `src/middleware/security-headers.ts` | HTTP-Sicherheitsheader |
| `src/middleware/error-handler.ts` | Zentralisierte Fehlerbehandlung |
| `src/app.ts` | Hono-App, CORS, statische Bereitstellung, Auth-Gate |
| `src/index.ts` | Server-Einstiegspunkt, WebSocket-Handling |
| `src/lib/sqlite-store.ts` | SQLite mit parametrisierten Abfragen, FTS5 |
| `src/utils/sanitize.ts` | Prompt-Injection-Säuberung |
| `src/services/probability-expression.ts` | Sicherer Ausdrucksevaluator |
| `src/services/websocket-manager.ts` | WebSocket-Verbindungsmanagement |
| `src/services/model-manager.ts` | Modellverwaltung, Ollama-Integration |
| `src/routes/chat.ts` | Chat-Endpunkte mit Zod-Validierung |
| `src/routes/settings.ts` | Settings-CRUD, Serververwaltung |
| `src/routes/models.ts` | Modell/Backend-Verwaltung |
| `src/routes/entities.ts` | Entitätsgraph-Abfragen |
| `src/routes/worlds.ts` | Welt-CRUD, Kapitelgenerierung |
| `src/routes/launch.ts` | Spielstart, Snapshots |
| `src/routes/maintenance.ts` | Speicherwartung |
| `scripts/hash-password.ts` | Passwort-Hash-Dienstprogramm |
| `.env.example` | Umgebungskonfiguration |
| `.gitignore` | Git-Ausschlussregeln |
