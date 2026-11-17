import { Page, PageRequest, buildPage } from '@shared/core';
import { IAgentEntity } from 'agents-domain';
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
 *
 * @throws InvalidPageRequestError for a bad limit or cursor.
 */
export class ListAgentsUseCase {
  constructor(private readonly agents: AgentRepository) {}

  async execute({ workspaceId, limit, next, previous }: ListAgentsCommand): Promise<Page<IAgentEntity>> {
    // Validate first, so a bad request never reaches the database.
    const request = PageRequest.create({ limit, next, previous });
    const rows = await this.agents.list(workspaceId, request);
    return buildPage(rows, request);
  }
}
