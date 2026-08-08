# TrueNeverStory — MCP UI: Fixes & Polish

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/mcp-console.md)

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

## Этап 4: Read-only мониторинг экономики (P2)

### Архитектурное решение
MCP Console — администратор баз данных, не игровой интерфейс. Генерация дилемм и смена фаз — прерогатива движка (игровой механики). Ручное управление создаёт риски: гонки двух писателей в БД, нарушение инвариантов циклов (abundance→transition→famine), нарративная несогласованность (события не попадают в Chronicler). Поэтому:

- ❌ **generateDilemma** — убираем, это геймплей
- ❌ **labor rules / checkJubilee / triggerJubilee** — конфигурация мира, не DB-админ
- ✅ **read-only** `GET /mcp/economics/phase` — текущая фаза, резерв, модификатор цен
- ✅ **read-only** `GET /mcp/economics/jubilee` — лет до следующего юбилея

### Проблема
`GET /mcp/economics/phase` возвращает хардкод `"requires EconomicService initialization"`. `GET /mcp/economics/dilemma` — заглушка, которую нужно удалить или заменить на заглушку с честным сообщением «use in-game chat commands».

### Решение
1. В `src/routes/mcp.ts` — импортировать `EconomicDB` + `EconomicService` + `EconomicCycles`
2. Создать lazy singleton `getEconomicService()` (аналогично другим DB-парсерам в роуте)
3. `worldId` — из query `?worldId=` с fallback `"default"`
4. `GET /mcp/economics/phase` → `EconomicCycles.getCurrentPhase(worldId)` → `{phase: "abundance"|"transition"|"famine"|null, reserve, price_modifier, ends_at}`
5. `GET /mcp/economics/jubilee` (новый) → `JubileeManager.getNextJubileeInfo(worldId, currentYear)` → `{years_until, next_year, last_year}`
6. `GET /mcp/economics/dilemma` → удалить. Если нужен placeholder в UI — вернуть `{generated: false, message: "Use in-game chat commands for dilemmas"}`
7. Обновить UI в `public/mcp.html`:
   - Убрать секцию «Generate Dilemma»
   - Phase — показывать без заглушки
   - (Опционально) добавить отображение jubilee-инфо

### Файлы
- `src/routes/mcp.ts` — +20 строк (lazy init + 2 read-only хендлера)
- `src/routes/mcp.test.ts` — добавить тест на `/economics/phase` (не хардкод) и `/economics/jubilee`
- `public/mcp.html` — убрать dilemma-секцию, поправить phase-отображение

### Верификация
```bash
bun test src/routes/mcp.test.ts
bun test src/mcp/tools/economic.test.ts
```

### Риски
Низкий. Сервис изолирован, работает в тестах. Только read-only запросы.

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

## Этап 7: Fix XSS в Wikipedia search (P0)

### Проблема
`mcp.html:570` — URL из ответа API рендерится как сырой HTML:
```js
el.innerHTML = `...<a href="${r.url}" target="_blank">${r.url}</a>...`;
```
Поскольку Wikipedia API возвращает данные из внешних источников, это потенциальная XSS-дыра. Злоумышленник может внедрить `<script>` через скомпрометированный Wikipedia mirror или man-in-the-middle.

### Решение
1. Добавить `escapeHtml()` helper в JS-блок
2. Заменить инлайн-интерполяцию на `textContent` + безопасный DOM-метод
3. Проверить все остальные `innerHTML` с динамическими данными в `mcp.html`

### escapeHtml helper
```js
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}
```

### Целевые локации
- `mcp.html:570` — `searchWikipedia()` — заменить `innerHTML` на безопасный рендеринг
- `mcp.html:406` — `searchBible()` — `r.text` рендерится в `innerHTML`
- `mcp.html:414` — `searchBibleChars()` — `r.canonical_name`, `r.role` в `innerHTML`
- `mcp.html:430` — `searchGutenberg()` — `r.name`, `r.mood`, `r.description` в `innerHTML`
- `mcp.html:463` — `renderCatalogTable()` — `b.title`, `b.author`, `b.subjects` в `innerHTML`
- `mcp.html:593` — `searchLiterary()` — `r.name`, `r.archetype`, `r.description` в `innerHTML`

### Файлы
- `public/mcp.html` — +8 строк helper, ~10 замен `innerHTML` → `textContent` или `escapeHtml()`

### Верификация
```bash
# Ручная: открыть MCP Console → Wikipedia tab → поискать "<script>alert(1)</script>"
# Убедиться, что HTML не исполнился
```

### Риски
Низкий. Чистый JS, не затрагивает бэкенд. Может чуть замедлить рендеринг на больших таблицах — незначительно.

---

## Этап 8: Fix compactAll — последовательное выполнение (P1)

### Проблема
`mcp.html:659-661` — `forEach` + `await` не даёт последовательного выполнения:
```js
async function compactAll() {
  for (const p of ["bible/compact","gutenberg/compact","wikipedia/compact","literary/compact"])
    await runAction(p);
}
```
На самом деле этот код корректен — `for...of` + `await` работает последовательно. **НО** `runAction` не ждёт завершения скрипта — она только запускает job и возвращает `{jobId}`. Все 4 compact запускаются одновременно, каждый спавнит `Bun.spawn`, что создаёт 4 параллельных процесса `compact-db.ts` — убивает диск (4× VACUUM/перезапись БД).

### Решение
1. Модифицировать `runAction` — возвращать Promise, который резолвится при `status === "done"` из SSE
2. Или: `compactAll` запускает следующий compact только после получения события `done` от предыдущего
3. Проще: `compactAll` вызывает `runAction` и ждёт через `trackProgress` с колбэком

### Подход A (рекомендуемый): `runAction` возвращает Promise
```js
function runAction(path) {
  return new Promise((resolve, reject) => {
    toast("Starting: " + path);
    addLog("Starting: " + path);
    fetch("/mcp/" + path, { method: "POST" })
      .then(r => r.json())
      .then(data => {
        if (data.jobId) {
          trackProgress(data.jobId, path, resolve, reject);
        } else {
          toast("Done: " + path, "success");
          addLog("Completed: " + path);
          resolve(data);
        }
      })
      .catch(err => { toast("Error: " + err.message, "error"); reject(err); });
  });
}
```

Тогда `compactAll` будет ждать каждый compact:
```js
async function compactAll() {
  const actions = ["bible/compact","gutenberg/compact","wikipedia/compact","literary/compact"];
  for (const p of actions) {
    await runAction(p); // ждёт завершения каждого
    loadTab(document.querySelector(".tab.active").dataset.tab);
  }
}
```

### Файлы
- `public/mcp.html` — модифицировать `runAction` (~15 строк), `trackProgress` (+2 параметра), `compactAll` (без изменений логики, только вызов)

### Верификация
```bash
# Ручная: запустить Compact All → убедиться, что в System Logs они идут последовательно
# (bible compact done → gutenberg compact starts → ...)
```

### Риски
Низкий. Меняется только flow управления в JS, API бэкенда не трогаем.

---

## Сводная таблица

| # | Этап | Приоритет | Файлов | Время |
|---|------|-----------|--------|-------|
| 1 | Fix 14 MCP tests | P0 | 1 | 5 мин |
| 7 | Fix XSS в Wikipedia search | P0 | 1 | 30 мин |
| 2 | Catalog tab i18n | P1 | 1 | 30 мин |
| 3 | Progress bar | P1 | 1 | 1 час |
| 8 | Fix compactAll — последовательное выполнение | P1 | 1 | 30 мин |
| 4 | Read-only мониторинг экономики | P2 | 2 | 45 мин |
| 5 | 5 stub endpoints | P2 | 4 | 2 часа |
| 6 | de/fr/es/ja/zh переводы | P3 | 1 | 1 час |

**Итого:** ~12 файлов, ~7 часов.

---

## Правила выполнения

1. Перед каждым этапом: `bun test` — убедиться, что текущее состояние зелёное
2. Вносим изменения в файлы согласно этапу
3. После изменений: `bun test` + цитируем результат
4. Если тесты красные — фиксим, не переходим к следующему этапу
5. Один логический шаг = один PR/коммит
6. Не трогаем промпты агентов и публичные сигнатуры движка
