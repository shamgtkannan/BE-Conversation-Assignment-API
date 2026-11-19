/**
 * What the history records about a conversation's assignment. Only assignments are
 * recorded (removing an agent is not announced), so there is one action; the field
 * stays so a line says what it is without the reader assuming it.
 */
export const ASSIGNMENT_ACTIONS = ['assigned'] as const;

/** One kind of assignment change that the history records. */
export type AssignmentAction = (typeof ASSIGNMENT_ACTIONS)[number];

/**
 * One line of a conversation's assignment history, before it is stored: who
 * changed the assignment, from which agent to which, and when.
 *
 * Pure domain contract: it knows nothing about Kafka, MongoDB or NestJS.
 * `previousAgentId` is absent (not `null`) when there was no agent before; the API
 * turns absent into `null`. `newAgentId` is always there.
 */
export interface NewAssignmentHistoryEntry {
  /** Id of the event this line was made from. Unique: the same event is recorded once. */
  eventId: string;
  workspaceId: string;
  conversationId: string;
  action: AssignmentAction;
  /** The agent that had the conversation before, if any. */
  previousAgentId?: string;
  /** The agent that has the conversation now. */
  newAgentId: string;
  /** User who made the change. */
  performedBy: string;
  /**
   * When the change happened, UTC (the event's `occurredAt`). Named `createdAt`
   * because it is the time the paged list is ordered by.
   */
  createdAt: Date;
  /** Version of the conversation after the change; orders one conversation's lines exactly. */
  version: number;
}

/** A stored history line. */
export interface IAssignmentHistoryEntity extends NewAssignmentHistoryEntry {
  /** Identifier as a string (an ObjectId hex string in the current persistence). */
  id: string;
}
