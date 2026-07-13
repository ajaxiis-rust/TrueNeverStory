import { AgentV2, AgentId } from './agent-v2';
import { getLogger } from '@/utils/logger';

const logger = getLogger('AgentRegistryV2');

/**
 * Agent Registry v2
 *
 * Manages the 6 new agents (Dramaturg, Validator, Stylist, Actor, Censor, Chronicler).
 * Replaces the old 14-agent system.
 */
export class AgentRegistryV2 {
  private agents = new Map<AgentId, AgentV2>();

  /**
   * Register an agent.
   */
  register(agent: AgentV2): void {
    if (this.agents.has(agent.id)) {
      logger.warn(`Agent ${agent.id} already registered, replacing`);
    }
    this.agents.set(agent.id, agent);
    logger.debug(`Registered agent: ${agent.id} (${agent.name})`);
  }

  /**
   * Get an agent by ID.
   */
  get(id: AgentId): AgentV2 | undefined {
    return this.agents.get(id);
  }

  /**
   * Get all registered agents.
   */
  getAll(): AgentV2[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent IDs.
   */
  getIds(): AgentId[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Check if an agent is registered.
   */
  has(id: AgentId): boolean {
    return this.agents.has(id);
  }

  /**
   * Unregister an agent.
   */
  unregister(id: AgentId): boolean {
    const deleted = this.agents.delete(id);
    if (deleted) {
      logger.debug(`Unregistered agent: ${id}`);
    }
    return deleted;
  }

  /**
   * Get agent by name (case-insensitive).
   */
  getByName(name: string): AgentV2 | undefined {
    const lower = name.toLowerCase();
    return this.getAll().find(a => a.name.toLowerCase() === lower);
  }

  /**
   * Get agent IDs that can use specific MCP tools.
   */
  getAgentsWithTool(toolName: string): AgentV2[] {
    return this.getAll().filter(a => a.mcpTools.includes(toolName));
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let instance: AgentRegistryV2 | null = null;

export function getAgentRegistryV2(): AgentRegistryV2 {
  if (!instance) {
    instance = new AgentRegistryV2();
  }
  return instance;
}

export function resetAgentRegistryV2(): void {
  instance = null;
}
