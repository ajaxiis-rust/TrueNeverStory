import { BibleParser } from './bible/parser';
import { GutenbergParser } from './gutenberg/parser';
import { BibleMCPTools } from './tools/bible';
import { GutenbergMCPTools } from './tools/gutenberg';
import { WikipediaMCPTools } from './tools/wikipedia';
import { LiteraryCompilerMCPTools } from './tools/literary-compiler';
import { EconomicMCPTools } from './tools/economic';
import { LiteraryCompilerDB } from './literary-compiler/schema';
import { EconomicDB } from './literary-compiler/economic-schema';
import { EconomicService } from '@/services/economic-service';
import {
  SearchVersesSchema,
  GetPatternSchema,
  GetArchetypeSchema,
  GetStyleSchema,
  ApplyStyleSchema,
  VerifyFactSchema,
  GetContextSchema,
  GetQuestTemplatesSchema,
  SearchQuestTemplatesSchema,
  GetEconomicPhaseSchema,
  GetPriceModifierSchema,
  CalculatePriceSchema,
  GetWageSchema,
  GenerateDilemmaSchema,
  CheckJubileeSchema,
  GetJubileeInfoSchema,
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
  private literaryCompilerDB: LiteraryCompilerDB;
  private literaryCompilerTools: LiteraryCompilerMCPTools;
  private economicDB: EconomicDB;
  private economicService: EconomicService;
  private economicTools: EconomicMCPTools;
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

    // Initialize Literary Compiler DB
    const litCompDbPath = config.dataDir
      ? join(config.dataDir, 'literary-compiler', 'literary.db')
      : join(process.cwd(), 'data', 'literary-compiler', 'literary.db');
    this.literaryCompilerDB = new LiteraryCompilerDB(litCompDbPath);

    // Initialize Economic DB
    const econDbPath = config.dataDir
      ? join(config.dataDir, 'literary-compiler', 'economic.db')
      : join(process.cwd(), 'data', 'literary-compiler', 'economic.db');
    this.economicDB = new EconomicDB(econDbPath);
    this.economicService = new EconomicService(this.economicDB);

    // Initialize tools
    this.bibleTools = new BibleMCPTools(this.bibleParser);
    this.gutenbergTools = new GutenbergMCPTools(this.gutenbergParser);
    this.wikipediaTools = new WikipediaMCPTools();
    this.literaryCompilerTools = new LiteraryCompilerMCPTools(this.literaryCompilerDB);
    this.economicTools = new EconomicMCPTools(this.economicService);
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

      case 'get_quest_templates': {
        const parsed = GetQuestTemplatesSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.literaryCompilerTools.getQuestTemplates(parsed.data);
      }

      case 'search_quest_templates': {
        const parsed = SearchQuestTemplatesSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.literaryCompilerTools.searchQuestTemplates(parsed.data);
      }

      // ─── Economic Tools ───────────────────────────────────────────

      case 'get_economic_phase': {
        const parsed = GetEconomicPhaseSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.economicTools.getEconomicPhase(parsed.data);
      }

      case 'get_price_modifier': {
        const parsed = GetPriceModifierSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.economicTools.getPriceModifier(parsed.data);
      }

      case 'calculate_price': {
        const parsed = CalculatePriceSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.economicTools.calculatePrice(parsed.data);
      }

      case 'get_wage': {
        const parsed = GetWageSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.economicTools.getWage(parsed.data);
      }

      case 'generate_dilemma': {
        const parsed = GenerateDilemmaSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.economicTools.generateDilemma(parsed.data);
      }

      case 'check_jubilee': {
        const parsed = CheckJubileeSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.economicTools.checkJubilee(parsed.data);
      }

      case 'get_jubilee_info': {
        const parsed = GetJubileeInfoSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);
        return this.economicTools.getJubileeInfo(parsed.data);
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
      {
        name: 'get_quest_templates',
        description: 'Get quest templates by player position, archetype, or mood',
        inputSchema: GetQuestTemplatesSchema.shape,
      },
      {
        name: 'search_quest_templates',
        description: 'Search quest templates by text',
        inputSchema: SearchQuestTemplatesSchema.shape,
      },
      // ─── Economic Tools ───────────────────────────────────────────
      {
        name: 'get_economic_phase',
        description: 'Get current economic phase (abundance/transition/famine) and price modifier',
        inputSchema: GetEconomicPhaseSchema.shape,
      },
      {
        name: 'get_price_modifier',
        description: 'Get current price modifier based on economic phase',
        inputSchema: GetPriceModifierSchema.shape,
      },
      {
        name: 'calculate_price',
        description: 'Calculate price with economic phase modifier applied',
        inputSchema: CalculatePriceSchema.shape,
      },
      {
        name: 'get_wage',
        description: 'Calculate wage for a faction based on labor rules',
        inputSchema: GetWageSchema.shape,
      },
      {
        name: 'generate_dilemma',
        description: 'Generate a tax dilemma between two factions',
        inputSchema: GenerateDilemmaSchema.shape,
      },
      {
        name: 'check_jubilee',
        description: 'Check if jubilee year should trigger',
        inputSchema: CheckJubileeSchema.shape,
      },
      {
        name: 'get_jubilee_info',
        description: 'Get jubilee cycle information',
        inputSchema: GetJubileeInfoSchema.shape,
      },
    ];
  }

  /**
   * Close the server and release resources.
   */
  close(): void {
    this.bibleParser.close();
    this.gutenbergParser.close();
    this.literaryCompilerDB.close();
    this.economicDB.close();
    this.initialized = false;
  }
}
