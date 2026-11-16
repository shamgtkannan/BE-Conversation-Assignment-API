import { ConversationStatus, IConversationEntity } from 'conversations-domain';

/**
 * JSON shape of a conversation in API responses. Dates are ISO 8601 strings in
 * UTC. The three assignment fields are always present: `null` while nobody is
 * assigned, as the specification shows.
 */
export interface ConversationResponse {
  id: string;
  subject: string;
  status: ConversationStatus;
  workspaceId: string;
  assignedAgentId: string | null;
  assignedAt: string | null;
  assignedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Converts a domain conversation to its response shape. Not implemented yet. */
export const toConversationResponse = (conversation: IConversationEntity): ConversationResponse => {
  void conversation;
  throw new Error('Not implemented');
};
