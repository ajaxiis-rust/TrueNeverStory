# NPC Economy System — Полная феодальная модель

> Обсуждение: ses_0e4bd15b5ffeREfhiVkzHjqYLl + ses_0e21fc741ffe5MHuVxrqhmMJDP

## Цель

Живая NPC-экономика где каждый NPC — "живой агент" со своими очками, целями, семьёй и пороками. Игрок влияет на систему через услуги, которые передают очки между NPC.

---

## 1. Феодальная лестница

| Ранг | Wealth минимум | Стражники | Мытари | Налог |
|------|----------------|-----------|--------|-------|
| Раб | 0 | 0 | 0 | 100% |
| Простолюдин | 0 | 0 | 0 | 90% |
| Баронет | 100,000 | 50 | 1/100 рабочих | 30% |
| Барон | 500,000 | 200 | 1/100 рабочих | 28% |
| Виконт | 2,000,000 | 1,000 | 1/100 рабочих | 25% |
| Граф | 10,000,000 | 5,000 | 1/100 рабочих | 22% |
| Маркиз | 50,000,000 | 20,000 | 1/100 рабочих | 20% |
| Герцог | 200,000,000 | 100,000 | 1/100 рабочих | 18% |
| Король | 2,000,000,000 | 500,000 | 1/100 рабочих | 10% |
| Император | 10,000,000,000 | 2,000,000 | 1/100 рабочих | 0% |

### Формула мытарей

```typescript
function taxCollectorsCount(peasants: number, craftsmen: number): number {
  return Math.ceil((peasants + craftsmen) / 100);
}
```

---

## 2. Базовые очки NPC (0-1000)

```typescript
interface NPCStats {
  wealth: number;      // Богатство (социальный статус)
  power: number;       // Могущество (военная сила, политическое влияние)
  popularity: number;  // Популярность (уважение, страх, любовь)
  health: number;      // Здоровье (жизненная сила)
  experience: number;  // Опыт
  intrigue: number;    // Интриги
}
```

---

## 3. Налоги

### Формула налоговой ставки

```typescript
function calculateTaxRate(power: number, popularity: number, rank: Rank): number {
  const baseTax = rank.baseTaxRate;
  const powerDiscount = Math.min(0.9, power / 10000);
  const popDiscount = Math.min(0.3, popularity / 3000);
  return Math.max(0, baseTax * (1 - powerDiscount - popDiscount));
}
```

### Цепочка налогов

```
Император (0%) → Король (10%) → Герцог (18%) → Маркиз (20%) → Граф (22%) → Виконт (25%) → Барон (28%) → Баронет (30%) → Простолюдин (90%)
```

---

## 4. Взятки

### Типы взяток

| Тип | Описание | Пример |
|-----|----------|--------|
| protection | Защита от преследований | Крестьянин платит стражнику |
| favor | Услуга за услугу | Торговец платит чтобы пропустили товар |
| silence | Молчание о преступлении | Нобил платит чтобы не донесли |
| access | Доступ к ресурсам | Торговец платит чтобы торговать |
| promotion | Продвижение по службе | Мытарь платит герцогу за повышение |
| exemption | Освобождение от налогов | Мытарь прощает налог за взятку |

### Механика

```typescript
interface Bribe {
  from: string;
  to: string;
  amount: number;
  type: BribeType;
  loyaltyCost: number;
  wealthCost: number;
  wealthGain: number;
  powerGain: number;
  popularityLoss: number;
  risk: number;
}
```

### Формула риска

```typescript
function bribeRisk(
  giver: NPC,
  taker: NPC,
  amount: number,
  witnesses: number
): number {
  const baseRisk = 0.1;
  const amountRisk = amount / 10000;
  const witnessRisk = witnesses * 0.15;
  const takerRisk = taker.intrigue * 0.01;
  return Math.min(0.95, baseRisk + amountRisk + witnessRisk - takerRisk);
}
```

### Точка невозврата

```typescript
function checkBetrayalRisk(npc: NPC): number {
  const taxBurden = npc.taxRate * npc.income;
  const bribeBurden = npc.totalBribes;
  const totalBurden = taxBurden + bribeBurden;
  const burdenRatio = totalBurden / npc.income;
  const loyaltyFactor = npc.loyalty / 100;
  return burdenRatio * (1 - loyaltyFactor);
}
```

### Кто даёт, кто берёт

| Профессия | Даёт взятки | Берёт взятки |
|-----------|-------------|--------------|
| Раб | Нет | Нет |
| Крестьянин | Стражнику | Нет |
| Рыбак | Стражнику | Нет |
| Ремесленник | Стражнику | Нет |
| Моряк | Стражнику | Нет |
| Торговец | Стражнику | Нет |
| Пират | Своему капитану | Грабеж |
| Баронет | Стражнику | Да |
| Барон | Стражнику | Да |
| Виконт | Стражнику | Да |
| Граф | Стражнику | Да |
| Маркиз | Стражнику | Да |
| Герцог | Нет | Да |
| Король | Нет | Да |
| Император | Нет | Да (у всех) |

---

## 5. Еда как основа экономики

### Ценовая шкала

| Статус | Потребление/месяц | Стоимость |
|--------|-------------------|-----------|
| Раб | 30 | 1 |
| Простолюдин | 50 | 5 |
| Ремесленник | 100 | 10 |
| Торговец | 200 | 20 |
| Баронет | 500 | 30 |
| Барон | 1,000 | 40 |
| Виконт | 2,000 | 50 |
| Граф | 5,000 | 60 |
| Маркиз | 10,000 | 70 |
| Герцог | 20,000 | 80 |
| Король | 50,000 | 90 |
| Император | 100,000 | 100 |

### Рабы: Производство vs Потребление

```typescript
interface SlaveEconomy {
  consumption: number;  // 30 еды/месяц
  production: number;   // 300-1000 еды/месяц
  surplus: number;      // 270-970 еды/месяц
}
```

---

## 6. Пороки

| Порок | Влияние |
|-------|---------|
| Обжорство | -health |
| Пьянство | -health, -knowledge |
| Жадность | +wealth, -popularity |
| Похоть | -health, -intrigue |
| Лень | -experience, -power |
| Гнев | -popularity, -intrigue |
| Гордыня | -popularity, +power |
| Зависть | +intrigue, -popularity |

### Кривая деградации по возрасту

| Возраст | Эффект |
|---------|--------|
| 0-20 | Рост (+health, +experience) |
| 20-40 | Пик |
| 40-60 | Медленное старение (-health) |
| 60-80 | Быстрое старение (-health, -power) |
| 80+ | Деградация (все -) |

---

## 7. Семья

### Расходы

```typescript
interface FamilyExpenses {
  wife: number;      // 50% дохода
  children: number;  // 10% дохода
  food: number;      // Фиксированный расход
  clothing: number;  // Фиксированный расход
}
```

### Наследование

```typescript
interface Inheritance {
  wealth: number;        // 50-100% wealth отца
  profession: Profession;// Ту же профессию
  traits: Trait[];       // Часть черт характера
  vices: Vice[];         // Часть пороков
}
```

### Количество детей

```typescript
function childrenCount(age: number, temperament: Temperament): number {
  let base = 0;
  if (age < 25) base = 0;
  else if (age < 35) base = 2;
  else if (age < 45) base = 3;
  else if (age < 55) base = 2;
  else if (age < 65) base = 1;
  else base = 0;

  const tempMod = { choleric: 1, sanguine: 0, melancholic: -1, phlegmatic: -1 };
  return Math.max(0, base + (tempMod[temperament] ?? 0));
}
```

---

## 8. Архетипы NPC

### Общие архетипы

| Архетип | Вес | Уникальный | Контексты | Описание |
|---------|-----|------------|-----------|----------|
| farmer | 10 | Нет | wild | Земледелец |
| fisherman | 8 | Нет | wild, sea | Рыбак |
| craftsman | 8 | Нет | market | Ремесленник |
| sailor | 6 | Нет | sea, market | Моряк |
| merchant | 6 | Нет | market | Торговец |
| guard | 5 | Нет | court, military | Стражник |
| wanderer | 4 | Нет | wild, market | Странник |
| pirate | 3 | Нет | sea, wild | Пират |
| sage | 3 | Нет | temple, court | Учёный |
| rogue | 2 | Нет | wild, market | Вор |
| cleric | 2 | Нет | temple | Жрец |
| healer | 2 | Нет | temple | Лекарь |
| noble | 1 | Нет | court | Дворянин |
| baronet | 0.5 | Нет | court | Баронет |
| baron | 0.3 | Нет | court | Барон |
| knight | 0.8 | Нет | military | Рыцарь |
| spy | 0.2 | Нет | court, military | Шпион |
| assassin | 0.1 | Нет | wild | Убийца |
| scholar | 0.5 | Нет | temple | Мудрец |
| moneylender | 0.4 | Нет | market | Меняла |
| captain | 0.6 | Нет | sea, military | Капитан |
| smuggler | 0.3 | Нет | sea, market | Контрабандист |

### Уникальные архетипы

| Архетип | Вес | Уникальный | Контексты | Описание |
|---------|-----|------------|-----------|----------|
| emperor | 0.01 | Да | court | Император |
| king | 0.05 | Да | court | Король |
| duke | 0.1 | Да | court | Герцог |
| archduke | 0.15 | Да | court | Эрцгерцог |
| prince | 0.2 | Да | court | Принц |
| high_priest | 0.2 | Да | temple | Верховный жрец |
| warlord | 0.3 | Да | military | Полководец |
| pirate_lord | 0.3 | Да | sea | Пиратский лорд |
| admiral | 0.4 | Да | sea, military | Адмирал |
| master_assassin | 0.3 | Да | wild | Мастер-убийца |
| legendary_merchant | 0.4 | Да | market | Легендарный торговец |
| dragon_rider | 0.1 | Да | wild | Верхом на драконе |

### Контекстные группы

| Контекст | Архетипы | Множитель веса |
|----------|----------|----------------|
| court | noble, baronet, baron, spy, sage | ×2 |
| market | merchant, craftsman, rogue, moneylender | ×2 |
| temple | cleric, healer, sage, scholar | ×2 |
| wild | farmer, wanderer, rogue, assassin | ×2 |
| military | guard, knight, warlord, spy | ×2 |
| sea | sailor, fisherman, pirate, captain, smuggler | ×2 |

---

## 9. Потеря власти

| Событие | Результат | Семья |
|---------|-----------|-------|
| Бунт | Смерть или рабство | Продаётся |
| Война (проигрыш, нет выкупа) | Рабство | Продаётся |
| Война (выкуп) | Свободен | Свободна |
| Разорение | Рабство | Продаётся |
| Политический заговор | Рабство | Продаётся |

### Формула выкупа на войне

```typescript
function canBuyFreedom(treasury: number, rank: Rank): boolean {
  const freedomCost = rank.wealthMin * 0.5;
  return treasury >= freedomCost;
}
```

---

## 10. Ремесленники

| Профессия | Доход/месяц |
|-----------|-------------|
| Ремесленник | 10-30 |
| Работорговец | 50-150 |
| Меняла (банкир) | 30-100 |
| Кузнец | 15-40 |
| Ткач | 10-25 |
| Пекарь | 8-20 |
| Рыбак | 5-15 |
| Моряк | 15-40 |
| Пират | 20-80 |

---

## 11. Файлы для создания/модификации

| Файл | Описание |
|------|----------|
| `src/models/npc-stats.ts` | Интерфейсы NPCStats, Vices, FamilyExpenses |
| `src/models/rank.ts` | Интерфейс Rank, enum RankType |
| `src/models/archetype.ts` | Интерфейс ArchetypeConfig |
| `src/services/npc-economy.ts` | Основная логика экономики |
| `src/services/npc-economy.test.ts` | Тесты |
| `src/services/npc-generator.ts` | Обновление: включение статов |
| `src/services/npc-runtime.ts` | Обновление: динамика статов |
| `src/services/social-graph.ts` | Обновление: иерархия |
| `src/services/slave-economy.ts` | Логика рабов |

---

## 12. Верификация

1. `bun test src/services/npc-economy.test.ts` — все тесты
2. `bun test src/services/npc-generator.test.ts` — все тесты
3. `bunx tsc --noEmit` — 0 ошибок
4. Ручной тест: создать мир, проверить распределение статов
5. Ручной тест: симулировать 100 ходов, проверить динамику
6. Ручной тест: проверить каскады от действий игрока
