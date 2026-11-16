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

/** Converts a domain agent to its response shape. Not implemented yet. */
export const toAgentResponse = (_agent: IAgentEntity): AgentResponse => {
  throw new Error('Not implemented');
};
