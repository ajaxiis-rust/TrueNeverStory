# Gutenberg Processing Pipeline — Design Spec

> Версия: 3.1 | Дата: 2026-08-09
> Архитектурная ревизия: 6 улучшений интегрированы (детали в [S11]) + 4 дополнения [S14-S17]

---

## [S1] Проблема

В проекте есть 59 скачанных книг с Project Gutenberg (`data/gutenberg/texts/*.txt`). Они лежат мёртвым грузом — ни один агент (Stylist, Dramaturg, LiteraryV2Generator) не может их использовать. Причина: нет сквозного конвейера от скачанного `.txt` файла до заполненных баз данных, которые читают агенты.

Текущее состояние на диске:

| Путь | Что | Статус |
|------|-----|--------|
| `data/gutenberg/texts/*.txt` | 59 текстов, ~40MB | Есть, но не используется |
| `data/mcp/gutenberg-catalog.db` | 213 книг с метаданными | Есть, только для UI выбора |
| `data/gutenberg/gutenberg-normalized.db` | Стили + FTS | Пустая |
| `data/gutenberg/classics.db` | Промежуточный формат | Не существует |
| `data/literary-compiler/classics-compiled.db` | V1 quest templates | Пустая |
| `data/literary-compiler/literary.db` | V2 scene_templates | Пустая |
| `data/player-profiles.db` | Стилевые профили игроков | Не существует |

Два критических бага:

1. **Скрипт импорта не существует** — некому создать `classics.db`
2. **`GutenbergParser.parse()` читает сам себя** — открывает `gutenberg-normalized.db` как источник данных, в котором пусто

---

## [S2] Архитектура решения

Два скрипта, запускаемые через MCP endpoint. Заполняют четыре выходные базы.

### Схема потоков данных

```
Gutenberg.org ──→ download-gutenberg-selected.ts ──→ texts/{etextno}.txt  ✅ есть
Gutendex API  ──→ build-gutenberg-catalog.ts      ──→ gutenberg-catalog.db ✅ есть
                                                           │
                              ┌────────────────────────────┘
                              ▼
                    [НОВЫЙ] import-gutenberg-texts.ts
                              │
                              │ читает: data/gutenberg/texts/*.txt
                              │         data/mcp/gutenberg-catalog.db
                              │ пишет:  data/gutenberg/classics.db
                              ▼
                         classics.db
                              │
                    [НОВЫЙ] process-gutenberg.ts
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
  gutenberg-            classics-            literary.db
  normalized.db         compiled.db
         │                    │                    │
     Стилист             Драматург           LiteraryV2
     (стили)             + Стилист           Generator
                         (шаблоны v1)        (шаблоны v2)

              data/player-profiles.db  ← общая БД для V1 и V2
              (стилевые профили игроков)
```

### Четыре потребителя и что они запрашивают

| Агент | MCP Tool | База | Таблица |
|-------|----------|------|---------|
| **Stylist** | `get_style_pattern` | `gutenberg-normalized.db` | `gutenberg_styles` |
| **Stylist** | `apply_style` | `gutenberg-normalized.db` | `gutenberg_texts` (delexify) |
| **Dramaturg** | `get_quest_templates` | `classics-compiled.db` | `bible_quest_templates` |
| **Stylist** | `get_quest_templates` | `classics-compiled.db` | `bible_quest_templates` |
| **LiteraryV2Generator** | `searchTemplates` | `literary.db` | `scene_templates` |
| **LiteraryV2Generator** | `getStyleForTemplate` | `literary.db` | `style_patterns` + `template_style_links` |
| **Все агенты** | `getPlayerStyleProfile` | `player-profiles.db` | `player_style_profiles` |

---

## [S3] Базы данных: полная спецификация

### 3.1 `data/gutenberg/classics.db` (промежуточный формат)

**Создаётся**: `import-gutenberg-texts.ts`
**Читается**: `process-gutenberg.ts`

```sql
CREATE TABLE gutenberg (
  etextno       INTEGER PRIMARY KEY,
  book_title    TEXT NOT NULL,
  author        TEXT NOT NULL,
  author_birth  INTEGER,
  author_death  INTEGER,
  subjects      TEXT,      -- JSON array
  bookshelves   TEXT,      -- JSON array
  language      TEXT DEFAULT 'en',
  context       TEXT NOT NULL
);
```

### 3.2 `data/gutenberg/gutenberg-normalized.db` (стили + FTS, V1)

**Создаётся**: Phase A через `GutenbergParser.parse()`
**Читается**: `GutenbergParser.searchStyles()`, `getStyle()`, `getAllStyles()`, `delexify()`

```sql
CREATE TABLE gutenberg_texts (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  author          TEXT NOT NULL,
  language        TEXT DEFAULT 'en',
  text            TEXT NOT NULL,
  source_work_id  TEXT,
  created_at      INTEGER DEFAULT (unixepoch())
);

CREATE TABLE gutenberg_styles (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL,
  examples          TEXT NOT NULL,      -- JSON array
  vocabulary        TEXT NOT NULL,      -- JSON array
  sentence_patterns TEXT NOT NULL,      -- JSON array
  mood_tags         TEXT NOT NULL,      -- JSON array
  narrative_voice   TEXT NOT NULL DEFAULT 'third_person',  -- first_person / third_person / omniscient / free_indirect
  temporal_style    TEXT NOT NULL DEFAULT 'linear',        -- linear / fragmented / retrospective / stream_of_consciousness
  metaphor_density  REAL NOT NULL DEFAULT 0.5,             -- 0=literal (Hemingway), 1=figurative (Melville)
  rhetorical_devices TEXT NOT NULL DEFAULT '[]',           -- JSON: [anaphora, chiasmus, litotes, ...]
  era               TEXT NOT NULL DEFAULT '19th_century',  -- 18th_century / 19th_century / early_20th_century
  source            TEXT,
  source_work_id    TEXT,
  created_at        INTEGER DEFAULT (unixepoch())
);

CREATE VIRTUAL TABLE gutenberg_fts
  USING fts5(title, author, text, content=gutenberg_texts, content_rowid=rowid);
CREATE VIRTUAL TABLE gutenberg_styles_fts
  USING fts5(name, description, vocabulary, content=gutenberg_styles, content_rowid=rowid);
```

### 3.3 `data/literary-compiler/classics-compiled.db` (V1 quest templates)

**Создаётся**: Phase A через `runCompilationPipeline()`
**Читается**: `LiteraryCompilerMCPTools.getQuestTemplates()`, `searchQuestTemplates()`

```sql
CREATE TABLE bible_quest_templates (
  id                    TEXT PRIMARY KEY,
  source_book           TEXT NOT NULL,
  source_chapter        INTEGER NOT NULL,
  archetype             TEXT NOT NULL,
  applicable_positions  TEXT NOT NULL,   -- JSON array
  variables             TEXT NOT NULL,   -- JSON array
  template_text         TEXT NOT NULL,
  mood                  TEXT NOT NULL,
  difficulty            TEXT NOT NULL,
  moral_ambiguity       REAL NOT NULL,
  tags                  TEXT NOT NULL,   -- JSON array
  created_at            INTEGER NOT NULL
);

CREATE VIRTUAL TABLE bible_quest_templates_fts
  USING fts5(template_text, tags, mood, archetype,
             content=bible_quest_templates, content_rowid=rowid);
```

### 3.4 `data/literary-compiler/literary.db` (V2 scene templates)

**Создаётся**: Phase B через V2 pipeline
**Читается**: `LiteraryV2Generator`

```sql
CREATE TABLE scene_templates (
  id                  TEXT PRIMARY KEY,
  source_book         TEXT NOT NULL,
  source_chapter      INTEGER NOT NULL,
  source_chunk_ids    TEXT NOT NULL,     -- JSON array
  archetype_primary   TEXT NOT NULL,
  archetype_secondary TEXT,
  applicable_positions TEXT NOT NULL,    -- JSON array
  variables           TEXT NOT NULL,     -- JSON array
  template_text       TEXT NOT NULL,     -- ≤120 tokens
  beat_sequence       TEXT NOT NULL,     -- JSON array
  mood                TEXT NOT NULL,
  difficulty          TEXT NOT NULL,
  moral_ambiguity     REAL NOT NULL,
  tension_curve       TEXT NOT NULL,     -- JSON array
  tags                TEXT NOT NULL,     -- JSON: scene_type + sensory + motifs
  domain              TEXT NOT NULL,
  scale               REAL NOT NULL,
  embedding_id        TEXT,
  quality_score       REAL NOT NULL,
  use_count           INTEGER DEFAULT 0,
  last_used_at        INTEGER,
  created_at          INTEGER NOT NULL
);

CREATE TABLE style_patterns (
  id                      TEXT PRIMARY KEY,
  source_author_or_era    TEXT NOT NULL,
  source_chunk_ids        TEXT NOT NULL,
  avg_sentence_len        REAL NOT NULL,
  sentence_len_variance   REAL NOT NULL,
  sensory_ratio           REAL NOT NULL,
  register                TEXT NOT NULL,
  pacing                  TEXT NOT NULL,
  tone                    TEXT NOT NULL,
  preferred_constructions TEXT NOT NULL,   -- JSON array
  forbidden_phrases       TEXT NOT NULL,   -- JSON array
  example_snippets        TEXT NOT NULL,   -- JSON array
  narrative_voice         TEXT NOT NULL DEFAULT 'third_person',  -- first_person / third_person / omniscient / free_indirect
  temporal_style          TEXT NOT NULL DEFAULT 'linear',        -- linear / fragmented / retrospective / stream_of_consciousness
  dialogue_style          TEXT NOT NULL DEFAULT 'direct',        -- indirect / direct / reported / free_indirect_speech
  metaphor_density        REAL NOT NULL DEFAULT 0.5,             -- 0=literal, 1=figurative
  sentence_opening_variance REAL NOT NULL DEFAULT 0.5,          -- разнообразие начал предложений
  paragraph_length_avg    REAL NOT NULL DEFAULT 60.0,            -- средняя длина абзаца (words)
  exclamation_ratio       REAL NOT NULL DEFAULT 0.05,            -- частота восклицаний
  rhetorical_devices      TEXT NOT NULL DEFAULT '[]',            -- JSON: [anaphora, chiasmus, litotes, hyperbole, ...]
  era                     TEXT NOT NULL DEFAULT '19th_century',
  literary_period         TEXT NOT NULL DEFAULT 'romanticism',   -- enlightenment / romanticism / victorian / modernism
  quality_score           REAL NOT NULL,
  created_at              INTEGER NOT NULL
);

CREATE TABLE template_style_links (
  template_id TEXT NOT NULL,
  style_id    TEXT NOT NULL,
  weight      REAL NOT NULL,
  PRIMARY KEY (template_id, style_id)
);

CREATE TABLE chunk_index (
  chunk_id      TEXT PRIMARY KEY,
  source_book   TEXT NOT NULL,
  source_chapter INTEGER NOT NULL,
  text          TEXT NOT NULL,
  token_est     INTEGER NOT NULL,
  char_start    INTEGER NOT NULL,
  char_end      INTEGER NOT NULL,
  embedding_ref TEXT,
  dict_hits     INTEGER NOT NULL,
  pre_score     REAL NOT NULL,
  cluster_id    INTEGER,
  scene_type    TEXT,              -- результат AnalyzePass
  tempo         TEXT,              -- результат AnalyzePass (variance-based)
  sensory_tags  TEXT,              -- JSON array, результат AnalyzePass (расширенный)
  narrative_distance REAL,         -- 0.0-1.0, результат AnalyzePass
  temporal_markers   TEXT,         -- JSON array, результат AnalyzePass
  created_at    INTEGER NOT NULL
);
```

### 3.5 `data/player-profiles.db` (общая БД профилей игроков)

**Создаётся**: при первом обращении через `PlayerProfileStore`
**Читается и пишется**: и V1 (Stylist), и V2 (LiteraryV2Generator)

```sql
CREATE TABLE player_style_profiles (
  player_id           TEXT PRIMARY KEY,
  avg_sentence_len    REAL NOT NULL DEFAULT 15.0,
  sensory_bias        REAL NOT NULL DEFAULT 0.5,   -- 0=sight, 1=touch
  register_score      REAL NOT NULL DEFAULT 0.5,   -- 0=casual, 1=formal
  dialogue_ratio      REAL NOT NULL DEFAULT 0.3,
  preferred_motifs    TEXT NOT NULL DEFAULT '[]',   -- JSON array
  anti_patterns       TEXT NOT NULL DEFAULT '[]',   -- JSON array
  sample_snippets     TEXT NOT NULL DEFAULT '[]',   -- JSON array
  confidence          REAL NOT NULL DEFAULT 0.0,
  narrative_distance    REAL NOT NULL DEFAULT 0.5,   -- 0=отстранённый (Толстой), 1=поток сознания (Вулф)
  action_orientation    REAL NOT NULL DEFAULT 0.5,   -- 0=описания, 1=действия
  emotional_expressiveness REAL NOT NULL DEFAULT 0.5, -- 0=подавленные (Чехов), 1=открытые (Диккенс)
  preferred_pace        TEXT NOT NULL DEFAULT 'medium', -- fast / medium / slow
  literary_sophistication REAL NOT NULL DEFAULT 0.5,  -- сложность лексики, метафор, аллюзий
  message_count_used  INTEGER NOT NULL DEFAULT 0,
  last_updated        INTEGER NOT NULL
);
```

**Почему отдельная БД, а не внутри literary.db**: профиль нужен и V1-агенту (Stylist), и V2 (LiteraryV2Generator). Если V2 не запущен, профиль всё равно должен существовать. Общая БД решает эту проблему.

---

## [S4] Общая функция очистки текста

**Файл**: `src/mcp/gutenberg/clean.ts`

```typescript
export function cleanGutenbergText(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n');

  const startMarkers = [
    '*** START OF THE PROJECT GUTENBERG EBOOK',
    '*** START OF THIS PROJECT GUTENBERG EBOOK',
    '***START OF THE PROJECT GUTENBERG EBOOK',
    '*** START OF THE PROJECT GUTENBERG E-TEXT',
  ];
  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) { text = text.slice(text.indexOf('\n', idx) + 1); break; }
  }

  const endMarkers = [
    '*** END OF THE PROJECT GUTENBERG EBOOK',
    '*** END OF THIS PROJECT GUTENBERG EBOOK',
    '***END OF THE PROJECT GUTENBERG EBOOK',
    '*** END OF THE PROJECT GUTENBERG E-TEXT',
  ];
  for (const marker of endMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) { text = text.slice(0, idx); break; }
  }

  text = text.replace(/^.*Project Gutenberg.*$/gm, '');
  text = text.replace(/^.*This etext was prepared.*$/gm, '');
  text = text.replace(/^.*Produced by.*$/gm, '');
  text = text.replace(/^.*Transcriber's [Nn]ote.*$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
```

**Используется в**: `import-gutenberg-texts.ts`, `process-gutenberg.ts`, `download-gutenberg-selected.ts` (замена существующего `stripGutenberg`).

---

## [S5] Скрипт 1: `import-gutenberg-texts.ts`

### Алгоритм

```
main():
  catalog = new GutenbergCatalog("data/mcp/gutenberg-catalog.db")
  classicsDb = new Database("data/gutenberg/classics.db")
  classicsDb.exec("CREATE TABLE IF NOT EXISTS gutenberg (...)")

  files = readdirSync("data/gutenberg/texts/").filter(f => f.endsWith('.txt'))

  for each file in files:
    etextno = parseInt(basename(file, '.txt'))

    // Дедупликация
    existing = classicsDb.query("SELECT etextno FROM gutenberg WHERE etextno = ?").get(etextno)
    if existing: skip

    // Метаданные из каталога
    meta = catalog.getBook(etextno)
    // fallback: если нет в каталоге → author="Unknown", title="Gutenberg #N"

    // Чтение и очистка
    raw = readFileSync("data/gutenberg/texts/" + file, 'utf-8')
    cleaned = cleanGutenbergText(raw)

    // Запись
    classicsDb.query("INSERT INTO gutenberg (...) VALUES (?,?,?,?,?,?,?,?)")
      .run(etextno, meta.title, meta.author, meta.birth_year, meta.death_year,
           JSON.stringify(meta.subjects), JSON.stringify(meta.bookshelves), 'en', cleaned)

    emit({phase:"import", pct:(i+1)/files.length*100, message:"..."})

  classicsDb.close()
  catalog.close()
  emit({phase:"done", pct:100, message:"Imported N books"})
```

### Обработка ошибок

- Файл не читается → skip, emit warning, продолжить
- Книги нет в каталоге → `author="Unknown"`, `title="Gutenberg #N"`, продолжить
- БД заблокирована → retry 3 раза с exponential backoff, затем emit error и exit(1)

---

## [S6] Скрипт 2: `process-gutenberg.ts`

### Общая структура

```
main():
  phase = parseArgs().phase ?? "all"

  if phase in ("v1", "all"): runPhaseA()
  if phase in ("v2", "all"): runPhaseB()
```

---

### Phase A: V1 pipeline (rule-based, без LLM)

#### Шаг A1: GutenbergParser — извлечение стилей

```
runGutenbergParser():
  parser = new GutenbergParser({
    dbPath: "data/gutenberg/classics.db",   // ← ИСПРАВЛЕНО
    dataDir: "data/gutenberg",
    extractStyles: true
  })
  result = await parser.parse()
  // ВНУТРИ parse():
  //   1. Проверяет gutenberg_texts.count → skip если > 0
  //   2. Открывает classics.db как providedDb (readonly)
  //   3. introspectSchema() → находит таблицу 'gutenberg'
  //   4. extractTexts() → читает строки, INSERT в gutenberg_texts
  //   5. extractStyles() → группирует по author, извлекает стили, INSERT в gutenberg_styles
  //   6. buildSearchIndex() → FTS5
  emit({phase:"v1-styles", ...})
```

#### Шаг A2: 4-pass compiler — quest templates

```
runV1Compiler():
  srcDb = new Database("data/gutenberg/classics.db", {readonly: true})
  books = srcDb.query("SELECT * FROM gutenberg ORDER BY author, book_title").all()
  compilerDb = new LiteraryCompilerDB("data/literary-compiler/classics-compiled.db")

  dramaturgic = new DramaturgicPass(compilerDb)  // без LLM — keywords-only
  stylistic   = new StylisticPass()
  emotional   = new EmotionalPass()
  metadata    = new MetadataPass()

  for each book in books:
    // Дедупликация
    sourceBook = book.author + "::" + book.book_title
    count = compilerDb.db.query(
      "SELECT COUNT(*) as n FROM bible_quest_templates WHERE source_book = ?"
    ).get(sourceBook)
    if count.n > 0: skip

    cleaned = cleanGutenbergText(book.context)
    if cleaned.length < 200: skip

    chapters = splitIntoChapters(cleaned, 3000)
    for chapterNum, chapterText of chapters:
      // Pass 1: Dramaturgic (prose mode)
      dramResult = await dramaturgic.parse({
        text: chapterText,
        source_book: sourceBook,
        source_chapter: chapterNum,
        mode: 'prose'               // ← PROSE РЕЖИМ
      })
      // В prose-режиме:
      //   - extractVerses → разбивает на параграфы (нет ## Verse)
      //   - inferArchetype → keywords-only с prose-словарями (см. [S7])
      //   - generateProseTemplate() → новый метод (см. [S7])
      template = dramResult.templates[0]
      if !template: continue

      // Pass 2: Stylistic — сенсорика, тон, темп
      styResult = stylistic.analyze({text: chapterText, source_id: template.id})
      if styResult.patterns[0]?.sensory_markers:
        template.tags = [...template.tags, ...styResult.patterns[0].sensory_markers]

      // Pass 3: Emotional — эмоции, напряжение
      emoResult = emotional.analyze({text: chapterText, source_id: template.id})
      if emoResult.arcs[0]:
        arc = emoResult.arcs[0]
        if arc.tension_level > 0.7: template.difficulty = 'high'
        else if arc.tension_level < 0.3: template.difficulty = 'low'
        if arc.dominant_emotion != 'neutral': template.mood = arc.dominant_emotion

      // Pass 4: Metadata — теги из subjects/bookshelves
      metaResult = metadata.enrich({template, context: chapterText.slice(0, 1000)})
      catalogTags = JSON.parse(book.subjects).concat(JSON.parse(book.bookshelves))
      template.tags = [...template.tags, ...catalogTags.map(t => t.toLowerCase())]

      // Truncate
      if template.template_text.split(/\s+/).length > 500:
        template.template_text = template.template_text.split(/\s+/).slice(0, 500).join(' ') + '...'

      compilerDb.insertTemplate(template)

    emit progress каждые 5 книг

  emit({phase:"v1-compiler", pct:100, message:"..."})
```

#### Функция `runCompilationPipeline()` — сигнатура

Эта функция извлекается из `compile-classics.ts` для переиспользования:

```typescript
function runCompilationPipeline(
  sourceDb: Database,                    // открытая classics.db (readonly)
  outputDb: LiteraryCompilerDB,         // открытая classics-compiled.db
  options: {
    mode: 'bible' | 'prose';            // prose для Гутенберга
    llm?: LLMProvider;                   // undefined = keywords-only
    chapterWordTarget?: number;          // default 3000
    maxTemplateWords?: number;           // default 500
    onProgress?: (pct: number, message: string) => void;
  }
): { templates: number; errors: number }
```

---

### Phase B: V2 pipeline (LLM)

#### Полный алгоритм с транзакциями

```
runV2Pipeline():
  // Проверка LLM
  try:
    llm = new LLMClient({ agentId: 'literary-compiler' })
    // fallback: если агент не определён → LLMClient({ agentId: 'dramaturg' })
  catch:
    emit({phase:"v2", pct:0, message:"LLM unavailable, skipping V2"})
    return

  srcDb = new Database("data/gutenberg/classics.db", {readonly: true})
  books = srcDb.query("SELECT * FROM gutenberg ORDER BY author, book_title").all()
  litDb = new LiteraryCompilerDB("data/literary-compiler/literary.db")

  // Проверка embedding-сервера
  hasEmbeddings = await checkEmbeddingServer()  // ping BGE-M3 на порту 5002

  for each book in books:
    // Дедупликация на уровне книги
    sourceBook = book.author + "::" + book.book_title
    count = litDb.db.query(
      "SELECT COUNT(*) as n FROM scene_templates WHERE source_book = ?"
    ).get(sourceBook)
    if count.n > 0: skip

    cleaned = cleanGutenbergText(book.context)
    if cleaned.length < 200: skip

    // ── ТРАНЗАКЦИЯ НА КНИГУ ──
    litDb.db.exec("BEGIN TRANSACTION")
    try:
      // 1. Chunker (200-400 токенов, overlap 40-80)
      chunks = chunkText(cleaned, {minTokens: 200, maxTokens: 400, overlap: 60})
      for chunk of chunks:
        litDb.insertChunk({chunk_id, source_book: sourceBook, text, token_est, ...})

      // 2. [ОБЪЕДИНЁННЫЙ] AnalyzePass: pre-score + scene_type + tempo + sensory
      //    ОДИН проход по тексту (вместо двух — исправление №1)
      for chunk of chunks:
        analysis = analyzeChunk(chunk.text)  // см. [S8]
        chunk.pre_score    = analysis.pre_score
        chunk.dict_hits    = analysis.dict_hits
        chunk.scene_type   = analysis.scene_type
        chunk.tempo        = analysis.tempo
        chunk.sensory_tags = JSON.stringify(analysis.sensory_tags)
        chunk.narrative_distance = analysis.narrative_distance
        chunk.temporal_markers   = JSON.stringify(analysis.temporal_markers)
        litDb.updateChunkAnalysis(chunk)

      // Фильтр: только чанки с pre_score > 0.3
      candidates = chunks.filter(c => c.pre_score > 0.3)
      if candidates.length == 0: continue  // skip книгу

      // 3. Cluster (с fallback — исправление №7)
      if hasEmbeddings:
        embeddings = await batchEmbed(candidates.map(c => c.text))
        clusters = clusterByCosine(embeddings, threshold=0.7)
      else:
        emit warning: "Embeddings unavailable, using keyword-based clustering"
        clusters = clusterBySceneType(candidates)  // грубая, но работает

      // 4. Выбрать представителей (по одному чанку с max pre_score на кластер)
      representatives = clusters.map(c => c.reduce((a, b) => a.pre_score > b.pre_score ? a : b))

      // 5. LLM extractor
      for rep of representatives:
        llmResult = await llm.generateJson(EXTRACT_TEMPLATE_PROMPT(rep.text))
        if !llmResult: continue  // timeout или не-JSON → skip чанк

        template = llmResult as SceneTemplate
        template.source_book = sourceBook
        template.tags = JSON.stringify([rep.scene_type, ...rep.sensory_tags])
        template.domain = rep.scene_type  // scene_type → domain
        template.quality_score = 0.8  // будет скорректирован Linter

        // 6. Создать StylePattern для каждого template
        styleResult = stylistic.analyze({text: rep.text, source_id: template.id})
        pattern = styleResult.patterns[0]
        stylePattern: StylePattern = {
          id: "style-" + template.id,
          source_author_or_era: book.author,
          avg_sentence_len: pattern.avg_sentence_length,
          pacing: pattern.pacing,
          tone: pattern.tone,
          register: pattern.lexical_richness > 0.6 ? 'formal' : 'casual',
          preferred_constructions: JSON.stringify(pattern.syntax_patterns),
          forbidden_phrases: '[]',
          example_snippets: JSON.stringify([rep.text.slice(0, 200)]),
          narrative_voice: rep.narrative_distance > 0.7 ? 'first_person' : 'third_person',
          temporal_style: rep.temporal_markers?.includes('flashback') ? 'retrospective' : 'linear',
          dialogue_style: (text.match(/"[^"]+"/g)?.length ?? 0) > 3 ? 'direct' : 'indirect',
          metaphor_density: pattern.metaphor_count / Math.max(pattern.sentence_count, 1),
          sentence_opening_variance: pattern.opening_variance ?? 0.5,
          paragraph_length_avg: pattern.avg_paragraph_length ?? 60,
          exclamation_ratio: (text.match(/!/g)?.length ?? 0) / Math.max(pattern.sentence_count, 1),
          rhetorical_devices: JSON.stringify(rep.rhetorical_devices ?? []),
          era: inferEra(book.author_birth, book.author_death),
          literary_period: inferLiteraryPeriod(book.author_birth, book.author_death),
          ...
        }
        litDb.insertStylePattern(stylePattern)

        // 7. Связать template ↔ style
        litDb.insertTemplateStyleLink(template.id, stylePattern.id, 1.0)

        // 8. Linter (литературная мера качества — см. [S13.5])
        template.quality_score = calculateLiteraryQuality(template, rep)
        if template.quality_score < 0.3: continue  // skip

        litDb.insertSceneTemplate(template)

      // ── КОНЕЦ ТРАНЗАКЦИИ ──
      litDb.db.exec("COMMIT")
      emit progress

    catch error:
      litDb.db.exec("ROLLBACK")
      emit warning: "Failed to process ${book.book_title}: ${error}"
      // продолжить со следующей книгой

  srcDb.close()
  litDb.close()
  emit({phase:"v2-done", pct:100, message:"..."})
```

#### Обработка ошибок Phase B

- LLM timeout (30 сек) → skip чанк
- LLM вернул не-JSON → retry 1 раз, затем skip
- LLM ошибка сети → skip книгу (ROLLBACK), продолжить
- БД заблокирована → retry 3 раза с backoff, затем skip книгу
- Embedding-сервер недоступен → fallback на keyword-based clustering (см. [S8])

---

## [S7] Prose Mode — DramaturgicPass

### Режим

Добавить `mode: 'bible' | 'prose'` в `DramaturgicInput`.

### Prose-специфичные архетипные keywords (исправление №4)

Существующий `ARCHETYPE_KEYWORDS` заточен под Библию. Для prose — отдельный словарь с весами:

```typescript
const PROSE_ARCHETYPE_KEYWORDS: Record<string, { strong: string[]; weak: string[] }> = {
  escape: {
    strong: ['flee', 'escape', 'pursuit', 'chase', 'prison', 'captive'],
    weak:   ['river', 'cross', 'border', 'wall', 'gate', 'door', 'window']
  },
  judgment: {
    strong: ['trial', 'verdict', 'court', 'judge', 'jury', 'sentence', 'condemn'],
    weak:   ['decide', 'choice', 'justice', 'guilty', 'innocent']
  },
  political: {
    strong: ['throne', 'king', 'queen', 'crown', 'usurp', 'rebellion', 'treason', 'plot'],
    weak:   ['power', 'rule', 'palace', 'court', 'council']
  },
  rescue: {
    strong: ['save', 'rescue', 'deliver', 'liberate', 'free', 'release'],
    weak:   ['help', 'aid', 'danger', 'threat', 'enemy']
  },
  endurance: {
    strong: ['endure', 'suffer', 'bear', 'survive', 'starve', 'freeze', 'torture'],
    weak:   ['pain', 'hunger', 'cold', 'weary', 'tired', 'exhausted']
  },
  loyalty: {
    strong: ['loyal', 'faithful', 'betray', 'oath', 'allegiance', 'swear'],
    weak:   ['follow', 'serve', 'master', 'lord', 'duty']
  },
  wisdom: {
    strong: ['wisdom', 'wise', 'sage', 'prophecy', 'oracle', 'riddle'],
    weak:   ['learn', 'teach', 'study', 'book', 'knowledge']
  },
  romance: {     // НОВЫЙ — отсутствует в библейском наборе
    strong: ['love', 'marry', 'wedding', 'propose', 'engagement'],
    weak:   ['kiss', 'embrace', 'heart', 'courtship', 'suitor', 'jealous']
  },
  revenge: {     // НОВЫЙ
    strong: ['revenge', 'vengeance', 'avenge', 'retribution', 'vendetta'],
    weak:   ['pay back', 'settle score', 'grudge', 'hatred']
  },
  discovery: {   // НОВЫЙ
    strong: ['discover', 'find', 'uncover', 'reveal', 'secret', 'hidden'],
    weak:   ['search', 'explore', 'map', 'treasure', 'artifact']
  },
  inner_monologue: {   // НОВЫЙ — Достоевский, Вулф, Джойс
    strong: ['conscience', 'torment', 'within me', 'my soul', 'I could not', 'I wondered', 'I felt'],
    weak:   ['thought', 'mind', 'doubt', 'questioned', 'pondered', 'conscious', 'guilt']
  },
  social_microscopy: { // НОВЫЙ — Остин, Бальзак, Флобер
    strong: ['propriety', 'reputation', 'eligible', 'match', 'fortune', 'connection', 'society'],
    weak:   ['bow', 'curtsey', 'glance', 'whisper', 'compliment', 'introduction', 'ball', 'dinner']
  },
  ironic_distance: {   // НОВЫЙ — Свифт, Остин, Теккерей
    strong: ['indeed', 'perhaps', 'it must be admitted', 'one might suppose', 'it is a truth', 'reader'],
    weak:   ['certainly', 'naturally', 'of course', 'surely', 'doubtless', 'evidently']
  },
  polyphony: {         // НОВЫЙ — Достоевский, Вулф
    strong: ['meanwhile', 'on the other hand', 'from where he stood', 'to her mind', 'as for him'],
    weak:   ['but', 'however', 'yet', 'still', 'though', 'although']
  },
  domestic_epic: {     // НОВЫЙ — Диккенс, Голсуорси, Чехов
    strong: ['breakfast', 'kitchen', 'garden', 'household', 'ordinary', 'commonplace', 'everyday'],
    weak:   ['tea', 'dinner', 'parlour', 'drawing room', 'servant', 'maid', 'butler']
  },
  temporal_layering: { // НОВЫЙ — Толстой, Пруст, Диккенс
    strong: ['remembered', 'years ago', 'in those days', 'the old times', 'used to', 'it was then'],
    weak:   ['ago', 'before', 'once', 'former', 'past', 'memory', 'childhood', 'youth']
  },
  rise_fall_rise: {
    strong: ['rise', 'fall', 'ruin', 'bankrupt', 'fortune', 'restore', 'reclaim'],
    weak:   ['success', 'failure', 'wealth', 'poverty']
  },
};
```

**Логика классификации**: если хотя бы 1 strong keyword → архетип. Если только weak → нужно 2+. Если ничего → `'everyday_life'`.

### Prose template text generator

```typescript
private generateProseTemplate(text: string): { template: string; devices: string[] } {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences.length === 0) {
    return {
      template: `The [PROTAGONIST] faces [CONFLICT] at the [LOCATION].`,
      devices: []
    };
  }

  // Выбираем НЕ первые 3 предложения, а самое насыщенное
  // (по density sensory + emotion keywords)
  const scored = sentences.map((s, i) => {
    const lower = s.toLowerCase();
    const sensory = ['saw','heard','felt','smelled','tasted','bright','dark','cold','warm','silence']
      .filter(k => lower.includes(k)).length;
    const emotion = ['fear','love','hate','anger','joy','sad','grief','hope','despair']
      .filter(k => lower.includes(k)).length;
    return { s, i, score: sensory + emotion * 1.5 };
  });
  scored.sort((a, b) => b.score - a.score);

  // Берём топ-2 соседних предложения (для контекста)
  const best = scored[0];
  const neighbors = [best];
  if (best.i > 0) neighbors.unshift({ ...scored.find(x => x.i === best.i - 1)!, s: sentences[best.i - 1] });
  if (best.i < sentences.length - 1) neighbors.push({ ...scored.find(x => x.i === best.i + 1)!, s: sentences[best.i + 1] });

  let template = neighbors.map(n => n.s.trim()).join('. ') + '.';

  // Извлекаем РИТОРИЧЕСКИЕ ПРИЁМЫ ДО делексификации
  const devices: string[] = [];
  if (/(.+),\s*\1/i.test(template)) devices.push('anaphora');
  if (/(.+);\s*(.+);\s*(.+)/.test(template)) devices.push('tricolon');
  if (/not\s+\w+,\s+but\s+\w+/.test(template)) devices.push('antithesis');
  if (/\b(O\s+|alas|ah|how\s+\w+)\b/i.test(template)) devices.push('exclamation');
  if (/\b(reader|you|we)\b/i.test(template.toLowerCase())) devices.push('direct_address');
  if (/, which|, who|, where|, when/.test(template)) devices.push('relative_clause_cascade');

  // Делексифицируем: заменяем имена, но СОХРАНЯЕМ синтаксический каркас
  template = this.delexifier.delexify(template);

  if (!/\[.*?\]/.test(template)) {
    template = `The [PROTAGONIST] enters the [LOCATION], ` +
               `where [CONFLICT] unfolds as [ALLY] reveals [SECRET].`;
  }

  return { template, devices };
}

// Литературные стили-шаблоны (few-shot для LLM)
const LITERARY_STYLE_TEMPLATES = {
  dickens_long_sentence: {
    description: "Длинные предложения с вложенными clause-ами, авторские отступления",
    pattern: "SUBJECT + VERB + [RELATIVE_CLAUSE + [PREPOSITIONAL_PHRASE + [ADJECTIVE_CLAUSE]]] + [AUTHORIAL_ASIDE]",
    example: "The gentleman, who had been sitting in the corner of the room with the air of one who had seen much of the world and liked it none the better for the seeing, rose and approached the window."
  },
  hemingway_short: {
    description: "Короткие declarative предложения, минимум прилагательных",
    pattern: "SUBJECT + VERB + OBJECT. SUBJECT + VERB. SUBJECT + VERB + OBJECT.",
    example: "He drank the coffee. It was good. He looked out the window."
  },
  austen_irony: {
    description: "Косвенная речь, ирония через несоответствие",
    pattern: "[GENERAL_CLAIM] + [SPECIFIC_CONTRADICTION]",
    example: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife."
  },
  dostoevsky_stream: {
    description: "Поток сознания, внутренний монолог с восклицаниями",
    pattern: "[INTERNAL_QUESTION] + [SELF_ANSWER] + [DOUBT] + [EXCLAMATION]",
    example: "What was I thinking? Had I gone mad? No, no — I was perfectly sane, more sane than any of them!"
  },
  tolstoy_panorama: {
    description: "Переключение масштаба: от общего к частному",
    pattern: "[WIDE_SHOT] + [ZOOM_IN] + [CHARACTER_DETAIL] + [PHILOSOPHICAL_ASIDE]",
    example: "The sun had not yet risen, but the sky was already lightening in the east. In the village, a cock crowed. Prince Andrei, who had not slept, stood at the window and thought about the meaning of it all."
  }
};
```

**Prose-переменные**: `PROTAGONIST, ANTAGONIST, ALLY, MENTOR, LOCATION, CONFLICT, SECRET, CHOICE, CONSEQUENCE, RESOLUTION`

**Prose-позиции** (из DEFAULT_POSITIONS, но расширено):
```typescript
const PROSE_DEFAULT_POSITIONS = {
  escape:     ['leader', 'follower', 'prisoner'],
  judgment:   ['judge', 'lawyer', 'accused'],
  political:  ['leader', 'advisor', 'spy', 'rebel'],
  rescue:     ['leader', 'savior', 'captive'],
  endurance:  ['survivor', 'witness'],
  loyalty:    ['follower', 'knight', 'vassal'],
  wisdom:     ['sage', 'student', 'seeker'],
  romance:    ['lover', 'suitor', 'rival'],
  revenge:    ['avenger', 'victim', 'accomplice'],
  discovery:  ['explorer', 'scholar', 'guide'],
  rise_fall_rise: ['hero', 'merchant', 'noble', 'outcast'],
  inner_monologue:    ['thinker', 'tormented_soul', 'doubter'],
  social_microscopy:  ['lady', 'gentleman', 'suitor', 'chaperone', 'matchmaker'],
  ironic_distance:    ['narrator', 'observer', 'satirist'],
  polyphony:          ['narrator', 'character_a', 'character_b', 'chorus'],
  domestic_epic:      ['householder', 'servant', 'child', 'neighbour'],
  temporal_layering:  ['elder', 'youth', 'ancestor', 'witness'],
};
```

---

## [S8] AnalyzePass — объединённый pre-score + scene classifier

**Исправление №1**: вместо двух проходов (Pre-score + Scene Classifier) — один проход `analyzeChunk()`.

### Сигнатура

```typescript
interface ChunkAnalysis {
  pre_score: number;       // 0.0-1.0
  dict_hits: number;       // количество сматченных словарей
  scene_type: string;      // 'battle_scene' | 'love_scene' | ...
  tempo: string;           // 'fast' | 'medium' | 'slow' (variance-based)
  sensory_tags: string[];  // ['sight','sound','touch','smell','taste','kinaesthetic','temperature','chiaroscuro','silence','temporal']
  narrative_distance: number; // 0.0=отстранённый, 1.0=поток сознания
  temporal_markers: string[]; // ['flashback','flashforward','simultaneity','timelessness']
}
```

### Алгоритм

```
function analyzeChunk(text: string): ChunkAnalysis {
  lower = text.toLowerCase()
  words = lower.split(/\s+/)

  // ── 1. Scene type scoring ──
  typeScores = {}
  for (type, keywords) of SCENE_TYPE_KEYWORDS:
    matches = keywords.filter(kw => lower.includes(kw))
    typeScores[type] = matches.length

  scene_type = argmax(typeScores)
  if all scores == 0:
    quotedRatio = (text.match(/"[^"]+"/g)?.length ?? 0) / sentences.length
    firstPersonRatio = (text.match(/\b(I|me|my|mine|myself)\b/gi)?.length ?? 0) / words.length
    scene_type = quotedRatio > 0.4 ? 'dialogue_scene'
               : firstPersonRatio > 0.5 ? 'introspection'
               : 'travel_scene'

  // ── 2. Sensory tags ──
  sensory_tags = []
  for (sense, keywords) of SENSORY_KEYWORDS:
    if keywords.some(kw => lower.includes(kw)): sensory_tags.push(sense)

  // ── 3. Tempo (variance-based) ──
  sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  sentLens = sentences.map(s => s.split(/\s+/).length)
  avgWords = words.length / sentences.length
  variance = sentLens.reduce((sum, len) => sum + (len - avgWords) ** 2, 0) / sentLens.length
  stdDev = Math.sqrt(variance)
  // Толстой: длинные предложения, но variance высокий → fast (чередование)
  // Хемингуэй: короткие, variance низкий → slow (монотонно-тяжёлый)
  tempo = stdDev > 12 ? 'fast' : stdDev < 5 ? 'slow' : 'medium'

  // ── 3b. Narrative Distance ──
  innerMarkers = text.match(/\b(I|me|my|mine|myself|thought|felt|wondered|realized|remembered)\b/gi)?.length ?? 0
  outerMarkers = text.match(/\b(he|she|they|him|her|them|his|theirs|looked|walked|said|stood)\b/gi)?.length ?? 0
  totalPronouns = innerMarkers + outerMarkers
  narrative_distance = totalPronouns > 0 ? innerMarkers / totalPronouns : 0.5

  // ── 3c. Temporal Markers ──
  temporal_markers: string[] = []
  if (/\b(remembered|years ago|in those days|used to|it was then|once upon)\b/i.test(text))
    temporal_markers.push('flashback')
  if (/\b(would|someday|one day|in the future|when he would)\b/i.test(text))
    temporal_markers.push('flashforward')
  if (/\b(now|at this moment|just then|at that instant|simultaneously)\b/i.test(text))
    temporal_markers.push('simultaneity')
  if (/\b(always|never|eternal|forever|for all time)\b/i.test(text))
    temporal_markers.push('timelessness')

  // ── 4. Pre-score (интересность чанка) ──
  // У чанка высокий score если:
  //   - много scene_type совпадений (насыщенный действием)
  //   - есть dialogue (динамика)
  //   - есть conflict keywords (драма)
  //   - есть хотя бы 2 sensory tags (богатый язык)
  hasConflict = /battle|fight|argue|conflict|dispute|struggle|war|attack/.test(lower)
  hasDialogue = /"[^"]{10,}"/.test(text)
  hasEmotion  = /fear|love|hate|anger|joy|sad|cry|tear|laugh|shout/.test(lower)

  baseScore = Math.min(typeScores[scene_type] / 10, 0.5)
  baseScore += hasConflict ? 0.15 : 0
  baseScore += hasDialogue ? 0.15 : 0
  baseScore += hasEmotion  ? 0.10 : 0
  baseScore += sensory_tags.length >= 2 ? 0.10 : 0

  pre_score = Math.min(baseScore, 1.0)
  dict_hits = Object.values(typeScores).filter(s => s > 0).length

  return { pre_score, dict_hits, scene_type, tempo, sensory_tags, narrative_distance, temporal_markers }
}
```

### Keyword-словари для типов сцен

```typescript
const SCENE_TYPE_KEYWORDS: Record<string, string[]> = {
  battle_scene: [
    'battle', 'fight', 'sword', 'blood', 'strike', 'army', 'clash', 'war',
    'attack', 'defend', 'slash', 'arrow', 'shield', 'spear', 'charge',
    'combat', 'warrior', 'soldier', 'regiment', 'cannon', 'gunfire',
    'duel', 'wound', 'stab', 'parry', 'thrust', 'shot', 'bullet'
  ],
  love_scene: [
    'love', 'kiss', 'embrace', 'heart', 'passion', 'desire', 'tender',
    'gentle', 'caress', 'whisper', 'gaze', 'blush', 'romance', 'darling',
    'beloved', 'lover', 'sweetheart', 'affection', 'longing', 'yearning',
    'fell in love', 'proposal', 'wedding', 'marry'
  ],
  nature_description: [
    'forest', 'mountain', 'river', 'tree', 'sun', 'sky', 'cloud', 'wind',
    'flower', 'grass', 'snow', 'rain', 'sea', 'field', 'ocean', 'lake',
    'valley', 'hill', 'stream', 'meadow', 'garden', 'horizon', 'dawn',
    'dusk', 'twilight', 'moonlight', 'stars', 'thunder', 'lightning',
    'landscape', 'scenery', 'wilderness', 'woods', 'grove'
  ],
  dialogue_scene: [
    'said', 'asked', 'replied', 'answered', 'spoke', 'told', 'whispered',
    'shouted', 'conversation', 'discuss', 'explain', 'argue',
    'insist', 'protest', 'agree', 'disagree', 'interrupt', 'mutter',
    'murmur', 'exclaim', 'declare', 'announce'
  ],
  introspection: [
    'thought', 'wondered', 'remembered', 'realized', 'felt', 'knew',
    'understood', 'decided', 'considered', 'reflection', 'memory',
    'recall', 'conscious', 'mind', 'soul', 'conscience',
    'doubt', 'questioned', 'pondered', 'contemplated', 'meditate'
  ],
  travel_scene: [
    'walk', 'ride', 'journey', 'road', 'path', 'travel', 'move', 'cross',
    'ford', 'climb', 'descend', 'march', 'leave', 'arrive', 'depart',
    'wander', 'roam', 'trek', 'expedition', 'voyage', 'caravan',
    'horseback', 'carriage', 'coach', 'mile', 'league', 'distance'
  ],
  ritual_scene: [
    'ceremony', 'ritual', 'prayer', 'crown', 'throne', 'kneel', 'bow',
    'oath', 'vow', 'knight', 'altar', 'sacrifice', 'blessing', 'coronation',
    'wedding', 'funeral', 'procession', 'incense', 'chant', 'hymn',
    'solemn', 'sacred', 'holy', 'ordain', 'anoint', 'baptize'
  ],
  death_scene: [
    'death', 'die', 'dead', 'body', 'funeral', 'grave', 'mourn', 'grief',
    'weep', 'last breath', 'farewell', 'loss', 'departed', 'passed away',
    'coffin', 'burial', 'tomb', 'mourner', 'widow', 'orphan',
    'lament', 'final', 'last words', 'dying'
  ],
  chase_scene: [
    'run', 'chase', 'flee', 'escape', 'hide', 'pursue', 'catch', 'grab',
    'snatch', 'stealth', 'sneak', 'shadow', 'dash', 'sprint', 'race',
    'dodge', 'duck', 'pursuit', 'hunted', 'track', 'follow', 'trail'
  ]
};
```

### Сенсорные словари (общие для AnalyzePass и StylisticPass)

```typescript
const SENSORY_KEYWORDS: Record<string, string[]> = {
  sight: ['saw', 'looked', 'gazed', 'watched', 'visible', 'bright', 'dark',
          'light', 'shadow', 'colour', 'color', 'red', 'blue', 'green',
          'golden', 'silver', 'glimpse', 'stared', 'observed', 'view', 'scene'],
  sound: ['heard', 'listened', 'voice', 'sound', 'whisper', 'shout', 'cry',
          'laugh', 'silence', 'thunder', 'wind', 'echo', 'noise',
          'roar', 'rustle', 'creak', 'bang', 'footstep', 'music', 'song'],
  touch: ['felt', 'touched', 'cold', 'warm', 'hot', 'rough', 'smooth', 'soft',
          'hard', 'wet', 'dry', 'heat', 'chill', 'pressure', 'grip', 'stroke',
          'prick', 'sting', 'numb', 'tingle'],
  smell: ['smelled', 'scent', 'fragrance', 'stench', 'aroma', 'perfume',
          'smoke', 'dust', 'odor', 'reek', 'stink', 'whiff', 'fresh', 'musty',
          'sweet', 'foul', 'pungent'],
  taste: ['tasted', 'sweet', 'bitter', 'sour', 'salty', 'delicious', 'bland',
          'flavor', 'flavour', 'tang', 'spice', 'honey', 'wine'],
  // Расширенная сенсорика для классической прозы:
  kinaesthetic: ['heavy', 'light', 'weight', 'burden', 'float', 'sink', 'fall',
                 'rise', 'fly', 'drag', 'lift', 'carry', 'weary', 'exhausted',
                 'strength', 'weakness', 'faint', 'stagger', 'tremble'],
  temperature: ['warmth', 'cold', 'chill', 'frost', 'fire', 'flame', 'ember',
                'frozen', 'burning', 'fever', 'icy', 'scorching', 'tepid',
                'blaze', 'shiver', 'sweat'],
  chiaroscuro: ['shadow', 'light', 'darkness', 'gloom', 'brilliance', 'dim',
                'glow', 'shade', 'twilight', 'dawn', 'dusk', 'candle', 'torch',
                'moonlight', 'starlight', 'lantern', 'murky', 'radiant'],
  silence: ['silence', 'silent', 'quiet', 'hush', 'still', 'mute', 'speechless',
            'whisper', 'murmur', 'faintly', 'barely', 'nothing', 'emptiness',
            'absence', 'deafening'],
  temporal: ['moment', 'instant', 'eternity', 'forever', 'never', 'always',
             'suddenly', 'gradually', 'slowly', 'quickly', 'endless', 'brief',
             'fleeting', 'lingering', 'pause', 'hesitation', 'delay']
};
```

### Fallback-кластеризация без embeddings (исправление №7)

```typescript
function clusterBySceneType(chunks: Chunk[]): Chunk[][] {
  const groups = new Map<string, Chunk[]>();
  for (const chunk of chunks) {
    const key = chunk.scene_type;  // грубая группировка
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(chunk);
  }
  return [...groups.values()];
}
```

---

## [S9] Player Style Profile — автообновление и использование

### Хранилище

**Файл**: `src/lib/player-profile-store.ts`

```typescript
class PlayerProfileStore {
  private db: Database;

  constructor(dbPath = 'data/player-profiles.db') {
    this.db = new Database(dbPath);
    this.db.exec("CREATE TABLE IF NOT EXISTS player_style_profiles (...)");
  }

  getProfile(playerId: string): PlayerStyleProfile | null;
  upsertProfile(profile: PlayerStyleProfile): void;
}
```

### Автообновление при ответе игрока

Вызывается в `Stylist.process()` и `LiteraryV2Generator.generate()` после генерации прозы:

```typescript
async function updatePlayerProfile(playerMessage: string, playerId: string) {
  const store = new PlayerProfileStore();
  let profile = store.getProfile(playerId) ?? createDefaultProfile(playerId);

  const styleResult = stylisticPass.analyze({
    text: playerMessage,
    source_id: `player:${playerId}`,
  });
  const pattern = styleResult.patterns[0];
  if (!pattern) return;

  const n = profile.message_count_used + 1;

  // rolling average для метрик
  profile.avg_sentence_len =
    (profile.avg_sentence_len * profile.message_count_used + pattern.avg_sentence_length) / n;

  profile.dialogue_ratio =
    (profile.dialogue_ratio * profile.message_count_used +
     (pattern.syntax_patterns.includes('dialogue') ? 1 : 0)) / n;

  // sensory_bias: сдвигаем в сторону доминирующего чувства
  if (pattern.sensory_markers.some(m => ['touch','smell'].includes(m))) {
    profile.sensory_bias = (profile.sensory_bias * profile.message_count_used + 1.0) / n;
  } else if (pattern.sensory_markers.includes('sight')) {
    profile.sensory_bias = (profile.sensory_bias * profile.message_count_used + 0.0) / n;
  }

  // register_score
  profile.register_score =
    (profile.register_score * profile.message_count_used + pattern.lexical_richness) / n;

  // Литературные метрики
  profile.narrative_distance =
    (profile.narrative_distance * profile.message_count_used +
     (pattern.syntax_patterns.includes('inner_monologue') ? 0.9 : 0.2)) / n;

  profile.action_orientation =
    (profile.action_orientation * profile.message_count_used +
     (pattern.syntax_patterns.includes('action_verb') ? 0.8 : 0.3)) / n;

  profile.emotional_expressiveness =
    (profile.emotional_expressiveness * profile.message_count_used +
     (pattern.tone !== 'neutral' ? 0.8 : 0.3)) / n;

  profile.preferred_pace = pattern.pacing ?? profile.preferred_pace;

  profile.literary_sophistication =
    (profile.literary_sophistication * profile.message_count_used +
     (pattern.lexical_richness > 0.7 ? 0.9 : pattern.lexical_richness > 0.4 ? 0.5 : 0.2)) / n;

  // motifs
  for (const tag of pattern.sensory_markers) {
    if (!profile.preferred_motifs.includes(tag)) profile.preferred_motifs.push(tag);
  }
  if (pattern.tone !== 'neutral' && !profile.preferred_motifs.includes(pattern.tone)) {
    profile.preferred_motifs.push(pattern.tone);
  }

  // snippets
  profile.sample_snippets.push(playerMessage.substring(0, 200));
  if (profile.sample_snippets.length > 5) profile.sample_snippets.shift();

  // confidence
  profile.confidence = Math.min(0.95, n / (n + 10));
  profile.message_count_used = n;
  profile.last_updated = Math.floor(Date.now() / 1000);

  store.upsertProfile(profile);
}
```

### Использование при retrieval

```typescript
async function retrieveWithProfile(keys: RetrievalKeys, playerId: string) {
  const store = new PlayerProfileStore();
  const profile = store.getProfile(playerId);
  let templates = db.searchTemplates(keys);

  if (profile && profile.confidence > 0.3) {
    templates = templates.filter(t => {
      const tags: string[] = JSON.parse(t.tags);
      // Исключить антипаттерны
      if (profile.anti_patterns.some(ap => tags.includes(ap))) return false;
      // Бонус за preferred_motifs
      t._profileScore = profile.preferred_motifs.filter(m => tags.includes(m)).length * 0.15;
      return true;
    });

    // Фильтр по domain если известен игровой контекст
    if (keys.domain) {
      templates = templates.filter(t => t.domain === keys.domain);
    }

    // Сортировка: quality_score + profile_score
    templates.sort((a, b) =>
      (b._profileScore + b.quality_score) - (a._profileScore + a.quality_score)
    );
  }

  return templates[0];  // top-1
}
```

---

## [S10] MCP Endpoint

`POST /mcp/gutenberg/process`

```json
// Request
{ "phase": "all" }  // "v1" | "v2" | "all" (default: "all")

// Response
{
  "importJob": "uuid",
  "v1Job": "uuid | null",
  "v2Job": "uuid | null"
}
```

**Реализация в `src/routes/mcp.ts`**:

```typescript
mcpRouter.post("/gutenberg/process", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const phase = body.phase ?? "all";

  const importResult = runScriptWithJob([
    "bun", "run", "scripts/import-gutenberg-texts.ts"
  ]);

  let v1Result = null, v2Result = null;

  if (phase === "v1" || phase === "all") {
    v1Result = runScriptWithJob([
      "bun", "run", "scripts/process-gutenberg.ts", "--phase", "v1"
    ]);
  }

  if (phase === "v2" || phase === "all") {
    v2Result = runScriptWithJob([
      "bun", "run", "scripts/process-gutenberg.ts", "--phase", "v2"
    ]);
  }

  return c.json({
    importJob: importResult.jobId,
    v1Job: v1Result?.jobId ?? null,
    v2Job: v2Result?.jobId ?? null,
  });
});
```

---

## [S11] Исправляемые баги и архитектурные улучшения

| # | Проблема | Где | Решение | Секция |
|---|----------|-----|---------|--------|
| 1 | Двойное сканирование (Pre-score + Scene Classifier) | Phase B | Объединить в `AnalyzePass` — один проход | [S8] |
| 2 | PlayerStyleProfile в V2-БД, нужен и V1 | `schema.ts` | Вынести в `data/player-profiles.db` | [S3.5] [S9] |
| 3 | Нет стратегии при частичном сбое Phase B | Phase B | Транзакции на уровне книги: BEGIN/COMMIT/ROLLBACK | [S6] |
| 4 | DramaturgicPass keywords — библейские, не prose | `dramaturgic-pass.ts` | Prose-специфичные словари с strong/weak весами + новые архетипы | [S7] |
| 5 | `runCompilationPipeline()` не определён | `compile-classics.ts` | Чёткая сигнатура с параметрами | [S6] |
| 6 | — (отменено пользователем) | — | — | — |
| 7 | BGE-M3 fallback отсутствует | Phase B Cluster | Fallback-кластеризация по scene_type без embeddings | [S8] |
| 8 | DramaturgicPass Bible-only | `dramaturgic-pass.ts:132` | Prose mode с `generateProseTemplate()` | [S7] |
| 9 | Три разных stripGutenberg | 3 файла | Общая `cleanGutenbergText()` в `clean.ts` | [S4] |
| 10 | Метаданные каталога теряются | `classics.db` | Расширенная схема + инжекция тегов в MetadataPass | [S3.1] [S6] |
| 11 | GutenbergParser circular source | `parser.ts:69` | `config.dbPath = 'classics.db'` | [S6] |
| 12 | compile-classics.ts hardcoded | `compile-classics.ts:21` | `runCompilationPipeline()` с параметрами | [S6] |
| 13 | V2 templates без scene_type тегов | Phase B | AnalyzePass заполняет scene_type, tempo, sensory | [S8] |
| 14 | 59 книг — стартер, не рабочий объём | `texts/*.txt` | Корпус-стратегия: целевая матрица + expand-corpus.ts | [S14] |
| 15 | Rule-based стиль не ловит иронию/поток сознания | Phase A | V1.5: LLM-обогащённый стилистический анализ (1 запрос/книга) | [S15] |
| 16 | Нет нарративной структуры (арки, мотивы) | Pipeline | narrative_arcs + thematic_motifs таблицы + NARRATIVE_STRUCTURE_PROMPT | [S16] |
| 17 | Quality score — невалидированная эвристика | [S13.5] | Трёхуровневая система L0/L1/L2 + калибровка + threshold | [S17] |

---

## [S12] Что НЕ делаем

- Не трогаем Bible pipeline (отдельный поток)
- Не переписываем Chunker/Cluster с нуля (добавляем только AnalyzePass)
- Не меняем промпты агентов
- Не включаем LLM cache (запрещено правилами проекта)
- Не добавляем автотриггер после download (пользователь хочет ручное управление)
- Не трогаем существующие FTS5 индексы (добавляем только новые поля)

### Вспомогательные функции (добавить в `src/mcp/gutenberg/helpers.ts`)

```typescript
function inferEra(birthYear?: number, deathYear?: number): string {
  const mid = ((birthYear ?? 1800) + (deathYear ?? 1900)) / 2;
  if (mid < 1790) return '18th_century';
  if (mid < 1900) return '19th_century';
  return 'early_20th_century';
}

function inferLiteraryPeriod(birthYear?: number, deathYear?: number): string {
  const mid = ((birthYear ?? 1800) + (deathYear ?? 1900)) / 2;
  if (mid < 1790) return 'enlightenment';
  if (mid < 1860) return 'romanticism';
  if (mid < 1900) return 'victorian';
  return 'modernism';
}
```

---

## [S13] Литературная архитектура: кросс-ссылки, континуум, эпохи

### 13.1 Таблица литературных влияний

```sql
CREATE TABLE literary_influences (
  id              TEXT PRIMARY KEY,
  source_author   TEXT NOT NULL,      -- кто испытал влияние
  influenced_by   TEXT NOT NULL,      -- на кого ссылается
  influence_type  TEXT NOT NULL,      -- 'parody' / 'homage' / 'adaptation' / 'contrast' / 'evolution'
  description     TEXT NOT NULL,      -- текстовое описание связи
  examples        TEXT NOT NULL,      -- JSON array: [{source_chunk_id, target_chunk_id, similarity}]
  created_at      INTEGER NOT NULL
);
```

**Примеры связей:**
- Остин → Готический роман: `parody` (Northanger Abbey пародирует готику)
- Диккенс → Шекспир: `homage` (цитаты, структура персонажей)
- Толстой → Руссо: `adaptation` (идеи просвещения в русском контексте)
- Достоевский → Гоголь: `evolution` (от «Шинели» к «Преступлению и наказанию»)

### 13.2 Стилистический континуум

Стили не изолированы — они образуют **континуум**. Добавить в `style_patterns`:

```sql
CREATE TABLE style_continuum (
  style_id_a    TEXT NOT NULL,
  style_id_b    TEXT NOT NULL,
  distance      REAL NOT NULL,  -- 0.0=идентичны, 1.0=полные противоположности
  transition    TEXT NOT NULL,  -- 'smooth' / 'jarring' / 'impossible'
  PRIMARY KEY (style_id_a, style_id_b)
);
```

**Континуум по осям:**

| Ось | Левый полюс | Правый полюс |
|-----|-------------|--------------|
| Плотность | Хемингуэй (1-2 уровня) | Диккенс (4-5 уровней) |
| Дистанция | Остин (отстранённая ирония) | Достоевский (поток сознания) |
| Сенсорика | Чехов (минимум) | Мелвилл (максимум) |
| Темп | Толстой (эпический) | По (стаккато) |
| Мораль | Свифт (сатира) | Диккенс (сентиментализм) |

**Использование:** если игрок пишет как Чехов (distance=0.3, density=0.2), а сцена требует Диккенса (distance=0.8, density=0.9), pipeline берёт **средневзвешенное** и генерирует текст на полпути.

### 13.3 Эпохальный контекст

59 книг — это три эпохи с разными нормами:

| Эпоха | Период | Нормы | Авторы в базе |
|-------|--------|-------|---------------|
| Просвещение | 1660-1790 | Длинные предложения, авторские отступления, морализаторство | Дефо, Свифт, Ричардсон |
| Романтизм/Викторианская | 1790-1900 | Контрасты, готика, социальная критика | Остин, Диккенс, Бронте, Твен |
| Модернизм | 1900-1940 | Поток сознания, фрагментация, субъективность | Вулф, Джойс |

**Функция определения эпохи:**

```typescript
function inferEra(birthYear?: number, deathYear?: number): string {
  const mid = ((birthYear ?? 1800) + (deathYear ?? 1900)) / 2;
  if (mid < 1790) return '18th_century';
  if (mid < 1900) return '19th_century';
  return 'early_20th_century';
}

function inferLiteraryPeriod(birthYear?: number, deathYear?: number): string {
  const mid = ((birthYear ?? 1800) + (deathYear ?? 1900)) / 2;
  if (mid < 1790) return 'enlightenment';
  if (mid < 1860) return 'romanticism';
  if (mid < 1900) return 'victorian';
  return 'modernism';
}
```

### 13.4 V2 LLM-промпт: контекст и стилистический анализ

**Исправление:** передавать LLM **3 чанка** вместо одного:

```typescript
const EXTRACT_TEMPLATE_PROMPT = (prevChunk: string | null, currentChunk: string, nextChunk: string | null) => `
You are a literary analyst extracting narrative templates from classical prose.

CONTEXT:
${prevChunk ? `PREVIOUS: "${prevChunk.slice(0, 300)}"` : '(beginning of chapter)'}
CURRENT: "${currentChunk}"
${nextChunk ? `NEXT: "${nextChunk.slice(0, 300)}"` : '(end of chapter)'}

Extract:
1. template_text: A reusable narrative template (≤120 words) with [VARIABLE] placeholders
2. archetype_primary: The dominant archetype (escape/judgment/political/rescue/endurance/loyalty/romance/revenge/discovery/inner_monologue/social_microscopy/ironic_distance)
3. rhetorical_devices: List of rhetorical devices found (anaphora/chiasmus/litotes/antithesis/tricolon/direct_address)
4. narrative_voice: first_person / third_person / omniscient / free_indirect
5. tempo: fast / medium / slow
6. sensory_dominance: Which sense is most prominent (sight/sound/touch/smell/taste/kinaesthetic)

Return JSON only.
`;
```

### 13.5 Quality Score: литературная мера

Заменить хардкод `0.8` на формулу:

```typescript
function calculateLiteraryQuality(template: SceneTemplate, chunk: ChunkAnalysis): number {
  let score = 0.5; // базовый

  // Конкретность: переменные vs. детали
  const variableCount = (template.template_text.match(/\[.*?\]/g) ?? []).length;
  const wordCount = template.template_text.split(/\s+/).length;
  const concreteness = 1 - (variableCount / Math.max(wordCount, 1));
  score += concreteness * 0.15;

  // Атмосферность: sensory tags
  score += Math.min(chunk.sensory_tags.length / 5, 0.15);

  // Драматический потенциал: конфликт + выбор
  if (template.archetype_secondary) score += 0.05; // сложный архетип
  if (template.variables.includes('CHOICE')) score += 0.05;
  if (template.variables.includes('CONFLICT')) score += 0.05;

  // Риторические приёмы
  const devices = JSON.parse(template.tags).filter((t: string) =>
    ['anaphora','chiasmus','litotes','antithesis','tricolon'].includes(t));
  score += Math.min(devices.length * 0.03, 0.1);

  // Штрафы
  if (wordCount > 120) score -= 0.15;
  if (hasMoralizing(template.template_text)) score -= 0.25;

  return Math.max(0, Math.min(1, score));
}
```

---

## [S14] Корпус-стратегия: от 59 до 250+

### Проблема

59 книг — достаточный стартер для smoke test, но для разнообразия стилей и эпох нужно 200-300. Без критической массы агенты будут генерировать в узком стилистическом коридоре.

### Целевая матрица покрытия

| Эпоха | Период | Целевой минимум | Сейчас (оценка) | GAP |
|-------|--------|-----------------|-----------------|-----|
| Просвещение | 1660-1790 | 30 книг | ~5 | 25 |
| Романтизм | 1790-1860 | 60 книг | ~15 | 45 |
| Викторианская | 1860-1900 | 80 книг | ~25 | 55 |
| Модернизм | 1900-1940 | 50 книг | ~10 | 40 |
| Русская классика | 1820-1910 | 30 книг | ~4 | 26 |
| **Итого** | | **250** | **~59** | **~191** |

### Приоритетный список авторов

**Первая волна (максимальное стилистическое разнообразие):**

| Автор | Почему | Книги (Gutenberg ID) |
|-------|--------|---------------------|
| Dickens | Длинные предложения, авторские отступления, социальная панорама | 98 (Tale of Two Cities), 1400 (Great Expectations), 766 (David Copperfield) |
| Tolstoy | Эпический масштаб, переключение масштаба, философские отступления | 2600 (War and Peace — EN), 1399 (Anna Karenina — EN) |
| Dostoevsky | Поток сознания, полифония, внутренний монолог | 2641 (Crime and Punishment — EN), 3603 (Brothers Karamazov — EN) |
| Austen | Ирония, free indirect speech, социальная микроскопия | 1342 (Pride and Prejudice), 121 (Sense and Sensibility) |
| Hemingway | Минимализм, короткие предложения, подтекст | 67979 (The Sun Also Rises), 57644 (A Farewell to Arms) |

**Вторая волна (расширение жанров):**

| Автор | Стилистическая ниша |
|-------|---------------------|
| Brontë (Charlotte, Emily) | Готика, страсть, пейзаж как эмоция |
| George Eliot | Психологический реализм, моральные дилеммы |
| Thomas Hardy | Фатализм, пейзаж, трагизм |
| Flaubert | Точность слова, свободное косвенное повествование |
| Victor Hugo | Эпический размах, социальный пафос |
| Balzac | Социальная анатомия, детализация |
| Poe | Стаккато, хоррор, unreliable narrator |
| Melville | Аллегория, длинные предложения, философия |
| Wharton | Социальные условности, ирония |
| Henry James | Психологическая глубина, сложный синтаксис |

**Третья волна (русская классика через переводы или отдельный pipeline):**

| Автор | Стилистическая ниша |
|-------|---------------------|
| Chekhov | Минимализм, недосказанность, подтекст |
| Gogol | Сатира, гротеск, абсурд |
| Turgenev | Лиризм, пейзаж, меланхолия |
| Pushkin | Ясность, ритм, элегантность |

### Скрипт `scripts/expand-corpus.ts`

```typescript
interface ExpandOptions {
  authors: string[];           // имена авторов для поиска
  targetPerAuthor?: number;    // default: 3
  minTextSize?: number;        // default: 10000 (10KB)
  languages?: string[];        // default: ['en']
  dryRun?: boolean;            // default: true (безопасный по умолчанию)
  manifestPath?: string;       // default: 'data/gutenberg/corpus-manifest.json'
}

interface CorpusManifest {
  version: 1;
  lastUpdated: string;
  books: Record<string, {
    etextno: number;
    title: string;
    author: string;
    era: string;
    downloadedAt: string;
    textHash: string;          // SHA-256 первых 1000 символов
    status: 'downloaded' | 'processed_v1' | 'processed_v2' | 'error';
  }>;
}

// Алгоритм:
// 1. Загрузить manifest (или создать пустой)
// 2. Для каждого автора:
//    a. Запрос к Gutendex: GET /books?author=<name>&languages=en&sort=downloads
//    b. Отфильтровать: text_size > minTextSize, есть author, есть subjects
//    c. Dedup: проверить manifest и texts/*.txt
//    d. Если dryRun → вывести список, не качать
//    e. Иначе → download + обновить manifest
// 3. Запустить import-gutenberg-texts.ts для новых файлов
// 4. Обновить manifest: status = 'downloaded'
```

### corpus-manifest.json

```json
{
  "version": 1,
  "lastUpdated": "2026-08-09T12:00:00Z",
  "books": {
    "98": {
      "etextno": 98,
      "title": "A Tale of Two Cities",
      "author": "Charles Dickens",
      "era": "victorian",
      "downloadedAt": "2026-08-09T10:00:00Z",
      "textHash": "a1b2c3...",
      "status": "downloaded"
    }
  }
}
```

---

## [S15] V1.5: LLM-обогащённый стилистический анализ

### Проблема

V1 rule-based анализ (keyword matching) хорошо определяет scene_type, tempo, sensory_tags, но плохо ловит:
- **Иронию** (Остин, Свифт) — нужен контекст, не отдельные слова
- **Поток сознания** (Вулф, Джойс) — нужен анализ синтаксической фрагментации
- **Полифонию** (Достоевский) — нужен анализ множественных голосов
- **Free indirect speech** — смешение narrator/character голосов

### Архитектура: V1 → V1.5 → V2

```
V1 (0 LLM):    keyword matching → scene_type, tempo, sensory_tags
V1.5 (1 LLM):  deep style analysis → narrative_voice, irony, stream, polyphony
V2 (N LLM):    template extraction → scene_templates + style_patterns
```

V1.5 — промежуточный слой. Один LLM-запрос на книгу. Не блокирует pipeline при недоступности LLM.

### STYLE_ANALYSIS_PROMPT

```typescript
const STYLE_ANALYSIS_PROMPT = (title: string, author: string, excerpts: string[]) => `
Analyze the literary style of "${title}" by ${author}.

Excerpts from different parts of the book:
${excerpts.map((e, i) => `--- Excerpt ${i + 1} ---\n"${e}"`).join('\n\n')}

Analyze and return JSON:
{
  "narrative_voice": "first_person" | "third_person" | "omniscient" | "free_indirect",
  "irony_level": 0.0-1.0,
  "irony_type": "verbal" | "situational" | "dramatic" | "none",
  "stream_of_consciousness": 0.0-1.0,
  "polyphony": 0.0-1.0,
  "register": "elevated" | "plain" | "earthy" | "mixed",
  "dominant_constructions": ["list", "of", "3-5", "patterns"],
  "forbidden_patterns": ["constructions", "that", "break", "style"],
  "literary_devices": [
    {"device": "anaphora", "example": "..."},
    {"device": "chiasmus", "example": "..."}
  ],
  "sentence_opening_variance": 0.0-1.0,
  "paragraph_length_avg": <number>,
  "exclamation_ratio": 0.0-1.0,
  "sensory_dominance": "sight" | "sound" | "touch" | "smell" | "taste" | "balanced"
}

Return JSON only. No markdown, no explanation.
`;
```

### Алгоритм интеграции в Phase A

```
runV1_5_StyleAnalysis():
  srcDb = new Database("data/gutenberg/classics.db", {readonly: true})
  books = srcDb.query("SELECT * FROM gutenberg ORDER BY author").all()
  litDb = new LiteraryCompilerDB("data/literary-compiler/literary.db")

  llm = new LLMClient({ agentId: 'literary-compiler' })
  // fallback: если агент не определён → LLMClient({ agentId: 'dramaturg' })

  for each book in books:
    // Дедупликация: skip если style_patterns уже есть для этого автора
    sourceBook = book.author + "::" + book.book_title
    existing = litDb.db.query(
      "SELECT COUNT(*) as n FROM style_patterns WHERE source_author_or_era = ?"
    ).get(book.author)
    if existing.n > 0: skip

    cleaned = cleanGutenbergText(book.context)
    if cleaned.length < 1000: skip

    // 3 случайных excerpt по 2000 символов
    excerpts = sampleExcerpts(cleaned, count=3, length=2000)

    try:
      result = await llm.generateJson(
        STYLE_ANALYSIS_PROMPT(book.book_title, book.author, excerpts)
      )
      if !result: continue

      // Создать StylePattern на основе LLM + V1 данных
      v1Analysis = analyzeChunk(excerpts[0])  // V1 для tempo, sensory

      pattern: StylePattern = {
        id: "style-llm-" + book.etextno,
        source_author_or_era: book.author,
        source_chunk_ids: '[]',
        avg_sentence_len: estimateSentenceLen(cleaned),
        sentence_len_variance: estimateSentenceVariance(cleaned),
        sensory_ratio: JSON.stringify({dominance: result.sensory_dominance}),
        register: result.register,
        pacing: tempoFromV1(v1Analysis.tempo),
        tone: inferTone(result),
        preferred_constructions: JSON.stringify(result.dominant_constructions),
        forbidden_phrases: JSON.stringify(result.forbidden_patterns),
        example_snippets: JSON.stringify(excerpts.map(e => e.slice(0, 200))),
        narrative_voice: result.narrative_voice,
        temporal_style: result.stream_of_consciousness > 0.5 ? 'stream_of_consciousness' : 'linear',
        dialogue_style: inferDialogueStyle(result),
        metaphor_density: estimateMetaphorDensity(result),
        sentence_opening_variance: result.sentence_opening_variance ?? 0.5,
        paragraph_length_avg: result.paragraph_length_avg ?? 60,
        exclamation_ratio: result.exclamation_ratio ?? 0.05,
        rhetorical_devices: JSON.stringify(
          result.literary_devices?.map(d => d.device) ?? []
        ),
        era: inferEra(book.author_birth, book.author_death),
        literary_period: inferLiteraryPeriod(book.author_birth, book.author_death),
        quality_score: 0.8, // будет скорректирован [S17]
        created_at: Math.floor(Date.now() / 1000)
      }

      litDb.insertStylePattern(pattern)
      emit progress

    catch error:
      emit warning: "V1.5 failed for ${book.book_title}: ${error}"
      // НЕ блокирует pipeline — V1 данные остаются

  srcDb.close()
  litDb.close()
```

### Fallback

Если LLM недоступен:
- V1.5 пропускается entirely
- V1 rule-based данные (scene_type, tempo, sensory) используются как есть
- Style patterns создаются на основе V1 данных (грубее, но работает)

### Стоимость

| Корпус | LLM-запросов | ~Токенов | ~Время |
|--------|-------------|----------|--------|
| 59 книг | 59 | ~60K | 2-3 мин |
| 250 книг | 250 | ~250K | 10-15 мин |

---

## [S16] Нарративная структура: арки, мотивы, трансформации

### Проблема

Pipeline извлекает шаблоны сцен (scene_templates) и стили (style_patterns), но не:
- **Сюжетные арки** — как напряжение растёт и падает по ходу книги
- **Арки персонажей** — как герои меняются
- **Тематические мотивы** — повторяющиеся образы и символы

Для Dramaturg это критично: он выбирает narrative patterns, а в базе только плоские шаблоны сцен без контекста «где в истории мы находимся».

### Новые таблицы

#### `narrative_arcs`

```sql
CREATE TABLE narrative_arcs (
  id                TEXT PRIMARY KEY,
  source_book       TEXT NOT NULL,
  arc_type          TEXT NOT NULL,  -- 'character_arc' / 'plot_arc' / 'thematic_arc'
  archetype         TEXT NOT NULL,  -- 'rise_fall' / 'fall_rise' / 'steady_rise' / 'steady_fall' / 'cyclical' / 'flat'
  tension_points    TEXT NOT NULL,  -- JSON array: [{position: 0.0-1.0, intensity: 0.0-1.0, label: string}]
  transformation    TEXT,           -- для character_arc: описание трансформации
  thematic_motifs   TEXT NOT NULL,  -- JSON array: повторяющиеся образы/мотивы
  moral_vector      TEXT,           -- 'redemptive' / 'corruptive' / 'ambiguous' / 'amoral'
  scale             TEXT NOT NULL,  -- 'personal' / 'interpersonal' / 'societal' / 'cosmic'
  quality_score     REAL NOT NULL,
  created_at        INTEGER NOT NULL
);

CREATE VIRTUAL TABLE narrative_arcs_fts
  USING fts5(source_book, transformation, thematic_motifs, archetype,
             content=narrative_arcs, content_rowid=rowid);
```

#### `thematic_motifs`

```sql
CREATE TABLE thematic_motifs (
  id              TEXT PRIMARY KEY,
  source_book     TEXT NOT NULL,
  motif_name      TEXT NOT NULL,  -- 'light_vs_dark' / 'journey_home' / 'betrayal_trust' / ...
  occurrences     TEXT NOT NULL,  -- JSON array: [{chunk_id, context: string}]
  symbolic_layer  TEXT,           -- что мотив символизирует
  evolution       TEXT,           -- как мотив меняется по ходу текста
  created_at      INTEGER NOT NULL
);

CREATE VIRTUAL TABLE thematic_motifs_fts
  USING fts5(motif_name, symbolic_layer, evolution,
             content=thematic_motifs, content_rowid=rowid);
```

### NARRATIVE_STRUCTURE_PROMPT

```typescript
const NARRATIVE_STRUCTURE_PROMPT = (
  title: string,
  author: string,
  sampledExcerpts: { chapter: number; text: string }[]
) => `
Analyze the narrative structure of "${title}" by ${author}.

Chapter excerpts (sampled from throughout the book):
${sampledExcerpts.map(e => `--- Chapter ${e.chapter} ---\n"${e.text}"`).join('\n\n')}

Extract:
{
  "plot_arc": {
    "archetype": "rise_fall" | "fall_rise" | "steady_rise" | "steady_fall" | "cyclical" | "flat",
    "tension_points": [
      {"position": 0.0-1.0, "intensity": 0.0-1.0, "label": "string"}
    ]
  },
  "character_arcs": [
    {
      "character_name": "string",
      "start_state": "string",
      "end_state": "string",
      "transformation": "string",
      "archetype": "rise_fall" | "fall_rise" | "redemption" | "corruption" | "growth" | "stagnation"
    }
  ],
  "thematic_motifs": [
    {
      "name": "string",
      "symbolic_layer": "string",
      "evolution": "string"
    }
  ],
  "moral_vector": "redemptive" | "corruptive" | "ambiguous" | "amoral",
  "scale": "personal" | "interpersonal" | "societal" | "cosmic"
}

Return JSON only. No markdown.
`;
```

### Интеграция в Phase B (V2 pipeline)

После template extraction для каждой книги:

```
// Внутри транзакции на книгу, ПОСЛЕ template extraction:

// 9. Narrative Structure Extraction
sampledExcerpts = sampleForNarrativeStructure(chunks, count=5)
// Берём первый чанк, последний, и 3 равномерно распределённых

narrativeResult = await llm.generateJson(
  NARRATIVE_STRUCTURE_PROMPT(book.book_title, book.author, sampledExcerpts)
)

if narrativeResult:
  // Plot arc
  litDb.insertNarrativeArc({
    id: "arc-plot-" + book.etextno,
    source_book: sourceBook,
    arc_type: 'plot_arc',
    archetype: narrativeResult.plot_arc.archetype,
    tension_points: JSON.stringify(narrativeResult.plot_arc.tension_points),
    thematic_motifs: JSON.stringify(
      narrativeResult.thematic_motifs.map(m => m.name)
    ),
    moral_vector: narrativeResult.moral_vector,
    scale: narrativeResult.scale,
    quality_score: 0.7,
    created_at: Math.floor(Date.now() / 1000)
  })

  // Character arcs (максимум 3 главных персонажа)
  for char of narrativeResult.character_arcs.slice(0, 3):
    litDb.insertNarrativeArc({
      id: "arc-char-" + book.etextno + "-" + char.character_name.toLowerCase().replace(/\s+/g, '-'),
      source_book: sourceBook,
      arc_type: 'character_arc',
      archetype: char.archetype,
      tension_points: '[]',
      transformation: char.transformation,
      thematic_motifs: '[]',
      moral_vector: null,
      scale: 'personal',
      quality_score: 0.7,
      created_at: Math.floor(Date.now() / 1000)
    })

  // Thematic motifs
  for motif of narrativeResult.thematic_motifs:
    litDb.insertThematicMotif({
      id: "motif-" + book.etextno + "-" + motif.name.toLowerCase().replace(/\s+/g, '-'),
      source_book: sourceBook,
      motif_name: motif.name,
      occurrences: '[]',
      symbolic_layer: motif.symbolic_layer,
      evolution: motif.evolution,
      created_at: Math.floor(Date.now() / 1000)
    })
```

### Использование в агентах

| Агент | MCP Tool | Что получает |
|-------|----------|-------------|
| **Dramaturg** | `get_narrative_arcs(archetype, scale)` | Сюжетные арки для выбора narrative pattern |
| **Dramaturg** | `get_tension_points(book, position)` | Где в истории находимся → интенсивность сцены |
| **Stylist** | `get_thematic_motifs(book)` | Мотивы как дополнительный контекст для промпта |
| **LiteraryV2Generator** | `get_narrative_arcs(source_book)` | tension_points → beat_sequence для scene_template |

### Стоимость

1 LLM-запрос на книгу (внутри существующей транзакции Phase B). Не увеличивает общее количество запросов — добавляется как шаг 9 в существующий pipeline.

---

## [S17] Quality Score: валидация и калибровка

### Проблема

`calculateLiteraryQuality()` в [S13.5] — эвристика без валидации. При масштабировании на 250+ книг нужна уверенность, что score коррелирует с реальным литературным качеством.

### Трёхуровневая система оценки

| Уровень | Метод | Стоимость | Точность | Когда |
|---------|-------|-----------|----------|-------|
| **L0: Heuristic** | `calculateLiteraryQuality()` из [S13.5] | 0 LLM | Грубо | Каждый шаблон, при extraction |
| **L1: LLM Calibration** | 1 LLM-запрос на 10 случайных шаблонов | 1 LLM на книгу | Средне | После Phase B, для валидации |
| **L2: Human Review** | Ручная проверка топ-5 и bottom-5 | 0 LLM | Высоко | После обработки корпуса |

### L1: LLM Calibration Prompt

```typescript
const QUALITY_CALIBRATION_PROMPT = (templates: {id: string; text: string}[]) => `
Rate these 10 narrative templates extracted from classical literature.

For each, score 0.0-1.0 on:
- literary_quality: Is this genuinely good prose, or generic filler?
- specificity: Could this describe ANY story, or only this specific one?
- reusability: Would this template produce interesting scenes when filled with variables?

Templates:
${templates.map((t, i) => `${i + 1}. [${t.id}] "${t.text}"`).join('\n')}

Return JSON array:
[
  {
    "id": "template_id",
    "literary_quality": 0.0-1.0,
    "specificity": 0.0-1.0,
    "reusability": 0.0-1.0,
    "composite_score": 0.0-1.0,
    "notes": "brief explanation"
  }
]

Return JSON only.
`;
```

### Алгоритм калибровки

```
calibrateQualityScores():
  books = getAllProcessedBooks()

  for each book:
    templates = getTemplatesForBook(book)

    // L0: уже посчитан при extraction
    l0Scores = templates.map(t => t.quality_score)

    // L1: LLM calibration на 10 случайных
    sample = randomSample(templates, 10)
    l1Result = await llm.generateJson(
      QUALITY_CALIBRATION_PROMPT(sample.map(t => ({id: t.id, text: t.template_text})))
    )

    if !l1Result: continue

    // Сопоставить L0 и L1
    l1Map = new Map(l1Result.map(r => [r.id, r.composite_score]))
    paired = sample.filter(t => l1Map.has(t.id)).map(t => ({
      l0: t.quality_score,
      l1: l1Map.get(t.id)!
    }))

    // Корреляция Пирсона
    correlation = pearsonCorrelation(paired.map(p => p.l0), paired.map(p => p.l1))

    // Средние
    l0Avg = mean(l0Scores)
    l1Avg = mean(l1Result.map(r => r.composite_score))

    // Выбросы: |L0 - L1| > 0.3
    outliers = paired.filter(p => Math.abs(p.l0 - p.l1) > 0.3)

    // Записать калибровку
    insertQualityCalibration({
      source_book: book.author + "::" + book.book_title,
      l0_avg: l0Avg,
      l1_avg: l1Avg,
      correlation: correlation,
      template_count: templates.length,
      outlier_count: outliers.length,
      calibrated_at: Math.floor(Date.now() / 1000)
    })

    // Корректировка L0: если корреляция < 0.5, сдвинуть веса
    if correlation < 0.5:
      adjustL0Weights(book, paired)
```

### Таблица калибровки

```sql
CREATE TABLE quality_calibration (
  source_book     TEXT NOT NULL,
  l0_avg          REAL NOT NULL,  -- средний heuristic score
  l1_avg          REAL NOT NULL,  -- средний LLM score
  correlation     REAL NOT NULL,  -- Pearson L0↔L1
  template_count  INTEGER NOT NULL,
  outlier_count   INTEGER NOT NULL, -- шаблоны с |L0-L1| > 0.3
  calibrated_at   INTEGER NOT NULL,
  PRIMARY KEY (source_book)
);
```

### Автоматический threshold

После обработки всего корпуса:

```
computeQualityThreshold():
  allScores = db.query("SELECT quality_score FROM scene_templates").all()
  scores = allScores.map(r => r.quality_score).sort((a, b) => a - b)

  q1 = percentile(scores, 25)
  q3 = percentile(scores, 75)
  iqr = q3 - q1

  threshold = q1 - 1.5 * iqr
  threshold = Math.max(threshold, 0.2)  // не ниже 0.2

  // Пометить шаблоны ниже threshold
  db.exec(`
    UPDATE scene_templates
    SET quality_flag = CASE
      WHEN quality_score < ? THEN 'low'
      WHEN quality_score > ? THEN 'high'
      ELSE 'normal'
    END
  `, [threshold, q3 + 1.5 * iqr])

  return { threshold, q1, q3, iqr, total: scores.length }
```

### MCP endpoints для review

```
GET /mcp/gutenberg/quality-report
→ {
    total_templates: number,
    avg_score: number,
    median_score: number,
    distribution: {low: number, normal: number, high: number},
    by_book: [{source_book, avg_score, template_count}],
    calibration_summary: [{source_book, correlation, outlier_count}]
  }

GET /mcp/gutenberg/quality-outliers?threshold=0.3
→ [{
    template_id: string,
    source_book: string,
    l0_score: number,
    l1_score: number,
    template_text: string,
    reason: string
  }]
```

### Feedback loop

1. **После первого прогона** (59 книг): проверить `quality-report`
2. **Если correlation < 0.5 для >30% книг**: скорректировать веса L0
3. **После расширения до 250**: пересчитать threshold
4. **L2 (human review)**: выборочно проверить 20 шаблонов из топ-5 и bottom-5 книг
