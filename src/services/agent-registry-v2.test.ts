import { describe, it, expect, beforeEach } from 'bun:test';
import { AgentRegistryV2, resetAgentRegistryV2 } from './agent-registry-v2';
import { AgentV2, AgentId } from './agent-v2';

describe('AgentRegistryV2', () => {
  let registry: AgentRegistryV2;

  beforeEach(() => {
    resetAgentRegistryV2();
    registry = new AgentRegistryV2();
  });

  const createMockAgent = (id: AgentId, name: string, tools: string[] = []): AgentV2 => ({
    id,
    name,
    description: `Mock ${name}`,
    mcpTools: tools,
    process: async () => ({}),
  });

  describe('register', () => {
    it('registers an agent', () => {
      const agent = createMockAgent('dramaturg', 'Dramaturg');
      registry.register(agent);
      expect(registry.has('dramaturg')).toBe(true);
    });

    it('replaces existing agent', () => {
      const agent1 = createMockAgent('dramaturg', 'Dramaturg v1');
      const agent2 = createMockAgent('dramaturg', 'Dramaturg v2');
      registry.register(agent1);
      registry.register(agent2);
      expect(registry.get('dramaturg')?.name).toBe('Dramaturg v2');
    });
  });

  describe('get', () => {
    it('returns registered agent', () => {
      const agent = createMockAgent('stylist', 'Stylist');
      registry.register(agent);
      expect(registry.get('stylist')).toBe(agent);
    });

    it('returns undefined for unknown agent', () => {
      expect(registry.get('unknown' as AgentId)).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('returns all registered agents', () => {
      registry.register(createMockAgent('dramaturg', 'Dramaturg'));
      registry.register(createMockAgent('validator', 'Validator'));
      registry.register(createMockAgent('stylist', 'Stylist'));
      expect(registry.getAll().length).toBe(3);
    });
  });

  describe('getIds', () => {
    it('returns all agent IDs', () => {
      registry.register(createMockAgent('actor', 'Actor'));
      registry.register(createMockAgent('censor', 'Censor'));
      expect(registry.getIds()).toContain('actor');
      expect(registry.getIds()).toContain('censor');
    });
  });

  describe('unregister', () => {
    it('removes an agent', () => {
      registry.register(createMockAgent('chronicler', 'Chronicler'));
      expect(registry.has('chronicler')).toBe(true);
      registry.unregister('chronicler');
      expect(registry.has('chronicler')).toBe(false);
    });

    it('returns false for unknown agent', () => {
      expect(registry.unregister('unknown' as AgentId)).toBe(false);
    });
  });

  describe('getByName', () => {
    it('finds agent by name (case-insensitive)', () => {
      registry.register(createMockAgent('dramaturg', 'Dramaturg'));
      expect(registry.getByName('dramaturg')).toBeDefined();
      expect(registry.getByName('DRAMATURG')).toBeDefined();
      expect(registry.getByName('Dramaturg')).toBeDefined();
    });

    it('returns undefined for unknown name', () => {
      expect(registry.getByName('Unknown')).toBeUndefined();
    });
  });

  describe('getAgentsWithTool', () => {
    it('returns agents that can use specific tool', () => {
      const agent1 = createMockAgent('dramaturg', 'Dramaturg', ['search_verses', 'get_pattern']);
      const agent2 = createMockAgent('validator', 'Validator', ['verify_fact']);
      registry.register(agent1);
      registry.register(agent2);

      const withSearch = registry.getAgentsWithTool('search_verses');
      expect(withSearch.length).toBe(1);
      expect(withSearch[0]!.id).toBe('dramaturg');
    });
  });
});
