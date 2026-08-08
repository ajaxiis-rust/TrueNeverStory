# TrueNeverStory — MCP UI: Fixes & Polish

**Дата:** 2026-08-08
**Цель:** Исправить 14 падающих тестов, восполнить пробелы i18n, подключить Economics, реализовать progress bar, добавить переводы на 7 языков.

**Принципы (из AGENTS.md):**
- Не меняем публичные сигнатуры processInput / processInputStream / setSession
- Не трогаем промпты агентов
- Plan + TDD: перед кодом пишем падающий тест
- Один логический шаг = один PR/коммит
- Verify: запускаем тесты и цитируем результат

---

## Этап 1: Fix 14 failing MCP tests (P0)

### Проблема
`src/routes/mcp.test.ts` ожидает HTTP 404, когда DB не найдена. Роуты в `src/routes/mcp.ts` возвращают HTTP 200 с `{error: "...", exists: false}`. 14 тестов красные.

### Решение
Два подхода (на выбор):
- **A. Обновить тесты** — `expect(res.status).toBe(404)` → `200` + проверять `body.error` + `body.exists === false`. Проще, не ломает UI.
- **B. Вернуть 404 в роутах** — изменить все `c.json({error: ...}, 200)` → `c.json({error: ...}, 404)`. Может сломать UI-обработку ошибок.

**Рекомендация: A** — тесты отражают реальное поведение, UI получает 200 и показывает toast с ошибкой.

### Целевые локации (14 строк)
Файл `src/routes/mcp.test.ts`:
- Строки 108-113: 9 GET-роутов в цикле — `expect(res.status).toBe(404)` → `200`
- Строки 126-132: 4 POST-роута в цикле — `expect(res.status).toBe(404)` → `200`
- Строка 140-144: `GET /mcp/stream/:jobId` — `expect(res.status).toBe(404)` → `200`

### Файлы
- `src/routes/mcp.test.ts` — 14 правок

### Верификация
```bash
bun test src/routes/mcp.test.ts   # должно быть 37 pass, 0 fail
bun test                           # 1113 pass, 4 skip, 0 fail
```

### Риски
Нулевой. Меняем только тесты.

---

## Этап 2: Catalog tab i18n (P1)

### Проблема
Catalog tab (самый сложный UI — поиск, фильтры, пагинация, чекбоксы) имеет все строки на английском, жёстко вшитые в HTML/JS без `data-i18n` атрибутов. ~20 строк.

### Решение
1. Добавить `mcp_catalog` ключи в `I18N.en` и `I18N.ru` объекты внутри `public/mcp.html`
2. Заменить хардкод-строки на `data-i18n` / `data-i18n-placeholder` атрибуты
3. Добавить `mcp_catalog` запись в `ui-translation-seeder.ts` для будущей миграции на БД

### Целевые строки в `public/mcp.html`
- "Build Catalog" → `data-i18n="mcp.catalog.build"`
- "Search & Filter" → `data-i18n="mcp.catalog.filter"`
- "Select All" → `data-i18n="mcp.catalog.selectAll"`
- "Deselect All" → `data-i18n="mcp.catalog.deselectAll"`
- "Download Selected" → `data-i18n="mcp.catalog.downloadSelected"`
- "Authors (comma-separated): Mark Twain, Jack London..." → placeholder
- "Topic (optional): adventure, romance..." → placeholder
- "Popular 500" → `data-i18n="mcp.catalog.popular500"`
- "Author" → placeholder
- "Year from" → placeholder
- "Year to" → placeholder
- "Min downloads" → placeholder
- "Apply" → `data-i18n="mcp.catalog.apply"`
- "Clear" → `data-i18n="mcp.catalog.clear"`
- "Prev" → `data-i18n="mcp.catalog.prev"`
- "Next" → `data-i18n="mcp.catalog.next"`
- "No books in catalog" → `data-i18n="mcp.catalog.empty"`
- "Page X of Y" → динамически через `t()`
- Названия колонок: "Title", "Author", "Year", "Downloads" → i18n

### Файлы
- `public/mcp.html` — добавить ~35 i18n-ключей en + ru, заменить хардкод на атрибуты

### Верификация
```bash
bun test src/routes/mcp.test.ts   # без регрессий
# Ручная: открыть MCP Console → Catalog tab → переключить язык
```

### Риски
Низкий. Только UI-строки, логика не меняется.

---

## Этап 3: Progress bar для длительных операций (P1)

### Проблема
Spec предусматривал visual progress bar (`.progress-bar` CSS), но реализованы только System log + toast. Пользователь не видит прогресс визуально при bootstrap, compact, download.

### Решение
1. Добавить CSS-классы для progress bar в `<style>` блока `mcp.html`
2. Добавить `<div class="progress-bar-container">` в DOM, скрытый по умолчанию
3. Модифицировать `trackProgress(jobId)` — обновлять progress bar вместо/в дополнение к логам
4. При завершении — скрывать bar, показывать toast

### CSS (добавить в mcp.html)
```css
.progress-bar-container{display:none;margin:12px 0}
.progress-bar-container.active{display:block}
.progress-bar-track{background:var(--surface);border-radius:var(--radius-pill);height:6px;overflow:hidden}
.progress-bar-fill{background:var(--accent);height:100%;border-radius:var(--radius-pill);transition:width 340ms var(--ease-out);width:0%}
.progress-bar-label{font-size:11px;color:var(--text-disabled);margin-top:4px}
```

### JS (модифицировать trackProgress)
```js
function trackProgress(jobId, onDone) {
  const bar = document.getElementById('progress-bar');
  const fill = document.getElementById('progress-fill');
  const label = document.getElementById('progress-label');
  bar.classList.add('active');
  
  const es = new EventSource('/mcp/stream/' + jobId);
  es.onmessage = (e) => {
    const d = JSON.parse(e.data);
    fill.style.width = d.progress + '%';
    label.textContent = d.message;
    if (d.status === 'done') { es.close(); bar.classList.remove('active'); onDone?.(d.result); toast('Done', 'success'); }
    if (d.status === 'error') { es.close(); bar.classList.remove('active'); toast(d.message, 'error'); }
  };
  es.onerror = () => { es.close(); bar.classList.remove('active'); toast('Connection lost', 'error'); };
}
```

### Файлы
- `public/mcp.html` — +30 строк CSS, +5 строк HTML, +15 строк JS

### Верификация
```bash
# Ручная: запустить Bible Bootstrap → видеть progress bar → дождаться Done
```

### Риски
Низкий. Чистый UI, не затрагивает бэкенд.

---

## Этап 4: Подключить Economics к EconomicService (P2)

### Проблема
`GET /mcp/economics/phase` и `GET /mcp/economics/dilemma` возвращают хардкод `"requires EconomicService initialization"`. Сервис существует и работает, но MCP-роуты его не используют.

### Решение
1. В `src/routes/mcp.ts` — импортировать `EconomicService` и `EconomicCycles`
2. Создать lazy singleton (как для `mcpRouter`)
3. `GET /mcp/economics/phase` → `EconomicService.getCurrentPhase()` → возвращать `{phase, message, phase_index, ...}`
4. `GET /mcp/economics/dilemma` → `EconomicCycles.generateDilemma()` → возвращать `{dilemma, factions, tax, ...}`
5. Добавить `worldId` параметр (из query или хардкод `"default"`)

### Файлы
- `src/routes/mcp.ts` — +15 строк импорта и lazy init, замена тел 2 обработчиков
- `src/routes/mcp.test.ts` — добавить 2 теста, что возвращается не хардкод

### Верификация
```bash
bun test src/routes/mcp.test.ts
bun test src/mcp/tools/economic.test.ts
```

### Риски
Низкий. Сервис изолирован, работает в тестах.

---

## Этап 5: 5 stub-эндпоинтов → реальные скрипты (P2)

### Проблема
5 POST-эндпоинтов возвращают `"not yet implemented"`.

### Решение
| Эндпоинт | Что должно делать | Как реализовать |
|----------|------------------|-----------------|
| `POST /mcp/wikipedia/download` | Скачать Wikipedia dump | `runScriptWithJob(["bun", "run", "scripts/download-wikipedia.ts"])` |
| `POST /mcp/wikipedia/convert` | Конвертировать в SQLite | `runScriptWithJob(["bun", "run", "scripts/convert-wikipedia.ts"])` |
| `POST /mcp/wikipedia/compact` | Уже работает! Возвращает `runScriptWithJob(...)` | ✅ Не трогать |
| `POST /mcp/literary/compile` | Скомпилировать классику | `runScriptWithJob(["bun", "run", "scripts/compile-literary.ts"])` |
| `POST /mcp/rebuild-index` | Перестроить FTS5 индексы | Встроенная логика — `sqliteStore.rebuildFTS()` или `VACUUM` |
| `POST /mcp/clean-orphans` | Удалить orphan записи | SQL: удалить embeddings без entity_uid |

### Файлы
- `src/routes/mcp.ts` — замена 4 тел-заглушек
- `scripts/download-wikipedia.ts` — новый (если нет)
- `scripts/convert-wikipedia.ts` — новый (если нет)
- `scripts/compile-literary.ts` — новый (если нет)

### Верификация
```bash
bun test src/routes/mcp.test.ts
```

### Риски
Средний. Нужны реальные скрипты/имплементации. Если скриптов нет — отложить, оставить stub с честным сообщением.

---

## Этап 6: de/fr/es/ja/zh переводы для MCP (P3)

### Проблема
7 языков в `ui-translation-seeder.ts`, но MCP использует только en/ru словари.

### Решение
1. Скопировать `I18N.en` → `I18N.de`, перевести вручную
2. Аналогично для fr, es, ja, zh
3. Добавить `mcp` page в `ui-translation-seeder.ts` если ещё нет
4. В будущем — перевести MCP на загрузку переводов из API (`/i18n/mcp/:lang`)

### Файлы
- `public/mcp.html` — +5 языковых блоков (~45 ключей × 5 = 225 строк)

### Верификация
```bash
# Ручная: открыть MCP Console → переключить язык → проверить все табы
```

### Риски
Низкий. Только UI-строки.

---

## Сводная таблица

| # | Этап | Приоритет | Файлов | Время |
|---|------|-----------|--------|-------|
| 1 | Fix 14 MCP tests | P0 | 1 | 5 мин |
| 2 | Catalog tab i18n | P1 | 1 | 30 мин |
| 3 | Progress bar | P1 | 1 | 1 час |
| 4 | Economics → EconomicService | P2 | 2 | 1 час |
| 5 | 5 stub endpoints | P2 | 4 | 2 часа |
| 6 | de/fr/es/ja/zh переводы | P3 | 1 | 1 час |

**Итого:** ~10 файлов, ~6 часов.

---

## Правила выполнения

1. Перед каждым этапом: `bun test` — убедиться, что текущее состояние зелёное
2. Вносим изменения в файлы согласно этапу
3. После изменений: `bun test` + цитируем результат
4. Если тесты красные — фиксим, не переходим к следующему этапу
5. Один логический шаг = один PR/коммит
6. Не трогаем промпты агентов и публичные сигнатуры движка
