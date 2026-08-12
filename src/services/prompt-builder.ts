/**
 * Prompt builder — all LLM prompt templates for narrative agents.
 * Uses i18n for multilingual support.
 */

import { t } from "../i18n";

export class PromptBuilder {
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
