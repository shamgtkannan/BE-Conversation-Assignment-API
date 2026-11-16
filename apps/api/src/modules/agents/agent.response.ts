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

/** Converts a domain agent to its response shape. */
export const toAgentResponse = (agent: IAgentEntity): AgentResponse => ({
  id: agent.id,
  name: agent.name,
  email: agent.email,
  workspaceId: agent.workspaceId,
  createdAt: agent.createdAt.toISOString(),
  updatedAt: agent.updatedAt.toISOString(),
});
