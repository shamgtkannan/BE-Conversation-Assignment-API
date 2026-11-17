import { GetAgentUseCase } from 'agents-application';
import { AgentNotFoundError } from 'agents-domain';
import { AgentLookup } from 'conversations-application';

/**
 * Answers the conversations side's {@link AgentLookup} question from the
 * agents context, by asking its `GetAgentUseCase`. This is the only place the
 * two contexts meet, so neither library imports the other.
 */
export class AgentsBackedAgentLookup implements AgentLookup {
  constructor(private readonly getAgent: GetAgentUseCase) {}

  async exists(workspaceId: string, agentId: string): Promise<boolean> {
    try {
      await this.getAgent.execute({ workspaceId, id: agentId });
      return true;
    } catch (error) {
      if (error instanceof AgentNotFoundError) return false;
      throw error;
    }
  }
}
