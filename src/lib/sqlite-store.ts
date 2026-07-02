import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { vectorToBlob, blobToVector, cosineSimilarity, reciprocalRankFusion, type RankedItem } from './vector-ops';

export interface EntityData {
  uid: string;
  name: string;
  entityType?: string;
  summary?: string;
  tags?: string;
  description?: string;
  profile?: string;
}

export interface EmbeddingResult {
  entityUid: string | null;
  score: number;
  source: string;
}

export interface MemoryOpts {
  role?: string;
  sessionId?: string;
  importance?: number;
  tags?: string;
}

export interface MemoryResult {
  id: number;
  content: string;
  score: number;
  role?: string;
  sessionId?: string;
}

export interface SearchResult {
  id: string;
  name?: string;
  score: number;
  source: 'fts' | 'vector' | 'hybrid';
}

export interface AgentPromptConfig {
  systemPrompt: string;
  userTemplate: string;
  outputFormat: string;
}

export class SQLiteStore {
  private db: Database;

  constructor(dbPath: string) {
    mkdirSync(dbPath, { recursive: true });
    this.db = new Database(join(dbPath, 'tns.db'));
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA synchronous = NORMAL');
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        uid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        entity_type TEXT,
        summary TEXT,
        tags TEXT,
        description TEXT,
        profile TEXT,
        _search TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
        name, summary, tags, description,
        content=entities,
        content_rowid=rowid
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_uid TEXT,
        vector BLOB NOT NULL,
        dim INTEGER NOT NULL,
        source TEXT DEFAULT 'entity',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        role TEXT,
        session_id TEXT,
        importance REAL DEFAULT 0.5,
        vector BLOB,
        dim INTEGER,
        tags TEXT,
        _search TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content, tags,
        content=memories,
        content_rowid=id
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        world TEXT NOT NULL DEFAULT 'default',
        agent_id TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        system_prompt TEXT NOT NULL DEFAULT '',
        user_template TEXT NOT NULL DEFAULT '',
        output_format TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(world, agent_id, language)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ui_translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language TEXT NOT NULL,
        page TEXT NOT NULL DEFAULT 'global',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(language, page, key)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_prompts_lookup
        ON agent_prompts(world, agent_id, language);
      CREATE INDEX IF NOT EXISTS idx_ui_translations_lookup
        ON ui_translations(language, page);
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
        INSERT INTO entities_fts(rowid, name, summary, tags, description)
        VALUES (new.rowid, new.name, new.summary, new.tags, new.description);
      END;

      CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
        INSERT INTO entities_fts(entities_fts, rowid, name, summary, tags, description)
        VALUES ('delete', old.rowid, old.name, old.summary, old.tags, old.description);
      END;

      CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
        INSERT INTO entities_fts(entities_fts, rowid, name, summary, tags, description)
        VALUES ('delete', old.rowid, old.name, old.summary, old.tags, old.description);
        INSERT INTO entities_fts(rowid, name, summary, tags, description)
        VALUES (new.rowid, new.name, new.summary, new.tags, new.description);
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, tags)
        VALUES (new.id, new.content, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags)
        VALUES ('delete', old.id, old.content, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags)
        VALUES ('delete', old.id, old.content, old.tags);
        INSERT INTO memories_fts(rowid, content, tags)
        VALUES (new.id, new.content, new.tags);
      END;
    `);

    this.seedUITranslations();
  }

  private seedUITranslations(): void {
    const count = this.db.query('SELECT COUNT(*) as count FROM ui_translations').get() as { count: number };
    if (count.count > 0) return;

    const agentsTranslations: Record<string, Record<string, string>> = {
      en: {
        title: 'Agent Configuration',
        providers: 'PROVIDERS',
        models: 'MODELS',
        back: 'BACK',
        settings: 'Settings',
        enabled: 'Enabled',
        provider: 'Provider',
        model: 'Model',
        default: '-- Default --',
        temperature: 'Temperature',
        maxTokens: 'Max Tokens',
        priority: 'Priority',
        saveSettings: 'Save Settings',
        resetDefaults: 'Reset to Defaults',
        systemPrompt: 'System Prompt',
        systemPromptLabel: 'System Prompt — defines agent personality and behavior',
        userTemplate: 'User Template',
        userTemplateLabel: 'User Template — variables: {world_name} {time} {location} {character} {npc_name} {events} {rules} etc.',
        outputFormat: 'Output Format',
        outputFormatLabel: 'Output Format — instructions for response structure',
        savePrompts: 'Save Prompts',
        reload: 'Reload',
        saved: 'Settings saved',
        promptsSaved: 'Prompts saved',
        resetDone: 'Agent reset',
        failed: 'Failed to load: ',
        saveFailed: 'Save failed: ',
        resetFailed: 'Reset failed: ',
        help: 'HELP',
        helpTitle: 'Agent Reference',
        helpSubtitle: 'Each agent has its own LLM configuration. Templates use {variable} placeholders resolved at runtime. Agents without a provider use the global default from Settings.',
        helpGlobalVars: 'Global Variables',
        helpAgents: 'Agents',
        helpTemperature: 'Temperature Guide',
        helpAgentChat: 'Using @agent in Chat',
        helpPriority: 'Priority',
        globalDefault: 'Global Default',
        changeInSettings: 'Change in Settings →',
      },
      ru: {
        title: 'Настройки агентов',
        providers: 'ПРОВАЙДЕРЫ',
        models: 'МОДЕЛИ',
        back: 'НАЗАД',
        settings: 'Настройки',
        enabled: 'Включён',
        provider: 'Провайдер',
        model: 'Модель',
        default: '-- По умолчанию --',
        temperature: 'Температура',
        maxTokens: 'Макс. токенов',
        priority: 'Приоритет',
        saveSettings: 'Сохранить настройки',
        resetDefaults: 'Сбросить настройки',
        systemPrompt: 'Системный промпт',
        systemPromptLabel: 'Системный промпт — определяет личность и поведение агента',
        userTemplate: 'Шаблон запроса',
        userTemplateLabel: 'Шаблон запроса — переменные: {world_name} {time} {location} {character} {npc_name} {events} {rules} и т.д.',
        outputFormat: 'Формат вывода',
        outputFormatLabel: 'Формат вывода — инструкции по структуре ответа',
        savePrompts: 'Сохранить промпты',
        reload: 'Обновить',
        saved: 'Настройки сохранены',
        promptsSaved: 'Промпты сохранены',
        resetDone: 'Агент сброшен',
        failed: 'Ошибка загрузки: ',
        saveFailed: 'Ошибка сохранения: ',
        resetFailed: 'Ошибка сброса: ',
        help: 'СПРАВКА',
        helpTitle: 'Справка по агентам',
        helpSubtitle: 'Каждый агент имеет свою конфигурацию LLM. Шаблоны используют переменные {variable}, подставляемые при выполнении. Агенты без провайдера используют глобальную модель из настроек.',
        helpGlobalVars: 'Глобальные переменные',
        helpAgents: 'Агенты',
        helpTemperature: 'Руководство по температуре',
        helpAgentChat: 'Использование @agent в чате',
        helpPriority: 'Приоритет',
        globalDefault: 'Глобальный по умолчанию',
        changeInSettings: 'Изменить в настройках →',
      },
      de: {
        title: 'Agenten-Konfiguration',
        providers: 'ANBIETER',
        models: 'MODELLE',
        back: 'ZURÜCK',
        settings: 'Einstellungen',
        enabled: 'Aktiviert',
        provider: 'Anbieter',
        model: 'Modell',
        default: '-- Standard --',
        temperature: 'Temperatur',
        maxTokens: 'Max. Tokens',
        priority: 'Priorität',
        saveSettings: 'Einstellungen speichern',
        resetDefaults: 'Auf Standard zurücksetzen',
        systemPrompt: 'System-Prompt',
        systemPromptLabel: 'System-Prompt — definiert Persönlichkeit und Verhalten des Agenten',
        userTemplate: 'Benutzervorlage',
        userTemplateLabel: 'Benutzervorlage — Variablen: {world_name} {time} {location} {character} {npc_name} {events} {rules} usw.',
        outputFormat: 'Ausgabeformat',
        outputFormatLabel: 'Ausgabeformat — Anweisungen für die Antwortstruktur',
        savePrompts: 'Prompts speichern',
        reload: 'Neu laden',
        saved: 'Einstellungen gespeichert',
        promptsSaved: 'Prompts gespeichert',
        resetDone: 'Agent zurückgesetzt',
        failed: 'Laden fehlgeschlagen: ',
        saveFailed: 'Speichern fehlgeschlagen: ',
        resetFailed: 'Zurücksetzen fehlgeschlagen: ',
        help: 'HILFE',
        helpTitle: 'Agenten-Referenz',
        helpSubtitle: 'Jeder Agent hat seine eigene LLM-Konfiguration. Vorlagen verwenden {variable}-Platzhalter.',
        helpGlobalVars: 'Globale Variablen',
        helpAgents: 'Agenten',
        helpTemperature: 'Temperatur-Leitfaden',
        helpAgentChat: '@agent im Chat verwenden',
        helpPriority: 'Priorität',
        globalDefault: 'Global Default',
        changeInSettings: 'Change in Settings →',
      },
      fr: {
        title: 'Configuration des agents',
        providers: 'FOURNISSEURS',
        models: 'MODÈLES',
        back: 'RETOUR',
        settings: 'Paramètres',
        enabled: 'Activé',
        provider: 'Fournisseur',
        model: 'Modèle',
        default: '-- Par défaut --',
        temperature: 'Température',
        maxTokens: 'Max. jetons',
        priority: 'Priorité',
        saveSettings: 'Enregistrer',
        resetDefaults: 'Réinitialiser',
        systemPrompt: 'Prompt système',
        systemPromptLabel: 'Prompt système — définit la personnalité et le comportement de l\'agent',
        userTemplate: 'Modèle utilisateur',
        userTemplateLabel: 'Modèle utilisateur — variables : {world_name} {time} {location} {character} {npc_name} {events} {rules} etc.',
        outputFormat: 'Format de sortie',
        outputFormatLabel: 'Format de sortie — instructions pour la structure de la réponse',
        savePrompts: 'Enregistrer les prompts',
        reload: 'Recharger',
        saved: 'Paramètres enregistrés',
        promptsSaved: 'Prompts enregistrés',
        resetDone: 'Agent réinitialisé',
        failed: 'Échec du chargement : ',
        saveFailed: 'Échec de l\'enregistrement : ',
        resetFailed: 'Échec de la réinitialisation : ',
        help: 'AIDE',
        helpTitle: 'Référence des agents',
        helpSubtitle: 'Chaque agent a sa propre configuration LLM. Les modèles utilisent des variables {variable}.',
        helpGlobalVars: 'Variables globales',
        helpAgents: 'Agents',
        helpTemperature: 'Guide de température',
        helpAgentChat: 'Utiliser @agent dans le chat',
        helpPriority: 'Priorité',
        globalDefault: 'Global Default',
        changeInSettings: 'Change in Settings →',
      },
      es: {
        title: 'Configuración de agentes',
        providers: 'PROVEEDORES',
        models: 'MODELOS',
        back: 'VOLVER',
        settings: 'Ajustes',
        enabled: 'Activado',
        provider: 'Proveedor',
        model: 'Modelo',
        default: '-- Por defecto --',
        temperature: 'Temperatura',
        maxTokens: 'Máx. tokens',
        priority: 'Prioridad',
        saveSettings: 'Guardar ajustes',
        resetDefaults: 'Restablecer valores',
        systemPrompt: 'Prompt del sistema',
        systemPromptLabel: 'Prompt del sistema — define la personalidad y comportamiento del agente',
        userTemplate: 'Plantilla de usuario',
        userTemplateLabel: 'Plantilla de usuario — variables: {world_name} {time} {location} {character} {npc_name} {events} {rules} etc.',
        outputFormat: 'Formato de salida',
        outputFormatLabel: 'Formato de salida — instrucciones para la estructura de respuesta',
        savePrompts: 'Guardar prompts',
        reload: 'Recargar',
        saved: 'Ajustes guardados',
        promptsSaved: 'Prompts guardados',
        resetDone: 'Agente restablecido',
        failed: 'Error al cargar: ',
        saveFailed: 'Error al guardar: ',
        resetFailed: 'Error al restablecer: ',
        help: 'AYUDA',
        helpTitle: 'Referencia de agentes',
        helpSubtitle: 'Cada agente tiene su propia configuración LLM. Las plantillas usan variables {variable}.',
        helpGlobalVars: 'Variables globales',
        helpAgents: 'Agentes',
        helpTemperature: 'Guía de temperatura',
        helpAgentChat: 'Usar @agent en el chat',
        helpPriority: 'Prioridad',
        globalDefault: 'Global Default',
        changeInSettings: 'Change in Settings →',
      },
      ja: {
        title: 'エージェント設定',
        providers: 'プロバイダー',
        models: 'モデル',
        back: '戻る',
        settings: '設定',
        enabled: '有効',
        provider: 'プロバイダー',
        model: 'モデル',
        default: '-- デフォルト --',
        temperature: '温度',
        maxTokens: '最大トークン',
        priority: '優先度',
        saveSettings: '設定を保存',
        resetDefaults: 'デフォルトに戻す',
        systemPrompt: 'システムプロンプト',
        systemPromptLabel: 'システムプロンプト — エージェントの個性と動作を定義',
        userTemplate: 'ユーザーテンプレート',
        userTemplateLabel: 'ユーザーテンプレート — 変数: {world_name} {time} {location} {character} {npc_name} {events} {rules} など',
        outputFormat: '出力形式',
        outputFormatLabel: '出力形式 — 応答構造の指示',
        savePrompts: 'プロンプトを保存',
        reload: '再読み込み',
        saved: '設定を保存しました',
        promptsSaved: 'プロンプトを保存しました',
        resetDone: 'エージェントをリセットしました',
        failed: '読み込みエラー: ',
        saveFailed: '保存エラー: ',
        resetFailed: 'リセットエラー: ',
        help: 'ヘルプ',
        helpTitle: 'エージェントリファレンス',
        helpSubtitle: '各エージェントは独自のLLM設定を持ちます。テンプレートは実行時に解決される{variable}プレースホルダーを使用します。',
        helpGlobalVars: 'グローバル変数',
        helpAgents: 'エージェント',
        helpTemperature: 'Temperatureガイド',
        helpAgentChat: 'チャットで@agentを使用',
        helpPriority: '優先度',
        globalDefault: 'Global Default',
        changeInSettings: 'Change in Settings →',
      },
      zh: {
        title: '代理配置',
        providers: '提供商',
        models: '模型',
        back: '返回',
        settings: '设置',
        enabled: '启用',
        provider: '提供商',
        model: '模型',
        default: '-- 默认 --',
        temperature: '温度',
        maxTokens: '最大令牌',
        priority: '优先级',
        saveSettings: '保存设置',
        resetDefaults: '恢复默认',
        systemPrompt: '系统提示词',
        systemPromptLabel: '系统提示词 — 定义代理的人格和行为',
        userTemplate: '用户模板',
        userTemplateLabel: '用户模板 — 变量: {world_name} {time} {location} {character} {npc_name} {events} {rules} 等',
        outputFormat: '输出格式',
        outputFormatLabel: '输出格式 — 响应结构的指令',
        savePrompts: '保存提示词',
        reload: '重新加载',
        saved: '设置已保存',
        promptsSaved: '提示词已保存',
        resetDone: '代理已重置',
        failed: '加载失败: ',
        saveFailed: '保存失败: ',
        resetFailed: '重置失败: ',
        help: '帮助',
        helpTitle: '代理参考',
        helpSubtitle: '每个代理都有自己的LLM配置。模板使用在运行时解析的{variable}占位符。',
        helpGlobalVars: '全局变量',
        helpAgents: '代理',
        helpTemperature: 'Temperature指南',
        helpAgentChat: '在聊天中使用@agent',
        helpPriority: '优先级',
        globalDefault: 'Global Default',
        changeInSettings: 'Change in Settings →',
      },
    };

    const settingsTranslations: Record<string, Record<string, string>> = {
      en: {
        uiSettings: 'Settings',
        uiBackToChat: 'BACK TO CHAT',
        uiModels: 'MODELS',
        uiAgents: 'AGENTS',
        uiLlmConfig: 'LLM Configuration',
        uiBaseUrl: 'Base URL',
        uiBaseUrlHint: 'OpenAI-compatible endpoint',
        uiApiKey: 'API Key',
        uiModel: 'Model',
        uiTimeout: 'Timeout (seconds)',
        uiMaxTokens: 'Max Tokens',
        uiTemperature: 'Temperature',
        uiMaxRetries: 'Max Retries',
        uiMaxConcurrent: 'Max Concurrent',
        uiEmbeddings: 'Embeddings',
        uiServer: 'Server',
        uiHost: 'Host',
        uiPort: 'Port',
        uiDbPath: 'Database Path',
        uiLocalModel: 'Local Model — Compute (llama.cpp / Ollama)',
        uiGpuLayers: 'GPU Layers (-1 = auto)',
        uiGpuLayersHint: 'Number of layers offloaded to GPU. -1 = all layers. 0 = CPU only.',
        uiCpuThreads: 'CPU Threads',
        uiCpuThreadsHint: 'Number of CPU threads for inference.',
        uiContextLength: 'Context Length',
        uiContextLengthHint: 'Maximum context window (tokens). Affects VRAM usage.',
        uiBatchSize: 'Batch Size',
        uiBatchSizeHint: 'Prompt processing batch size. Higher = faster but more VRAM.',
        uiSampling: 'Local Model — Sampling Parameters',
        uiTopP: 'Top P (nucleus sampling)',
        uiTopPHint: 'Cumulative probability threshold. 0.9 = top 90% tokens.',
        uiTopK: 'Top K',
        uiTopKHint: 'Limit to K most probable tokens at each step.',
        uiRepeatPenalty: 'Repeat Penalty',
        uiRepeatPenaltyHint: '1.0 = no penalty. >1.0 = penalize repetition.',
        uiMirostat: 'Mirostat (0=off, 1=v1, 2=v2)',
        uiMirostatHint: 'Adaptive sampling for consistent perplexity.',
        uiMirostatTau: 'Mirostat Tau',
        uiMirostatTauHint: 'Target entropy. Lower = more focused.',
        uiMirostatEta: 'Mirostat Eta',
        uiMirostatEtaHint: 'Learning rate for Mirostat adaptation.',
        uiAuth: 'Authentication',
        uiPassword: 'Password',
        uiPasswordHint: 'Empty = no authentication required',
        uiMemory: 'Memory System',
        uiMaxEntries: 'Max Entries',
        uiEmbeddingDim: 'Embedding Dimension',
        uiSimilarityThreshold: 'Similarity Threshold',
        uiHalfLife: 'Half-life (days)',
        uiProbability: 'Probability System',
        uiGlobalLuck: 'Global Luck (0.0 – 1.0)',
        uiGlobalLuckHint: '0.5 = neutral, higher = more lucky',
        uiWorld: 'World',
        uiAutoHeal: 'Auto-Heal Graph',
        uiEnabled: 'Enabled',
        uiDisabled: 'Disabled',
        uiSave: 'Save Settings',
        uiReset: 'Reset to Defaults',
        uiCancel: 'Cancel',
        uiLanguage: 'Language',
        uiConfirmReset: 'Reset all settings?',
        uiSaveSuccess: 'Settings saved',
        uiSaveFail: 'Save failed',
        uiLoadFail: 'Load failed',
        uiResetSuccess: 'Settings reset',
      },
      ru: {
        uiSettings: 'Настройки',
        uiBackToChat: 'К ЧАТУ',
        uiModels: 'МОДЕЛИ',
        uiAgents: 'АГЕНТЫ',
        uiLlmConfig: 'Конфигурация LLM',
        uiBaseUrl: 'Base URL',
        uiBaseUrlHint: 'OpenAI-совместимая конечная точка',
        uiApiKey: 'API Key',
        uiModel: 'Модель',
        uiTimeout: 'Таймаут (секунды)',
        uiMaxTokens: 'Макс. токенов',
        uiTemperature: 'Температура',
        uiMaxRetries: 'Макс. повторов',
        uiMaxConcurrent: 'Макс. параллельных',
        uiEmbeddings: 'Эмбеддинги',
        uiServer: 'Сервер',
        uiHost: 'Хост',
        uiPort: 'Порт',
        uiDbPath: 'Путь к БД',
        uiLocalModel: 'Локальная модель — Вычисления (llama.cpp / Ollama)',
        uiGpuLayers: 'GPU слои (-1 = авто)',
        uiGpuLayersHint: 'Количество слоёв на GPU. -1 = все. 0 = только CPU.',
        uiCpuThreads: 'Потоки CPU',
        uiCpuThreadsHint: 'Количество потоков CPU для инференса.',
        uiContextLength: 'Длина контекста',
        uiContextLengthHint: 'Макс. окно контекста (токены). Влияет на VRAM.',
        uiBatchSize: 'Размер батча',
        uiBatchSizeHint: 'Размер батча обработки промпта. Больше = быстрее, но больше VRAM.',
        uiSampling: 'Локальная модель — Параметры сэмплирования',
        uiTopP: 'Top P (ядройное сэмплирование)',
        uiTopPHint: 'Порог кумулятивной вероятности. 0.9 = топ 90% токенов.',
        uiTopK: 'Top K',
        uiTopKHint: 'Ограничить K наиболее вероятными токенами на каждом шаге.',
        uiRepeatPenalty: 'Штраф за повтор',
        uiRepeatPenaltyHint: '1.0 = без штрафа. >1.0 = штраф за повторение.',
        uiMirostat: 'Mirostat (0=выкл, 1=v1, 2=v2)',
        uiMirostatHint: 'Адаптивное сэмплирование для стабильной перплексии.',
        uiMirostatTau: 'Mirostat Tau',
        uiMirostatTauHint: 'Целевая энтропия. Меньше = более сфокусировано.',
        uiMirostatEta: 'Mirostat Eta',
        uiMirostatEtaHint: 'Скорость обучения для адаптации Mirostat.',
        uiAuth: 'Аутентификация',
        uiPassword: 'Пароль',
        uiPasswordHint: 'Пусто = аутентификация не требуется',
        uiMemory: 'Система памяти',
        uiMaxEntries: 'Макс. записей',
        uiEmbeddingDim: 'Размерность эмбеддингов',
        uiSimilarityThreshold: 'Порог схожести',
        uiHalfLife: 'Полураспад (дни)',
        uiProbability: 'Система вероятностей',
        uiGlobalLuck: 'Глобальная удача (0.0 – 1.0)',
        uiGlobalLuckHint: '0.5 = нейтрально, выше = более везучий',
        uiWorld: 'Мир',
        uiAutoHeal: 'Авто-исправление графа',
        uiEnabled: 'Включено',
        uiDisabled: 'Выключено',
        uiSave: 'Сохранить настройки',
        uiReset: 'Сбросить настройки',
        uiCancel: 'Отмена',
        uiLanguage: 'Язык',
        uiConfirmReset: 'Сбросить все настройки?',
        uiSaveSuccess: 'Настройки сохранены',
        uiSaveFail: 'Ошибка сохранения',
        uiLoadFail: 'Ошибка загрузки',
        uiResetSuccess: 'Настройки сброшены',
      },
      de: {
        uiSettings: 'Einstellungen',
        uiBackToChat: 'ZUM CHAT',
        uiModels: 'MODELS',
        uiAgents: 'AGENTS',
        uiLlmConfig: 'LLM-Konfiguration',
        uiBaseUrl: 'Base URL',
        uiBaseUrlHint: 'OpenAI-compatible endpoint',
        uiApiKey: 'API Key',
        uiModel: 'Modell',
        uiTimeout: 'Timeout (Sekunden)',
        uiMaxTokens: 'Max. Tokens',
        uiTemperature: 'Temperatur',
        uiMaxRetries: 'Max. Wiederholungen',
        uiMaxConcurrent: 'Max. parallel',
        uiEmbeddings: 'Embeddings',
        uiServer: 'Server',
        uiHost: 'Host',
        uiPort: 'Port',
        uiDbPath: 'Datenbankpfad',
        uiLocalModel: 'Lokales Modell — Berechnung (llama.cpp / Ollama)',
        uiGpuLayers: 'GPU-Schichten (-1 = auto)',
        uiGpuLayersHint: 'Anzahl der GPU-Schichten. -1 = alle. 0 = nur CPU.',
        uiCpuThreads: 'CPU-Threads',
        uiCpuThreadsHint: 'Anzahl der CPU-Threads für die Inferenz.',
        uiContextLength: 'Kontextlänge',
        uiContextLengthHint: 'Max. Kontextfenster (Token). Beeinflusst VRAM-Verbrauch.',
        uiBatchSize: 'Batch-Größe',
        uiBatchSizeHint: 'Batch-Größe der Prompt-Verarbeitung. Größer = schneller, aber mehr VRAM.',
        uiSampling: 'Lokales Modell — Sampling-Parameter',
        uiTopP: 'Top P (Nucleus-Sampling)',
        uiTopPHint: 'Schwellenwert der kumulativen Wahrscheinlichkeit. 0.9 = Top 90% Token.',
        uiTopK: 'Top K',
        uiTopKHint: 'Auf K wahrscheinlichste Token pro Schritt begrenzen.',
        uiRepeatPenalty: 'Wiederholungsstrafe',
        uiRepeatPenaltyHint: '1.0 = keine Strafe. >1.0 = Strafe bei Wiederholung.',
        uiMirostat: 'Mirostat (0=aus, 1=v1, 2=v2)',
        uiMirostatHint: 'Adaptives Sampling für gleichmäßige Perplexität.',
        uiMirostatTau: 'Mirostat Tau',
        uiMirostatTauHint: 'Ziel-Entropie. Niedriger = fokussierter.',
        uiMirostatEta: 'Mirostat Eta',
        uiMirostatEtaHint: 'Lernrate für Mirostat-Anpassung.',
        uiAuth: 'Authentifizierung',
        uiPassword: 'Passwort',
        uiPasswordHint: 'Leer = keine Authentifizierung erforderlich',
        uiMemory: 'Speichersystem',
        uiMaxEntries: 'Max. Einträge',
        uiEmbeddingDim: 'Embedding-Dimension',
        uiSimilarityThreshold: 'Ähnlichkeitsschwelle',
        uiHalfLife: 'Halbwertszeit (Tage)',
        uiProbability: 'Wahrscheinlichkeitssystem',
        uiGlobalLuck: 'Globales Glück (0.0 – 1.0)',
        uiGlobalLuckHint: '0.5 = neutral, höher = mehr Glück',
        uiWorld: 'Welt',
        uiAutoHeal: 'Auto-Heal Graph',
        uiEnabled: 'Aktiviert',
        uiDisabled: 'Deaktiviert',
        uiSave: 'Einstellungen speichern',
        uiReset: 'Auf Standard zurücksetzen',
        uiCancel: 'Abbrechen',
        uiLanguage: 'Sprache',
        uiConfirmReset: 'Alle Einstellungen zurücksetzen?',
        uiSaveSuccess: 'Einstellungen gespeichert',
        uiSaveFail: 'Speichern fehlgeschlagen',
        uiLoadFail: 'Laden fehlgeschlagen',
        uiResetSuccess: 'Einstellungen zurückgesetzt',
      },
      fr: {
        uiSettings: 'Paramètres',
        uiBackToChat: 'AU CHAT',
        uiModels: 'MODÈLES',
        uiAgents: 'AGENTS',
        uiLlmConfig: 'Configuration LLM',
        uiBaseUrl: 'Base URL',
        uiBaseUrlHint: 'Endpoint compatible OpenAI',
        uiApiKey: 'API Key',
        uiModel: 'Modèle',
        uiTimeout: 'Timeout (secondes)',
        uiMaxTokens: 'Max. jetons',
        uiTemperature: 'Température',
        uiMaxRetries: 'Max. tentatives',
        uiMaxConcurrent: 'Max. concurrence',
        uiEmbeddings: 'Embeddings',
        uiServer: 'Serveur',
        uiHost: 'Hôte',
        uiPort: 'Port',
        uiDbPath: 'Chemin de la base',
        uiLocalModel: 'Modèle local — Calcul (llama.cpp / Ollama)',
        uiGpuLayers: 'Couches GPU (-1 = auto)',
        uiGpuLayersHint: 'Nombre de couches sur GPU. -1 = toutes. 0 = CPU seul.',
        uiCpuThreads: 'Threads CPU',
        uiCpuThreadsHint: 'Nombre de threads CPU pour l\'inférence.',
        uiContextLength: 'Longueur du contexte',
        uiContextLengthHint: 'Fenêtre de contexte max (jetons). Affecte l\'utilisation VRAM.',
        uiBatchSize: 'Taille du batch',
        uiBatchSizeHint: 'Taille du batch de traitement. Plus grand = plus rapide mais plus de VRAM.',
        uiSampling: 'Modèle local — Paramètres d\'échantillonnage',
        uiTopP: 'Top P (échantillonnage noyau)',
        uiTopPHint: 'Seuil de probabilité cumulative. 0.9 = top 90% jetons.',
        uiTopK: 'Top K',
        uiTopKHint: 'Limiter aux K jetons les plus probables à chaque étape.',
        uiRepeatPenalty: 'Pénalité de répétition',
        uiRepeatPenaltyHint: '1.0 = pas de pénalité. >1.0 = pénaliser la répétition.',
        uiMirostat: 'Mirostat (0=off, 1=v1, 2=v2)',
        uiMirostatHint: 'Échantillonnage adaptatif pour une perplexité constante.',
        uiMirostatTau: 'Mirostat Tau',
        uiMirostatTauHint: 'Entropie cible. Plus bas = plus concentré.',
        uiMirostatEta: 'Mirostat Eta',
        uiMirostatEtaHint: 'Taux d\'apprentissage pour l\'adaptation Mirostat.',
        uiAuth: 'Authentification',
        uiPassword: 'Mot de passe',
        uiPasswordHint: 'Vide = aucune authentification requise',
        uiMemory: 'Système de mémoire',
        uiMaxEntries: 'Max. entrées',
        uiEmbeddingDim: 'Dimension des embeddings',
        uiSimilarityThreshold: 'Seuil de similarité',
        uiHalfLife: 'Demi-vie (jours)',
        uiProbability: 'Système de probabilité',
        uiGlobalLuck: 'Chance globale (0.0 – 1.0)',
        uiGlobalLuckHint: '0.5 = neutre, plus haut = plus de chance',
        uiWorld: 'Monde',
        uiAutoHeal: 'Auto-Heal Graph',
        uiEnabled: 'Activé',
        uiDisabled: 'Désactivé',
        uiSave: 'Enregistrer',
        uiReset: 'Par défaut',
        uiCancel: 'Annuler',
        uiLanguage: 'Langue',
        uiConfirmReset: 'Réinitialiser tous les paramètres ?',
        uiSaveSuccess: 'Paramètres enregistrés',
        uiSaveFail: 'Échec de l\'enregistrement',
        uiLoadFail: 'Échec du chargement',
        uiResetSuccess: 'Paramètres réinitialisés',
      },
      es: {
        uiSettings: 'Ajustes',
        uiBackToChat: 'AL CHAT',
        uiModels: 'MODELOS',
        uiAgents: 'AGENTES',
        uiLlmConfig: 'Configuración LLM',
        uiBaseUrl: 'Base URL',
        uiBaseUrlHint: 'Endpoint compatible con OpenAI',
        uiApiKey: 'API Key',
        uiModel: 'Modelo',
        uiTimeout: 'Tiempo de espera (segundos)',
        uiMaxTokens: 'Máx. tokens',
        uiTemperature: 'Temperatura',
        uiMaxRetries: 'Máx. reintentos',
        uiMaxConcurrent: 'Máx. concurrencia',
        uiEmbeddings: 'Embeddings',
        uiServer: 'Servidor',
        uiHost: 'Host',
        uiPort: 'Puerto',
        uiDbPath: 'Ruta de la base de datos',
        uiLocalModel: 'Modelo local — Cómputo (llama.cpp / Ollama)',
        uiGpuLayers: 'Capas GPU (-1 = auto)',
        uiGpuLayersHint: 'Número de capas en GPU. -1 = todas. 0 = solo CPU.',
        uiCpuThreads: 'Hilos CPU',
        uiCpuThreadsHint: 'Número de hilos CPU para inferencia.',
        uiContextLength: 'Longitud de contexto',
        uiContextLengthHint: 'Ventana máxima de contexto (tokens). Afecta el uso de VRAM.',
        uiBatchSize: 'Tamaño de lote',
        uiBatchSizeHint: 'Tamaño de lote de procesamiento. Mayor = más rápido pero más VRAM.',
        uiSampling: 'Modelo local — Parámetros de muestreo',
        uiTopP: 'Top P (muestreo núcleo)',
        uiTopPHint: 'Umbral de probabilidad acumulada. 0.9 = top 90% tokens.',
        uiTopK: 'Top K',
        uiTopKHint: 'Limitar a K tokens más probables en cada paso.',
        uiRepeatPenalty: 'Penalización por repetición',
        uiRepeatPenaltyHint: '1.0 = sin penalización. >1.0 = penalizar repetición.',
        uiMirostat: 'Mirostat (0=off, 1=v1, 2=v2)',
        uiMirostatHint: 'Muestreo adaptativo para perplexidad consistente.',
        uiMirostatTau: 'Mirostat Tau',
        uiMirostatTauHint: 'Entropía objetivo. Menor = más enfocado.',
        uiMirostatEta: 'Mirostat Eta',
        uiMirostatEtaHint: 'Tasa de aprendizaje para adaptación Mirostat.',
        uiAuth: 'Autenticación',
        uiPassword: 'Contraseña',
        uiPasswordHint: 'Vacío = sin autenticación requerida',
        uiMemory: 'Sistema de memoria',
        uiMaxEntries: 'Máx. entradas',
        uiEmbeddingDim: 'Dimensión de embeddings',
        uiSimilarityThreshold: 'Umbral de similitud',
        uiHalfLife: 'Vida media (días)',
        uiProbability: 'Sistema de probabilidad',
        uiGlobalLuck: 'Suerte global (0.0 – 1.0)',
        uiGlobalLuckHint: '0.5 = neutral, mayor = más suerte',
        uiWorld: 'Mundo',
        uiAutoHeal: 'Auto-Heal Graph',
        uiEnabled: 'Activado',
        uiDisabled: 'Desactivado',
        uiSave: 'Guardar',
        uiReset: 'Por defecto',
        uiCancel: 'Cancelar',
        uiLanguage: 'Idioma',
        uiConfirmReset: '¿Restablecer todos los ajustes?',
        uiSaveSuccess: 'Ajustes guardados',
        uiSaveFail: 'Error al guardar',
        uiLoadFail: 'Error al cargar',
        uiResetSuccess: 'Ajustes restablecidos',
      },
      ja: {
        uiSettings: '設定',
        uiBackToChat: 'チャットへ',
        uiModels: 'モデル',
        uiAgents: 'エージェント',
        uiLlmConfig: 'LLM設定',
        uiBaseUrl: 'Base URL',
        uiBaseUrlHint: 'OpenAI互換エンドポイント',
        uiApiKey: 'API Key',
        uiModel: 'モデル',
        uiTimeout: 'タイムアウト（秒）',
        uiMaxTokens: '最大トークン',
        uiTemperature: '温度',
        uiMaxRetries: '最大リトライ',
        uiMaxConcurrent: '最大同時実行',
        uiEmbeddings: 'Embeddings',
        uiServer: 'サーバー',
        uiHost: 'ホスト',
        uiPort: 'ポート',
        uiDbPath: 'データベースパス',
        uiLocalModel: 'ローカルモデル — 計算 (llama.cpp / Ollama)',
        uiGpuLayers: 'GPUレイヤー (-1 = auto)',
        uiGpuLayersHint: 'GPUレイヤー数。-1 = 全部。0 = CPUのみ。',
        uiCpuThreads: 'CPUスレッド',
        uiCpuThreadsHint: '推論用CPUスレッド数。',
        uiContextLength: 'コンテキスト長',
        uiContextLengthHint: '最大コンテキストウィンドウ（トークン）。VRAM使用量に影響。',
        uiBatchSize: 'バッチサイズ',
        uiBatchSizeHint: 'プロンプト処理バッチサイズ。大きい=速いがVRAM多い。',
        uiSampling: 'ローカルモデル — サンプリングパラメータ',
        uiTopP: 'Top P (nucleus sampling)',
        uiTopPHint: '累積確率しきい値。0.9 = トップ90%トークン。',
        uiTopK: 'Top K',
        uiTopKHint: '各ステップで最も確率の高いKトークンに制限。',
        uiRepeatPenalty: '繰り返しペナルティ',
        uiRepeatPenaltyHint: '1.0 = ペナルティなし。>1.0 = 繰り返しをペナルティ。',
        uiMirostat: 'Mirostat (0=off, 1=v1, 2=v2)',
        uiMirostatHint: '一定のパープレキシティのための適応サンプリング。',
        uiMirostatTau: 'Mirostat Tau',
        uiMirostatTauHint: '目標エントロピー。低い=より集中。',
        uiMirostatEta: 'Mirostat Eta',
        uiMirostatEtaHint: 'Mirostat適応の学習率。',
        uiAuth: '認証',
        uiPassword: 'パスワード',
        uiPasswordHint: '空=認証不要',
        uiMemory: 'メモリシステム',
        uiMaxEntries: '最大エントリ',
        uiEmbeddingDim: 'Embedding次元',
        uiSimilarityThreshold: '類似度しきい値',
        uiHalfLife: '半減期（日）',
        uiProbability: '確率システム',
        uiGlobalLuck: 'グローバル幸運 (0.0 – 1.0)',
        uiGlobalLuckHint: '0.5 = 中立、高い=より幸運',
        uiWorld: 'ワールド',
        uiAutoHeal: 'Auto-Heal Graph',
        uiEnabled: '有効',
        uiDisabled: '無効',
        uiSave: '保存',
        uiReset: 'デフォルト',
        uiCancel: 'キャンセル',
        uiLanguage: '言語',
        uiConfirmReset: 'すべての設定をリセットしますか？',
        uiSaveSuccess: '設定を保存しました',
        uiSaveFail: '保存に失敗しました',
        uiLoadFail: '読み込みに失敗しました',
        uiResetSuccess: '設定をリセットしました',
      },
      zh: {
        uiSettings: '设置',
        uiBackToChat: '返回聊天',
        uiModels: '模型',
        uiAgents: '代理',
        uiLlmConfig: 'LLM配置',
        uiBaseUrl: 'Base URL',
        uiBaseUrlHint: 'OpenAI兼容端点',
        uiApiKey: 'API Key',
        uiModel: '模型',
        uiTimeout: '超时（秒）',
        uiMaxTokens: '最大令牌',
        uiTemperature: '温度',
        uiMaxRetries: '最大重试',
        uiMaxConcurrent: '最大并发',
        uiEmbeddings: 'Embeddings',
        uiServer: '服务器',
        uiHost: '主机',
        uiPort: '端口',
        uiDbPath: '数据库路径',
        uiLocalModel: '本地模型 — 计算 (llama.cpp / Ollama)',
        uiGpuLayers: 'GPU层数 (-1 = auto)',
        uiGpuLayersHint: 'GPU层数。-1 = 全部。0 = 仅CPU。',
        uiCpuThreads: 'CPU线程',
        uiCpuThreadsHint: '推理CPU线程数。',
        uiContextLength: '上下文长度',
        uiContextLengthHint: '最大上下文窗口（令牌）。影响VRAM使用。',
        uiBatchSize: '批处理大小',
        uiBatchSizeHint: '提示词处理批大小。越大=越快但VRAM越多。',
        uiSampling: '本地模型 — 采样参数',
        uiTopP: 'Top P (核采样)',
        uiTopPHint: '累积概率阈值。0.9 = 前90%令牌。',
        uiTopK: 'Top K',
        uiTopKHint: '每步限制为K个最可能的令牌。',
        uiRepeatPenalty: '重复惩罚',
        uiRepeatPenaltyHint: '1.0 = 无惩罚。>1.0 = 惩罚重复。',
        uiMirostat: 'Mirostat (0=off, 1=v1, 2=v2)',
        uiMirostatHint: '自适应采样以保持一致的困惑度。',
        uiMirostatTau: 'Mirostat Tau',
        uiMirostatTauHint: '目标熵。越低=越集中。',
        uiMirostatEta: 'Mirostat Eta',
        uiMirostatEtaHint: 'Mirostat适应的学习率。',
        uiAuth: '认证',
        uiPassword: '密码',
        uiPasswordHint: '空=不需要认证',
        uiMemory: '记忆系统',
        uiMaxEntries: '最大条目',
        uiEmbeddingDim: 'Embedding维度',
        uiSimilarityThreshold: '相似度阈值',
        uiHalfLife: '半衰期（天）',
        uiProbability: '概率系统',
        uiGlobalLuck: '全局幸运值 (0.0 – 1.0)',
        uiGlobalLuckHint: '0.5 = 中性，越高=越幸运',
        uiWorld: '世界',
        uiAutoHeal: 'Auto-Heal Graph',
        uiEnabled: '启用',
        uiDisabled: '禁用',
        uiSave: '保存',
        uiReset: '恢复默认',
        uiCancel: '取消',
        uiLanguage: '语言',
        uiConfirmReset: '重置所有设置？',
        uiSaveSuccess: '设置已保存',
        uiSaveFail: '保存失败',
        uiLoadFail: '加载失败',
        uiResetSuccess: '设置已重置',
      },
    };

    const agentNames: Record<string, Record<string, string>> = {
      en: { narrator: 'Narrator', director: 'Director', scene: 'Scene', npc: 'NPC', chronicler: 'Chronicler', 'story-planner': 'Story Planner', 'social-sim': 'Social Sim', villain: 'Villain', researcher: 'Researcher' },
      ru: { narrator: 'Рассказчик', director: 'Режиссёр', scene: 'Сцена', npc: 'NPC', chronicler: 'Летописец', 'story-planner': 'Планер', 'social-sim': 'Соц. динамика', villain: 'Злодей', researcher: 'Исследователь' },
      de: { narrator: 'Erzähler', director: 'Regisseur', scene: 'Szene', npc: 'NPC', chronicler: 'Chronist', 'story-planner': 'Story-Planer', 'social-sim': 'Soz. Sim', villain: 'Schurke', researcher: 'Forscher' },
      fr: { narrator: 'Narrateur', director: 'Réalisateur', scene: 'Scène', npc: 'PNJ', chronicler: 'Chroniqueur', 'story-planner': 'Planificateur', 'social-sim': 'Sim. sociale', villain: 'Méchant', researcher: 'Chercheur' },
      es: { narrator: 'Narrador', director: 'Director', scene: 'Escena', npc: 'NPC', chronicler: 'Cronista', 'story-planner': 'Planificador', 'social-sim': 'Sim. social', villain: 'Villano', researcher: 'Investigador' },
      ja: { narrator: 'ナレーター', director: 'ディレクター', scene: 'シーン', npc: 'NPC', chronicler: '年代記', 'story-planner': 'ストーリープランナー', 'social-sim': 'ソーシャル', villain: '悪役', researcher: 'リサーチャー' },
      zh: { narrator: '叙述者', director: '导演', scene: '场景', npc: 'NPC', chronicler: '编年史', 'story-planner': '故事规划', 'social-sim': '社交模拟', villain: '反派', researcher: '研究员' },
    };

    const agentDescs: Record<string, Record<string, string>> = {
      en: { narrator: 'Generates world narrative from context', director: 'Integrates story beats into narrative', scene: 'Generates scene transition narratives', npc: 'Roleplays as NPCs', chronicler: 'Maintains world history timeline', 'story-planner': 'Plans story arcs and quests', 'social-sim': 'Simulates NPC social dynamics', villain: 'Manages antagonist actions', researcher: 'Fact-checking and realism validation' },
      ru: { narrator: 'Генерирует повествование мира из контекста', director: 'Интегрирует сюжетныеbeatы в повествование', scene: 'Генерирует описание переходов между сценами', npc: 'Ролевая игра за NPC', chronicler: 'Ведёт хронику мира', 'story-planner': 'Планирует сюжетные арки и квесты', 'social-sim': 'Моделирует социальную динамику NPC', villain: 'Управляет действиями антагонистов', researcher: 'Проверка фактов и валидация реализма' },
      de: { narrator: 'Generiert Weltnarrativ aus Kontext', director: 'Integriert Handlungsbeats in die Erzählung', scene: 'Generiert Szenenübergänge', npc: 'Spielt NPCs', chronicler: 'Pflegt Weltgeschichte', 'story-planner': 'Plant Handlungsstränge', 'social-sim': 'Simuliert soziale Dynamik', villain: 'Verwaltet Antagonisten', researcher: 'Faktencheck und Realismusvalidierung' },
      fr: { narrator: 'Génère le récit du monde', director: 'Intègre les battements narratifs', scene: 'Génère les transitions de scène', npc: 'Interprète les PNJ', chronicler: 'Maintient l\'historique du monde', 'story-planner': 'Planifie les arcs narratifs', 'social-sim': 'Simule la dynamique sociale', villain: 'Gère les actions antagonistes', researcher: 'Vérification des faits et validité' },
      es: { narrator: 'Genera narrativa del mundo', director: 'Integra momentos narrativos', scene: 'Genera transiciones de escena', npc: 'Interpreta NPCs', chronicler: 'Mantiene la historia del mundo', 'story-planner': 'Planifica arcos argumentales', 'social-sim': 'Simula dinámica social', villain: 'Gestiona antagonistas', researcher: 'Verificación de hechos y realismo' },
      ja: { narrator: 'コンテキストから世界の物語を生成', director: 'ストーリービートを統合', scene: 'シーン遷移を生成', npc: 'NPCのロールプレイ', chronicler: '世界の歴史を管理', 'story-planner': 'ストーリーを計画', 'social-sim': 'ソーシャル dynamicsをシミュレート', villain: '敵対者を管理', researcher: '事実確認とリアル検証' },
      zh: { narrator: '从上下文生成世界叙事', director: '将故事节拍整合到叙事中', scene: '生成场景过渡描述', npc: '扮演NPC', chronicler: '维护世界历史时间线', 'story-planner': '规划故事弧线', 'social-sim': '模拟NPC社交动态', villain: '管理反派行为', researcher: '事实核查和真实感验证' },
    };

    this.db.transaction(() => {
      for (const [lang, entries] of Object.entries(agentsTranslations)) {
        this.upsertTranslations(lang, 'agents', entries);
      }
      for (const [lang, entries] of Object.entries(settingsTranslations)) {
        this.upsertTranslations(lang, 'settings', entries);
      }
      for (const [lang, entries] of Object.entries(agentNames)) {
        this.upsertTranslations(lang, 'agent_names', entries);
      }
      for (const [lang, entries] of Object.entries(agentDescs)) {
        this.upsertTranslations(lang, 'agent_descs', entries);
      }
    })();
  }

  private sanitizeFtsQuery(query: string): string {
    return query.replace(/[^\w\s\u0400-\u04FF]/g, ' ').trim();
  }

  private buildSearchText(...fields: (string | null | undefined)[]): string {
    return fields.filter(Boolean).join(' ').toLowerCase();
  }

  upsertEntity(entity: EntityData): void {
    const searchText = this.buildSearchText(entity.name, entity.summary, entity.tags, entity.description);
    this.db.run(`
      INSERT INTO entities (uid, name, entity_type, summary, tags, description, profile, _search, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(uid) DO UPDATE SET
        name = excluded.name,
        entity_type = excluded.entity_type,
        summary = excluded.summary,
        tags = excluded.tags,
        description = excluded.description,
        profile = excluded.profile,
        _search = excluded._search,
        updated_at = datetime('now')
    `, [
      entity.uid,
      entity.name,
      entity.entityType ?? null,
      entity.summary ?? null,
      entity.tags ?? null,
      entity.description ?? null,
      entity.profile ?? null,
      searchText
    ]);
  }

  getEntity(uid: string): EntityData | undefined {
    const row = this.db.query('SELECT * FROM entities WHERE uid = ?').get(uid) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      uid: row.uid as string,
      name: row.name as string,
      entityType: row.entity_type as string | undefined,
      summary: row.summary as string | undefined,
      tags: row.tags as string | undefined,
      description: row.description as string | undefined,
      profile: row.profile as string | undefined,
    };
  }

  searchEntitiesFTS(query: string, limit = 10): EntityData[] {
    const safeQuery = this.sanitizeFtsQuery(query);
    if (!safeQuery) return [];
    const tokens = safeQuery.split(/\s+/).filter(Boolean);
    const ftsQuery = tokens.join(" OR ");

    let rows = this.db.query(`
      SELECT e.uid, e.name, e.entity_type, e.summary, e.tags, e.description, e.profile
      FROM entities_fts fts
      JOIN entities e ON e.rowid = fts.rowid
      WHERE entities_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as Record<string, unknown>[];

    if (rows.length === 0) {
      const pattern = `%${safeQuery.toLowerCase()}%`;
      rows = this.db.query(`
        SELECT * FROM entities
        WHERE _search LIKE ?
        LIMIT ?
      `).all(pattern, limit) as Record<string, unknown>[];
    }

    return rows.map(row => ({
      uid: row.uid as string,
      name: row.name as string,
      entityType: row.entity_type as string | undefined,
      summary: row.summary as string | undefined,
      tags: row.tags as string | undefined,
      description: row.description as string | undefined,
      profile: row.profile as string | undefined,
    }));
  }

  storeEmbedding(entityUid: string, vector: Float32Array, source = 'entity'): void {
    this.db.run(`
      INSERT INTO embeddings (entity_uid, vector, dim, source)
      VALUES (?, ?, ?, ?)
    `, [entityUid, vectorToBlob(vector), vector.length, source]);
  }

  searchDense(queryVector: Float32Array, topK = 10): EmbeddingResult[] {
    const rows = this.db.query('SELECT entity_uid, vector, dim, source FROM embeddings').all() as {
      entity_uid: string | null;
      vector: Buffer;
      dim: number;
      source: string;
    }[];

    const results: EmbeddingResult[] = [];
    for (const row of rows) {
      const vec = blobToVector(row.vector);
      if (vec.length === queryVector.length) {
        results.push({
          entityUid: row.entity_uid,
          score: cosineSimilarity(queryVector, vec),
          source: row.source,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  addMemory(content: string, vector: Float32Array, opts: MemoryOpts = {}): number {
    const searchText = this.buildSearchText(content, opts.tags, opts.role);
    const result = this.db.run(`
      INSERT INTO memories (content, role, session_id, importance, vector, dim, tags, _search)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      content,
      opts.role ?? null,
      opts.sessionId ?? null,
      opts.importance ?? 0.5,
      vectorToBlob(vector),
      vector.length,
      opts.tags ?? null,
      searchText
    ]);
    return Number(result.lastInsertRowid);
  }

  searchMemoriesFTS(query: string, limit = 10): MemoryResult[] {
    const safeQuery = this.sanitizeFtsQuery(query);
    if (!safeQuery) return [];
    const tokens = safeQuery.split(/\s+/).filter(Boolean);
    const ftsQuery = tokens.join(" OR ");

    let rows = this.db.query(`
      SELECT m.id, m.content, m.role, m.session_id
      FROM memories_fts fts
      JOIN memories m ON m.id = fts.rowid
      WHERE memories_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as Record<string, unknown>[];

    if (rows.length === 0) {
      const pattern = `%${safeQuery.toLowerCase()}%`;
      rows = this.db.query(`
        SELECT id, content, role, session_id FROM memories
        WHERE _search LIKE ?
        LIMIT ?
      `).all(pattern, limit) as Record<string, unknown>[];
    }

    return rows.map(row => ({
      id: row.id as number,
      content: row.content as string,
      score: 1.0,
      role: row.role as string | undefined,
      sessionId: row.session_id as string | undefined,
    }));
  }

  searchMemoriesDense(queryVector: Float32Array, topK = 10): MemoryResult[] {
    const rows = this.db.query('SELECT id, content, role, session_id, vector, dim FROM memories WHERE vector IS NOT NULL').all() as {
      id: number;
      content: string;
      role: string | null;
      session_id: string | null;
      vector: Buffer;
      dim: number;
    }[];

    const results: MemoryResult[] = [];
    for (const row of rows) {
      const vec = blobToVector(row.vector);
      if (vec.length === queryVector.length) {
        results.push({
          id: row.id,
          content: row.content,
          score: cosineSimilarity(queryVector, vec),
          role: row.role ?? undefined,
          sessionId: row.session_id ?? undefined,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  hybridSearch(
    query: string,
    queryVector: Float32Array,
    topK = 10
  ): SearchResult[] {
    const ftsResults: RankedItem[] = this.searchEntitiesFTS(query, topK * 2).map((e, i) => ({
      id: e.uid,
      name: e.name,
      score: 1 / (i + 1),
      source: 'fts' as const,
    }));

    const vecResults: RankedItem[] = this.searchDense(queryVector, topK * 2).map((r, i) => ({
      id: r.entityUid ?? `emb-${i}`,
      score: r.score,
      source: 'vector' as const,
    }));

    const fused = reciprocalRankFusion([ftsResults, vecResults]);

    return fused.slice(0, topK).map(r => ({
      id: r.id,
      name: r.name as string | undefined,
      score: r.score,
      source: 'hybrid' as const,
    }));
  }

  entityCount(): number {
    const row = this.db.query('SELECT COUNT(*) as count FROM entities').get() as { count: number };
    return row.count;
  }

  embeddingCount(): number {
    const row = this.db.query('SELECT COUNT(*) as count FROM embeddings').get() as { count: number };
    return row.count;
  }

  memoryCount(): number {
    const row = this.db.query('SELECT COUNT(*) as count FROM memories').get() as { count: number };
    return row.count;
  }

  // ── Agent Prompts ──

  getAgentPrompts(world: string, agentId: string, language: string): AgentPromptConfig | undefined {
    const row = this.db.query(
      'SELECT system_prompt, user_template, output_format FROM agent_prompts WHERE world = ? AND agent_id = ? AND language = ?'
    ).get(world, agentId, language) as Record<string, string> | undefined;
    if (!row) return undefined;
    return {
      systemPrompt: row.system_prompt ?? '',
      userTemplate: row.user_template ?? '',
      outputFormat: row.output_format ?? '',
    };
  }

  upsertAgentPrompts(world: string, agentId: string, language: string, prompts: AgentPromptConfig): void {
    this.db.run(`
      INSERT INTO agent_prompts (world, agent_id, language, system_prompt, user_template, output_format, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(world, agent_id, language) DO UPDATE SET
        system_prompt = excluded.system_prompt,
        user_template = excluded.user_template,
        output_format = excluded.output_format,
        updated_at = datetime('now')
    `, [world, agentId, language, prompts.systemPrompt, prompts.userTemplate, prompts.outputFormat]);
  }

  // ── UI Translations ──

  getTranslations(language: string, page?: string): Record<string, string> {
    if (page) {
      const rows = this.db.query(
        'SELECT key, value FROM ui_translations WHERE language = ? AND page = ?'
      ).all(language, page) as { key: string; value: string }[];
      return Object.fromEntries(rows.map(r => [r.key, r.value]));
    }
    const rows = this.db.query(
      'SELECT key, value FROM ui_translations WHERE language = ?'
    ).all(language) as { key: string; value: string }[];
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  upsertTranslations(language: string, page: string, entries: Record<string, string>): void {
    const stmt = this.db.query(`
      INSERT INTO ui_translations (language, page, key, value, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(language, page, key) DO UPDATE SET
        value = excluded.value, updated_at = datetime('now')
    `);
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(entries)) {
        stmt.run(language, page, key, value);
      }
    })();
  }

  deleteTranslation(language: string, page: string, key: string): void {
    this.db.run(
      'DELETE FROM ui_translations WHERE language = ? AND page = ? AND key = ?',
      [language, page, key]
    );
  }

  close(): void {
    this.db.close();
  }
}
