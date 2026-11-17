import { Page } from '@shared/core';
import { IAgentEntity } from 'agents-domain';

/** JSON shape of an agent in API responses. Dates are ISO 8601 strings in UTC. */
export interface AgentResponse {
  id: string;
  name: string;
  email: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

/** JSON shape of `GET /agents`: one page of agents with opaque tokens to move on. */
export interface AgentPageResponse {
  items: AgentResponse[];
  hasNext: boolean;
  next: string | null;
  hasPrevious: boolean;
  previous: string | null;
}

/** Converts a domain agent to its response shape. */
export const toAgentResponse = (agent: IAgentEntity): AgentResponse => ({
  id: agent.id,
  name: agent.name,
  email: agent.email,
  workspaceId: agent.workspaceId,
  createdAt: agent.createdAt.toISOString(),
  updatedAt: agent.updatedAt.toISOString(),
});

/** Converts a page of domain agents to its response shape. */
export const toAgentPageResponse = (page: Page<IAgentEntity>): AgentPageResponse => ({
  items: page.items.map(toAgentResponse),
  hasNext: page.hasNext,
  next: page.next,
  hasPrevious: page.hasPrevious,
  previous: page.previous,
});
