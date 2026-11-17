import { GetAgentUseCase } from 'agents-application';
import { AgentLookup } from 'conversations-application';

/**
 * Answers the conversations side's {@link AgentLookup} question from the
 * agents context, by asking its `GetAgentUseCase`. This is the only place the
 * two contexts meet, so neither library imports the other.
 */
export class AgentsBackedAgentLookup implements AgentLookup {
  constructor(protected readonly getAgent: GetAgentUseCase) {}

  async exists(_workspaceId: string, _agentId: string): Promise<boolean> {
    throw new Error('not implemented');
  }
}
