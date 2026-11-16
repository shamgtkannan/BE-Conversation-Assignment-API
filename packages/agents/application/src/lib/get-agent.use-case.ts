import { AgentNotFoundError, IAgentEntity, InvalidAgentError, isAgentId } from 'agents-domain';
import { AgentRepository } from './ports';

/** Input of {@link GetAgentUseCase}. */
export interface GetAgentCommand {
  /** Workspace of the authenticated caller; only its agents can be found. */
  workspaceId: string;
  id: string;
}

/**
 * Reads one agent of the caller's workspace by id.
 *
 * @throws InvalidAgentError when the id is malformed.
 * @throws AgentNotFoundError when no such agent exists in the workspace.
 */
export class GetAgentUseCase {
  constructor(private readonly agents: AgentRepository) {}

  async execute({ workspaceId, id }: GetAgentCommand): Promise<IAgentEntity> {
    // Check the format first, so a malformed id never reaches the database.
    if (!isAgentId(id)) {
      throw new InvalidAgentError('id', 'Agent id must be 24 lowercase hexadecimal characters');
    }
    const agent = await this.agents.findById(workspaceId, id);
    if (!agent) {
      throw new AgentNotFoundError(id);
    }
    return agent;
  }
}
