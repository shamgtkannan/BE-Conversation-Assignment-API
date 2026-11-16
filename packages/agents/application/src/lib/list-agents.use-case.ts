import { AgentPage } from 'agents-domain';
import { AgentRepository } from './ports';

/** Input of {@link ListAgentsUseCase}. */
export interface ListAgentsCommand {
  /** Workspace of the authenticated caller; only its agents are listed. */
  workspaceId: string;
  limit?: number;
  next?: string;
  previous?: string;
}

/**
 * Lists a workspace's agents one page at a time, newest first.
 * Not implemented yet.
 *
 * @throws InvalidPageRequestError for a bad limit or cursor.
 */
export class ListAgentsUseCase {
  constructor(private readonly agents: AgentRepository) {}

  execute(command: ListAgentsCommand): Promise<AgentPage> {
    void command;
    void this.agents;
    throw new Error('Not implemented');
  }
}
