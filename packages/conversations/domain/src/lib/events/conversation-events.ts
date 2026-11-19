/** Type of the event announced when an agent is assigned to a conversation. */
export const CONVERSATION_ASSIGNED_V1 = 'conversation.assigned.v1';

/**
 * An agent was assigned to a conversation (the first one, or in place of
 * another). Published once per real change, never for assigning the current
 * agent again.
 */
export interface ConversationAssigned {
  readonly type: typeof CONVERSATION_ASSIGNED_V1;
  /** Unique per event, so a consumer can ignore a delivery it has already handled. */
  readonly eventId: string;
  /** When the change happened, UTC. Equals the conversation's `assignedAt`. */
  readonly occurredAt: Date;
  readonly workspaceId: string;
  readonly conversationId: string;
  /** The agent replaced by this assignment, or `null` if nobody was assigned. */
  readonly previousAgentId: string | null;
  readonly agentId: string;
  /** User who made the assignment. */
  readonly assignedBy: string;
  /** Version of the conversation after this change; orders a conversation's events. */
  readonly version: number;
}

/**
 * Everything a conversation announces: only assignments. Removing an agent is not
 * announced, so it leaves no event and no history line.
 */
export type ConversationEvent = ConversationAssigned;
