# [S1] Problem
4-5 LLM-запросов на каждый ввод пользователя: перевод → intent → мир → агенты → перевод. Для локальных моделей это критично по latency.

# [S2] Solution overview
Два изменения:
1. **Маленькая модель для перевода/intent** — phi-3, gemma-2, qwen2.5. Основная — только для нарратива.
2. **Custom function calling для MCP** — модель вызывает MCP-инструменты через маркеры в ответе, движок парсит и исполняет.

# [S3] Target pipeline
```
Ввод юзера → [Small LLM: translate+intent] → [мир детерминированно] → [Main LLM: нарратив+tools] → [Small LLM: translate] → Ответ
```
Итого: 2-3 LLM-запроса вместо 4-5.

# [S4] Dual model config
Расширить `AgentConfig` и `LLMClientOptions`:
- `translationProviderId` / `translationModelId` — провайдер/модель для перевода и intent
- `LLMQueue.getAgentClient(agentId, { useTranslationModel: true })` — флаг для выбора модели

# [S5] Custom function calling protocol
Формат ответа модели:
```
<tool_call>{"name":"query_entity","args":{"name":"Blacksmith"}}</tool_call>
```
Движок парсит `<tool_call>` блоки, вызывает MCP tool, возвращает результат в следующий запрос.

# [S6] Translation batching
Перевод input + intent — один запрос к маленькой модели:
```
"Translate to English AND classify intent: {input}"
```
Результат: JSON `{ translated: "...", intent: { type: "...", ... } }`
