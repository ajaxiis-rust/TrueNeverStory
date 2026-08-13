# Jungian Player Profiler — Design Spec

> Версия: 1.0 | Дата: 2026-08-10

---

## [S1] Проблема

TrueNeverStory адаптирует нарратив к стилю письма игрока (14 метрик в `PlayerStyleProfile`), но не к его **психологическому типу**. Интроверт и экстраверт, мыслитель и чувствующий — все получают одну и ту же историю.

Система понимает, *как* игрок пишет, но не *зачем* он играет и *что* его цепляет. Результат: нарратив стилистически адаптирован, но эмоционально универсален.

---

## [S2] Архитектура решения

Новый сервис `JungianProfiler` анализирует данные из трёх источников и строит юнгианский профиль игрока:

```
Источник 1: Создание мира (жанры, соц. строй, описание, правила)
    → inferFromWorld() → грубый тип (confidence 0.2-0.3)

Источник 2: Birth Wizard (hints, возраст, isekai, любимые авторы)
    → inferFromBirth() → уточнённый тип (confidence 0.4-0.5)

Источник 3: Игровое поведение (PlayerProfileStore метрики, N ходов)
    → inferFromMetrics() → финальный тип (confidence 0.8-0.9)

Все три → blend() → JungianType, сохраняется в player_profiles
    → getNarrativeConstraints() → блок в промпт Стилиста
```

### Юнгианская модель

Четыре дихотомии, 16 типов:

| Дихотомия | Полюса | Что определяет |
|-----------|--------|---------------|
| Установка | E (экстраверсия) / I (интроверсия) | Источник энергии |
| Перceiving | S (ощущение) / N (интуиция) | Как воспринимает мир |
| Judging | T (мышление) / F (чувство) | Как принимает решения |
| Attitude | J (суждение) / P (восприятие) | Отношение к структуре |

---

## [S3] Данные из создания мира

Форма `worlds.html` уже собирает достаточно данных для первичного inference:

| Поле | Сигнал |
|------|--------|
| Genres (checkboxes) | Fantasy→N+F, Sci-Fi→N+T, LitRPG→T+S, Horror→S+N, Historical→S+T, Cyberpunk→T+N, Mythology→N+F, Post-Apocalyptic→S+F, Steampunk→N+T |
| Social System | Feudalism→SJ, Democracy→NF, Anarchy→NP, Theocracy→NJ, Communism→ST, Capitalism→ST, Tribalism→SF, Slavery→(требует анализа), Mercantilism→ST |
| Description (длина, стиль) | Длинное описание→J (структура), короткое→P (спонтанность). Богатый словарь→N, конкретное→S |
| World Rules (количество) | Много правил→J, мало→P |
| Economy Modifiers | Gold Standard/Command→ST, Barter→SF |
| Magic System (наличие и стиль) | Системное описание→T, атмосферическое→F |

---

## [S4] Данные из Birth Wizard

| Поле | Сигнал |
|------|--------|
| Character Hints (текст) | LLM-анализ: "warrior"→S, "scholar"→T, "healer"→F, "seer"→N. Пол: не влияет напрямую, но косвенно (social coding) |
| Starting Age | Молодой (0-15)→P (открытость), зрелый (30+)→J (структура), старый (60+)→I+N (рефлексия) |
| Isekai Mode | ON→E ("я хочу быть собой"), OFF→I ("я хочу стать другим") |
| Favorite Authors/Books (новое поле) | Прямой маппинг авторов на функции (база 50-100 авторов) |

---

## [S5] Данные из игрового поведения

Метрики из `PlayerProfileStore`, которые корректируют тип:

| Метрика | Юнгианский сигнал |
|---------|------------------|
| `action_orientation` > 0.7 | S (ощущение) |
| `emotional_expressiveness` > 0.7 | F (чувство) |
| `literary_sophistication` > 0.7 | T (мышление) или N (интуиция) |
| `dialogue_ratio` > 0.6 | E (экстраверсия) |
| `narrative_distance` > 0.7 | I (интроверсия) |
| `preferred_pace` = "fast" | S (ощущение) |
| `sensory_bias` > 0.6 | S (ощущение) |
| `preferred_motifs` содержит "mystery", "secrets" | N (интуиция) |

---

## [S6] JungianType — тип данных

```typescript
type JungianAttitude = 'E' | 'I';
type JungianPerceiving = 'S' | 'N';
type JungianJudging = 'T' | 'F';
type JungianLifestyle = 'J' | 'P';

interface JungianType {
  attitude: JungianAttitude;       // E/I
  perceiving: JungianPerceiving;   // S/N
  judging: JungianJudging;         // T/F
  lifestyle: JungianLifestyle;     // J/P
  confidence: number;              // 0-1
  source: 'world' | 'birth' | 'metrics' | 'blended';
}

// 4-буквенное кодирование: "INFJ", "ESTP" и т.д.
function encodeJungian(t: JungianType): string {
  return `${t.attitude}${t.perceiving}${t.judging}${t.lifestyle}`;
}
```

---

## [S7] Адаптация нарратива

`getNarrativeConstraints(type)` возвращает текстовый блок для промпта:

| Тип | Prefer | Avoid | Pace | Tone |
|-----|--------|-------|------|------|
| **ISTJ** | Архитектура, логика загадок, структура | Абстракции, pure emotion | Medium | Factual |
| **ISFJ** | Детали прошлого, традиции, забота | Хаос, моральная двусмысленность | Slow | Warm |
| **INFJ** | Символизм, внутренний мир, моральные дилеммы | Pure action, чёрно-белая мораль | Slow build | Dark, poetic |
| **INTP** | Системы, логика, скрытые связи | Melodrama, поверхностность | Medium | Analytical |
| **ESTP** | Action, danger, sensory details | Long introspection | Fast | Visceral |
| **ESFP** | Эмоции, social dynamics, immediate experience | Dry technical detail | Fast | Vibrant |
| **ENFP** | Возможности, character depth, скрытые смыслы | Routine, predictability | Variable | Inspirational |
| **ENTP** | Debate, paradox, intellectual challenge | Simple answers | Fast | Witty |

*(полная таблица на 16 типов — в Task 10)*

---

## [S8] Авторы — база данных

JSON-массив `AUTHOR_DB` с маппингом 50-100 авторов:

```typescript
interface AuthorMapping {
  author: string;           // lowercase, нормализованное
  aliases: string[];        // альтернативные имена
  perceiving: 'S' | 'N';
  judging: 'T' | 'F';
  attitude: 'E' | 'I';
  weight: number;           // 0.5-1.0, сила сигнала
}
```

Примеры:
- `достоевский` → N, F, I, 0.9
- `толкин` → N, F, I, 0.8
- `азимов` → N, T, I, 0.8
- `хемингуэй` → S, T, E, 0.7
- `сапковский` → S, T, E, 0.6

Fuzzy matching через нормализацию (lowercase, транслитерация кириллицы).

---

## [S9] Вопросы-тесты в онбординге

5-7 вопросов, замаскированных под выбор персонажа, добавляются в Birth Wizard:

| Вопрос | Варианты | Что определяет |
|--------|----------|---------------|
| "Ты входишь в таверну. Что first?" | Оглядываюсь / Захожу к бармену / Ищу приключения / Сажусь в угол | E/I |
| "Старик рассказывает legend. Что интересует?" | Детали / Мораль / Практическое применение / Скрытый смысл | S/N, T/F |
| "Ты нашёл artifact. Как поступишь?" | Изучу / Использую / Продам / Спрячу | T/F, S/N |
| "Тебя предали. Что чувствуешь?" | Злость / Обида / Холодный расчёт / Желание понять | T/F |
| "Перед тобой два пути." | Безопасный / Интересный / Короткий / Неизвестный | J/P, S/N |

---

## [S10] Сохранение и обновление

1. Новые колонки в `player_style_profiles`: `jungian_type TEXT`, `jungian_confidence REAL`, `jungian_source TEXT`, `jungian_history TEXT` (JSON-массив прошлых значений)
2. При создании мира: `inferFromWorld()` → сохранить в сессию (не в DB, т.к. player ещё не создан)
3. При Birth: `inferFromBirth()` → объединить с world → сохранить в DB
4. Каждые 20 ходов: `blend()` с метриками → обновить в DB
5. Логирование: каждый inference логируется с reasoning

---

## [S11] Адаптация архетипов

`DramaturgAgent` при выборе NarrativePattern учитывает тип:

| Юнгианская функция | Предпочтительные архетипы |
|-------------------|--------------------------|
| S (ощущение) | rescue, escape_liberation, quest_journey |
| N (интуиция) | temptation_fall, wisdom_counsel, rise_fall_rise |
| T (мышление) | judgment_trial, political_intrigue, wisdom_counsel |
| F (чувство) | loyalty, betrayal, inheritance_return, endurance_suffering |

---

## [S12] Адаптация NPC-диалогов

`Actor` при генерации ответа NPC учитывает тип игрока:

| Тип игрока | NPC-адаптация |
|-----------|---------------|
| T-доминанта | Больше фактов, деталей, логических аргументов |
| F-доминанта | Больше эмоций, личных историй, эмпатии |
| S-доминанта | Конкретные описания, practical info |
| N-доминанта | Символы, метафоры, скрытые намёки |

---

## [S13] Адаптация Economic Service

| Тип игрока | Экономическая адаптация |
|-----------|------------------------|
| T+S | Подробные цифры, таблицы цен, механики торговли |
| N+F | Социальные последствия торговли, отношения с купцами |
| S | Конкретные описания товаров (вес, текстура, запах) |
| N | Скрытые возможности, контрабанда, тайные рынки |

---

## [S14] Cross-session persistence

`JungianType` сохраняется в `player_profiles.db` и переживает сессии. При новой сессии того же игрока:
1. Загружаем сохранённый тип
2. Продолжаем обновлять через `blend()` с новыми метриками
3. `confidence` не сбрасывается между сессиями

---

## [S15] A/B тестирование

Флаг `jungian-profiler-enabled` в feature flags:
- `false` (default) — обычный нарратив без адаптации
- `true` — полная адаптация через `getNarrativeConstraints()`

Позволяет измерить engagement (session length, return rate, message count) в обоих режимах.

---

## [S16] Файловая структура

| Файл | Действие | Ответственность |
|------|----------|----------------|
| `src/services/jungian-profiler.ts` | Создать | JungianProfiler, AUTHOR_DB, типы |
| `src/services/jungian-profiler.test.ts` | Создать | Unit-тесты |
| `src/lib/player-profile-store.ts` | Модифицировать | Новые колонки в schema |
| `src/services/agents/stylist.ts` | Модифицировать | Инъекция constraints в buildMicroPrompt |
| `src/services/agents/dramaturg.ts` | Модифицировать | Учёт типа при выборе архетипа |
| `src/services/agents/actor.ts` | Модифицировать | Учёт типа в NPC-диалогах |
| `src/services/economic-service.ts` | Модифицировать | Учёт типа в экономике |
| `src/routes/worlds.ts` | Модифицировать | Вызов inferFromWorld при создании |
| `src/routes/launch.ts` | Модифицировать | Вызов inferFromBirth при рождении |
| `src/services/roleplay/pipeline-runner.ts` | Модифицировать | Обновление типа каждый N ходов |
| `public/worlds.html` | Модифицировать | Поле "Favorite Authors/Books" |
