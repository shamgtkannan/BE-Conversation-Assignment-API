/** Every state a conversation can be in. */
export const CONVERSATION_STATUSES = ['open', 'closed'] as const;

/** A conversation is open until it is closed. Closed conversations cannot be assigned. */
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/**
 * A customer conversation that can be handled by one support agent at a time.
 *
 * Pure domain contract: it knows nothing about MongoDB or NestJS. The
 * persistence model in `conversations-infra` implements this interface.
 *
 * The three `assigned*` fields belong together: they are all set while an agent
 * is assigned and all absent (not `null`) otherwise. The API turns absent into
 * `null` in its responses.
 */
export interface IConversationEntity {
  /** Identifier as a string (an ObjectId hex string in the current persistence). */
  id: string;
  subject: string;
  status: ConversationStatus;
  /** Workspace the conversation belongs to. Always taken from the auth context. */
  workspaceId: string;
  /** Id of the assigned agent, who must belong to the same workspace. */
  assignedAgentId?: string;
  /** When the current assignment was made, UTC. */
  assignedAt?: Date;
  /** Id of the user who made the current assignment. */
  assignedBy?: string;
  /** Creation time, UTC. */
  createdAt: Date;
  /** Last modification time, UTC. Equals `createdAt` until the first change. */
  updatedAt: Date;
}
