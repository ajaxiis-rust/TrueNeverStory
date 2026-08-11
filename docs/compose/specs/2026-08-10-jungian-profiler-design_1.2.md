# Jungian Player Profiler — Design Spec v1.2

> Версия: 1.2 | Дата: 2026-08-11 | Редакция: 4 (исправлены критические ошибки: диаграмма S2, пример Validator, неиспользуемые параметры Director, confidence caps, 17 пунктов)  
> Изменения v1.2: Director как вероятностный оркестратор; NPC-психотипы; пассивный профайлинг через Synopsis + Prologue; continuous scores; единый LLM-анализ текста; AuthorMatcher; WikiEnricher; shadow exploration; confidence decay; полный конвейер из 6 агентов (Director→Dramaturg→Actor→Validator→Stylist→Censor→Chronicler); Censor удаляет AI-клише; Validator проверяет правдоподобность до генерации; детальная схема оркестрации; полный пример хода с разбором всех 11 шагов.

---

## [S1] Проблема

TrueNeverStory адаптирует нарратив к стилю письма игрока (14 метрик в `PlayerStyleProfile`), но не к его **психологическому типу**. Интроверт и экстраверт, мыслитель и чувствующий — все получают одну и ту же историю.

Система понимает, *как* игрок пишет, но не *зачем* он играет и *что* его цепляет. Результат: нарратив стилистически адаптирован, но эмоционально универсален.

Кроме того, NPC лишены психологической глубины — они функциональны (кузнец, стражник, торговец), но не *личности*. Мир реагирует на игрока механически, а не *живёт*.

---

## [S2] Архитектура — Director как вероятностный оркестратор

### Ключевой принцип

Агенты (Stylist, Dramaturg, Actor, Validator, Censor, Chronicler) **не получают строковые подсказки** о психотипе. Вместо этого **Director вычисляет распределение вероятностей** на основе `JungianProfile`, а агенты сэмплят из этого распределения или получают enrichment через `playerVoice`.

```
                         ┌─────────────────────┐
   Synopsis ────────────►│                     │
   Prologue ───────────►│  PsychotypeAnalyzer  │──► JungianProfile
   World choices ──────►│  (один LLM-запрос)   │──► StyleProfile
                         │                     │──► AuthorMatch
                         └────────┬────────────┘──► Themes, Arcs
                                  │
                                  ▼
                         ┌─────────────────────┐
                         │      Director       │
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

### ProbabilityDistribution

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

**Правило применения:** адаптация включается при `profile.confidence >= 0.3`. При confidence < 0.3 Director возвращает равномерное распределение (все веса равны). Per-axis confidence gate — out of scope v1.2 (требует отдельных порогов для каждой оси, будет добавлен в v1.3 по результатам A/B).

---

## [S3] Пайплайн

```
СОЗДАНИЕ МИРА (однократно):
─────────────────────────────
[Synopsis + Prologue] → [TranslationService] → [PsychotypeAnalyzer]
    → TextAnalysis { JungianProfile, StyleProfile, AuthorMatch, Themes, Arcs }
    → сохраняется в session/memory

ОДИН ХОД (каждый раз):
───────────────────────
[Ввод игрока] → [TranslationService] → [IntentParser]
    → [SimulationEngine] → [StateMutator] → [ContextBuilder]
    → [Director.computeDistribution] → ProbabilityDistribution
    → [Dramaturg.enrichScene] → archetype + filledSkeleton
    → [Actor.enrichNpcs] → NpcEnrichment[]
    → [Validator.verify] → VerificationResult
    → [Stylist.buildMicroPrompt] → сырой нарратив (1 LLM)
    → [Censor.clean] → очищенный текст
    → [Chronicler.logEvent] → timeline
    → [TranslationService] → язык игрока
```

**PsychotypeAnalyzer (S5) вызывается однократно при создании мира** в `worlds.ts` route handler. Результат (`JungianProfile`) сохраняется в session/memory и загружается каждым последующим ходом. На каждом ходу работает конвейер из 6 агентов + Director.

---

## [S3.1] Agent Orchestration — внутри одного хода

### Все 6 агентов в конвейере

Каждый ход проходит через **полный конвейер из 6 агентов + Translation + Director**. Ни один не пропускается.

| # | Агент | Роль | Что производит | LLM? |
|---|-------|------|---------------|------|
| — | TranslationService | Перевод ввода на English | English text | Да |
| — | IntentParser | Классификация интента | Intent | Нет (regex) / Да (fallback) |
| — | SimulationEngine | Бросок кубиков | SimulationResult | Нет |
| — | StateMutator | Применение изменений | — | Нет |
| — | ContextBuilder | Сбор контекста сцены | GameContext | Нет |
| **1** | **Director** | Психотипический оркестратор | `ProbabilityDistribution` | **Нет — TypeScript** |
| **2** | **Dramaturg** | Архетип + шаблон сцены | `filledSkeleton` + archetype | Нет (SQL) / Да (MCP fallback) |
| **3** | **Actor** | Обогащение NPC | `NpcEnrichment[]` | **Нет — TypeScript** |
| **4** | **Validator** | Проверка правдоподобности | `VerificationResult` (claims, confidence) | Нет (Wikipedia API) / Да (MCP fallback) |
| **5** | **Stylist** | Генерация нарратива | **Полный текст сцены** | **Да — 1 LLM** |
| **6** | **Censor** | Очистка от клише | Очищенный текст | Нет (regex) / Да (LLM polish) |
| — | TranslationService | Перевод ответа | Текст на языке игрока | Да |
| — | **Chronicler** | Запись в timeline | — | Нет |

### Очерёдность вызовов в одном ходе

```
Шаг 0–3:     TranslationService → IntentParser → SimulationEngine → ContextBuilder
                 (без изменений относительно текущего кода)

Шаг 4:       Director.computeDistribution(profile, worldState)
                 → ProbabilityDistribution
                 (математика: 4 числа психотипа → таблица весов)
                 (~микросекунды, без LLM)

Шаг 5:       Dramaturg.enrich(dist.archetypes, gameContext)
                 → sample archetype → SQL-запрос в literary-compiler БД
                 → filledSkeleton (скелет сцены)
                 (SQL в 95% случаев. LLM — только если шаблон не найден.)

Шаг 6:       Actor.enrich(dist.informationStyle, nearbyNpcsWithPsychotypes)
                 → для каждого NPC: psychotype × informationStyle
                 → NpcEnrichment[] (строки-подсказки как NPC должен говорить)
                 (чистый TypeScript, без LLM)

Шаг 7:       Validator.verify(gameContext, filledSkeleton)
                 → проверка фактов: существует ли такой NPC в этой локации?
                   правдоподобна ли сцена? нет ли анахронизмов?
                 → VerificationResult — добавляется в playerVoice как "fact-check notes"
                 (Wikipedia API / MCP. LLM — только для сложных проверок.)

Шаг 8:       Stylist.buildMicroPrompt(filledSkeleton, style, context, outcome, playerVoice)
                 → playerVoice = сборка из Director + Dramaturg + Actor + Validator
                 → ОДИН LLM-запрос → полный нарратив

Шаг 9:       Censor.clean(rawNarrative)
                 → regex: удаление AI-клише ("delved", "tapestry", "palpable"…)
                 → проверка анахронизмов ("meanwhile, back at the ranch" в фэнтези)
                 → LLM polish для сложных случаев
                 → очищенный текст

Шаг 10:      Chronicler.logEvent(description, time, type)
                 → запись в timeline
                 → обновление NPC memory

Шаг 11:      TranslationService → язык игрока
```

### Кто генерирует текст?

**Stylist — единственный генератор текста.** Все остальные агенты enrichment-уровня — они поставляют метаданные, которые Stylist получает через `playerVoice`.

### Две стадии Censor

```typescript
interface CensorResult {
  cleaned: string;
  clichesRemoved: string[];     // какие клише были удалены
  anachronismsFixed: string[];  // какие анахронизмы исправлены
  llmPolished: boolean;         // был ли LLM-запрос для сложных случаев
}
```

1. **Regex-pass (быстрый, 0 LLM):** ищет AI-клише по списку и **заменяет их на нейтральные альтернативы**, а не вырезает:
   - `"the very fabric of X"` → `"X"`
   - `"a rich tapestry of Y"` → `"generations of Y"`
   - `"It's worth noting that Z"` → `"Z"`
   - `"The palpable silence"` → `"The silence"`
   - `"X delved into the depths of Y"` → `"X explored Y"`
   - Если клише занимает целое предложение — предложение удаляется с проверкой, что соседние предложения остаются связными.
   - Удаляет ~95% AI-клише.
2. **LLM-pass (только если остались подозрительные паттерны):** отправляет текст в LLM с инструкцией «перепиши, избегая клише, сохраняя стиль». Используется в ~10-15% случаев.

### Validator — правдоподобность до генерации

```typescript
interface VerificationResult {
  claims: Array<{
    claim: string;
    verified: boolean;
    confidence: string;        // "high" | "medium" | "low" | "unknown"
    evidence: string[];
  }>;
  worldConsistency: {
    npcInLocation: boolean;    // NPC действительно в этой локации?
    itemsAvailable: boolean;   // предмет доступен в этом мире?
    timelineCoherent: boolean; // нет противоречий с хронологией?
  };
  notes: string[];             // "Bran is confirmed in Old Oak Tavern (entity store)"
}
```

Validator **не генерирует текст.** Результат добавляется в `playerVoice` как `"Fact-check: Bran confirmed in tavern (verified, high confidence). Sword repair is plausible in medieval setting."`. Stylist учитывает это при генерации.

### Text Generation Contract (все 6 + Director + сборка playerVoice)

```typescript
// 1. Director — чистая функция
// worldState и sceneContext влияют на weights (жанр мира, настроение сцены)
function computeDistribution(
  profile: JungianProfile,
  worldState: WorldState,          // genre, socialSystem влияют на archetype weights
  sceneContext: SceneContext,      // mood, timeOfDay влияют на tone weights
): ProbabilityDistribution;

// 2. Dramaturg — enrichment (SQL + редкий LLM)
function enrichScene(
  archetypeWeights: WeightedChoice[],
  gameContext: GameContext,
): Promise<{ archetype: string; filledSkeleton: string; mood: string }>;

// 3. Actor — enrichment (чистый TypeScript)
function enrichNpcs(
  informationStyleWeights: WeightedChoice[],
  npcs: Array<{ id: string; name: string; psychotype: JungianProfile }>,
): NpcEnrichment[];

// 4. Validator — fact-check (MCP-тулы: verify_fact, get_context)
// Проверяет ТОЛЬКО факты, известные ДО генерации: из gameContext и filledSkeleton.
// НЕ проверяет детали, которые Stylist придумает позже.
function verify(
  gameContext: GameContext,
  filledSkeleton: string,
): Promise<VerificationResult>;

// 5. Stylist — ЕДИНСТВЕННЫЙ генератор текста (LLM)
// НЕ сэмплит из Distribution сам. Получает уже готовый playerVoice.
function buildMicroPrompt(
  filledSkeleton: string,
  style: { register: string; pacing: string; sensory: string[]; snippets: string[]; forbidden: string[] },
  context: { world: string; location: string; time?: string },
  outcome: string,
  playerVoice?: string,
): { system: string; user: string };

// 6. Censor — очистка (regex + редкий LLM)
// Regex-pass ЗАМЕНЯЕТ клишированные фрагменты на нейтральные альтернативы.
// Если клише занимает целое предложение — предложение удаляется с проверкой связности.
function clean(
  rawNarrative: string,
  worldContext: { genre: string; timePeriod: string },
): Promise<CensorResult>;

// ─── Сборка playerVoice ─────────────────────────────────────────────
// Вызывается в integration code (RoleplayEngine), а не в агенте.
// Сэмплинг из Distribution происходит ЗДЕСЬ, не в Stylist.
function buildPlayerVoice(
  dist: ProbabilityDistribution,
  dramaturg: { archetype: string; filledSkeleton: string; mood: string },
  actor: NpcEnrichment[],
  validator: VerificationResult,
): string {
  const tone = sample(dist.sceneTone);
  const pace = sample(dist.pacing);
  const sensory = dist.sensoryChannels.slice(0, 3).map(c => c.value);
  const infoStyle = sample(dist.informationStyle);
  
  const forbidden = dist.sceneTone
    .filter(t => t.weight < 0.08).map(t => t.value)
    .concat(['melodrama', 'emotional outburst']);

  return [
    `Player psychological context:`,
    `- Prefers ${infoStyle}, structured information`,
    `- Responds to ${tone} tone`,
    `- Sensory focus: ${sensory.join(', ')}`,
    `- Scene archetype: ${dramaturg.archetype} (mood: ${dramaturg.mood})`,
    ...actor.map(a => `- NPC ${a.name}: ${a.hint}`),
    `- Avoid: ${forbidden.join(', ')}`,
    ``,
    `Fact-check notes:`,
    ...validator.notes.map(n => `- ${n}`),
  ].join('\n');
}

function sample(choices: WeightedChoice[]): string {
  const r = Math.random();
  let cumulative = 0;
  for (const c of choices) {
    cumulative += c.weight;
    if (r <= cumulative) return c.value;
  }
  return choices[choices.length - 1]!.value;
}
```

### Определение injectShadow

```typescript
// Добавляет в distribution веса для слабой (inferior) функции игрока.
// INTJ (T-доминант, F-слабость): добавляет низковероятностный emotional контент.
// ESFP (F-доминант, T-слабость): добавляет низковероятностный analytical контент.
function injectShadow(dist: ProbabilityDistribution, profile: JungianProfile): void {
  const rate = dist.shadowInjection;

  // Слабая judging-функция: T → добавляем emotional, F → добавляем analytical
  if (profile.thinking > 0.6) {
    dist.informationStyle.push({ value: 'emotional', weight: rate });
    dist.sceneTone.push({ value: 'warm, personal', weight: rate });
  }
  if (profile.thinking < 0.4) {
    dist.informationStyle.push({ value: 'analytical', weight: rate });
    dist.sceneTone.push({ value: 'dry, factual', weight: rate });
  }
  
  // Слабая perceiving-функция: N → добавляем sensory-детали, S → добавляем символизм
  if (profile.intuition > 0.6) {
    dist.sensoryChannels.push({ value: 'concrete, tactile', weight: rate });
  }
  if (profile.intuition < 0.4) {
    dist.sensoryChannels.push({ value: 'symbolic, metaphorical', weight: rate });
  }

  normalizeWeights(dist);
}

function normalizeWeights(dist: ProbabilityDistribution): void {
  for (const key of ['sceneTone', 'archetypes', 'pacing', 'sensoryChannels', 'informationStyle'] as const) {
    const total = dist[key].reduce((s, c) => s + c.weight, 0);
    if (total > 0) dist[key].forEach(c => c.weight /= total);
  }
}
```

### Интеграция в RoleplayEngine

```typescript
// В _processInputImpl после buildGameContext (текущий шаг 5)

if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
  const profile = this.profileStore.getProfile(playerId)?.jungianProfile;
  if (profile && profile.confidence >= 0.3) {
    // 1. Director
    const dist = Director.computeDistribution(profile, worldState, sceneContext);
    
    // 2. Dramaturg
    const dramaturgEnrichment = await this.dramaturg.enrichScene(dist.archetypes, gameContext);
    
    // 3. Actor
    const actorEnrichment = Actor.enrichNpcs(dist.informationStyle, gameContext.nearbyNpcs);
    
    // 4. Validator
    const verification = await this.validator.verify(gameContext, dramaturgEnrichment.filledSkeleton);
    
    // Собрать playerVoice из ВСЕХ enrichment
    ctx.playerVoice = buildPlayerVoice(dist, dramaturgEnrichment, actorEnrichment, verification);
    ctx.distribution = dist;
  }
}

// 5. Stylist — существующий код generate prose, получает playerVoice
let narrative = await this.stylist.buildMicroPrompt(..., ctx.playerVoice);

// 6. Censor
if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
  narrative = await this.censor.clean(narrative, {
    genre: this._worldFrame.genre as string,
    timePeriod: 'medieval',
  });
}

// 7. Chronicler
await this.chronicler.logEvent(narrativeSummary, this.currentTime, 'narrative');
```

### LLM-запросы: полный конвейер

| # | Компонент | LLM | Примечание |
|---|-----------|-----|------------|
| 0 | TranslationService (вход) | 0-1 | Комбинирован с Intent если язык ≠ EN |
| — | IntentParser | 0-1 | Regex first, LLM fallback |
| 1 | Director | **0** | Чистый TypeScript |
| 2 | Dramaturg | **0** (редко 1) | SQL. LLM — только генерация нового шаблона. |
| 3 | Actor | **0** | Чистый TypeScript |
| 4 | Validator | **0** (редко 1) | Wikipedia API. LLM — сложные проверки. |
| 5 | Stylist | **1** | Основной генератор текста |
| 6 | Censor | **0** (редко 1) | Regex. LLM — polish в ~10-15% случаев. |
| 7 | TranslationService (выход) | 0-1 | Только если язык ≠ EN |
| — | Chronicler | **0** | SQL INSERT |

**Всего на ход: 1-4 LLM.** Диапазон как сейчас. Director, Actor, Chronicler — 0 LLM. Dramaturg, Validator, Censor — 0 в типичном случае, +1 каждый в редких edge-кейсах.

---

## [S4] Входные данные: Synopsis + Prologue

### Форма создания мира (worlds.html)

Существующие поля сохраняются: Description, World Rules, Genres, Social System, Economy, Magic, Language.

Добавляются два новых поля:

| Поле | Тип | Назначение |
|------|-----|------------|
| **Synopsis** | textarea (1-3 предложения) | «О чём ваша история?» Тема, конфликт, ставки |
| **Prologue** | textarea (100-1000 слов, опционально) | «Как начинается ваш мир?» Пролог/предистория |

### Почему Synopsis + Prologue

- **Synopsis** → тема и глобальный фокус (ЧТО интересует игрока)
- **Prologue** → психотип, язык, стиль (КАК игрок думает и пишет)
- **Оба опциональны.** Пустой Synopsis → тема из жанров. Пустой Prologue → холодный старт, профиль строится из поведения.
- **Это проективный тест.** Игрок не знает, что его анализируют. Он просто пишет историю.

### i18n

Все label, placeholder, tip — через существующую систему `I18N` для 7 языков (EN, RU, DE, FR, ES, JA, ZH).

---

## [S5] PsychotypeAnalyzer — единый LLM-анализ

### Structured Output Schema

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
    sentenceProfile: {
      avgLength: number;
      complexity: 'simple' | 'moderate' | 'complex';
    };
  };
  closestAuthor: {
    name: string;
    matchConfidence: number;
    matchReason: string;
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

### Промпт (English)

Система отправляет Synopsis + Prologue (переведённые на English) одним запросом. LLM возвращает structured JSON.

### Обработка результата

`TextAnalysis.psychotype.overallConfidence` маппится в `JungianProfile.confidence` при `source: 'text'`. Значение capped по длине текста:

```typescript
function analyzeText(synopsis: string, prologue: string): TextAnalysis {
  const wordCount = (synopsis + ' ' + prologue).split(/\s+/).filter(Boolean).length;
  
  // LLM возвращает raw confidence, но мы cap'им по длине текста:
  const cap = wordCount < 50  ? 0.2
            : wordCount < 200 ? 0.35
            : wordCount < 500 ? 0.45
            : 0.55;
  
  // raw_confidence из LLM capped → это начальный JungianProfile.confidence
  const confidence = Math.min(analysis.psychotype.overallConfidence, cap);
  
  // Дальнейший blend с metrics повышает confidence до диапазонов из S6
  return { ...analysis, psychotype: { ...analysis.psychotype, overallConfidence: confidence } };
}
```

Начальный confidence из текста: 0.2–0.55 (capped). После blend с metrics (20+ ходов): 0.55–0.80. После 50+ ходов: 0.75–0.95.

### Fallback: пустой текст

Если Synopsis и Prologue пусты — анализатор не вызывается. `JungianProfile` начинается с `createDefaultProfile()` (все оси = 0.5, confidence = 0).

---

## [S6] JungianProfile — continuous scores

```typescript
interface JungianProfile {
  extraversion: number;      // 0 = pure I, 1 = pure E, 0.5 = neutral
  intuition: number;         // 0 = pure S, 1 = pure N
  thinking: number;          // 0 = pure F, 1 = pure T
  judging: number;           // 0 = pure P, 1 = pure J

  confidence: number;
  axisConfidence: {
    extraversion: number;
    intuition: number;
    thinking: number;
    judging: number;
  };
  source: 'text' | 'metrics' | 'blended' | 'default';
}

function createDefaultProfile(): JungianProfile {
  return {
    extraversion: 0.5, intuition: 0.5, thinking: 0.5, judging: 0.5,
    confidence: 0,
    axisConfidence: { extraversion: 0, intuition: 0, thinking: 0, judging: 0 },
    source: 'default',
  };
}

// Derived 4-letter type for 16-style adaptation table
function deriveType(profile: JungianProfile): string {
  const e = profile.extraversion > 0.55 ? 'E' : profile.extraversion < 0.45 ? 'I' : 'X';
  const n = profile.intuition > 0.55 ? 'N' : profile.intuition < 0.45 ? 'S' : 'X';
  const t = profile.thinking > 0.55 ? 'T' : profile.thinking < 0.45 ? 'F' : 'X';
  const j = profile.judging > 0.55 ? 'J' : profile.judging < 0.45 ? 'P' : 'X';
  return e + n + t + j; // "INFJ", "ESTP", "XNTP" (амбивалентный N)
}

// How "clear" is the type (distance from neutral)
function axisClarity(profile: JungianProfile): number {
  const axes = [profile.extraversion, profile.intuition, profile.thinking, profile.judging];
  return axes.reduce((sum, x) => sum + Math.abs(x - 0.5) * 2, 0) / 4;
}
```

### Почему continuous

- **Градуальная адаптация.** Игрок на 0.6 T получает мягкий T-стиль, на 0.9 T — выраженный.
- **Амбивалентные профили.** Оси около 0.5 → адаптация минимальна.
- **Совместимость с таблицей 16 типов.** `deriveType` даёт строку для `getNarrativeConstraints`.
- **Путь к Big Five.** Continuous scores — 4 из 5 факторов OCEAN.

### Confidence formula (в blend)

```text
newAxisConfidence = min(0.95, current + weight * (1 - current) * signalStrength)
newAxisValue = current + weight * (incoming - current)
  — только если incomingAxisConfidence по этой оси > 0
overallConfidence = среднее по 4 newAxisConfidence
```

Ожидаемые диапазоны:
| Источник | overall confidence |
|----------|--------------------|
| Text only (Prologue 200+ слов) | 0.25–0.45 |
| + Metrics (≥20 ходов) | 0.55–0.80 |
| + Metrics (≥50 ходов) | 0.75–0.95 |

---

## [S7] AuthorMatcher — векторный поиск

Вместо статической `AUTHOR_DB` — **векторный поиск** по embeddings пролога.

### Реализация

1. **Предварительно:** embeddings для корпуса ~50 классических авторов (первые главы). Хранятся в `data/author-embeddings.json`.
2. **На лету:** embedding пролога → cosine similarity → топ-3 ближайших автора.
3. **LLM выбирает лучшего** из топ-3 (тот же запрос S5).

```typescript
interface AuthorEntry {
  name: string;
  embedding: number[];        // 384-мерный (BGE-M3) или 768-мерный
  psychotype: JungianProfile; // экспертно определённый психотип автора
  samplePhrases: string[];    // 3-5 характерных фраз для few-shot
  genres: string[];
}
```

### Использование

- **Стилевой референс для Stylist:** «Используй конструкции, характерные для [Author]»
- **Сэмплы прозы как few-shot** в промпт Stylist (2-3 предложения)

---

## [S8] NPC Psychotypes

Каждый NPC получает `JungianProfile`. Это делает их личностями, а не функциями.

### Назначение типа NPC

Тип назначается на основе:
- **Роли:** кузнец → S+J; бард → N+F+P; стражник → S+J; учёный → N+T
- **Фракции:** разбойники → P; инквизиция → J; торговая гильдия → S+T
- **Мира:** феодализм → J-типы; анархия → P-типы
- **Случайный jitter** для вариативности

```typescript
interface NpcProfile {
  npcId: string;
  psychotype: JungianProfile;
  // Как NPC воспринимает игрока через призму своего типа.
  // Вычисляется после 3+ взаимодействий: реальный профиль игрока ±0.2 смещение.
  // ISTP-кузнец видит INTJ-игрока как "ещё более холодного" (thinking +0.2).
  // ESFJ-трактирщица видит INTJ-игрока как "замкнутого, но надёжного" (extraversion -0.1).
  // Обновляется каждые 10 взаимодействий.
  perceivedPlayerType: JungianProfile;
  interactionHistory: Array<{
    ts: number;
    type: string;
    tension: number;
  }>;
}
```

### Влияние на поведение

- **Диалоги:** противоположный тип → напряжение. Похожий → союзник.
- **NPC-to-NPC:** ISTJ-кузнец + ENFP-бард → готовая драма.
- **Профайлинг игрока:** реакции на NPC выдают тип игрока.

---

## [S9] Director — ProbabilityDistribution

```typescript
function computeDistribution(
  profile: JungianProfile,
  worldState: WorldState,
  sceneContext: SceneContext,
): ProbabilityDistribution {
  if (profile.confidence < 0.3) return uniformDistribution();

  const dist: ProbabilityDistribution = {
    sceneTone: computeToneDistribution(profile),
    archetypes: computeArchetypeDistribution(profile),
    pacing: computePacingDistribution(profile),
    sensoryChannels: computeSensoryDistribution(profile),
    informationStyle: computeInfoStyleDistribution(profile),
    shadowInjection: profile.confidence > 0.5 ? 0.15 : 0.05,
    explorationFactor: 0.05,
  };

  injectShadow(dist, profile);
  injectExploration(dist);
  return dist;
}
```

### Интеграция с агентами

- **Stylist:** `sample(dist.sceneTone)`, `sample(dist.pacing)`, `sample(dist.sensoryChannels)` → `buildMicroPrompt`
- **Dramaturg:** `sample(dist.archetypes)` → приоритет в `get_pattern` MCP-запросе
- **Actor:** `sample(dist.informationStyle)` → enrichment `personality` поля NPC
- **EconomicService:** `sample(dist.informationStyle)` → enrichment через Stylist

---

## [S9.1] Complete Turn Example — INTJ в таверне (полный конвейер)

Полный прогон одного хода через все 6 агентов + Translation.

### Исходные данные

- **Игрок:** INTJ (extraversion=0.3, intuition=0.8, thinking=0.75, judging=0.7, confidence=0.82)
- **Язык:** русский
- **Мир:** фэнтези-средневековье
- **Персонаж:** странник Алек
- **Действие:** «Я вхожу в таверну "Старый Дуб" и ищу кузнеца Брана, чтобы починить сломанный меч»

### Шаг 0. TranslationService → English

> "I enter the 'Old Oak' tavern and look for the blacksmith Bran to repair my broken sword."

### Шаг 1. IntentParser

```json
{ "type": "dialogue", "target": "Bran", "content": "looking for blacksmith to repair broken sword" }
```

### Шаг 2. SimulationEngine

Бросок кубиков. Исход: **success**. State changes: `inventory.sword.condition → repaired`.

### Шаг 3. StateMutator + ContextBuilder

```json
{
  "location": { "name": "Old Oak Tavern", "type": "tavern" },
  "nearbyNpcs": [
    { "name": "Bran", "psychotype": "ISTP" },
    { "name": "Innkeeper Marta", "psychotype": "ESFJ" },
    { "name": "Minstrel Lio", "psychotype": "ENFP" }
  ],
  "time": "dusk",
  "worldRules": ["Magic requires blood sacrifice", "The dead cannot be resurrected"],
  "world": { "name": "Dark Realm", "genre": "fantasy" }
}
```

### Шаг 4. Director.computeDistribution(INTJ_profile)

**0 LLM. Чистая математика.**

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
    { "value": "judgment_trial",         "weight": 0.35 },
    { "value": "political_intrigue",     "weight": 0.25 },
    { "value": "wisdom_counsel",         "weight": 0.20 },
    { "value": "rescue",                 "weight": 0.10 },
    { "value": "random",                 "weight": 0.10 }
  ],
  "pacing": [
    { "value": "medium",                 "weight": 0.50 },
    { "value": "slow",                   "weight": 0.30 },
    { "value": "fast",                   "weight": 0.20 }
  ],
  "sensoryChannels": [
    { "value": "visual",                 "weight": 0.35 },
    { "value": "tactile",                "weight": 0.30 },
    { "value": "atmospheric",            "weight": 0.20 },
    { "value": "auditory",               "weight": 0.10 },
    { "value": "emotional",              "weight": 0.05 }
  ],
  "informationStyle": [
    { "value": "analytical",             "weight": 0.55 },
    { "value": "balanced",               "weight": 0.30 },
    { "value": "emotional",              "weight": 0.10 },
    { "value": "concrete",               "weight": 0.05 }
  ],
  "shadowInjection": 0.15,
  "explorationFactor": 0.05
}
```

### Шаг 5. Dramaturg — архетип + шаблон

**0 LLM. SQL-запрос к literary-compiler БД.**

Сэмплит из `dist.archetypes`: выпало **judgment_trial** (35%).

```json
{
  "archetype": "judgment_trial",
  "filledSkeleton": "Alek enters the tavern seeking sword repair. Bran assesses Alek's worth. Evidence of breaking the sword fighting bandits is presented. The verdict will determine whether Bran helps.",
  "mood": "tense"
}
```

### Шаг 6. Actor — enrichment NPC

**0 LLM. Чистый TypeScript.** Для каждого NPC: psychotype × informationStyle(analytical, 0.55).

```
Bran (ISTP: S+T+P):
  "Practical, blunt, tool-oriented. Speaks in short, precise sentences. Gives exact 
   prices. References material quality. Avoids small talk. Shop organized by function."

Marta (ESFJ: S+F+J):
  "Warm but orderly. Under analytical style, presents tavern's menu as a structured 
   list rather than emotional recommendations. First ale on the house — but listed 
   as a line item."

Lio (ENFP: N+F+P):
  "Background presence. Under analytical style, nearly invisible to Alek. His song 
   lyrics sound like cryptic riddles that an INTJ might find intriguing if noticed 
   at all."
```

### Шаг 7. Validator — проверка правдоподобности

**0 LLM. MCP-тулы `verify_fact` + `get_context`.**

Validator проверяет ТОЛЬКО факты, известные ДО генерации: из `gameContext`, `filledSkeleton`, entity store. Детали, которые Stylist придумает позже (имена кузниц, конкретные цены), проверяются Censor'ом постфактум.

```json
{
  "claims": [
    {
      "claim": "Bran the blacksmith is in Old Oak Tavern",
      "verified": true,
      "confidence": "high",
      "evidence": ["Entity store confirms Bran.type=Character, location=Old Oak Tavern"]
    },
    {
      "claim": "Sword can be repaired by a medieval blacksmith",
      "verified": true,
      "confidence": "high",
      "evidence": ["MCP verify_fact: blacksmiths performed blade repair including crossguard replacement"]
    }
  ],
  "worldConsistency": {
    "npcInLocation": true,
    "itemsAvailable": true,
    "timelineCoherent": true
  },
  "notes": [
    "Bran confirmed in Old Oak Tavern (entity store, high confidence)",
    "Sword repair is historically plausible in medieval setting",
    "No anachronisms detected in scene context"
  ]
}
```

### Шаг 8. Stylist — генерация текста

**1 LLM. Единственный генератор.** `playerVoice` собирается из Director + Dramaturg + Actor + Validator:

```
Player psychological context:
- Prefers analytical, structured information
- Responds to controlled, strategic tone
- Sensory focus: visual, tactile, atmospheric
- Scene archetype: judgment_trial (mood: tense)
- NPC Bran: practical, blunt. Speaks in short precise sentences. Gives exact prices.
- NPC Marta: warm but orderly. Presents information in structured way.
- NPC Lio: background presence. Cryptic, riddling lyrics if noticed at all.
- Avoid melodrama. Avoid emotional outburst. Avoid small talk.

Fact-check notes:
- Bran confirmed in Old Oak Tavern (verified, high confidence)
- Sword repair is historically plausible (blacksmiths performed blade repair)
- No anachronisms detected in scene
```

**Stylist.buildMicroPrompt(filledSkeleton, style, context, outcome, playerVoice).**

**LLM генерирует (сырой текст до Censor):**

```
The Old Oak's door swung inward on oiled hinges — the first sign of a 
well-kept establishment. Alek noted the iron reinforcements, the absence 
of rust, the precise dovetail joints in the oak boards. It was a place 
where craftsmanship spoke louder than words — a quiet testament to the 
delved depths of human ingenuity. The very fabric of the tavern seemed 
woven with stories, a rich tapestry of lives lived and forgotten.

The smithy occupied the far corner. Tools hung on the wall in descending 
order of size: hammers, tongs, chisels, files. Each had its place. Bran 
stood behind a heavy workbench, sorting a tray of rivets into three piles. 
He didn't look up.

"Broken blade." It wasn't a question. His eyes had found the wrapped bundle 
in Alek's hand.

"Bandits. Three of them. The crossguard took the worst of it."

Bran turned the sword over once. His thumb traced the fracture line. 
"Good steel. Nordmark forge, third generation. This didn't break from 
poor craftsmanship." He met Alek's eyes for the first time. "You blocked 
an axe with it. Stupid, but brave. The edge saved your ribs."

"Can you fix it?"

"Four silver. Ready by dawn." He set the sword on the bench. "Leave it. 
Come back when the bell rings six."

Behind the counter, Marta was arranging tankards. She caught Alek's eye 
and pointed at a chalkboard: *Ale — 2 copper. Stew — 5 copper. Room — 
8 copper (includes breakfast)*. "First ale's on the house," she said, 
already filling a tankard. "You look like you've been through something. 
It's worth noting that the stew is fresh today."

In the corner, the minstrel's lute whispered something about a man who 
broke his sword against fate and found it sharper for the breaking. Alek 
didn't notice. The palpable silence of his indifference hung in the air.
```

### Шаг 9. Censor — очистка

**0 LLM. Regex-pass.** Находит и удаляет AI-клише:

| Найдено | Заменено на | Тип |
|---------|-------------|-----|
| `"the delved depths of human ingenuity"` | `"(удалено — целое клише-предложение)"` | ✂️ delved |
| `"The very fabric of the tavern seemed woven with stories"` | `"The tavern"` | ✂️ very fabric of |
| `", a rich tapestry of lives lived and forgotten"` | `""` | ✂️ rich tapestry |
| `"It's worth noting that the stew is fresh today"` | `"The stew is fresh today"` | ✂️ it's worth noting |
| `"The palpable silence of his indifference"` | `"The silence of his indifference"` | ✂️ palpable |

**Результат Censor:** 5 клише удалено. `llmPolished: false` (regex справился).

### Финальный текст (после Censor)

```
The Old Oak's door swung inward on oiled hinges — the first sign of a 
well-kept establishment. Alek noted the iron reinforcements, the absence 
of rust, the precise dovetail joints in the oak boards. Whoever built 
this place understood their trade.

The smithy occupied the far corner. Tools hung on the wall in descending 
order of size: hammers, tongs, chisels, files. Each had its place. Bran 
stood behind a heavy workbench, sorting a tray of rivets into three piles. 
He didn't look up.

"Broken blade." It wasn't a question. His eyes had found the wrapped bundle 
in Alek's hand.

"Bandits. Three of them. The crossguard took the worst of it."

Bran turned the sword over once. His thumb traced the fracture line. 
"Good steel. Nordmark forge, third generation. This didn't break from 
poor craftsmanship." He met Alek's eyes for the first time. "You blocked 
an axe with it. Stupid, but brave. The edge saved your ribs."

"Can you fix it?"

"Four silver. Ready by dawn." He set the sword on the bench. "Leave it. 
Come back when the bell rings six."

Behind the counter, Marta was arranging tankards. She caught Alek's eye 
and pointed at a chalkboard: *Ale — 2 copper. Stew — 5 copper. Room — 
8 copper (includes breakfast)*. "First ale's on the house," she said, 
already filling a tankard. "You look like you've been through something."

In the corner, the minstrel's lute whispered something about a man who 
broke his sword against fate and found it sharper for the breaking. Alek 
didn't notice.
```

### Шаг 10. Chronicler — запись в timeline

**0 LLM. SQL INSERT.**

```
Event: "Alek entered the Old Oak Tavern seeking Bran the blacksmith. 
Bran agreed to repair the broken sword (Nordmark forge, third generation) 
for four silver. Marta offered hospitality."
Time: dusk, Day 3
Type: narrative
```

### Шаг 11. TranslationService → русский

---

### Разбор: кто за что отвечает

| Фрагмент текста | Кто определил |
|---|---|
| «oiled hinges, iron reinforcements, dovetail joints» | **Director → sensoryChannels: visual+tactile** |
| «Tools hung in descending order of size» | **Director → informationStyle: analytical** |
| «Bran didn't look up» | **Actor → Bran=ISTP, blunt** |
| «Good steel. Nordmark forge, third generation» | **Actor → Bran=ISTP + analytical → факты** |
| «Stupid, but brave» | **Dramaturg → judgment_trial → оценка** |
| «Four silver. Ready by dawn» | **Actor → ISTP + analytical → точные цифры** |
| «Ale — 2 copper. Stew — 5 copper» — список | **Actor → Marta=ESFJ под analytical линзой** |
| «First ale's on the house» — теплота | **Actor → Marta=ESFJ, F-тип (shadow/contrast)** |
| «Nordmark forge» — географическая деталь | **Validator → Wikipedia: Nordmark region exists** |
| Удалённые клише (delved, tapestry, palpable…) | **Censor → regex-pass** |
| «Alek didn't notice» — финал | **Director → I-type: интровертная линза** |

### Тот же мир — другой тип (Stylist + Censor — единый генератор)

| Тип | Что бы он увидел в ТОЙ ЖЕ таверне |
|---|---|
| **ESFP** (S+F+P) | «Музыка гремела, пахло жареным мясом. Рыжая девушка за соседним столом улыбнулась. Бран хлопнул Алека по плечу: "Дружище! Сто лет тебя не видел! Садись, выпьем!"» |
| **INTP** (N+T+P) | «Таверна работала как механизм. Подача эля — 12 секунд. Кузнец брал 4 серебра за починку — на 0.5 выше рыночной. Монополия? Сговор с гильдией?» |
| **INFJ** (N+F+J) | «В полумраке таверны свет падал только на руки Брана — руки человека, который чинит сломанное. "Меч можно починить за четыре серебра. Душу — за всю жизнь."» |

**Один мир. Один движок. Шесть агентов. Четыре разные подачи.**

### LLM-запросы: этот конкретный ход

| Шаг | Компонент | LLM |
|-----|-----------|-----|
| 0 | TranslationService (вход) | 1 (translateAndClassify — комбинированный) |
| 1 | IntentParser | 0 (regex match) |
| 4 | **Director** | **0** |
| 5 | **Dramaturg** | **0** (SQL hit) |
| 6 | **Actor** | **0** |
| 7 | **Validator** | **0** (Wikipedia API) |
| 8 | **Stylist** | **1** |
| 9 | **Censor** | **0** (regex, без LLM polish) |
| 10 | **Chronicler** | **0** |
| 11 | TranslationService (выход) | 1 |
| **Итого** | | **3 LLM** (translate+classify + Stylist + translate back) |

**Стоимость: 3 LLM-запроса.** Ровно столько же, сколько текущий код для русскоязычного игрока. Director, Actor, Chronicler — всегда 0. Dramaturg, Validator, Censor — 0 в типичном случае.

---

## [S10] Narrative adaptation — таблица 16 типов (производная)

`getNarrativeConstraints(profile)` использует `deriveType()` для маппинга. При амбивалентных осях ('X') — intermediate стиль.

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

Stylist имеет `buildAntiMoralizingPrompt()`. Для F-типов (thinking < 0.5) ограничение ослабляется:

```typescript
function getMoralizingGate(profile: JungianProfile): 'strict' | 'relaxed' | 'off' {
  if (profile.thinking > 0.7) return 'strict';
  if (profile.thinking > 0.5) return 'relaxed';
  return 'off';
}
```

---

## [S11] Архетипические предпочтения (Dramaturg)

Вероятностные веса вместо жёстких списков. Dramaturg передаёт в `get_pattern`:

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

### Новые колонки в `player_style_profiles`

```sql
ALTER TABLE player_style_profiles ADD COLUMN jungian_extraversion REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_intuition REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_thinking REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_judging REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_confidence REAL NOT NULL DEFAULT 0;
ALTER TABLE player_style_profiles ADD COLUMN jungian_source TEXT NOT NULL DEFAULT 'default';
ALTER TABLE player_style_profiles ADD COLUMN jungian_history TEXT NOT NULL DEFAULT '[]';
ALTER TABLE player_style_profiles ADD COLUMN closest_author TEXT;
ALTER TABLE player_style_profiles ADD COLUMN detected_themes TEXT NOT NULL DEFAULT '[]';
```

Миграция через `PRAGMA table_info` перед каждым `ALTER` (SQLite не поддерживает `IF NOT EXISTS`).

### Пайплайн обновления

1. **При создании мира:** `analyzeText(synopsis, prologue)` → session/memory
2. **При Birth Wizard:** hints уточняют (слабые сигналы, weight ≤ 0.15)
3. **Каждые 20 ходов:** `inferFromMetrics` → `blend` → update DB
4. **Confidence decay:** 10+ противоречащих ходов → `confidence *= 0.9`
5. **Exploration:** ~5% контента всегда равномерное distribution

---

## [S15] Cross-session persistence

- Профиль переживает сессии
- При бездействии > 7 дней: `confidence` decay

---

## [S16] A/B тестирование

Флаг `jungian-profiler-enabled` (default: **false**).

Метрики: session length, return rate, turns per session, per-type distribution.
Логи тегируются `jungianEnabled` + `jungianType` + `confidence`.

---

## [S17] Файловая структура

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `src/services/jungian-profiler.ts` | Создать | Profiler, Director, PsychotypeAnalyzer, AuthorMatcher, типы, constraints |
| `src/services/jungian-profiler.test.ts` | Создать | Unit-тесты: Director, blend, infer, constraints |
| `src/lib/player-profile-store.ts` | Модифицировать | 9 новых колонок (jungian_* + closest_author + detected_themes) |
| `src/lib/feature-flags.ts` | Модифицировать | Флаг `jungian-profiler-enabled` + дефолтная конфигурация |
| `conf/feature-flags.json` | Модифицировать | Конфигурация флага с вариантами control/treatment |
| **Big Six — интеграция в пайплайн:** | | |
| → Director | pure function в `jungian-profiler.ts` | Старый `DirectorAgent` — без изменений, для `@director` mention |
| `src/services/agents/dramaturg.ts` | Модифицировать | `enrichScene()` — SQL к **literary-compiler** БД (`searchTemplates`). Bible MCP не используется в enrichment. |
| `src/services/agents/actor.ts` | Модифицировать | `enrichNpcs()` — NPC psychotype × informationStyle |
| `src/services/agents/validator.ts` | Модифицировать | `verify()` — существующие **MCP-тулы** (`verify_fact`, `get_context`) |
| `src/services/agents/stylist.ts` | Модифицировать | `buildMicroPrompt()` — получает готовый `playerVoice`, сэмплинг делает integration code |
| `src/services/agents/censor.ts` | Модифицировать | `clean()` — regex-замена клише (не удаление) + LLM polish |
| `src/services/agents/chronicler-agent.ts` | Без изменений | **ChroniclerAgent** (v2) уже вызывает `chronicler.logEvent()` |
| **Интеграция:** | | |
| `src/services/roleplay-engine.ts` | Модифицировать | Конвейер: Director→Dramaturg→Actor→Validator→Stylist→Censor. PsychotypeAnalyzer — в `worlds.ts`. |
| `src/services/roleplay/pipeline-runner.ts` | Модифицировать | Передача `playerVoice` и `distribution` в контекст |
| `src/services/roleplay/prose/literary-v2-generator.ts` | Модифицировать | Приём `playerVoice` вместо самостоятельного поиска шаблонов |
| **Ввод данных (точка вызова PsychotypeAnalyzer):** | | |
| `src/routes/worlds.ts` | Модифицировать | **Вызывает `PsychotypeAnalyzer.analyzeText(synopsis, prologue)`** однократно при создании мира |
| `public/worlds.html` | Модифицировать | Поля Synopsis + Prologue + i18n для 7 языков |
| **Данные:** | | |
| `data/author-embeddings.json` | Создать | Предвычисленные embeddings ~50 авторов (BGE-M3, 384-мерные) |

---

## [S18] Риски и митигации

| Риск | Митигация |
|------|-----------|
| Stereotyping | Continuous scores + exploration + shadow |
| Self-fulfilling prophecy | Exploration 5% + confidence decay |
| Холодный старт | Равномерное distribution при confidence < 0.3 |
| LLM hallucination в PsychotypeAnalyzer | Structured output + JSON Schema + fallback к default |
| AuthorMatcher размер | 384-мерный (BGE-M3), ~50 авторов = < 100KB |
| Privacy | Локально в `player-profiles.db` |
| Type lock-in | Decay + exploration |
| Censor regex ломает грамматику | Замена клише на нейтральные альтернативы, не удаление; LLM polish для сложных случаев |

---

## [S19] Out of scope (v1.2)

- Ручной сброс психотипа через UI
- Визуализация распределения в UI
- AUTHOR_EMBEDDINGS 100+ (seed 50)
- Big Five (OCEAN) — v2+
- Нейросетевой маппинг behaviour → psychotype
- NPC-to-NPC автономные взаимодействия без игрока

---

## [S20] Миграция с v1.1

| v1.1 | v1.2 |
|------|------|
| Quiz (5 вопросов) | Prologue (свободный текст) |
| Character Hints (keywords) | Synopsis (тема) |
| Favorite Authors field | AuthorMatcher (векторный поиск) |
| Статическая AUTHOR_DB (40) | AUTHOR_EMBEDDINGS (50) |
| Бинарный JungianType | Continuous JungianProfile (0-1) |
| `getNarrativeConstraints()` → строка | `Director.process()` → Distribution |
| Три источника сигнала | Текст + пассивные метрики |
| NPC без психотипов | NPC с JungianProfile |
| Нет shadow/exploration | 15% shadow + 5% exploration |
