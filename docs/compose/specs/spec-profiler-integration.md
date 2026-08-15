# Profiler Integration — Jungian Profiler

> Спека 4 из 5. Wiring всего в движок.
> Зависит от: [Spec 1 — Blend](spec-blend-algorithm.md) | [Spec 2 — Metrics](spec-behavioral-metrics.md) | [Spec 3 — Persistence](spec-profiler-persistence.md) | [Spec 5 — Implementation](spec-profiler-implementation.md)
>
> **Архитектурное решение (дизайн S3.2):** enrichment-конвейер Director→Dramaturg→Actor→Validator→Stylist→Censor идёт через dedicated-методы агентов, **НЕ** через `AgentV2.process()`. `process()` остаётся нетронутым для prose/`@mention`. Методы additive, за флагом.

## 1. Хуки в roleplay-engine.ts

### Точка входа: `_processInputImpl` / `_processInputStreamImpl`

```typescript
// В roleplay-engine.ts, _processInputImpl() — ПОСЛЕ IntentParser.parse():
this.metricsCollector.recordIntent(intent, ctx.parsedInput, /* initiated */ true); // _processInputImpl — только player-initiated ввод

// ПОСЛЕ SimulationEngine.simulate():
this.metricsCollector.recordSimulation(intent, simResult);

// КАЖДЫЙ ХОД — sync visited locations + input:
this.metricsCollector.recordInput(ctx.parsedInput);

// КАЖДЫЕ 20 ХОДОВ — blend:
if (this.metricsCollector.getTurnCount() % 20 === 0) {
  const derived = deriveMetrics(this.metricsCollector.getAggregates(), this.metricsCollector.getTurnCount(), this.visitedLocations.size);
  const signals = inferFromMetrics(derived);
  this.jungianProfile = blendBehavioralSignals(signals, this.jungianProfile, this.recentSignals);
  this.metricsCollector.decay();
  this.playerProfileStore.upsertJungianProfile(this.playerId, this.jungianProfile);
  this.playerProfileStore.upsertBehavioralMetrics(this.playerId, this.metricsCollector.getAggregates(), this.metricsCollector.getTurnCount(), signals);
}
```

### Инициализация

```typescript
// В конструкторе RoleplayEngine или при загрузке сессии:
this.jungianProfile = this.playerProfileStore.getJungianProfile(this.playerId) ?? createDefaultProfile();
this.metricsCollector = new MetricsCollector();
// Восстановить агрегаты из БД (если есть):
const saved = this.playerProfileStore.getBehavioralMetrics(this.playerId);
if (saved) this.metricsCollector.restore(saved.aggregates, saved.totalTurns);
```

### recentSignals (rolling window)

Для blend нужны последние 10 сигналов каждой оси. Хранятся в памяти (не в БД):

```typescript
private recentSignals: {
  extraversion: number[];
  intuition: number[];
  thinking: number[];
  judging: number[];
} = { extraversion: [], intuition: [], thinking: [], judging: [] };

// При каждом blend-цикле:
this.recentSignals.extraversion.push(signals.extraversion);
if (this.recentSignals.extraversion.length > 10) this.recentSignals.extraversion.shift();
// ... аналогично для остальных осей
```

## 2. Pipeline — обзор

```
СОЗДАНИЕ МИРА (однократно):
─────────────────────────────
[Synopsis + Prologue] → [TranslationService] → [PsychotypeAnalyzer]
    → TextAnalysis { JungianProfile, StyleProfile, Themes, Arcs }
    → сохраняется в session/memory

ОДИН ХОД (каждый раз):
───────────────────────
[Ввод игрока] → [TranslationService] → [IntentParser]
    → [MetricsCollector.recordIntent]      ← NEW: собирает behavioral signals
    → [SimulationEngine] → [StateMutator]
    → [MetricsCollector.recordSimulation]  ← NEW: outcome, risk level
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

**PsychotypeAnalyzer вызывается однократно при создании мира** в `worlds.ts` route handler. Результат (`JungianProfile`) сохраняется в session/memory и загружается каждым последующим ходом. На каждом ходу работает конвейер из 6 агентов + Director.

---

## 3. Director → агенты: маппинг ProbabilityDistribution

**Реализация:** `computeDistribution()` в [Spec 1 — Blend Algorithm](spec-blend-algorithm.md). Director — pure function (0 LLM).

### Кто что использует

| Поле ProbabilityDistribution | Агент | Как используется |
|-----|-------|-----------------|
| `sceneTone` | **Stylist** | `sample()` → tone в `playerVoice` ("controlled, strategic") |
| `pacing` | **Stylist** | `sample()` → pace в `playerVoice` ("medium") |
| `sensoryChannels` | **Stylist** | top-3 → sensory focus в `playerVoice` ("visual, tactile, atmospheric") |
| `informationStyle` | **Stylist** | `sample()` → info style в `playerVoice` ("analytical") |
| `archetypes` | **Dramaturg** | `sample()` → приоритет в `get_pattern` MCP-запросе |
| `informationStyle` | **Actor** | `sample()` → enrichment стиля NPC-диалогов |
| `shadowInjection` | **Stylist** | ~15% контента — inferior function (emotional для T-типов) |
| `explorationFactor` | **Director** | min 5% non-type контента (из `averageRange(profile) * 0.3`) |

### Confidence → разнообразие

При `profile.confidence < 0.3` → `uniformDistribution()` (все веса равны). При 0.3–0.5 → адаптация минимальна. При ≥ 0.5 → полная адаптация.

### Mood mapping (какие sceneTone для каких типов)

| Ось | Значение | sceneTone |
|-----|----------|-----------|
| I | preference > 0.55 | introspective, melancholic, mysterious |
| E | preference > 0.55 | lively, festive, dramatic |
| N | preference > 0.55 | wonder, discovery, surreal |
| S | preference > 0.55 | grounded, practical, survival |
| T | preference > 0.55 | conflict, strategy, tension |
| F | preference > 0.55 | romance, loyalty, sacrifice |
| J | preference > 0.55 | order, politics, structure |
| P | preference > 0.55 | chaos, adventure, freedom |

## 4. Stylist — адаптация прозы

Stylist получает готовый `playerVoice` через `buildPlayerVoice()` (см. [Spec 1](spec-blend-algorithm.md)). **НЕ** сэмплит из Distribution сам.

Влияние профиля на прозу через `playerVoice`:

| Фактор | Влияние на прозу |
|--------|-----------------|
| Extraversion high | Больше диалогов, динамичные сцены |
| Introversion high | Внутренний монолог, описательность |
| Intuition high | Метафоры, абстрактные образы |
| Sensing high | Конкретные детали, sensory language |
| Thinking high | Стратегические описания, cause-effect |
| Feeling high | Эмоциональные акценты, relationships |
| Judging high | Структурированный narrative arc |
| Perceiving high | Спонтанные повороты, open-ended |

## 5. Actor — NPC диалоги

Actor адаптирует NPC-реплики под профиль игрока:

- **E-игрок**: NPC говорят больше, задают вопросы, вовлекают
- **I-игрок**: NPC дают пространство, не навязывают диалог
- **T-игрок**: NPC предлагают логические аргументы, deals
- **F-игрок**: NPC апеллируют к эмоциям, loyalty, honor

### informationStyle → NPC-стиль

NPC получает `JungianProfile`. Диалог строится из характера NPC, не из адаптации под игрока. `informationStyle` из Distribution влияет на стиль подачи:

| informationStyle | NPC-стиль |
|-----------------|-----------|
| analytical | Больше фактов, логических аргументов |
| emotional | Больше эмоций, личных историй, эмпатии |
| concrete | Конкретные описания, practical info |
| symbolic | Символы, метафоры, скрытые намёки |

## 6. Dramaturg — архетипические предпочтения

Dramaturg выбирает narrative patterns из **literary-compiler** БД (SQL `searchTemplates`), учитывая профиль:

```typescript
function filterPatternsByProfile(patterns: NarrativePattern[], profile: JungianProfile): NarrativePattern[] {
  return patterns.filter(p => {
    if (p.mood === 'conflict' && profile.thinking.preference < 0.3) return false;
    if (p.mood === 'romance' && profile.extraversion.preference < 0.3) return false;
    if (p.mood === 'mystery' && profile.intuition.preference < 0.3) return false;
    return true;
  });
}
```

### Архетипические предпочтения по функциям

Вероятностные веса вместо жёстких списков. Dramaturg передаёт в `get_pattern`:

| Функция | Архетипы (soft bias) |
|---------|---------------------|
| S | rescue, escape_liberation, quest_journey |
| N | temptation_fall, wisdom_counsel, rise_fall_rise |
| T | judgment_trial, political_intrigue, wisdom_counsel |
| F | loyalty, betrayal, inheritance_return, endurance_suffering |

При амбивалентных осях — равные веса на обе группы.

---

## 7. NPC Psychotypes

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

> **Storage/assignment-план:** см. дизайн S8.1 — `psychotype` хранится в `profile.l3.psychotype` на NPC-сущности в `UnifiedEntityStore` (JSON-файл `entities.json`); `perceivedPlayerType` — в таблице `npc_perception`; назначается лениво при создании NPC через `assignNpcPsychotype(role, faction, worldSystem)` (pure-функция, не LLM). NPC-психотипы — **Phase 3**.

---

## 8. Complete Turn Example — INTJ в таверне (полный конвейер)

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
| «Nordmark forge» — географическая деталь | **Stylist → LLM-изобретение** (Validator НЕ генерирует факты; Censor проверяет анахронизмы постфактум) |
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

## 9. Narrative adaptation — таблица 16 типов (производная)

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
  if (profile.thinking.preference > 0.7) return 'strict';
  if (profile.thinking.preference > 0.5) return 'relaxed';
  return 'off';
}
```

---

## 10. Risks и mitigations

| Риск | Митигация |
|------|-----------|
| LLM глючит при PsychotypeAnalyzer | Fallback на createDefaultProfile(), behavioral blend исправит за ~100 ходов |
| MetricsCollector overhead | O(1) на ход (инкрементальные счётчики), blend каждые 20 ходов |
| Профиль "застревает" на wrong answer | Range растёт при отклонениях → Director видит что range высокий и даёт разнообразный контент |
| Anti-manipulation: игрок пытается "farm" определённый тип | Rate limit 0.10/blend-цикл + EMA alpha 0.25 → ~210 ходов для 95% сдвига; range tracking делает осцилляции видимыми |
| DB migration при обновлении | CREATE TABLE IF NOT EXISTS, UPSERT — идемпотентно |


