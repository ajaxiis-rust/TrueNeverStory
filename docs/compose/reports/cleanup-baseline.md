# Cleanup Baseline — Phase 0

**Дата:** 2026-08-18
**Git tag:** `v0.33.4-stable-pre-cleanup` → `80b8663`
**Bun:** 1.3.14
**Конфиг:** `bunfig.toml` (`[test]` section, coverage off by default, `--coverage` to enable)

## Test baseline

```
1308 pass
4 skip
0 fail
~3030 expect() calls
1312 tests across 130 files
~14-20s runtime
```

## Typecheck baseline

```
bun run lint (tsc --noEmit) → 0 errors
```

## Coverage baseline

Полный coverage-отчёт: `docs/compose/reports/coverage-baseline.txt` (201 строка).
lcov-отчёт: `coverage/lcov.info` (генерируется при `bun test --coverage`).

### Ключевые находки coverage

#### 0% Lines — кандидаты в мёртвый код (Phase 2 P2.1)

| Файл | % Lines | % Funcs | Примечание |
|---|---|---|---|
| `src/services/agent-v2.ts` | 0.00 | 100.00 | BaseAgentV2 + типы; 100% funcs = только декларации |
| `src/services/prompt-builder.ts` | 0.00 | 10.16 | Static prompts — сильный signal dead code |

#### Очень низкое покрытие (<25%) — legacy / непротестированные

| Файл | % Lines | % Funcs | Примечание |
|---|---|---|---|
| `src/services/researcher-agent.ts` | 12.50 | 7.81 | v2-paradigm: миграция на MCP |
| `src/services/item-evaluation.ts` | 16.67 | 6.50 | Аудит вызовов |
| `src/services/start-resolver.ts` | 20.00 | 8.16 | Аудит вызовов |
| `src/services/crafter-agent.ts` | 23.08 | 23.67 | v2-paradigm: flavor → stylist |
| `src/services/agents/chronicler-agent.ts` | 25.00 | 5.08 | Big Six! Нет .test.ts |

#### Big Six agents — coverage

| Файл | % Lines | % Funcs | .test.ts? |
|---|---|---|---|
| `agents/chronicler-agent.ts` | 25.00 | 5.08 | ❌ НЕТ |
| `agents/dramaturg.ts` | 41.67 | 17.41 | ✅ |
| `agents/actor.ts` | 50.00 | 24.62 | ✅ |
| `agents/censor.ts` | 60.00 | 60.84 | ✅ |
| `agents/stylist.ts` | 71.43 | 100.00 | ✅ |
| `agents/validator.ts` | 87.50 | 52.68 | ✅ |

#### 100% coverage — canonical, хорошо протестированы (сохранять)

- `pipeline-runner.ts` — 100%
- `state-mutator.ts` — 100%
- `simulation-engine.ts` — 100%
- `intent-parser.ts` — 100%
- `quest-manager.ts` — 100%
- `branch-manager.ts` — 100%
- `npc-economy.ts` — 100%
- `npc-runtime.ts` — 100%
- `probability-expression.ts` — 100%
- `author-matcher.ts` — 100% (98.13% funcs)
- `world-validator.ts` — 100%
- `navigator.ts` — 100%
- `literary-modulation.ts` — 100%

#### roleplay-engine.ts (pipeline hub)

- 60.00% lines, 85.88% funcs
- Непокрытые линии: 795-826, 873-934 — это @mention service agents section (v2-paradigm §S4.1)
- Подтверждает: @mention inline-лямбды — legacy, непротестированы

## Команды для воспроизведения baseline

```bash
git checkout v0.33.4-stable-pre-cleanup
bun test                    # 1308 pass, 0 fail
bun run lint                # 0 errors
bun test --coverage         # text table + coverage/lcov.info
```
