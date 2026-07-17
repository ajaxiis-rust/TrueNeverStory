/**
 * Prompt builder — all LLM prompt templates for narrative agents.
 * Uses i18n for multilingual support.
 */

import type { StoryContext } from "../models/story";
import { t } from "../i18n";

export class PromptBuilder {
  static buildNarratorPrompt(
    context: StoryContext,
    recentMemories: string[],
    worldFacts: string[],
    conversationHistory: Array<{ user: string; assistant: string }>,
  ): string {
    const lang = t();
    const timeline = context.recentTimeline
      .slice(-5)
      .map((e) => `- ${e}`)
      .join("\n");

    const rules = context.worldRules
      .map((r) => `- ${r}`)
      .join("\n");

    const memories = recentMemories.length > 0
      ? recentMemories.slice(0, 5).map((m) => `- ${m}`).join("\n")
      : "None";

    const facts = worldFacts.length > 0
      ? worldFacts.slice(0, 3).map((f) => `- ${f}`).join("\n")
      : "None";

    const history = conversationHistory.length > 0
      ? conversationHistory.slice(-3)
          .map((h) => `User: ${h.user}\nAssistant: ${h.assistant}`)
          .join("\n\n")
      : "No previous conversation.";

    return `${lang.narratorIntro(context.worldName)}

Current story time: ${context.currentTime}
Location: ${context.location}
Active character: ${context.activeCharacter ?? "none"}
User role: ${context.userRole}

${lang.narratorRules}
${rules}

${lang.narratorTimeline}
${timeline}

${lang.narratorConversation}
${history}

${lang.narratorMemories}
${memories}

${lang.narratorFacts}
${facts}

${lang.narratorNpcs} ${context.nearbyNpcs.join(", ") || "None"}

The user is controlling ${context.activeCharacter ?? "their character"}.
${lang.narratorInstruction}

${lang.narratorOutput}`;
  }

  static buildNPCPrompt(
    npcName: string,
    npcPersonality: string,
    playerCharacter: string,
    location: string,
    playerLine: string,
    recentEvents: string[],
    relationship = "neutral",
  ): string {
    const lang = t();
    const events = recentEvents.length > 0
      ? recentEvents.slice(-3).map((e) => `- ${e}`).join("\n")
      : "None";

    return `${lang.npcIntro(npcName, npcPersonality, location)}
Their relationship with ${playerCharacter} is ${relationship}.

${lang.npcEvents} ${events}

${playerCharacter} says: "${playerLine}"

${lang.npcInstruction(npcName)}`;
  }

  static buildSceneTransitionPrompt(
    currentLocation: string,
    destination: string,
    character: string,
    recentEvents: string[],
    worldRules: string[],
  ): string {
    const lang = t();
    const events = recentEvents.length > 0
      ? recentEvents.slice(-3).map((e) => `- ${e}`).join("\n")
      : "None";

    const rules = worldRules.map((r) => `- ${r}`).join("\n");

    return `${lang.sceneIntro(character, currentLocation, destination)}
${lang.sceneInstruction}
World rules: ${rules}
Recent events: ${events}`;
  }

  static buildDirectorBeatPrompt(
    beatDescription: string,
    currentNarrative: string,
  ): string {
    const lang = t();
    return `${lang.directorIntro}
Current narrative: ${currentNarrative}

Story beat to inject: ${beatDescription}

${lang.directorInstruction}`;
  }

  static readonly WORLD_FRAME_PROMPT = `
You are a master world-builder. Generate a brand-new fantasy world.
Return ONLY a valid JSON object with the following structure:

{
  "world_name": "string",
  "calendar_era": {"name": "string", "year_zero_event": "string"},
  "magic_system": {
    "name": "string",
    "rules": "string (hard limitations, costs, side-effects)",
    "cost": "string (what casters must sacrifice)"
  },
  "races": [
    {"name": "string", "traits": "string", "culture": "string"}
  ],
  "factions": [
    {"name": "string", "goal": "string", "type": "political|religious|guild|secret"}
  ],
  "characters": [
    {
      "name": "string (unique)",
      "race": "string (must match a race name)",
      "age": 0,
      "role": "string",
      "personality": "string",
      "abilities": ["string (max 3)"],
      "affiliations": ["string (race, faction, or location names)"]
    }
  ],
  "locations": [
    {
      "name": "string",
      "type": "city|forest|ruin|mountain|desert|sea|underground",
      "description": "string (atmosphere, key feature)",
      "ruling_faction": "string or null"
    }
  ],
  "items": [
    {
      "name": "string",
      "type": "weapon|artifact|potion|armor|tool",
      "power": "string (mechanical effect)",
      "origin": "string (creator or event)"
    }
  ],
  "historical_events": [
    {
      "name": "string",
      "year_ago": 0,
      "description": "string",
      "involved_characters": ["name"],
      "involved_factions": ["name"]
    }
  ],
  "world_rules": [
    {
      "name": "string",
      "description": "string (concise law)",
      "category": "magic_law|physical_law|social_norm|divine_mandate"
    }
  ]
}

Constraints:
- Generate 3-4 races, 3-4 factions, 5-6 characters, 3-4 locations, 3 items, 3-4 events, 3-4 rules.
- Every affiliation must EXACTLY match an existing name.
- Return ONLY the JSON object.`;

  static buildEntityL2Prompt(
    entityType: string,
    l1Json: string,
    rulesSummary: string,
    existingNames: string,
  ): string {
    return `${entityType} L1: ${l1Json}
World rules: ${rulesSummary}
Existing entities: ${existingNames}

Expand this ${entityType.toLowerCase()}'s Level 2 details (L2) only.
Return a JSON object with the appropriate keys for ${entityType}.
Do NOT include Level 1 or Level 3 data. Return ONLY the L2 object.`;
  }

  static buildRelationshipPrompt(entitiesList: string): string {
    return `You are an expert world-building relationship generator.
Below is a list of existing entities in the world, with their names, types, and a one-sentence summary.

Entities:
${entitiesList}

Suggest complex, non-obvious relationships between these entities.
- Use only the existing entity names; never invent new ones.
- Use directional relationships (source → target).
- Output a JSON array of objects like:
  [{"source": "Character:Name", "target": "Character:Name", "type": "mentor_of"}, ...]
Return ONLY the JSON array.`;
  }

  static buildSceneGenerationPrompt(
    worldName: string,
    rules: string,
    context: string,
  ): string {
    return `World: ${worldName}
Active world rules: ${rules}
Scene context: ${context}

Write a short narrative scene (120-180 words) that follows all rules and character personalities.
Return JSON:
{
  "scene_text": "...",
  "time_markers": ["extracted phrases"],
  "entities_mentioned": [{"name": "...", "type": "...", "attributes": {}}],
  "relationships_mentioned": [{"source": "...", "target": "...", "type": "..."}]
}`;
  }

  static buildResearcherRecipePrompt(
    recipeName: string,
    ingredients: string[],
    result: string,
    difficulty: string,
    worldContext: string,
  ): string {
    const lang = t();
    return `${lang.researcherIntro}

${lang.researcherRecipeCheck}

Recipe: ${recipeName}
Ingredients: ${ingredients.join(", ")}
Result: ${result}
Difficulty: ${difficulty}
World context: ${worldContext}

${lang.researcherRecipeInstruction}`;
  }

  static buildResearcherTopicPrompt(
    topic: string,
    worldContext: string,
    era?: string,
  ): string {
    const lang = t();
    const eraLine = era ? `Historical era: ${era}` : "";
    return `${lang.researcherIntro}

${lang.researcherTopicResearch}

Topic: ${topic}
${eraLine}
World context: ${worldContext}

${lang.researcherTopicInstruction}`;
  }

  static buildResearcherCharacterPrompt(
    characterName: string,
    personality: string,
    role: string,
    location: string,
    worldContext: string,
  ): string {
    const lang = t();
    return `${lang.researcherIntro}

${lang.researcherCharacterCheck}

Character: ${characterName}
Personality: ${personality}
Role: ${role}
Location: ${location}
World context: ${worldContext}

${lang.researcherCharacterInstruction}`;
  }

  static buildResearcherScenePrompt(
    sceneDescription: string,
    location: string,
    worldContext: string,
    era?: string,
  ): string {
    const lang = t();
    const eraLine = era ? `Historical era: ${era}` : "";
    return `${lang.researcherIntro}

${lang.researcherSceneEnrich}

Scene: ${sceneDescription}
Location: ${location}
${eraLine}
World context: ${worldContext}

${lang.researcherSceneInstruction}`;
  }

  static buildResearcherFactCheckPrompt(
    claim: string,
    worldContext: string,
  ): string {
    const lang = t();
    return `${lang.researcherIntro}

${lang.researcherFactCheck}

Claim: ${claim}
World context: ${worldContext}

${lang.researcherFactCheckInstruction}`;
  }

  static buildCrafterPrompt(
    item1: string,
    item2: string,
    worldContext: string,
  ): string {
    const lang = t();
    return `${lang.crafterIntro}

${lang.crafterScenario(item1, item2)}

World context: ${worldContext}

${lang.crafterInstruction}`;
  }
}
