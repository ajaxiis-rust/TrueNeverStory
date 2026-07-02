// ═══════════════════════════════════════════════════════════════
// PRESET PROVIDER CATALOG — TrueNeverStory Engine Quick Add
// ═══════════════════════════════════════════════════════════════
// Each entry: name, type, baseUrl, defaultModel, models[], freeTier, desc
// Chinese providers use OpenAI-compatible API format by default.
// ═══════════════════════════════════════════════════════════════
const PRESET_PROVIDERS = [
  // ── Major Market Players ──
  {
    name: "OpenAI",
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    models: [
      "gpt-4o", "gpt-4o-mini", "gpt-4o-2024-11-20", "gpt-4o-2024-08-06",
      "o1", "o1-mini", "o1-preview", "o1-pro",
      "o3", "o3-mini", "o4-mini",
      "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo",
      "gpt-4o-audio-preview", "gpt-4o-realtime-preview",
      "chatgpt-4o-latest",
      "gpt-4o-mini-audio-preview", "gpt-4o-mini-realtime-preview"
    ],
    freeTier: false,
    desc: "GPT-4o, o-series reasoning models, real-time audio"
  },
  {
    name: "Anthropic",
    type: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-20250514",
    models: [
      "claude-opus-4-20250514", "claude-sonnet-4-20250514",
      "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"
    ],
    freeTier: false,
    desc: "Claude 4/3 family — long context, tool use, vision"
  },
  {
    name: "Google Gemini",
    type: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    models: [
      "gemini-2.5-pro", "gemini-2.5-flash",
      "gemini-2.0-flash", "gemini-2.0-flash-lite",
      "gemini-1.5-pro", "gemini-1.5-flash",
      "gemini-2.0-flash-exp", "gemini-2.0-pro-exp"
    ],
    freeTier: true,
    desc: "Gemini 2.5/2.0/1.5 — multimodal, 1M context, free tier via Google AI Studio"
  },
  {
    name: "Cohere",
    type: "openai",
    baseUrl: "https://api.cohere.com/v2",
    defaultModel: "command-a-20250515",
    models: [
      "command-a-20250515", "command-r-plus-08-2024", "command-r-08-2024",
      "command-r-plus", "command-r", "command-light", "command"
    ],
    freeTier: true,
    desc: "Command A/R — RAG-optimized, reranking, embeddings, free tier"
  },
  {
    name: "Mistral AI",
    type: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    models: [
      "mistral-large-latest", "mistral-medium-latest", "mistral-small-latest",
      "codestral-latest", "codestral",
      "pixtral-large-latest", "pixtral-12b-2409",
      "open-mistral-nemo", "open-mixtral-8x22b", "open-mixtral-8x7b",
      "mistral-embed", "mistral-ocr-latest"
    ],
    freeTier: true,
    desc: "Mistral Large/Small, Codestral, Pixtral — free tier available"
  },
  {
    name: "Together AI",
    type: "openai",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
    models: [
      "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
      "meta-llama/Llama-4-Scout-17B-16E-Instruct",
      "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
      "Qwen/Qwen2.5-Coder-32B-Instruct",
      "deepseek-ai/DeepSeek-R1",
      "deepseek-ai/DeepSeek-V3",
      "mistralai/Mistral-Small-3.1-24B-Instruct-2503",
      "google/gemma-3-27b-it",
      "databricks/dbrx-instruct"
    ],
    freeTier: true,
    desc: "Open-source model hub — Llama, Qwen, DeepSeek, $1 free credit"
  },
  {
    name: "Groq",
    type: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      "llama-3.3-70b-versatile", "llama-3.1-8b-instant",
      "gemma2-9b-it", "gemma-7b-it",
      "llama3-70b-8192", "llama3-8b-8192",
      "mixtral-8x7b-32768", "whisper-large-v3"
    ],
    freeTier: true,
    desc: "Ultra-fast inference via custom silicon, generous free tier"
  },
  {
    name: "Fireworks AI",
    type: "openai",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    models: [
      "accounts/fireworks/models/llama-v3p3-70b-instruct",
      "accounts/fireworks/models/llama-v3p1-405b-instruct",
      "accounts/fireworks/models/llama-v3p1-70b-instruct",
      "accounts/fireworks/models/mixtral-8x22b-instruct",
      "accounts/fireworks/models/qwen-v2p5-72b-instruct",
      "accounts/fireworks/models/deepseek-r1",
      "accounts/fireworks/models/stable-diffusion-xl",
      "accounts/fireworks/models/whisper-v3"
    ],
    freeTier: true,
    desc: "Fast OSS inference — Llama, Mixtral, Qwen, audio models"
  },
  {
    name: "Perplexity",
    type: "openai",
    baseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar",
    models: [
      "sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro",
      "sonar-deep-research", "sonar-small-online", "sonar-medium-online",
      "llama-3.1-sonar-small-128k-online",
      "llama-3.1-sonar-large-128k-online"
    ],
    freeTier: false,
    desc: "Search-augmented LLM — real-time web grounding, citations"
  },

  // ── Chinese Providers ──
  {
    name: "DeepSeek",
    type: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: [
      "deepseek-chat", "deepseek-reasoner"
    ],
    freeTier: true,
    desc: "DeepSeek V3/R1 — top-tier reasoning, very affordable, free tier"
  },
  {
    name: "Moonshot (Kimi)",
    type: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    models: [
      "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k",
      "kimi-latest", "moonshot-auto"
    ],
    freeTier: true,
    desc: "128K context, Kimi chatbot, OpenAI-compatible API"
  },
  {
    name: "Zhipu (GLM)",
    type: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    models: [
      "glm-4-plus", "glm-4-0520", "glm-4-air", "glm-4-airx",
      "glm-4-flash", "glm-4-flashx", "glm-4-long",
      "glm-4v-plus", "glm-4v-flash",
      "embedding-3"
    ],
    freeTier: true,
    desc: "GLM-4 family — text, vision, embeddings, free flash tier"
  },
  {
    name: "Baichuan",
    type: "openai",
    baseUrl: "https://api.baichuan-ai.com/v1",
    defaultModel: "Baichuan4-Turbo",
    models: [
      "Baichuan4-Turbo", "Baichuan4-Air", "Baichuan4",
      "Baichuan3-Turbo", "Baichuan3-Turbo-128k",
      "Baichuan2-Turbo"
    ],
    freeTier: true,
    desc: "Baichuan 4 family — strong Chinese NLP, free tier"
  },
  {
    name: "MiniMax",
    type: "openai",
    baseUrl: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-Text-01",
    models: [
      "MiniMax-Text-01", "MiniMax-Text-01-20k",
      "abab6.5s-chat", "abab5.5-chat",
      "abab6.5-chat", "abab5-chat",
      "MiniMax-Text-01-speech", "music-01"
    ],
    freeTier: true,
    desc: "MiniMax-Text-01 — 4M context, speech, music generation"
  },
  {
    name: "SenseNova (SenseTime)",
    type: "openai",
    baseUrl: "https://api.sensenova.cn/v1",
    defaultModel: "nova-32k",
    models: [
      "nova-32k", "nova-128k", "nova-pro", "nova-lite",
      "nova-embedding"
    ],
    freeTier: true,
    desc: "SenseNova — SenseTime's LLM platform, OpenAI-compatible"
  },
  {
    name: "01.AI (Yi)",
    type: "openai",
    baseUrl: "https://api.lingyiwanwu.com/v1",
    defaultModel: "yi-lightning",
    models: [
      "yi-lightning", "yi-large", "yi-medium",
      "yi-medium-200k", "yi-spark", "yi-large-turbo"
    ],
    freeTier: true,
    desc: "Yi-Lightning — fast and cheap, 200K context option"
  },
  {
    name: "Alibaba (Qwen/DashScope)",
    type: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-max",
    models: [
      "qwen-max", "qwen-max-latest", "qwen-max-longcontext",
      "qwen-plus", "qwen-plus-latest",
      "qwen-turbo", "qwen-turbo-latest", "qwen-turbo-2024-11-01",
      "qwen-long",
      "qwen-vl-max", "qwen-vl-plus",
      "qwen-audio-turbo", "qwen-audio-turbo-latest",
      "qwen2-vl-72b-instruct", "qwen2.5-72b-instruct",
      "text-embedding-v3"
    ],
    freeTier: true,
    desc: "Qwen 2.5/MAX — multimodal, long context, free tier, OpenAI-compat"
  },
  {
    name: "Baidu (Ernie)",
    type: "openai",
    baseUrl: "https://qianfan.baidubce.com/v2",
    defaultModel: "ernie-4.0-turbo-8k",
    models: [
      "ernie-4.0-turbo-8k", "ernie-4.0-8k",
      "ernie-3.5-8k", "ernie-3.5-128k",
      "ernie-speed-8k", "ernie-speed-128k",
      "ernie-lite-8k",
      "ernie-4.0-vl-8k", "ernie-4.0-turbo-vl"
    ],
    freeTier: true,
    desc: "ERNIE 4.0/3.5 — Baidu's flagship LLMs, vision capable, free tier"
  },
  {
    name: "Tencent (Hunyuan)",
    type: "openai",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    defaultModel: "hunyuan-pro",
    models: [
      "hunyuan-pro", "hunyuan-standard", "hunyuan-turbo",
      "hunyuan-lite",
      "hunyuan-vision", "hunyuan-vision-pro"
    ],
    freeTier: true,
    desc: "Tencent Hunyuan — text + vision, free tier"
  },
  {
    name: "ByteDance (Doubao)",
    type: "openai",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-1.5-pro-32k",
    models: [
      "doubao-1.5-pro-32k", "doubao-1.5-pro-256k",
      "doubao-1.5-lite-32k", "doubao-1.5-lite-128k",
      "doubao-pro-32k", "doubao-pro-128k",
      "doubao-lite-32k", "doubao-lite-128k"
    ],
    freeTier: true,
    desc: "Doubao 1.5 — ByteDance's LLM via Volcano Engine, free tier"
  },
  {
    name: "StepFun",
    type: "openai",
    baseUrl: "https://api.stepfun.com/v1",
    defaultModel: "step-2-16k",
    models: [
      "step-2-16k", "step-2-128k",
      "step-1-flash", "step-1-32k",
      "step-1v-8k", "step-2v-14k"
    ],
    freeTier: true,
    desc: "StepFun — 16K/128K context, vision models, free tier"
  }
];

// ── Auto-fill function for Quick Add ──
function applyPreset(presetName) {
  const preset = PRESET_PROVIDERS.find(p => p.name === presetName);
  if (!preset) return;

  document.getElementById('provName').value = preset.name;
  document.getElementById('provType').value = preset.type;
  document.getElementById('provUrl').value = preset.baseUrl;
  document.getElementById('provDefaultModel').value = preset.defaultModel;
  document.getElementById('provModels').value = preset.models.join(', ');

  // Update placeholder text based on type
  const urlInput = document.getElementById('provUrl');
  const modelInput = document.getElementById('provDefaultModel');
  urlInput.placeholder = preset.baseUrl;
  modelInput.placeholder = preset.defaultModel;

  toast('Preset loaded: ' + preset.name + (preset.freeTier ? ' (free tier available)' : ''), true);
}
