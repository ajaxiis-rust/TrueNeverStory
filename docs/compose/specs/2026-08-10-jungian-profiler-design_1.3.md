# Jungian Player Profiler — Design Spec v1.3

> Версия: 1.3 | Дата: 2026-08-14 | Редакция: 6
> Источник правды: эта спека — контракты + WHY. Код живёт в 5 implementation-спеках (см. S17).
> Изменения v1.3 (относительно v1.2):
> - **Структурные:** дизайн-спека лишена кода-имплементации (оставлены только интерфейсы/контракты); код перенесён/сверён с implementation-спеками.
> - **Противоречия устранены:** S18 (risk table) больше не ссылается на удалённую inertia; S5 `overallConfidence`→`confidence` (имя поля); S5.1 integration-сниппет передаёт `recentSignals`; S14 убран дублированный пункт «6.».
> - **Director** переименован концептуально: это pure orchestration function, НЕ AgentV2-агент. Конвейер enrichment идёт через dedicated-методы Big Six, а НЕ через `AgentV2.process()` (см. S3.2).
> - **Validator/Censor** граница зафиксирована: Validator — pre-gen факт-чек существующих данных; Censor — post-gen клише/анахронизмы. Из примера убрано ошибочное attribution «Nordmark forge → Validator».
> - **NPC-психотипы:** добавлен storage/assignment-план (S8.1) — ранее заголовочная фича без персистентности.
> - **`range` холодный старт:** явно задокументирован (~200 ходов до meaningful rolling avg).
> - **Anti-manipulation:** определена threat model; rate limit + range tracking — без inertia.
> - **Добавлено:** фазирование (S21), rollback-план (S22), test-стратегия (S23).
> - **AuthorMatcher:** явно deferred в Phase 4 (синхронизировано с `spec-profiler-implementation.md`).
> - **Реализованное:** `MetricsCollector` (S5.1) уже построен в `src/services/metrics-collector.ts` — спека фиксирует это как выполненное.

---

## [S1] Проблема

TrueNeverStory адаптирует нарратив к стилю письма игрока (14 метрик в `PlayerStyleProfile`), но не к его **психологическому типу**. Интроверт и экстраверт, мыслитель и чувствующий — все получают одну и ту же историю.

Система понимает, *как* игрок пишет, но не *зачем* он играет и *что* его цепляет. Результат: нарратив стилистически адаптирован, но эмоционально универсален.

Кроме того, NPC лишены психологической глубины — они функциональны (кузнец, стражник, торговец), но не *личности*. Мир реагирует на игрока механически, а не *живёт*.

---

## [S2] Архитектура — Director как вероятностный оркестратор

### Ключевой принцип

Агенты (Stylist, Dramaturg, Actor, Validator, Censor, Chronicler) **не получают строковые подсказки** о психотипе. Вместо этого **Director** (pure-функция, не агент — см. S3.2) вычисляет распределение вероятностей на основе `JungianProfile`, а enrichment-методы агентов сэмплят из этого распределения или получают enrichment через `playerVoice`.

```
                          ┌─────────────────────┐
    Synopsis ────────────►│                     │
    Prologue ───────────►│  PsychotypeAnalyzer  │──► JungianProfile
    World choices ──────►│  (один LLM-запрос)   │──► StyleProfile
                          │                     │──► AuthorMatch (Phase 4)
                          └────────┬────────────┘──► Themes, Arcs
                                   │
                                   ▼
                          ┌─────────────────────┐
                          │   Director (pure)   │
                          │  вычисляет          │
                          │  ProbabilityDist    │
                          └────────┬────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
    ┌──────────┐            ┌──────────┐            ┌──────────┐
    │Dramaturg │            │  Actor   │            │Validator │
    │ архетип  │            │   NPC    │            │  fact-   │
    │+ шаблон  │            │enrichment│            │  check   │
    └────┬─────┘            └────┬─────┘            └────┬─────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │ playerVoice
                                 ▼
                          ┌──────────┐
                          │ Stylist  │──► сырой нарратив
                          │генератор │
                          │  текста  │
                          └────┬─────┘
                               ▼
                          ┌──────────┐
                          │  Censor  │──► очищенный текст
                          │ regex +  │
                          │LLM polish│
                          └────┬─────┘
                               ▼
                          ┌──────────┐
                          │Chronicler│──► timeline + NPC memory
                          └──────────┘
```

### ProbabilityDistribution (контракт)

```typescript
interface ProbabilityDistribution {
  sceneTone: WeightedChoice[];
  archetypes: WeightedChoice[];
  pacing: WeightedChoice[];
  sensoryChannels: WeightedChoice[];
  informationStyle: WeightedChoice[];
  shadowInjection: number;       // 0.10-0.20 — доля контента для inferior функции
  explorationFactor: number;     // 0.05 — случайный non-type контент
}

interface WeightedChoice {
  value: string;
  weight: number;
}
```

> Семантика `ProbabilityDistribution` — **per-turn weighted-random selector**, а не распределение, на которое модель кондиционируется. На одном ходу `buildPlayerVoice()` делает ровно один `sample()` → одна детерминированная строка. Variance проявляется *между* ходами. `shadowInjection=0.15` означает «~15% ходов получают shadow-контент», не «15% контента в каждом ходе».

**Правило применения:** адаптация включается при `profile.confidence >= 0.3`. При confidence < 0.3 Director возвращает равномерное распределение. Per-axis confidence gate — out of scope (v1.4, по результатам A/B).

---

## [S3] Пайплайн

```
СОЗДАНИЕ МИРА (однократно):
─────────────────────────────
[Synopsis + Prologue] → [TranslationService] → [PsychotypeAnalyzer]
    → TextAnalysis { JungianProfile, StyleProfile, Themes, Arcs }
    → сохраняется в session/memory

ОДИН ХОД (каждый раз):
───────────────────────
[Ввод игрока] → [TranslationService] → [IntentParser]
    → [MetricsCollector.recordIntent]      ← РЕАЛИЗОВАНО
    → [SimulationEngine] → [StateMutator]
    → [MetricsCollector.recordSimulation]  ← РЕАЛИЗОВАНО
    → [ContextBuilder]
    → [Director.computeDistribution] → ProbabilityDistribution
    → [Dramaturg.enrichScene] → archetype + filledSkeleton
    → [Actor.enrichNpcs] → NpcEnrichment[]
    → [Validator.verify] → VerificationResult
    → [Stylist.buildMicroPrompt] → сырой нарратив (1 LLM)
    → [Censor.clean] → очищенный текст
    → [Chronicler.logEvent] → timeline
    → [TranslationService] → язык игрока
    → [Каждые 20 ходов: blendBehavioralSignals → update JungianProfile]
```

**PsychotypeAnalyzer (S5) вызывается однократно при создании мира** в `createWorld` (world-manager, этап 1). Результат сохраняется в session/memory и загружается каждым последующим ходом. На каждом ходу работает enrichment-конвейер из 6 агентов + Director.

---

## [S3.1] Agent Orchestration — внутри одного хода

### Все 6 агентов в конвейере

Каждый ход проходит через полный enrichment-конвейер из 6 агентов + Translation + Director. Ни один не пропускается (при включённом флаге).

| # | Агент | Роль | Что производит | LLM? |
|---|-------|------|---------------|------|
| — | TranslationService | Перевод ввода на English | English text | Да |
| — | IntentParser | Классификация интента | Intent | Нет (regex) / Да (fallback) |
| — | **MetricsCollector** | Сбор behavioral signals | Агрегаты (инкрементальные) | **Нет — TS** ✅ |
| — | SimulationEngine | Бросок кубиков | SimulationResult | Нет |
| — | StateMutator | Применение изменений | — | Нет |
| — | ContextBuilder | Сбор контекста сцены | GameContext | Нет |
| **1** | **Director** (pure fn) | Психотипический оркестратор | `ProbabilityDistribution` | **Нет — TS** |
| **2** | **Dramaturg** | Архетип + шаблон сцены | `filledSkeleton` + archetype | Нет (SQL) / Да (fallback) |
| **3** | **Actor** | Обогащение NPC | `NpcEnrichment[]` | **Нет — TS** |
| **4** | **Validator** | Pre-gen факт-чек | `VerificationResult` | Нет (Wikipedia API) / Да (fallback) |
| **5** | **Stylist** | Генерация нарратива | **Полный текст сцены** | **Да — 1 LLM** |
| **6** | **Censor** | Post-gen очистка | Очищенный текст | Нет (regex) / Да (LLM polish) |
| — | TranslationService | Перевод ответа | Текст на языке игрока | Да |
| — | **Chronicler** | Запись в timeline | — | Нет |

### Очерёдность вызовов в одном ходе

```
Шаг 0–3:     TranslationService → IntentParser → SimulationEngine → ContextBuilder
             (без изменений относительно текущего кода)

Шаг 0.5:     MetricsCollector.recordInput(rawInput)
             MetricsCollector.recordIntent(intent, rawInput, /*initiated*/ true)
             MetricsCollector.recordSimulation(intent, simResult)
             MetricsCollector.syncLocations(visitedLocations)
             (инкрементальные счётчики, без LLM, O(1) на ход)  ✅ РЕАЛИЗОВАНО

Шаг 3.5:     [Каждые 20 ходов] blendBehavioralSignals(signals, profile, recentSignals)
             → update JungianProfile → decay агрегатов → upsert DB
             (EMA + rate limit, без LLM)

Шаг 4:       Director.computeDistribution(profile, worldState, sceneContext)
             → ProbabilityDistribution  (~микросекунды, без LLM)

Шаг 5:       Dramaturg.enrichScene(dist.archetypes, gameContext)
             → sample archetype → SQL в literary-compiler БД
             → filledSkeleton  (SQL в 95%; LLM — только если шаблон не найден)

Шаг 6:       Actor.enrichNpcs(dist.informationStyle, nearbyNpcsWithPsychotypes)
             → NpcEnrichment[]  (чистый TS, без LLM)

Шаг 7:       Validator.verify(gameContext, filledSkeleton)
             → pre-gen факт-чек: NPC в локации? предмет доступен? timeline когерентен?
             → VerificationResult → добавляется в playerVoice как "fact-check notes"
             (Wikipedia API / MCP. LLM — только для сложных проверок.)

Шаг 8:       Stylist.buildMicroPrompt(filledSkeleton, style, context, outcome, playerVoice)
             → playerVoice = сборка из Director + Dramaturg + Actor + Validator
             → ОДИН LLM-запрос → полный нарратив

Шаг 9:       Censor.clean(rawNarrative, worldContext)
             → post-gen: regex замена AI-клише, анахронизмы
             → LLM polish для сложных случаев → очищенный текст

Шаг 10:      Chronicler.logEvent(description, time, type)
             → запись в timeline, обновление NPC memory

Шаг 11:      TranslationService → язык игрока
```

### Кто генерирует текст?

**Stylist — единственный генератор текста.** Все остальные агенты enrichment-уровня поставляют метаданные, которые Stylist получает через `playerVoice`.

### Validator / Censor — зафиксированная граница

| | Validator (Шаг 7, **pre-gen**) | Censor (Шаг 9, **post-gen**) |
|---|---|---|
| Когда | до генерации Stylist'ом | после генерации |
| Что проверяет | факты, существующие ДО генерации: NPC в локации (entity store), предмет доступен, timeline когерентен | клише в сгенерированном тексте, анахронизмы, грамматика после замен |
| Источник | gameContext + filledSkeleton + entity store | сырой нарратив Stylist'а |
| Тип | факт-чек / правдоподобность | лингвистическая очистка |
| LLM | Wikipedia API; LLM — редкий fallback | regex; LLM polish в ~10-15% |

> **Не путать:** детали, которые Stylist *придумает* (имена кузниц, конкретные цены), НЕ проверяются Validator'ом — они проверяются Censor'ом постфактум на анахронизмы. Validator не генерирует факты, он подтверждает известные.

### LLM-запросы: полный конвейер

| # | Компонент | LLM | Примечание |
|---|-----------|-----|------------|
| 0 | TranslationService (вход) | 0-1 | Комбинирован с Intent если язык ≠ EN |
| — | IntentParser | 0-1 | Regex first, LLM fallback |
| 1 | Director | **0** | Чистый TS |
| 2 | Dramaturg | **0** (редко 1) | SQL. LLM — только генерация нового шаблона. |
| 3 | Actor | **0** | Чистый TS |
| 4 | Validator | **0** (редко 1) | Wikipedia API. LLM — сложные проверки. |
| 5 | Stylist | **1** | Основной генератор текста |
| 6 | Censor | **0** (редко 1) | Regex. LLM — polish в ~10-15% случаев. |
| 7 | TranslationService (выход) | 0-1 | Только если язык ≠ EN |
| — | Chronicler | **0** | SQL INSERT |

**Всего на ход: 1-4 LLM.** Диапазон как сейчас. Director, Actor, Chronicler — 0 LLM.

---

## [S3.2] Связь конвейера с AgentV2 (архитектурное решение)

`docs/AGENTS.md` фиксирует Big Six в `AgentRegistryV2` с унифицированным контрактом `AgentV2.process(intent, simulation, context, pattern?)`. Этот контракт **остаётся нетронутым** — он обслуживает существующие потоки (prose-генерацию, `@mention`-роутинг, RAG-память, template-систему).

Jungian-profiler добавляет **параллельный enrichment-слой**, который RoleplayEngine оркеструет *до* prose-генерации:

- `Dramaturg.enrichScene()`, `Actor.enrichNpcs()`, `Validator.verify()`, `Censor.clean()` — **новые dedicated-методы** на существующих агентах (additive, не ломают `process()`).
- `Stylist` принимает `playerVoice` как **дополнительное поле** контекста (additive к существующему `process()` / `buildMicroPrompt`).
- **Director — НЕ агент**, НЕ регистрируется в `AgentRegistryV2`. Pure-функция в `jungian-profiler.ts`. Имя `director` для `@director` mention остаётся за существующим `DirectorAgent`-mention-handler'ом — **коллизии имён нет**, т.к. pure-функция живёт в сервисном модуле и вызывается напрямую из RoleplayEngine, а не через реестр.

**Итог:** enrichment-конвейер НЕ идёт через `AgentV2.process()`. Это намеренно — он предобрабатывает контекст, а `process()` остаётся контрактным входом для prose. Методы additive, откатываемы за флагом.

---

## [S4] Входные данные: Synopsis + Prologue

### Форма создания мира (worlds.html)

Существующие поля сохраняются. Добавляются два новых (опциональных):

| Поле | Тип | Назначение |
|------|-----|------------|
| **Synopsis** | textarea (1-3 предложения) | «О чём ваша история?» Тема, конфликт, ставки |
| **Prologue** | textarea (100-1000 слов, опционально) | «Как начинается ваш мир?» Пролог/предистория |

- **Synopsis** → тема и глобальный фокус (ЧТО интересует)
- **Prologue** → психотип, язык, стиль (КАК игрок думает и пишет)
- **Оба опциональны.** Пустой Synopsis → тема из жанров. Пустой Prologue → холодный старт, профиль из поведения.
- **Это проективный тест.** Игрок не знает, что его анализируют.
- **Персистентность:** Synopsis + Prologue сохраняются в `world_frame.json` при создании мира — они нужны этапу 2 (birth-wizard refinement, [S5.2]) и ленивому подбору автора ([S7]).

i18n — через существующую систему `I18N` для 7 языков (EN, RU, DE, FR, ES, JA, ZH).

---

## [S5] PsychotypeAnalyzer — единый LLM-анализ

> **Двухэтапный анализ текстов.** Этап 1 (этот раздел) — при создании мира (Synopsis+Prologue → начальный профиль), один синхронный LLM-вызов. Этап 2 — при создании персонажа (birth wizard): описание персонажа уточняет профиль + подбор автора ([S5.2], [S7]), один комбинированный синхронный LLM-вызов.

### Structured Output Schema (контракт)

```typescript
interface TextAnalysis {
  psychotype: {
    extraversion: number;    // 0 = pure I, 1 = pure E, 0.5 = neutral
    intuition: number;       // 0 = pure S, 1 = pure N
    thinking: number;        // 0 = pure F, 1 = pure T
    judging: number;         // 0 = pure P, 1 = pure J
    axisConfidence: {
      extraversion: number;
      intuition: number;
      thinking: number;
      judging: number;
    };
    confidence: number;      // 0-1, capped по длине текста → JungianProfile.confidence
  };
  style: {
    register: 'high' | 'medium' | 'low';
    pacing: 'slow' | 'medium' | 'fast' | 'variable';
    sensoryFocus: string[];
    sentenceProfile: { avgLength: number; complexity: 'simple' | 'moderate' | 'complex' };
  };
  themes: string[];
  suggestedArcs: string[];
  worldHints: {
    suggestedGenres: string[];
    suggestedSocialSystem: string;
    suggestedTone: string;
  };
}
```

> Имя поля — `confidence` (не `overallConfidence`). `axisConfidence` — per-axis. Соответствие `JungianProfile.confidence`/`axisConfidence` — прямое.

Система отправляет Synopsis + Prologue (переведённые на English) одним запросом. LLM возвращает structured JSON (JSON Schema + fallback к default).

### Confidence cap по длине текста (контракт)

| wordCount | cap |
|-----------|-----|
| < 50 | 0.20 |
| < 200 | 0.35 |
| < 500 | 0.45 |
| ≥ 500 | 0.55 |

`JungianProfile.confidence = min(LLM.confidence, cap)` при `source: 'text'`.

Начальный confidence из текста: 0.2–0.55. После blend с metrics (20+ ходов): 0.55–0.80. После 50+ ходов: 0.75–0.95.

### Fallback: пустой текст

Если Synopsis и Prologue пусты — анализатор не вызывается. `JungianProfile` начинается с `createDefaultProfile()` (все оси = 0.5, confidence = 0).

---

## [S5.1] Behavioral Metrics Pipeline — ✅ РЕАЛИЗОВАНО

> **Статус:** построено в `src/services/metrics-collector.ts`. Implementation-спека: `spec-behavioral-metrics.md`. Раздел фиксирует контракты + точки хуков; код — в implementation-спеке и исходнике.

### Проблема

PsychotypeAnalyzer (S5) строит профиль из текста — это **самопрезентация**. Реальное поведение может отличаться: интроверт в прологе может вести себя как экстраверт в игре. Нужен второй источник — behavioral metrics.

### Контракты типов (реализованы)

```typescript
interface RawAggregates {
  dialogueInitiated: number;
  dialogueCount: number;
  dialogueTotalWords: number;
  avoidedDialogues: number;
  explorationActions: number;
  riskTakingActions: number;
  planningActions: number;
  combatInitiated: number;
  inputTotalChars: number;
  expressiveActions: number;
}

interface AxisSignals {
  extraversion: number;   // 0 = I, 1 = E
  intuition: number;      // 0 = S, 1 = N
  thinking: number;       // 0 = F, 1 = T
  judging: number;        // 0 = P, 1 = J
}
```

`MetricsCollector`: `recordInput`, `recordIntent(intent, rawInput, initiated?)`, `recordSimulation(intent, simResult)`, `recordAvoidedDialogue()`, `decay()` (×0.9), `getAggregates()`, `getTurnCount()`. Производные: `deriveMetrics(aggregates, totalTurns, visitedLocations)` → `DerivedMetrics`; `inferFromMetrics(derived)` → `AxisSignals`. Все функции — чистый TS, O(1) на ход.

### Точки хуков в `_processInputImpl` (контракт; см. `spec-profiler-integration.md` для кода)

```typescript
// ПОСЛЕ IntentParser.parse():
this.metricsCollector.recordInput(ctx.parsedInput);
this.metricsCollector.recordIntent(intent, ctx.parsedInput, /*initiated*/ true); // _processInputImpl — только player-initiated ввод

// ПОСЛЕ SimulationEngine.simulate():
this.metricsCollector.recordSimulation(intent, simResult);

// КАЖДЫЕ 20 ХОДОВ — blend (ПЕРЕДАЁТ recentSignals — fix v1.3):
if (this.metricsCollector.getTurnCount() % 20 === 0) {
  const derived = deriveMetrics(this.metricsCollector.getAggregates(), this.metricsCollector.getTurnCount(), this.visitedLocations.size);
  const signals = inferFromMetrics(derived);
  this.jungianProfile = blendBehavioralSignals(signals, this.jungianProfile, this.recentSignals);
  this.metricsCollector.decay();
  this.playerProfileStore.upsertJungianProfile(this.playerId, this.jungianProfile);
  this.playerProfileStore.upsertBehavioralMetrics(this.playerId, this.metricsCollector.getAggregates(), this.metricsCollector.getTurnCount(), signals);
}
```

`recentSignals` (rolling window, последние 10 сигналов на ось) — в памяти, не в БД. Каждые 20 ходов push + shift.

### Decay-семантика

При каждом blend-цикле агрегаты ×0.9. Эффективное окно ~100 ходов. `uniqueLocations` не decay'ится (Set из `SessionState`).

### Известные ограничения (зафиксировано)

- **Пассивный игрок не получает адаптации.** `normalize()` при нулевых сигналах → 0.5; default preference тоже 0.5 → `updateAxisConfidence` видит difference 0 → «нейтрально» → confidence не растёт. Это намеренный cold start, но явно озвучено.
- **Bug `recordSimulation` для `command`-типа** — **исправлен** (`metrics-collector.ts:102`): `const verb = intent.type === 'action' ? intent.verb : intent.command;`. Фикс в working tree, требует коммита.

---

## [S5.2] Birth-wizard refinement — комбинированный вызов (этап 2)

> **Статус:** новый этап. Связывает уточнение психотипа (P2) и подбор автора (P4, [S7]) в один LLM-вызов при создании персонажа.

### Назначение

Описание персонажа (`birthHints` в birth-wizard'е) — это проекция игрока: люди создают персонажей по своему образу, мечтам и проекциям. Поэтому это второй (помимо Synopsis+Prologue) текстовый сигнал для психотипа игрока.

### Вход / выход (контракт)

```typescript
interface BirthAnalysis {
  psychotype: JungianProfile;   // из описания персонажа (проекция игрока)
  closestAuthor: string;        // из top-3 кандидатов (S7), по прологу + описанию
}
```

### Поток (синхронно, до первого ответа Stylist)

1. Прочитать `birthHints` (описание персонажа) + `prologue` (из `world_frame.json`, этап 1).
2. Embed пролога → cosine top-3 авторов (0 LLM, [S7]).
3. **Один** комбинированный LLM-вызов: `birthHints` + `prologue` + top-3 кандидата → `{ psychotype, closestAuthor }`.
4. `blend` психотипа из описания с профилем этапа 1 (0 LLM) → уточнённый профиль.
5. Персист уточнённого профиля + `closest_author`.

### Graceful

Упал LLM → остаётся профиль этапа 1 + нет автора (few-shot не добавляется). Пустое описание → пропускаем refine, только подбор автора по прологу.

---

## [S6] JungianProfile — multi-dimensional (preference + range)

### Ключевая идея

Каждая ось — **не одно число**, а два:
- `preference` (0-1): что игрок **предпочитает** (медленно меняется, EMA)
- `range` (0-1): насколько **разнообразно** ведёт себя (растёт при отклонениях, сужается при стабильности)

**Пример:** Технократ, написавший стихи:
- `thinking.preference = 0.83` (всё ещё технократ)
- `thinking.range = 0.18` (но система знает, что он *способен* на другое)

Манипулятор, осциллирующий между E и I:
- `extraversion.preference = 0.50` (осцилляции компенсируют друг друга)
- `extraversion.range = 0.70` (система видит широкий диапазон → предлагает разнообразный контент)

### Интерфейс (контракт)

```typescript
interface AxisProfile {
  preference: number;    // 0-1: основная линия (EMA от наблюдений)
  range: number;         // 0-1: диапазон поведения (0 = стабилен, 1 = хаотичен)
}

interface JungianProfile {
  extraversion: AxisProfile;
  intuition: AxisProfile;
  thinking: AxisProfile;
  judging: AxisProfile;
  confidence: number;    // 0-1: общая уверенность в профиле
  axisConfidence: {
    extraversion: number;
    intuition: number;
    thinking: number;
    judging: number;
  };
  source: 'text' | 'metrics' | 'blended' | 'default';
}
```

`createDefaultProfile()`: все оси `{ preference: 0.5, range: 0.1 }`, confidence 0, source `'default'`.

### Blend-контракт (параметры — контракт; код в `spec-blend-algorithm.md`)

| Параметр | Значение | Роль |
|----------|----------|------|
| `emaAlpha` | 0.25 | Скорость сдвига preference (EMA) |
| `maxShiftPerTurn` | 0.10 | Rate limit: максимум 10% за blend-цикл |
| `rangeGrowthThreshold` | 0.3 | Отклонение от rolling avg > 0.3 → range растёт |
| `rangeDecayRate` | 0.005 | Range сужается на 0.5%/цикл при стабильности |
| `minTurnsForBlend` | 20 | Минимум ходов перед первым обновлением |

**Без inertia.** EMA (alpha=0.25) даёт 75% старого + 25% нового — достаточно сглаживает шум, позволяет конвергировать за 50-100 ходов. Inertia поверх EMA создавала двойное сглаживание (effective alpha 0.027) — профиль замораживался. Confidence влияет только на `updateAxisConfidence` (порог), не на скорость сдвига.

`updateAxis(current, signal, recentSignals[])` → `{ preference, range }`:
1. EMA blend → rate-limit clamping.
2. Range: deviation от **rolling avg** recentSignals (не от preference) — предотвращает ложный рост range при стабильном поведении, когда preference ещё не догнал сигнал.

`blendBehavioralSignals(signals, profile, recentSignals)` → обновлённый `JungianProfile` (все 4 оси + `axisConfidence` + `confidence` = среднее axisConfidence).

### Скорость конвергенции (контрактные ожидания — покрываются тестами S23)

| Сценарий | Ходов до 50% gap closed |
|----------|------------------------|
| Полная смена стиля (gap=0.2) | ~50 ходов (~2.5 blend-цикла) |
| Малый сигнал (gap=0.05) | ~25 ходов |
| Шумный сигнал (oscillation) | EMA сглаживает, preference стабилен |
| Резкий скачок (0.9→0.1) | Ограничен rate limit 0.10/ход |

### ⚠️ Холодный старт `range` (зафиксировано в v1.3)

`updateAxis` считает deviation от rolling avg из `recentSignals` (нужно ~10 семплов для осмысленной статистики). Blend идёт каждые 20 ходов → **10 семплов накопятся к ходу ~200**. До этого rolling avg либо пуст (fallback на preference), либо из 1–5 семплов — статистически ненадёжен.

**Следствие:** `range` (заголовочная v1.3-инновация) **функционально неактивен первые ~200 ходов.** `explorationFactor` держится на минимуме 0.05. Это приемлемо как warmup, но должно быть явно задокументировано (раньше молчало). Альтернатива для v1.4 — warmup-логика (bootstrap range из дисперсии первых N сигналов).

### Derived type (совместимость с таблицей 16 типов)

```typescript
function deriveType(profile: JungianProfile): string;   // "INTJ", "X" для амбивалентных осей (0.45–0.55)
function axisClarity(profile: JungianProfile): number;   // 0-1
function averageRange(profile: JungianProfile): number;   // 0-1, → Director.explorationFactor
```

Director: `explorationFactor = max(0.05, averageRange(profile) * 0.3)`.

### Confidence formula

`confidence = (conf_extraversion + conf_intuition + conf_thinking + conf_judging) / 4`. Каждая `axisConfidence` обновляется в `updateAxisConfidence`:
- Подтверждение (|signal - blendedPreference| < 0.1): +0.05, cap 0.95
- Противоречие (|signal - blendedPreference| > 0.3): -0.10, floor 0.30
- Нейтрально: без изменений

---

## [S7] AuthorMatcher — DEFERRED (Phase 4)

> **Статус:** отложен. Синхронизировано с `spec-profiler-implementation.md` (out of scope). Заглушка: PsychotypeAnalyzer не возвращает `closestAuthor`; Stylist работает без author few-shot. Контракт оставлен как forward-reference.

Векторный поиск по embeddings пролога вместо статической `AUTHOR_DB`:

1. Предвычисленные embeddings ~50 классических авторов (BGE-M3) в `data/author-embeddings.json`.
2. На лету: embedding пролога → cosine similarity → топ-3.
3. LLM выбирает лучшего из топ-3 **лениво при создании персонажа** (birth wizard) — комбинированным вызовом этапа 2 ([S5.2]: психотип из описания + автор-pick). Не на создании мира, не в рамках S5.

```typescript
interface AuthorEntry {
  name: string;
  embedding: number[];        // dim из конфигурации модели (BGE-M3 = 1024; default text-embedding-3-small)
  psychotype: JungianProfile;
  samplePhrases: string[];    // 3-5 фраз для few-shot
  genres: string[];
}
```

Использование: стилевой референс + few-shot для Stylist. **Не блокирует Phase 1-3.**

---

## [S8] NPC Psychotypes

Каждый NPC получает `JungianProfile`. Это делает их личностями, а не функциями.

### Назначение типа NPC (контракт)

Тип назначается на основе:
- **Роли:** кузнец → S+J; бард → N+F+P; стражник → S+J; учёный → N+T
- **Фракции:** разбойники → P; инквизиция → J; торговая гильдия → S+T
- **Мира:** феодализм → J-типы; анархия → P-типы
- **Случайный jitter** для вариативности

```typescript
interface NpcProfile {
  npcId: string;
  psychotype: JungianProfile;
  perceivedPlayerType: JungianProfile;  // Как NPC видит игрока; после 3+ взаимодействий; ±0.2 смещение; обновляется каждые 10 взаимодействий
  interactionHistory: Array<{ ts: number; type: string; tension: number }>;
}
```

### Влияние на поведение

- **Диалоги:** противоположный тип → напряжение. Похожий → союзник.
- **NPC-to-NPC:** ISTJ-кузнец + ENFP-бард → готовая драма.
- **Профайлинг игрока:** реакции на NPC выдают тип игрока.

### [S8.1] NPC storage / assignment-план (новое в v1.3 — ранее отсутствовало)

> В v1.2 заголовочная фича NPC-психотипов не имела плана персистентности. v1.3 фиксирует это.

| Данные | Хранение | Когда назначается |
|--------|----------|-------------------|
| `psychotype` (NPC) | `profile.l3.psychotype` на NPC-сущности в `UnifiedEntityStore` (JSON-файл `entities.json`) | **Лениво при создании NPC** (world-gen) через `assignNpcPsychotype(role, faction, worldSystem)` |
| `perceivedPlayerType` | Таблица `npc_perception` (см. ниже) | После 3+ взаимодействий, обновление каждые 10 |
| `interactionHistory` | JSON-колонка `interaction_history` в таблице `npc_perception` | Инкрементально при каждом взаимодействии |

```sql
CREATE TABLE IF NOT EXISTS npc_perception (
  npc_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  perceived_extraversion_pref REAL NOT NULL DEFAULT 0.5,
  perceived_intuition_pref REAL NOT NULL DEFAULT 0.5,
  perceived_thinking_pref REAL NOT NULL DEFAULT 0.5,
  perceived_judging_pref REAL NOT NULL DEFAULT 0.5,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  interaction_history TEXT NOT NULL DEFAULT '[]',
  last_updated INTEGER NOT NULL,
  PRIMARY KEY (npc_id, player_id)
);
```

`assignNpcPsychotype()` — pure-функция в `jungian-profiler.ts`, детерминированная по (role, faction, worldSystem) + seed-jitter. **Не LLM.** Назначается один раз при создании NPC, не пересчитывается (тип NPC стабилен, в отличие от игрока).

> NPC-психотипы попадают в **Phase 3** (см. S21) — требуют storage + lazy-assignment, отдельной от player-profiler.

---

## [S9] Director — ProbabilityDistribution (контракт)

```typescript
function computeDistribution(
  profile: JungianProfile,
  worldState: WorldState,          // genre, socialSystem влияют на archetype weights
  sceneContext: SceneContext,      // mood, timeOfDay влияют на tone weights
): ProbabilityDistribution;

// if (profile.confidence < 0.3) return uniformDistribution();
// shadowInjection: confidence > 0.5 ? 0.15 : 0.05
// explorationFactor: max(0.05, averageRange(profile) * 0.3)
// injectShadow(dist, profile) + injectExploration(dist) + normalizeWeights(dist)
```

`injectShadow` добавляет низковероятностный контент для слабой (inferior) функции игрока (INTJ → emotional; ESFP → analytical). Код — в `spec-blend-algorithm.md`.

### Интеграция с агентами

- **Stylist:** `sample(dist.sceneTone)`, `sample(dist.pacing)`, `sample(dist.sensoryChannels)` → `buildMicroPrompt`
- **Dramaturg:** `sample(dist.archetypes)` → приоритет в SQL-запросе к literary-compiler
- **Actor:** `sample(dist.informationStyle)` → enrichment NPC
- **EconomicService:** `sample(dist.informationStyle)` → enrichment через Stylist

> Сэмплинг из Distribution происходит в `buildPlayerVoice()` (integration code в RoleplayEngine), **не** в агентах. Stylist получает уже готовую строку `playerVoice`.

---

## [S9.1] Complete Turn Example — INTJ в таверне

Полный прогон одного хода. Иллюстрирует контракты (не код).

### Исходные данные

- **Игрок:** INTJ (extraversion=0.3, intuition=0.8, thinking=0.75, judging=0.7, confidence=0.82)
- **Язык:** русский | **Мир:** фэнтези-средневековье
- **Действие:** «Я вхожу в таверну "Старый Дуб" и ищу кузнеца Брана, чтобы починить сломанный меч»

### Шаг 4. Director → ProbabilityDistribution (0 LLM)

```json
{
  "sceneTone": [
    { "value": "controlled, strategic", "weight": 0.40 },
    { "value": "dry, precise",           "weight": 0.30 },
    { "value": "neutral",                "weight": 0.15 },
    { "value": "warm, emotional",        "weight": 0.10 },
    { "value": "chaotic",                "weight": 0.05 }
  ],
  "archetypes": [
    { "value": "judgment_trial", "weight": 0.35 },
    { "value": "political_intrigue", "weight": 0.25 },
    { "value": "wisdom_counsel", "weight": 0.20 },
    { "value": "rescue", "weight": 0.10 },
    { "value": "random", "weight": 0.10 }
  ],
  "shadowInjection": 0.15,
  "explorationFactor": 0.05
}
```

### Шаг 5. Dramaturg — архетип + шаблон (0 LLM, SQL)

Сэмплит `judgment_trial` (35%). → `filledSkeleton` + `mood: "tense"`.

### Шаг 6. Actor — enrichment NPC (0 LLM, TS)

```
Bran (ISTP: S+T+P):  "Practical, blunt, tool-oriented. Short precise sentences. Exact prices."
Marta (ESFJ: S+F+J): "Warm but orderly. Under analytical lens — structured menu list."
Lio (ENFP: N+F+P):   "Background presence. Cryptic riddling lyrics if noticed at all."
```

### Шаг 7. Validator — pre-gen факт-чек (0 LLM, MCP)

Проверяет **только факты, известные до генерации**:

```json
{
  "claims": [
    { "claim": "Bran the blacksmith is in Old Oak Tavern",
      "verified": true, "confidence": "high",
      "evidence": ["Entity store: Bran.type=Character, location=Old Oak Tavern"] },
    { "claim": "Sword can be repaired by a medieval blacksmith",
      "verified": true, "confidence": "high",
      "evidence": ["MCP verify_fact: blacksmiths performed blade repair"] }
  ],
  "worldConsistency": { "npcInLocation": true, "itemsAvailable": true, "timelineCoherent": true },
  "notes": ["Bran confirmed in Old Oak Tavern (entity store, high confidence)",
            "Sword repair historically plausible"]
}
```

> **Fix v1.3:** «Nordmark forge» — это деталь, придуманная Stylist'ом на шаге 8; она **не** attributable к Validator'у. В v1.2 пример ошибочно приписывал её Validator'у. Validator подтверждает *существование* фактов, не генерирует их.

### Шаг 8. Stylist — генерация (1 LLM)

`playerVoice` собирается из Director + Dramaturg + Actor + Validator:

```
Player psychological context:
- Prefers analytical, structured information
- Responds to controlled, strategic tone
- Sensory focus: visual, tactile, atmospheric
- Scene archetype: judgment_trial (mood: tense)
- NPC Bran: practical, blunt. Short precise sentences. Exact prices.
- NPC Marta: warm but orderly. Structured presentation.
- NPC Lio: background presence. Cryptic lyrics if noticed.
- Avoid melodrama. Avoid emotional outburst. Avoid small talk.

Fact-check notes:
- Bran confirmed in Old Oak Tavern (verified, high confidence)
- Sword repair historically plausible
```

LLM генерирует сырой нарратив (с AI-клише для демонстрации Censor):

```
The Old Oak's door swung inward on oiled hinges — the first sign of a 
well-kept establishment. Alek noted the iron reinforcements, the precise 
dovetail joints. It was a place where craftsmanship spoke louder than 
words — a quiet testament to the delved depths of human ingenuity. The 
very fabric of the tavern seemed woven with stories, a rich tapestry of 
lives lived and forgotten.
...
"Four silver. Ready by dawn." He set the sword on the bench.
...
Marta: "You look like you've been through something. It's worth noting 
that the stew is fresh today."
...
Alek didn't notice. The palpable silence of his indifference hung in the air.
```

### Шаг 9. Censor — post-gen очистка (0 LLM, regex)

| Найдено | Заменено на |
|---------|-------------|
| `"the delved depths of human ingenuity"` | целое клише-предложение удалено |
| `"The very fabric of the tavern seemed woven with stories"` | `"The tavern"` |
| `", a rich tapestry of lives lived and forgotten"` | `""` |
| `"It's worth noting that the stew is fresh today"` | `"The stew is fresh today"` |
| `"The palpable silence of his indifference"` | `"The silence of his indifference"` |

5 клише удалено, `llmPolished: false`.

### Шаг 10. Chronicler (0 LLM, SQL)

```
Event: "Alek entered Old Oak Tavern, Bran agreed to repair the broken 
sword for four silver. Marta offered hospitality."
Time: dusk, Day 3 | Type: narrative
```

### Разбор: кто за что отвечает

| Фрагмент | Кто определил |
|---|---|
| «oiled hinges, iron reinforcements, dovetail joints» | Director → sensoryChannels: visual+tactile |
| «Tools hung in descending order of size» | Director → informationStyle: analytical |
| «Bran didn't look up» / «Good steel. Nordmark forge» | Actor → Bran=ISTP, blunt + analytical → факты |
| «Stupid, but brave» | Dramaturg → judgment_trial → оценка |
| «Four silver. Ready by dawn» | Actor → ISTP + analytical → точные цифры |
| Удалённые клише (delved, tapestry, palpable…) | Censor → regex-pass |
| «Alek didn't notice» — финал | Director → I-type: интровертная линза |

### LLM-запросы: этот ход

| Шаг | LLM |
|-----|-----|
| 0 Translation (вход) | 1 (translateAndClassify) |
| 4 Director | 0 |
| 5 Dramaturg | 0 (SQL hit) |
| 6 Actor | 0 |
| 7 Validator | 0 (Wikipedia API) |
| 8 Stylist | 1 |
| 9 Censor | 0 (regex) |
| 10 Chronicler | 0 |
| 11 Translation (выход) | 1 |
| **Итого** | **3 LLM** |

Стоимость: 3 LLM-запроса — столько же, сколько текущий код для русскоязычного игрока.

### Тот же мир — другой тип

| Тип | Что бы он увидел в ТОЙ ЖЕ таверне |
|---|---|
| **ESFP** (S+F+P) | «Музыка гремела, пахло жареным мясом. Рыжая девушка улыбнулась. Бран хлопнул Алека по плечу: "Дружище! Садись, выпьем!"» |
| **INTP** (N+T+P) | «Таверна работала как механизм. Подача эля — 12 секунд. Кузнец брал 4 серебра — на 0.5 выше рыночной. Монополия? Сговор?» |
| **INFJ** (N+F+J) | «В полумраке свет падал только на руки Брана — руки человека, который чинит сломанное. "Меч можно починить за четыре серебра. Душу — за всю жизнь."» |

**Один мир. Один движок. Шесть агентов. Четыре разные подачи.**

---

## [S10] Narrative adaptation — таблица 16 типов (производная)

`getNarrativeConstraints(profile)` использует `deriveType()`. При амбивалентных осях ('X') — intermediate стиль.

| Тип | Prefer | Avoid | Pace | Tone |
|-----|--------|-------|------|------|
| **ISTJ** | Architecture, logical puzzles, clear structure, duty | Pure abstraction, melodrama | medium | factual |
| **ISFJ** | Past details, tradition, care, loyalty to people | Chaos, moral ambiguity as default | slow | warm |
| **INFJ** | Symbolism, inner world, moral dilemmas, quiet meaning | Pure action, black-and-white morality | slow | dark, poetic |
| **INTJ** | Long-term plans, systems, competence, hidden strategy | Small talk, aimless wandering | medium | controlled, strategic |
| **ISTP** | Tools, tactics, hands-on problem solving | Forced emotion, abstract philosophy | medium–fast | dry, precise |
| **ISFP** | Sensory beauty, personal values, quiet loyalty | Cold systems, public conflict | medium | soft, aesthetic |
| **INFP** | Ideals, authenticity, emotional truth, found family | Cynicism-as-default, pure mechanics | variable | lyrical, sincere |
| **INTP** | Systems, logic, hidden connections, paradox | Melodrama, surface charm | medium | analytical |
| **ESTP** | Action, danger, sensory immediacy, risk | Long introspection, pure theory | fast | visceral |
| **ESFP** | Emotions, social dynamics, immediate experience | Dry technical detail, isolation | fast | vibrant |
| **ENFP** | Possibilities, character depth, hidden meanings | Routine, rigid predictability | variable | inspirational |
| **ENTP** | Debate, paradox, intellectual challenge, schemes | Simple answers, dogma | fast | witty |
| **ESTJ** | Order, clear goals, leadership, measurable progress | Ambiguity, endless open endings | medium–fast | decisive |
| **ESFJ** | Community, harmony, care for others, rituals | Cold calculation, isolation | medium | sociable, warm |
| **ENFJ** | Shared purpose, growth of others, moral arc | Pure self-interest, nihilism | medium | inspiring, guiding |
| **ENTJ** | Ambition, strategy, decisive action, empire-building | Passivity, pure sentiment | fast | commanding |

### Anti-moralizing gate

```typescript
function getMoralizingGate(profile: JungianProfile): 'strict' | 'relaxed' | 'off';
// thinking.preference > 0.7 → 'strict'; > 0.5 → 'relaxed'; иначе 'off'
```

---

## [S11] Архетипические предпочтения (Dramaturg)

Вероятностные веса вместо жёстких списков. Dramaturg передаёт в SQL-запрос к literary-compiler:

| Функция | Архетипы (soft bias) |
|---------|---------------------|
| S | rescue, escape_liberation, quest_journey |
| N | temptation_fall, wisdom_counsel, rise_fall_rise |
| T | judgment_trial, political_intrigue, wisdom_counsel |
| F | loyalty, betrayal, inheritance_return, endurance_suffering |

При амбивалентных осях — равные веса на обе группы.

---

## [S12] NPC-диалоги (Actor)

NPC получает `JungianProfile`. Диалог строится из характера NPC, не из адаптации под игрока. `informationStyle` из Distribution влияет на стиль подачи:

| informationStyle | NPC-стиль |
|-----------------|-----------|
| analytical | Больше фактов, логических аргументов |
| emotional | Больше эмоций, личных историй, эмпатии |
| concrete | Конкретные описания, practical info |
| symbolic | Символы, метафоры, скрытые намёки |

---

## [S13] Экономическая адаптация

Через Distribution. EconomicService получает `informationStyle`, Stylist генерирует описания в соответствующем стиле:

| informationStyle | Описание |
|-----------------|----------|
| analytical + concrete | Цифры, таблицы цен, механики |
| emotional + symbolic | Социальные последствия, скрытые возможности |
| concrete | Вес, текстура, запах товаров |
| symbolic | Контрабанда, тайные рынки |

---

## [S14] Сохранение и обновление

### Новые колонки в `player_style_profiles` (контракт-схема; код миграции в `spec-profiler-persistence.md`)

```sql
ALTER TABLE player_style_profiles ADD COLUMN jungian_extraversion_pref REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_extraversion_range REAL NOT NULL DEFAULT 0.1;
ALTER TABLE player_style_profiles ADD COLUMN jungian_intuition_pref REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_intuition_range REAL NOT NULL DEFAULT 0.1;
ALTER TABLE player_style_profiles ADD COLUMN jungian_thinking_pref REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_thinking_range REAL NOT NULL DEFAULT 0.1;
ALTER TABLE player_style_profiles ADD COLUMN jungian_judging_pref REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_judging_range REAL NOT NULL DEFAULT 0.1;
ALTER TABLE player_style_profiles ADD COLUMN jungian_confidence REAL NOT NULL DEFAULT 0;
ALTER TABLE player_style_profiles ADD COLUMN jungian_conf_extraversion REAL NOT NULL DEFAULT 0;
ALTER TABLE player_style_profiles ADD COLUMN jungian_conf_intuition REAL NOT NULL DEFAULT 0;
ALTER TABLE player_style_profiles ADD COLUMN jungian_conf_thinking REAL NOT NULL DEFAULT 0;
ALTER TABLE player_style_profiles ADD COLUMN jungian_conf_judging REAL NOT NULL DEFAULT 0;
ALTER TABLE player_style_profiles ADD COLUMN jungian_source TEXT NOT NULL DEFAULT 'default';
ALTER TABLE player_style_profiles ADD COLUMN detected_themes TEXT NOT NULL DEFAULT '[]';
```

Миграция через `PRAGMA table_info` перед каждым `ALTER` (SQLite не поддерживает `IF NOT EXISTS`). `closest_author` — Phase 4.

### Таблица `player_behavioral_metrics` (✅ схема реализована)

```sql
CREATE TABLE IF NOT EXISTS player_behavioral_metrics (
  player_id TEXT PRIMARY KEY,
  total_turns INTEGER NOT NULL DEFAULT 0,
  dialogue_initiated REAL NOT NULL DEFAULT 0,
  dialogue_count REAL NOT NULL DEFAULT 0,
  dialogue_total_words REAL NOT NULL DEFAULT 0,
  avoided_dialogues REAL NOT NULL DEFAULT 0,
  exploration_actions REAL NOT NULL DEFAULT 0,
  risk_taking_actions REAL NOT NULL DEFAULT 0,
  planning_actions REAL NOT NULL DEFAULT 0,
  combat_initiated REAL NOT NULL DEFAULT 0,
  input_total_chars REAL NOT NULL DEFAULT 0,
  expressive_actions REAL NOT NULL DEFAULT 0,
  signal_extraversion REAL NOT NULL DEFAULT 0.5,
  signal_intuition REAL NOT NULL DEFAULT 0.5,
  signal_thinking REAL NOT NULL DEFAULT 0.5,
  signal_judging REAL NOT NULL DEFAULT 0.5,
  last_updated INTEGER NOT NULL
);
```

Агрегаты — REAL (после decay 0.9 дробные). `unique_locations` — из `SessionState.visitedLocations.size` при `deriveMetrics()`, в БД не хранится.

### Пайплайн обновления

1. **При создании мира:** `analyzeText(synopsis, prologue)` → session/memory
2. **Каждый ход:** `MetricsCollector` инкрементирует агрегаты (без LLM) ✅
3. **Каждые 20 ходов:** `deriveMetrics` → `inferFromMetrics` → `blendBehavioralSignals(signals, profile, recentSignals)` → update both tables → `decay()`
4. **Confidence:** подтверждение → +0.05, противоречие → −0.10, нейтрально → стабильно
5. **Range:** отклонения > 0.3 → рост, стабильность → decay 0.5%/цикл
6. **Exploration:** Director использует `averageRange(profile)` для `explorationFactor` (минимум 5%)

> Fix v1.3: убран дублированный пункт «6.» из v1.2 (S14).

---

## [S15] Cross-session persistence

- Профиль переживает сессии (по `player_id`)
- При бездействии > 7 дней: `confidence` decay

---

## [S16] A/B тестирование

Флаг `jungian-profiler-enabled` (default: **false**).

Метрики: session length, return rate, turns per session, per-type distribution.
Логи тегируются `jungianEnabled` + `jungianType` + `confidence`.

---

## [S17] Файловая структура и источник правды

> **Двухслойная модель (v1.3):** эта дизайн-спека = контракты + WHY. Код = 5 implementation-спек. Дублирование кода в дизайне устранено.

### Implementation-спеки (источник правды для кода)

| Спека | Покрывает | Статус |
|-------|-----------|--------|
| `spec-blend-algorithm.md` | `updateAxis`, `blendBehavioralSignals`, `injectShadow`, Director math | spec |
| `spec-behavioral-metrics.md` | `MetricsCollector`, `inferFromMetrics`, hooks | ✅ **реализовано** (`src/services/metrics-collector.ts`) |
| `spec-profiler-persistence.md` | DB-колонки, миграции, `player_behavioral_metrics` | spec |
| `spec-profiler-integration.md` | хуки в `_processInputImpl`, `recentSignals`, `buildPlayerVoice` | spec |
| `spec-profiler-implementation.md` | файловая структура, экономика, A/B | spec |

### Файловая структура (контракт)

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `src/services/jungian-profiler.ts` | Создать | `JungianProfile` типы, Director (pure fn), `PsychotypeAnalyzer`, `assignNpcPsychotype`, constraints |
| `src/services/jungian-profiler.test.ts` | Создать | Unit-тесты (см. S23) |
| `src/services/metrics-collector.ts` | ✅ есть | MetricsCollector |
| `src/lib/player-profile-store.ts` | Модифицировать | jungian-колонки + `player_behavioral_metrics` + `npc_perception` |
| `src/lib/feature-flags.ts` + `conf/feature-flags.json` | Модифицировать | Флаг `jungian-profiler-enabled` |
| `src/services/agents/dramaturg.ts` | Модифицировать | `enrichScene()` — SQL к literary-compiler (`searchTemplates`) |
| `src/services/agents/actor.ts` | Модифицировать | `enrichNpcs()` — NPC psychotype × informationStyle |
| `src/services/agents/validator.ts` | Модифицировать | `verify()` — pre-gen факт-чек (MCP `verify_fact`, `get_context`) |
| `src/services/agents/stylist.ts` | Модифицировать | `buildMicroPrompt()` — приём `playerVoice` |
| `src/services/agents/censor.ts` | Модифицировать | `clean()` — regex-замена + LLM polish |
| `src/services/agents/chronicler-agent.ts` | Без изменений | уже вызывает `chronicler.logEvent()` |
| `src/services/roleplay-engine.ts` | Модифицировать | Конвейер enrichment + MetricsCollector хуки |
| `src/services/roleplay/pipeline-runner.ts` | Модифицировать | Передача `playerVoice`, `distribution` |
| `src/services/roleplay/prose/literary-v2-generator.ts` | Модифицировать | Приём `playerVoice` |
| `src/services/world-manager.ts` | Модифицировать | `createWorld` вызывает `analyzeText` (этап 1) + персист synopsis/prologue в `world_frame.json` |
| `src/services/birth.ts` | Модифицировать | `analyzeBirth` (этап 2, [S5.2]) — комбинированный refine+автор |
| `public/worlds.html` | Модифицировать | Поля Synopsis + Prologue + i18n |
| `data/author-embeddings.json` | Phase 4 | AuthorMatcher |

---

## [S18] Риски и митигации (исправлено в v1.3)

| Риск | Митигация |
|------|-----------|
| Stereotyping | Continuous scores + exploration + shadow + range (multi-dimensional) |
| Self-fulfilling prophecy | Exploration через `averageRange * 0.3`, min 5% |
| Холодный старт | Равномерное distribution при confidence < 0.3; MetricsCollector с 0.5; **range неактивен ~200 ходов** (S6) |
| LLM hallucination в PsychotypeAnalyzer | Structured output + JSON Schema + fallback к default |
| Privacy | Локально в `player-profiles.db`; агрегаты без истории действий (O(1) место) |
| Type lock-in | Range позволяет Director предлагать разнообразный контент |
| Манипуляция профиля (см. threat model ниже) | **Rate limit (maxShift 0.10/blend) + range tracking. Без inertia.** |
| Censor regex ломает грамматику | Замена клише на нейтральные альтернативы, не удаление; LLM polish |
| MetricsCollector overhead | Инкрементальные счётчики (O(1)/ход), сигналы каждые 20 ходов ✅ |

> **Fix v1.3:** в v1.2 risk table ссылалась на «inertia (0.5-0.9) + rate limit (0.05/ход)» — но inertia была удалена в S6, а rate limit = 0.10. Таблица приведена в соответствие с телом спеки.

### Threat model: «манипуляция профиля» (определена в v1.3)

В v1.2 угроза не была определена. v1.3 фиксирует:

- **Игрок не видит свой профиль** (локально, без UI) → прямого вектора воздействия нет.
- **Единственный сценарий:** игрок (или автоматизированный клиент) ведёт себя непоследовательно, пытаясь сдвинуть профиль к целевому типу.
- **Митигация:** rate limit (maxShift 0.10/blend) не даёт сдвинуть preference быстрее legitimate игрока; range tracking делает осцилляции *видимыми* (range растёт, preference остаётся стабильным) → Director предлагает разнообразный контент вместо навешивания ярлыка.
- **Out of scope:** отдельная anomaly-detection система (v1.4 при необходимости).

---

## [S19] Out of scope (v1.3)

- Ручной сброс психотипа через UI
- Визуализация распределения в UI
- AuthorMatcher + `data/author-embeddings.json` — **Phase 4** (синхронизировано с `spec-profiler-implementation.md`)
- Big Five (OCEAN) — v2+
- Нейросетевой маппинг behaviour → psychotype
- NPC-to-NPC автономные взаимодействия без игрока
- Хранение истории отдельных действий (только агрегаты)
- Per-axis confidence gates — v1.4 по результатам A/B
- Manipulation detection как отдельная система
- `range` warmup-логика (bootstrap из дисперсии первых N сигналов) — v1.4

---

## [S20] Миграция с v1.2

| v1.2 | v1.3 |
|------|------|
| Файл `_1.2.md`, заголовок v1.2, метаданные «Версия 1.3» | Единая v1.3 везде |
| Код в дизайн-спеке + дубли в impl-спеках (дрейф) | Дизайн = контракты; код только в impl-спеках |
| `overallConfidence` vs `confidence` (имя) | `confidence` |
| S5.1 missing `recentSignals` arg | передаётся |
| S14 дублированный пункт «6.» | убран |
| S18 risk table: «inertia (0.5-0.9)» | «rate limit 0.10 + range tracking, без inertia» |
| Director назван «агентом» | pure-функция, не AgentV2; коллизии имён нет (S3.2) |
| Конвейер vs `AgentV2.process()` — не определено | зафиксировано: parallel enrichment layer (S3.2) |
| Validator attribution «Nordmark forge» | исправлено: Stylist придумал, не Validator |
| NPC-психотипы без storage-плана | S8.1: `npc_perception` + lazy assignment |
| `range` холодный старт не озвучен | S6: явно ~200 ходов |
| AuthorMatcher в дизайне как v1.3 | deferred Phase 4 |
| Нет фазирования | S21 |
| Нет rollback-плана | S22 |
| Нет test-стратегии для математики | S23 |

---

## [S21] Фазирование (новое в v1.3)

> MetricsCollector (S5.1) уже построен. Дальнейшая работа разбита на независимо шипабемые фазы, каждая за флагом `jungian-profiler-enabled`.

| Фаза | Что | Эффект на нарратив | Зависимости |
|------|-----|--------------------|-------------|
| **Phase 1** | `JungianProfile` типы + persistence (`player_style_profiles` колонки) + `blendBehavioralSignals` + `updateAxis` | **Нет** — только логирование профиля. Director возвращает uniform. | MetricsCollector ✅ |
| **Phase 2** | Director `computeDistribution` + `buildPlayerVoice` + Stylist `playerVoice` + Dramaturg/Actor/Validator/Censor enrichment | **Да** — нарративная адаптация, A/B | Phase 1 |
| **Phase 3** | NPC-психотипы: `assignNpcPsychotype` + `npc_perception` + `entities.psychotype` + Actor enrichment | NPC как личности | Phase 2 |
| **Phase 4** | AuthorMatcher + `data/author-embeddings.json` + few-shot Stylist | Стилевой референс | Phase 2 |

**Каждая фаза:** за флагом, независимо откатываема (см. S22), TDD (см. S23).

---

## [S22] Rollback-план (новое в v1.3)

- **Откат = flip `jungian-profiler-enabled` → false.** Narrative path возвращается к текущему (без enrichment).
- **Schema additive:** все миграции — `ALTER TABLE ADD COLUMN` / `CREATE TABLE IF NOT EXISTS`. **Schema-downgrade не требуется** при откате флага.
- **Данные остаются:** `jungian_*` колонки и `player_behavioral_metrics` переживают откат; при повторном включении профиль продолжается с места.
- **Phase-изоляция:** откат отдельной фазы (например, Phase 3 NPC) не требует отката Phase 1/2 — флаги per-phase при необходимости (рассмотреть `jungian-npc-enabled` в Phase 3).
- **Code path:** enrichment-методы additive (S3.2) — при `flag=false` RoleplayEngine пропускает шаги 4–9 enrichment и идёт в существующий prose-путь. `AgentV2.process()` не изменён.

---

## [S23] Test-стратегия (новое в v1.3)

> В v1.2 упоминался test-файл, но «done» для вероятностных частей не определялось. v1.3 фиксирует.

### Unit-тесты (чистая математика, без LLM)

| Что | Тип | Контрактное ожидание |
|-----|-----|----------------------|
| `normalize()` | edge | все-нулевые сигналы → 0.5 |
| `signal()` | unit | `value ≥ threshold` → насыщение на weight |
| `inferFromMetrics` | snapshot | known aggregates → known AxisSignals |
| `deriveMetrics` | unit | decay'ed дробные aggregates → корректные averages |
| `updateAxis` EMA | property | после N blend с константным signal → preference → signal (converge) |
| `updateAxis` rate limit | property | единичный шумный signal не сдвигает preference > maxShift |
| `updateAxis` range growth | property | отклонение > threshold → range растёт; стабильность → range падает |
| `blendBehavioralSignals` | integration | 4 оси обновляются, confidence = среднее axisConfidence |
| `updateAxisConfidence` | unit | подтверждение +0.05 / противоречие -0.10 / нейтрально 0 |
| `computeDistribution` | property | confidence < 0.3 → uniform; weights суммируются в 1.0 после normalize |
| `injectShadow` | property | для T-доминанты добавляется emotional weight; normalize сохраняет сумму |
| `deriveType` | unit | INTJ-профиль → "INTJ"; амбивалентная ось → "X" |
| `assignNpcPsychotype` | unit | (role, faction, world) → ожидаемый psychotype; jitter в диапазоне |

### Convergence-тесты (контрактные claims из S6)

Таблица конвергенции (S6) — не assertion, а **property-based тест**: для gap=0.2 проверить, что 50% closed за ≤ ~60 ходов (допуск). Для резкого скачка — что ≤ maxShift/ход.

### Censor regex-тесты

Для каждого клише из списка — входная строка с клише → assert заменена на нейтральную альтернативу, связность сохранена.

### Что НЕ тестируется unit-ами

- Качество нарратива Stylist'а (subjective — A/B метрики S16).
- LLM structured output PsychotypeAnalyzer (тестировать через mock LLM + schema-validation).
- NPC `perceivedPlayerType` drift (интеграционный тест, Phase 3).

### Done-критерий для Phase 1

Все unit-тесты выше (кроме NPC/AuthorMatcher) зелёные; `bun test src/services/jungian-profiler.test.ts` проходит; профиль пишется в БД и читается обратно; Director при confidence<0.3 возвращает uniform (логируется, нарратив не меняется).

---

## [S24] Миграция с v1.1 (историческая справка)

| v1.1 | v1.2+ |
|------|------|
| Quiz (5 вопросов) | Prologue (свободный текст) |
| Character Hints (keywords) | Synopsis (тема) |
| Favorite Authors field | AuthorMatcher (векторный, Phase 4) |
| Статическая AUTHOR_DB (40) | AUTHOR_EMBEDDINGS (50, Phase 4) |
| Бинарный JungianType | Continuous JungianProfile (0-1) + range |
| `getNarrativeConstraints()` → строка | Director → Distribution → playerVoice |
| Три источника сигнала | Текст + пассивные метрики |
| NPC без психотипов | NPC с JungianProfile (Phase 3) |
| Нет shadow/exploration | 15% shadow + 5% exploration (min) |
