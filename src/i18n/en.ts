import type { LanguagePack } from "./types";

export const EN: LanguagePack = {
  code: "en",
  name: "English",
  nativeName: "English",

  systemPrompt: "Respond only in English.",

  narratorIntro: (name: string) => `You are a master storyteller in the world "${name}".`,
  narratorRules: "World rules:",
  narratorTimeline: "Recent timeline:",
  narratorConversation: "Recent conversation:",
  narratorMemories: "Relevant memories about this character and world:",
  narratorFacts: "World facts:",
  narratorNpcs: "Nearby NPCs:",
  narratorInstruction: `You MUST NOT speak or act for the user's character. You only describe the environment, the actions and dialogue of NPCs, and the consequences of the user's choices.

Respond in immersive, third-person descriptive prose. Move the story forward naturally. Describe what the user sees, hears, smells, and feels. If there are NPCs present, you can describe their appearance, mood, and what they do or say.`,
  narratorOutput: "Output only the narrative text, no extra commentary.",

  npcIntro: (name: string, personality: string, location: string) =>
    `${name} is a ${personality} character currently in ${location}.`,
  npcEvents: "Recent events:",
  npcInstruction: (name: string) =>
    `Write ${name}'s response in character. Keep it short, natural, and consistent with their personality.
Return only the dialogue line, no extra description.`,

  sceneIntro: (char: string, from: string, to: string) =>
    `You are a scene agent. The player character ${char} is moving from "${from}" to "${to}".`,
  sceneInstruction: `Describe the journey and arrival. Do NOT speak or act for the character; just describe the environment, any obstacles, sights, and sounds.
Generate a short narrative (2-4 sentences). Output only the narrative text.`,

  directorIntro: `You are integrating a story beat into the current narrative.`,
  directorInstruction: `Modify the narrative to naturally include this beat. Do not change the user's actions or dialogue.
Keep the same tone and style. Output only the modified narrative.`,

  whereToGo: "Where do you want to go?",
  noPlace: (name: string) => `You don't know a place called '${name}'.`,
  toWhom: (name: string) => `To whom? Say 'tell ${name} Hello'.`,
  whomTalking: "Whom are you talking to? Example: 'talk to John'.",
  whatSay: (name: string) => `What do you want to say to ${name}?`,
  noNpc: (name: string) => `There is no one named '${name}'.`,
  emptyInventory: "Your inventory is empty.",
  noCharacter: "You are not controlling any character.",
  youSee: "You see nothing special.",
  youSeeNothing: "You see nothing of note.",
  noQuests: "No active quests.",
  unknownCommand: (cmd: string) => `Unknown command: ${cmd}. Type /help.`,
  goodbye: "Goodbye!",
  sessionSaved: "Session state saved.",

  crafterIntro: "You are a master crafter. The player wants to combine items. Analyze the materials and suggest what could be created, or confirm if it's a known recipe. Be creative but realistic within the world's rules.",
  crafterScenario: (item1: string, item2: string) => `The player wants to combine: ${item1} + ${item2}. What could be created from these materials?`,
  crafterInstruction: "Respond with a short description (2-3 sentences) of what happens when these items are combined. If it's a known recipe, describe the crafting process. If not, suggest a creative but plausible result. Keep it immersive and in-character.",
  crafterInventoryEmpty: "You have nothing in your inventory.",
  crafterNothingToCraft: "You don't have the right ingredients for any known recipe.",
  crafterCrafted: (result: string, ingredients: string) => `Crafted: ${result} (from ${ingredients})`,
  crafterMissingIngredient: (item: string, need: number, have: number) => `Need ${item} x${need}, but only have ${have}.`,
  crafterUnknownRecipe: (id: string) => `Unknown recipe: ${id}. Type /craft list to see available recipes.`,
  crafterSuggestion: (item1: string, item2: string) => `What could be made from ${item1} and ${item2}?`,
  crafterAlreadyHave: (item: string) => `You already have ${item}.`,

  researcherIntro: "You are a research analyst specializing in historical accuracy, cultural authenticity, and practical realism for world-building. You fact-check details, verify plausibility, and enrich scenes with accurate, grounded details.",
  researcherRecipeCheck: "Verify this recipe for realism and plausibility:",
  researcherRecipeInstruction: `Analyze the recipe ingredients, process, and result for practical realism.
Return a JSON object:
{
  "verdict": "plausible" | "questionable" | "unrealistic",
  "confidence": 0.0-1.0,
  "issues": ["list of realism problems"],
  "suggestions": ["list of improvements"],
  "enrichedDetails": "1-2 sentences adding realistic sensory or procedural details"
}`,
  researcherTopicResearch: "Research this topic for world-building accuracy:",
  researcherTopicInstruction: `Provide historically and culturally accurate information that can enrich the world. Cover: materials, tools, techniques, social context, sensory details (smells, textures, sounds). Be specific and grounded.
Output a concise research summary (3-5 paragraphs).`,
  researcherCharacterCheck: "Validate this character for realism and cultural consistency:",
  researcherCharacterInstruction: `Check: clothing appropriate to era/location, realistic daily habits, plausible food/diet, authentic speech patterns, physical details that match their role and environment.
Return a JSON object:
{
  "verdict": "plausible" | "questionable" | "unrealistic",
  "confidence": 0.0-1.0,
  "issues": ["list of inconsistencies"],
  "suggestions": ["list of realistic additions"],
  "enrichedDetails": "1-2 sentences of grounded character details (clothing, food, daily life)"
}`,
  researcherSceneEnrich: "Enrich this scene with accurate, grounded details:",
  researcherSceneInstruction: `Add realistic sensory and environmental details: weather effects on materials, ambient sounds, smells, lighting, textures, time-of-day atmosphere. Ground the scene in physical reality.
Output the enriched scene description (3-5 sentences).`,
  researcherFactCheck: "Fact-check this claim for accuracy:",
  researcherFactCheckInstruction: `Evaluate the claim against real-world knowledge. Consider historical period, geography, technology level, and cultural context.
Return a JSON object:
{
  "verdict": "plausible" | "questionable" | "unrealistic",
  "confidence": 0.0-1.0,
  "issues": ["list of factual problems"],
  "suggestions": ["list of corrections"],
  "enrichedDetails": "1-2 sentences of corrected or enriched factual information"
}`,

  uiSettings: "Settings",
  uiBackToChat: "BACK TO CHAT",
  uiLlmConfig: "LLM Configuration",
  uiBaseUrl: "Base URL",
  uiBaseUrlHint: "OpenAI-compatible endpoint",
  uiApiKey: "API Key",
  uiModel: "Model",
  uiTimeout: "Timeout (seconds)",
  uiMaxTokens: "Max Tokens",
  uiTemperature: "Temperature",
  uiMaxRetries: "Max Retries",
  uiMaxConcurrent: "Max Concurrent",
  uiEmbeddings: "Embeddings",
  uiServer: "Server",
  uiHost: "Host",
  uiPort: "Port",
  uiDbPath: "Database Path",
  uiLocalModel: "Local Model — Compute (llama.cpp / Ollama)",
  uiGpuLayers: "GPU Layers (-1 = auto)",
  uiGpuLayersHint: "Number of layers offloaded to GPU. -1 = all layers. 0 = CPU only.",
  uiCpuThreads: "CPU Threads",
  uiCpuThreadsHint: "Number of CPU threads for inference.",
  uiContextLength: "Context Length",
  uiContextLengthHint: "Maximum context window (tokens). Affects VRAM usage.",
  uiBatchSize: "Batch Size",
  uiBatchSizeHint: "Prompt processing batch size. Higher = faster but more VRAM.",
  uiSampling: "Local Model — Sampling Parameters",
  uiTopP: "Top P (nucleus sampling)",
  uiTopPHint: "Cumulative probability threshold. 0.9 = top 90% tokens.",
  uiTopK: "Top K",
  uiTopKHint: "Limit to K most probable tokens at each step.",
  uiRepeatPenalty: "Repeat Penalty",
  uiRepeatPenaltyHint: "1.0 = no penalty. >1.0 = penalize repetition.",
  uiMirostat: "Mirostat (0=off, 1=v1, 2=v2)",
  uiMirostatHint: "Adaptive sampling for consistent perplexity.",
  uiMirostatTau: "Mirostat Tau",
  uiMirostatTauHint: "Target entropy. Lower = more focused.",
  uiMirostatEta: "Mirostat Eta",
  uiMirostatEtaHint: "Learning rate for Mirostat adaptation.",
  uiAuth: "Authentication",
  uiPassword: "Password",
  uiPasswordHint: "Empty = no authentication required",
  uiMemory: "Memory System",
  uiMaxEntries: "Max Entries",
  uiEmbeddingDim: "Embedding Dimension",
  uiSimilarityThreshold: "Similarity Threshold",
  uiHalfLife: "Half-life (days)",
  uiProbability: "Probability System",
  uiGlobalLuck: "Global Luck (0.0 – 1.0)",
  uiGlobalLuckHint: "0.5 = neutral, higher = more lucky",
  uiWorld: "World",
  uiAutoHeal: "Auto-Heal Graph",
  uiEnabled: "Enabled",
  uiDisabled: "Disabled",
  uiMaxServe: "MAX Serve (Mojo)",
  uiEndpointUrl: "Endpoint URL",
  uiEndpointHint: "Optional: Mojo MAX Serve for vector search",
  uiSave: "Save Settings",
  uiReset: "Reset to Defaults",
  uiCancel: "Cancel",
  uiLanguage: "Language",
  uiConfirmReset: "Reset all settings to defaults?",
  uiSaveSuccess: "Settings saved successfully",
  uiSaveFail: "Failed to save",
  uiLoadFail: "Failed to load settings",
  uiResetSuccess: "Settings reset to defaults",
};
