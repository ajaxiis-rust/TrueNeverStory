# NPC Runtime Integration — Динамика, Взятки, Еда, Наследование

> Дополнение к плану 2026-07-02-npc-economy-system.md
> Статус: ✅ РЕАЛИЗОВАНО

## Цель

Интегрировать модель экономики NPC в NPCRuntime для пошаговой симуляции.

---

## Реализованные компоненты

### 1. Динамика статов каждый ход ✅

**Файл:** `src/services/npc-economy-runtime.ts`

```typescript
function processTurn(state: EconomyState): EconomyState {
  // 1. Возраст +1
  // 2. Динамика статов (ageDecay, viceDecay)
  // 3. Взятки (если может брать)
  // 4. Налоги
  // 5. Еда (потребление/производство)
  // 6. Проверка на банкротство
  // 7. Проверка на предательство
}
```

### 2. Симуляция взяток ✅

**Файл:** `src/services/npc-economy-runtime.ts`

```typescript
function processBribes(state: EconomyState): EconomyState {
  // Мытари берут взятки 0-20% от жалования
  // Нобилы/герцоги берут взятки от нижестоящих
}
```

### 3. Экономика еды ✅

**Файл:** `src/services/npc-economy-runtime.ts`

```typescript
function processTurn(state: EconomyState): EconomyState {
  // Фермеры производят 500-1000 еды
  // Рабы производят 300-1000 еды
  // Все потребляют еду по рангу
}
```

### 4. Наследование при смерти ✅

**Файл:** `src/services/npc-economy-runtime.ts`

```typescript
function processInheritance(state: EconomyState, deadNpcId: string): EconomyState {
  // Дети наследуют wealth
  // Семья продаётся в рабство
}
```

### 5. Каскады от игрока ✅

**Файл:** `src/services/npc-economy-runtime.ts`

```typescript
function processPlayerAction(
  state: EconomyState,
  playerId: string,
  targetId: string,
  action: "help" | "betray" | "gift",
  amount: number,
): EconomyState {
  // help: +power, +popularity, +loyalty
  // betray: +wealth, -popularity, -loyalty
  // gift: -wealth player, +wealth target, +popularity, +loyalty
}
```

---

## Файлы

| Файл | Описание | Статус |
|------|----------|--------|
| `src/services/npc-economy-runtime.ts` | Ядро динамики | ✅ Создан |
| `src/services/npc-economy-runtime.test.ts` | Тесты (12/12) | ✅ Создан |

---

## Верификация

1. `bun test src/services/npc-economy-runtime.test.ts` — 12/12 ✅
2. `bun test src/services/npc-economy.test.ts` — 28/28 ✅
3. `bun test src/services/npc-generator.test.ts` — 7/7 ✅
4. `bunx tsc --noEmit` — 0 ошибок ✅
5. **Итого: 47/47 тестов проходят**

---

## Оставшаяся работа

| Что | Приоритет |
|-----|-----------|
| Иерархия в SocialGraph (feudal hierarchy) | Средний |
| Полная симуляция 100 ходов с логированием | Низкий |
