import { ConversationAssigned, CONVERSATION_ASSIGNED_V1 } from './conversation-events';
import { ConversationChange } from './conversation-change';

/**
 * Says what a change to a conversation means for its assignment: a
 * `conversation.assigned.v1` event when an agent was assigned, otherwise `null`.
 *
 * - An assignment is a change that leaves a conversation with an agent it did not
 *   have just before: the first one, a replacement, or one that arrives with the
 *   conversation itself.
 * - `previousAgentId` is the agent just before the change, or `null` when there was
 *   none (so after an agent was removed, the next assignment has no previous agent).
 * - Nothing is announced when the agent stayed the same, whatever else changed, or
 *   when the agent was removed: only assignments are announced.
 * - An agent without who assigned it and when is not a valid assignment (the
 *   database refuses to store one), so there is nothing to announce.
 * - The event takes the change's id as its own, so the same change always gives the
 *   same event, however many times it is seen. The time is the assignment's own
 *   `assignedAt`, copied.
 */
export function assignedEventFromChange(change: ConversationChange): ConversationAssigned | null {
  const { before, after } = change;
  const { assignedAgentId, assignedAt, assignedBy } = after;

  if (assignedAgentId === undefined || assignedAgentId === before?.assignedAgentId) {
    return null;
  }
  if (assignedAt === undefined || assignedBy === undefined) {
    return null;
  }

  return {
    type: CONVERSATION_ASSIGNED_V1,
    eventId: change.changeId,
    occurredAt: new Date(assignedAt),
    workspaceId: after.workspaceId,
    conversationId: after.id,
    previousAgentId: before?.assignedAgentId ?? null,
    agentId: assignedAgentId,
    assignedBy,
    version: after.version,
  };
}
