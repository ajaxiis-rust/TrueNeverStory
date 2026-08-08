import type { ServiceMessageAgent, ServiceMessageContext } from '../../roleplay-engine';

/**
 * Adapter for legacy agents that implement ServiceMessageAgent.
 * Wraps them to provide the generateServiceMessage interface.
 */
export class LegacyAgentAdapter implements ServiceMessageAgent {
  name: string;

  constructor(name: string, private fn: (ctx: ServiceMessageContext) => Promise<string>) {
    this.name = name;
  }

  async generateServiceMessage(ctx: ServiceMessageContext): Promise<string> {
    return this.fn(ctx);
  }
}
