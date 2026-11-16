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

/**
 * Converts a domain conversation to its response shape. Listing every field
 * keeps stray properties off the wire, and turns the domain's "absent"
 * assignment fields into the explicit `null` the API contract promises.
 */
export const toConversationResponse = (conversation: IConversationEntity): ConversationResponse => ({
  id: conversation.id,
  subject: conversation.subject,
  status: conversation.status,
  workspaceId: conversation.workspaceId,
  assignedAgentId: conversation.assignedAgentId ?? null,
  assignedAt: conversation.assignedAt?.toISOString() ?? null,
  assignedBy: conversation.assignedBy ?? null,
  createdAt: conversation.createdAt.toISOString(),
  updatedAt: conversation.updatedAt.toISOString(),
});
