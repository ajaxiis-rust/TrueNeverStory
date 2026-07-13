import { BibleParser } from './bible/parser';
import { GutenbergParser } from './gutenberg/parser';
import { BibleMCPTools } from './tools/bible';
import { GutenbergMCPTools } from './tools/gutenberg';
import { WikipediaMCPTools } from './tools/wikipedia';
import {
  SearchVersesSchema,
  GetPatternSchema,
  GetArchetypeSchema,
  GetStyleSchema,
  ApplyStyleSchema,
  VerifyFactSchema,
  GetContextSchema,
} from './schemas';
import { UnifiedEntityStore } from '@/store/entity-store';
import { getLogger } from '@/utils/logger';
import { join } from 'node:path';

const logger = getLogger('TNSServer');

// ─── MCP Server Configuration ────────────────────────────────────────────────

export interface TNSServerConfig {
  bibleDbPath: string;
  gutenbergDbPath: string;
  entityStore: UnifiedEntityStore;
  dataDir?: string;
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

export class TNSServer {
  private bibleParser: BibleParser;
  private gutenbergParser: GutenbergParser;
  private bibleTools: BibleMCPTools;
  private gutenbergTools: GutenbergMCPTools;
  private wikipediaTools: WikipediaMCPTools;
  private entityStore: UnifiedEntityStore;
  private initialized = false;

  constructor(private config: TNSServerConfig) {
    this.entityStore = config.entityStore;

    // Initialize parsers
    this.bibleParser = new BibleParser({
      dbPath: config.bibleDbPath,
      dataDir: config.dataDir ? join(config.dataDir, 'bible') : undefined,
    });

    this.gutenbergParser = new GutenbergParser({
      dbPath: config.gutenbergDbPath,
      dataDir: config.dataDir ? join(config.dataDir, 'gutenberg') : undefined,
      extractStyles: true,
    });

    // Initialize tools
    this.bibleTools = new BibleMCPTools(this.bibleParser);
    this.gutenbergTools = new GutenbergMCPTools(this.gutenbergParser);
    this.wikipediaTools = new WikipediaMCPTools();
  }

  /**
   * Initialize the server (parse databases).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing TNS MCP Server...');

    // Parse Bible database
    try {
      const bibleResult = await this.bibleParser.parse();
      logger.info(`Bible parsed: ${bibleResult.verseCount} verses, ${bibleResult.bookCount} books`);
    } catch (error) {
      logger.error('Failed to parse Bible database:', error as string);
    }

    // Parse Gutenberg database
    try {
      const gutenbergResult = await this.gutenbergParser.parse();
      logger.info(`Gutenberg parsed: ${gutenbergResult.textCount} texts, ${gutenbergResult.styleCount} styles`);
    } catch (error) {
      logger.error('Failed to parse Gutenberg database:', error as string);
    }

    this.initialized = true;
    logger.info('TNS MCP Server initialized');
  }

  /**
   * Handle an MCP tool call.
   */
  async handleToolCall(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    if (!this.initialized) {
      await this.initialize();
    }

    switch (toolName) {
      case 'search_verses': {
        const parsed = SearchVersesSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.bibleTools.searchVerses(parsed.data);
      }

      case 'get_pattern': {
        const parsed = GetPatternSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.bibleTools.getPattern(parsed.data);
      }

      case 'get_archetype': {
        const parsed = GetArchetypeSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.bibleTools.getArchetype(parsed.data);
      }

      case 'get_style_pattern': {
        const parsed = GetStyleSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.gutenbergTools.getStylePattern(parsed.data);
      }

      case 'apply_style': {
        const parsed = ApplyStyleSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.gutenbergTools.applyStyle(parsed.data);
      }

      case 'verify_fact': {
        const parsed = VerifyFactSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.wikipediaTools.verifyFact(parsed.data);
      }

      case 'get_context': {
        const parsed = GetContextSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.wikipediaTools.getContext(parsed.data);
      }

      case 'query_entity': {
        const { name, type } = input as { name: string; type?: string };
        if (type) {
          const entity = this.entityStore.getByNameAndType(name, type);
          return entity ? { found: true, entity } : { found: false };
        }
        const entity = this.entityStore.getByName(name);
        return entity ? { found: true, entity } : { found: false };
      }

      case 'get_relationships': {
        const { entityUid, depth = 1 } = input as { entityUid: string; depth?: number };
        const entity = this.entityStore.get(entityUid);
        if (!entity) return { found: false, relationships: [] };

        const relationships = (entity.profile.l1?.relationships as Array<Record<string, unknown>> ?? [])
          .slice(0, depth * 10);

        return {
          found: true,
          entity: { uid: entity.uid, name: entity.name, type: entity.entityType },
          relationships,
        };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Get list of available tools.
   */
  getTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return [
      {
        name: 'search_verses',
        description: 'Search Bible verses by text, book, or reference',
        inputSchema: SearchVersesSchema.shape,
      },
      {
        name: 'get_pattern',
        description: 'Get narrative patterns by archetype, mood, or function',
        inputSchema: GetPatternSchema.shape,
      },
      {
        name: 'get_archetype',
        description: 'Get archetype details by name',
        inputSchema: GetArchetypeSchema.shape,
      },
      {
        name: 'get_style_pattern',
        description: 'Search Gutenberg styles by mood, tags, or description',
        inputSchema: GetStyleSchema.shape,
      },
      {
        name: 'apply_style',
        description: 'Apply style to text (delexify and return suggestions)',
        inputSchema: ApplyStyleSchema.shape,
      },
      {
        name: 'verify_fact',
        description: 'Verify a factual claim against Wikipedia',
        inputSchema: VerifyFactSchema.shape,
      },
      {
        name: 'get_context',
        description: 'Get Wikipedia context for a topic',
        inputSchema: GetContextSchema.shape,
      },
      {
        name: 'query_entity',
        description: 'Query an entity by name and optional type',
        inputSchema: { name: { type: 'string' }, type: { type: 'string', optional: true } },
      },
      {
        name: 'get_relationships',
        description: 'Get entity relationships',
        inputSchema: { entityUid: { type: 'string' }, depth: { type: 'number', optional: true } },
      },
    ];
  }

  /**
   * Close the server and release resources.
   */
  close(): void {
    this.bibleParser.close();
    this.gutenbergParser.close();
    this.initialized = false;
  }
}
