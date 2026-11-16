import { IAgentEntity } from 'agents-domain';

/** Input of {@link CreateAgentUseCase}. */
export interface CreateAgentCommand {
  /** Workspace of the authenticated caller, never taken from the request body. */
  workspaceId: string;
  name: string;
  email: string;
}

/**
 * Creates an agent in the caller's workspace and saves it.
 * Contract only for now; the implementation comes with the application layer.
 *
 * @throws InvalidAgentError when the name or email breaks a domain rule.
 * @throws AgentEmailAlreadyExistsError when the email is taken in the workspace.
 */
export class CreateAgentUseCase {
  execute(_command: CreateAgentCommand): Promise<IAgentEntity> {
    throw new Error('Not implemented');
  }
}
