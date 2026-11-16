import { Agent, IAgentEntity } from 'agents-domain';
import { AgentRepository, Clock, IdGenerator } from './ports';

/** Input of {@link CreateAgentUseCase}. */
export interface CreateAgentCommand {
  /** Workspace of the authenticated caller, never taken from the request body. */
  workspaceId: string;
  name: string;
  email: string;
}

/**
 * Creates an agent in the caller's workspace and saves it.
 *
 * @throws InvalidAgentError when the name or email breaks a domain rule.
 * @throws AgentEmailAlreadyExistsError when the email is taken in the workspace.
 */
export class CreateAgentUseCase {
  constructor(
    private readonly agents: AgentRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateAgentCommand): Promise<IAgentEntity> {
    const agent = Agent.create({
      id: this.ids.next(),
      workspaceId: command.workspaceId,
      name: command.name,
      email: command.email,
      now: this.clock.now(),
    });

    // The database's unique index is the real guard against duplicate emails;
    // it also covers two requests racing each other.
    await this.agents.save(agent);
    return agent;
  }
}
