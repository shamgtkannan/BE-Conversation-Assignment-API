/** Type of the message that asks for an agent to be assigned or removed. */
export const CONVERSATION_ASSIGNMENT_REQUESTED_V1 = 'conversation.assignment-requested.v1';

/** What every assignment request carries. */
interface AssignmentRequestBase {
  readonly type: typeof CONVERSATION_ASSIGNMENT_REQUESTED_V1;
  /** Unique per request. Names the request through its whole life, and identifies a repeat of it. */
  readonly commandId: string;
  /** When the request was made, UTC. */
  readonly requestedAt: Date;
  readonly workspaceId: string;
  readonly conversationId: string;
  /** The authenticated user who asked. */
  readonly requestedBy: string;
  /** That user's role. The use case that carries the request out checks it again. */
  readonly role: string;
}

/** Asks for an agent to be assigned to a conversation, replacing any current one. */
export interface AssignRequested extends AssignmentRequestBase {
  readonly action: 'assign';
  readonly agentId: string;
}

/** Asks for the agent to be removed from a conversation. */
export interface UnassignRequested extends AssignmentRequestBase {
  readonly action: 'unassign';
}

/**
 * A request to change a conversation's assignment. It is a command, not a fact:
 * nothing has happened yet. The consumer that carries it out decides whether it
 * is allowed, and announces the result as a `conversation.assigned.v1` or
 * `conversation.unassigned.v1` event.
 */
export type AssignmentRequested = AssignRequested | UnassignRequested;
