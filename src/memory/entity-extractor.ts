/**
 * Entity extraction and resolution for cognitive memory.
 * Replaces world_core/memory/entity_extractor.ts.
 */

import type { LLMClient } from "../lib/llm-client";
import { getLogger } from "../utils/logger";

const log = getLogger("entity-extractor");

export interface ExtractedEntity {
  name: string;
  type: string;
  attributes: Record<string, unknown>;
  canonical: string;
}

export class EntityExtractor {
  private _llm: LLMClient;
  private _canonicalMap: Map<string, string> = new Map();
  private _entityAttributes: Map<string, Record<string, unknown>> = new Map();

  constructor(llm: LLMClient) {
    this._llm = llm;
  }

  async extractFromText(text: string): Promise<ExtractedEntity[]> {
    const prompt = `Extract all named entities from the following text. For each entity, provide:
- name (the exact mention)
- type (person, place, event, item, organization, concept)
- attributes (relevant properties)

Return a JSON array of objects. If no entities, return [].
Text: ${text}`;

    try {
      const result = await this._llm.generateJson(prompt, { temperature: 0.2 });
      if (!Array.isArray(result)) return [];

      return result
        .filter((obj): obj is { name: string; type?: string; attributes?: Record<string, unknown> } => obj != null && typeof obj === "object" && "name" in obj)
        .map((obj) => {
          const canonical = this._resolveEntity(obj.name, obj.type ?? "unknown", obj.attributes ?? {});
          return {
            name: obj.name,
            type: obj.type ?? "unknown",
            attributes: obj.attributes ?? {},
            canonical,
          };
        });
    } catch (err) {
      log.warn({ err }, "Entity extraction failed");
      return [];
    }
  }

  private _resolveEntity(name: string, type: string, attrs: Record<string, unknown>): string {
    const lower = name.toLowerCase();
    if (this._canonicalMap.has(lower)) {
      const canonical = this._canonicalMap.get(lower)!;
      const existing = this._entityAttributes.get(canonical);
      if (existing) Object.assign(existing, attrs);
      return canonical;
    }
    this._canonicalMap.set(lower, name);
    this._entityAttributes.set(name, attrs);
    return name;
  }

  getEntityInfo(entityUid: string): Record<string, unknown> | undefined {
    return this._entityAttributes.get(entityUid);
  }

  getCanonicalName(alias: string): string | undefined {
    return this._canonicalMap.get(alias.toLowerCase());
  }
}
