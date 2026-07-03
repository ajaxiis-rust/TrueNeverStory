import { z } from "zod";
import { getLogger } from "../utils/logger";

const log = getLogger("config");

const envSchema = z.object({
  CONF_PATH: z.string().default("./conf"),
  WORLD_LLM_BASE_URL: z.string().default(""),
  WORLD_LLM_API_KEY: z.string().default(""),
  WORLD_LLM_MODEL: z.string().default("gpt-4o-mini"),
  WORLD_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  WORLD_EMBEDDING_BASE_URL: z.string().default(""),
  WORLD_EMBEDDING_API_KEY: z.string().default(""),
  WORLD_LLM_TIMEOUT: z.coerce.number().default(300),
  WORLD_LLM_MAX_TOKENS: z.coerce.number().default(4096),
  WORLD_LLM_TEMPERATURE: z.coerce.number().default(0.7),
  WORLD_LLM_MAX_RETRIES: z.coerce.number().default(3),
  WORLD_LLM_MAX_CONCURRENT: z.coerce.number().default(8),
  WORLD_DB_PATH: z.string().default("./world_db"),
  WORLDS_ROOT: z.string().default("./worlds"),
  LOCAL_MODELS_PATH: z.string().default("./local-models"),
  WORLD_SERVER_HOST: z.string().default("127.0.0.1"),
  WORLD_SERVER_PORT: z.coerce.number().default(8000),
  AUTH_PASSWORD: z.string().default(""),
  AUTH_PASSWORD_HASH: z.string().default(""), // pbkdf2 format: salt:hash
  WORLD_AUTO_HEAL: z.coerce.boolean().default(true),
  MAX_SERVE_URL: z.string().default("http://localhost:8000"),
  SQLITE_DB_PATH: z.string().default(""),
  EMBEDDING_DIM: z.coerce.number().default(1024),
  EMBEDDING_ENDPOINT: z.string().default("http://127.0.0.1:5002"),
});

export type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

export function loadConfig(): EnvConfig {
  if (_config) return _config;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    log.warn({ errors: result.error.flatten().fieldErrors }, "Environment validation warnings");
    _config = envSchema.parse({});
  } else {
    _config = result.data;
  }
  return _config;
}

export function getConfig(): EnvConfig {
  if (!_config) return loadConfig();
  return _config;
}

export function isLLMConfigured(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.WORLD_LLM_BASE_URL && cfg.WORLD_LLM_API_KEY);
}

export function getLLMConfig() {
  const cfg = getConfig();
  return {
    baseUrl: cfg.WORLD_LLM_BASE_URL,
    model: cfg.WORLD_LLM_MODEL,
    embeddingModel: cfg.WORLD_EMBEDDING_MODEL,
    timeout: cfg.WORLD_LLM_TIMEOUT,
    maxTokens: cfg.WORLD_LLM_MAX_TOKENS,
    apiKeySet: Boolean(cfg.WORLD_LLM_API_KEY),
  };
}
