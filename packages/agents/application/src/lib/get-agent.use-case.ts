import { IAgentEntity } from 'agents-domain';
import { AgentRepository } from './ports';

/** Input of {@link GetAgentUseCase}. */
export interface GetAgentCommand {
  /** Workspace of the authenticated caller; only its agents can be found. */
  workspaceId: string;
  id: string;
}

/**
 * Reads one agent of the caller's workspace by id. Not implemented yet.
 *
 * @throws InvalidAgentError when the id is malformed.
 * @throws AgentNotFoundError when no such agent exists in the workspace.
 */
export class GetAgentUseCase {
  constructor(private readonly agents: AgentRepository) {}

  execute(command: GetAgentCommand): Promise<IAgentEntity> {
    void command;
    void this.agents;
    throw new Error('Not implemented');
  }
}
