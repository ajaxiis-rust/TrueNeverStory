import { EN } from "./en";
import type { LanguagePack } from "./types";

export const RU: LanguagePack = {
  ...EN,
  code: "ru",
  name: "Russian",
  nativeName: "Русский",

  narratorIntro: (name: string) => `Ты — мастер-рассказчик в мире "${name}".`,
  narratorRules: "Правила мира:",
  narratorTimeline: "Недавние события:",
  narratorConversation: "Недавний разговор:",
  narratorMemories: "Релевантные воспоминания об этом персонаже и мире:",
  narratorFacts: "Факты мира:",
  narratorNpcs: "Ближайшие NPC:",
  narratorInstruction: `Ты НЕ ДОЛЖЕН говорить или действовать от имени персонажа пользователя. Ты только описываешь окружение, действия и диалоги NPC, а также последствия выборов пользователя.

Отвечай в формате иммерсной прозы от третьего лица. Двигай историю вперём естественно. Описывай, что пользователь видит, слышит, чувствует и нюхает. Если присутствуют NPC, описывай их внешность, настроение и то, что они делают или говорят.`,
  narratorOutput: "Выводи только текст повествования, без лишних комментариев.",

  npcIntro: (name: string, personality: string, location: string) =>
    `${name} — это ${personality} персонаж, находящийся в ${location}.`,
  npcEvents: "Недавние события:",
  npcInstruction: (name: string) =>
    `Напиши ответ ${name} в соответствии с характером. Коротко, естественно, в стиле персонажа.
Выводи только строку диалога, без лишних описаний.`,

  sceneIntro: (char: string, from: string, to: string) =>
    `Ты — агент сцены. Персонаж игрока ${char} перемещается из "${from}" в "${to}".`,
  sceneInstruction: `Опиши путь и прибытие. НЕ говори и НЕ действуй от имени персонажа — просто опиши окружение, препятствия, sights и звуки.
Сгенерируй короткое повествование (2-4 предложения). Выводи только текст.`,

  directorIntro: `Ты интегрируешь сюжетныйbeat в текущее повествование.`,
  directorInstruction: `Модифицируй повествование, чтобы естественно включить этотbeat. Не меняй действия или диалоги пользователя.
Сохрани тот же тон и стиль. Выводи только изменённое повествование.`,

  whereToGo: "Куда ты хочешь пойти?",
  noPlace: (name: string) => `Ты не знаешь места с названием '${name}'.`,
  toWhom: (name: string) => `Кому? Скажи 'сказать ${name} Привет'.`,
  whomTalking: "С кем ты разговариваешь? Пример: 'поговорить с Иван'.",
  whatSay: (name: string) => `Что ты хочешь сказать ${name}?`,
  noNpc: (name: string) => `Нет никого с именем '${name}'.`,
  emptyInventory: "Твой инвентарь пуст.",
  noCharacter: "Ты не управляешь никаким персонажем.",
  youSee: "Ты не видишь ничего особенного.",
  youSeeNothing: "Ты не видишь ничего примечательного.",
  noQuests: "Нет активных квестов.",
  unknownCommand: (cmd: string) => `Неизвестная команда: ${cmd}. Напиши /help.`,
  goodbye: "До свидания!",
  sessionSaved: "Состояние сессии сохранено.",

  crafterIntro: "Ты — мастер-ремесленник. Игрок хочет соединить предметы. Проанализируй материалы и предложи, что можно создать, или подтверди известный рецепт. Будь креативен, но реалистичен в рамках правил мира.",
  crafterScenario: (item1: string, item2: string) => `Игрок хочет соединить: ${item1} + ${item2}. Что можно создать из этих материалов?`,
  crafterInstruction: "Ответь коротким описанием (2-3 предложения) того, что происходит при соединении этих предметов. Если это известный рецепт — опиши процесс создания. Если нет — предложи креативный, но правдоподобный результат. Сохрани атмосферность.",
  crafterInventoryEmpty: "У тебя пустой инвентарь.",
  crafterNothingToCraft: "У тебя нет нужных ингредиентов ни для одного известного рецепта.",
  crafterCrafted: (result: string, ingredients: string) => `Создано: ${result} (из ${ingredients})`,
  crafterMissingIngredient: (item: string, need: number, have: number) => `Нужно ${item} x${need}, но есть только ${have}.`,
  crafterUnknownRecipe: (id: string) => `Неизвестный рецепт: ${id}. Напиши /craft list для списка рецептов.`,
  crafterSuggestion: (item1: string, item2: string) => `Что можно сделать из ${item1} и ${item2}?`,
  crafterAlreadyHave: (item: string) => `У тебя уже есть ${item}.`,

  researcherIntro: "Ты — аналитик-исследователь, специализирующийся на исторической точности, культурной подлинности и практическом реализме для построения мира. Ты проверяешь факты, верифицируешь правдоподобность и обогащаешь сцены точными, заземлёнными деталями.",
  researcherRecipeCheck: "Проверь этот рецепт на реализм и правдоподобие:",
  researcherRecipeInstruction: `Проанализируй ингредиенты, процесс и результат рецепта на практический реализм.
Выведи JSON-объект:
{
  "verdict": "plausible" | "questionable" | "unrealistic",
  "confidence": 0.0-1.0,
  "issues": ["список проблем с реализмом"],
  "suggestions": ["список улучшений"],
  "enrichedDetails": "1-2 предложения с реалистичными сенсорными или процедурными деталями"
}`,
  researcherTopicResearch: "Исследуй эту тему для точности построения мира:",
  researcherTopicInstruction: `Предоставь исторически и культурно точную информацию для обогащения мира. Охвати: материалы, инструменты, техники, социальный контекст, сенсорные детали (запахи, текстуры, звуки). Будь конкретен и заземлён.
Выведи краткую исследовательскую сводку (3-5 абзацев).`,
  researcherCharacterCheck: "Проверь этого персонажа на реализм и культурную согласованность:",
  researcherCharacterInstruction: `Проверь: одежда, соответствующая эпохе/месту, реалистичные привычки, правдоподобная еда/питание, аутентичная речь, физические детали, соответствующие роли и среде.
Выведи JSON-объект:
{
  "verdict": "plausible" | "questionable" | "unrealistic",
  "confidence": 0.0-1.0,
  "issues": ["список несоответствий"],
  "suggestions": ["список реалистичных дополнений"],
  "enrichedDetails": "1-2 предложения с заземлёнными деталями персонажа (одежда, еда, быт)"
}`,
  researcherSceneEnrich: "Обогати эту сцену точными, заземлёнными деталями:",
  researcherSceneInstruction: `Добавь реалистичные сенсорные и environmental детали: влияние погоды на материалы, фоновые звуки, запахи, освещение, текстуры, атмосферу времени суток. Заземли сцену в физическую реальность.
Выведи обогащённое описание сцены (3-5 предложений).`,
  researcherFactCheck: "Проверь это утверждение на точность:",
  researcherFactCheckInstruction: `Оцени утверждение на основе реальных знаний. Учитывай исторический период, географию, уровень технологий и культурный контекст.
Выведи JSON-объект:
{
  "verdict": "plausible" | "questionable" | "unrealistic",
  "confidence": 0.0-1.0,
  "issues": ["список фактических ошибок"],
  "suggestions": ["список исправлений"],
  "enrichedDetails": "1-2 предложения с исправленной или обогащённой фактической информацией"
}`,

  uiSettings: "Настройки",
  uiBackToChat: "К ЧАТУ",
  uiLlmConfig: "Конфигурация LLM",
  uiBaseUrl: "Base URL",
  uiBaseUrlHint: "OpenAI-совместимая конечная точка",
  uiApiKey: "API Key",
  uiModel: "Модель",
  uiTimeout: "Таймаут (секунды)",
  uiMaxTokens: "Макс. токенов",
  uiTemperature: "Температура",
  uiMaxRetries: "Макс. повторов",
  uiMaxConcurrent: "Макс. параллельных",
  uiEmbeddings: "Эмбеддинги",
  uiServer: "Сервер",
  uiHost: "Хост",
  uiPort: "Порт",
  uiDbPath: "Путь к БД",
  uiLocalModel: "Локальная модель — Вычисления (llama.cpp / Ollama)",
  uiGpuLayers: "GPU слои (-1 = авто)",
  uiGpuLayersHint: "Количество слоёв на GPU. -1 = все. 0 = только CPU.",
  uiCpuThreads: "Потоки CPU",
  uiCpuThreadsHint: "Количество потоков CPU для инференса.",
  uiContextLength: "Длина контекста",
  uiContextLengthHint: "Макс. окно контекста (токены). Влияет на VRAM.",
  uiBatchSize: "Размер батча",
  uiBatchSizeHint: "Размер батча обработки промпта. Больше = быстрее, но больше VRAM.",
  uiSampling: "Локальная модель — Параметры сэмплирования",
  uiTopP: "Top P (ядройное сэмплирование)",
  uiTopPHint: "Порог кумулятивной вероятности. 0.9 = топ 90% токенов.",
  uiTopK: "Top K",
  uiTopKHint: "Ограничить K наиболее вероятными токенами на каждом шаге.",
  uiRepeatPenalty: "Штраф за повтор",
  uiRepeatPenaltyHint: "1.0 = без штрафа. >1.0 = штраф за повторение.",
  uiMirostat: "Mirostat (0=выкл, 1=v1, 2=v2)",
  uiMirostatHint: "Адаптивное сэмплирование для стабильной перплексии.",
  uiMirostatTau: "Mirostat Tau",
  uiMirostatTauHint: "Целевая энтропия. Меньше = более сфокусировано.",
  uiMirostatEta: "Mirostat Eta",
  uiMirostatEtaHint: "Скорость обучения для адаптации Mirostat.",
  uiAuth: "Аутентификация",
  uiPassword: "Пароль",
  uiPasswordHint: "Пусто = аутентификация не требуется",
  uiMemory: "Система памяти",
  uiMaxEntries: "Макс. записей",
  uiEmbeddingDim: "Размерность эмбеддингов",
  uiSimilarityThreshold: "Порог схожести",
  uiHalfLife: "Полураспад (дни)",
  uiProbability: "Система вероятностей",
  uiGlobalLuck: "Глобальная удача (0.0 – 1.0)",
  uiGlobalLuckHint: "0.5 = нейтрально, выше = более везучий",
  uiWorld: "Мир",
  uiAutoHeal: "Авто-восстановление графа",
  uiEnabled: "Включено",
  uiDisabled: "Выключено",
  uiMaxServe: "MAX Serve (Mojo)",
  uiEndpointUrl: "URL эндпоинта",
  uiEndpointHint: "Опционально: Mojo MAX Serve для векторного поиска",
  uiSave: "Сохранить настройки",
  uiReset: "Сбросить к стандартным",
  uiCancel: "Отмена",
  uiLanguage: "Язык",
  uiConfirmReset: "Сбросить все настройки к стандартным?",
  uiSaveSuccess: "Настройки успешно сохранены",
  uiSaveFail: "Ошибка сохранения",
  uiLoadFail: "Ошибка загрузки настроек",
  uiResetSuccess: "Настройки сброшены к стандартным",
};
