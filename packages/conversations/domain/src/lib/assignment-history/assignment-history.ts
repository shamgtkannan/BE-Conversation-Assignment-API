import { CONVERSATION_ASSIGNED_V1, ConversationEvent } from '../events/conversation-events';
import { NewAssignmentHistoryEntry } from './assignment-history.entity';

/**
 * Turns a conversation event into the history line that records it.
 *
 * - An assigned event becomes an "assigned" line with the new agent. The replaced
 *   agent is left out when nobody was assigned before.
 * - An unassigned event becomes an "unassigned" line with the removed agent and no new agent.
 * - The time is copied, so changing the event afterwards cannot change the line.
 */
export function historyEntryFromEvent(event: ConversationEvent): NewAssignmentHistoryEntry {
  if (event.type === CONVERSATION_ASSIGNED_V1) {
    return {
      eventId: event.eventId,
      workspaceId: event.workspaceId,
      conversationId: event.conversationId,
      action: 'assigned',
      ...(event.previousAgentId !== null && { previousAgentId: event.previousAgentId }),
      newAgentId: event.agentId,
      performedBy: event.assignedBy,
      createdAt: new Date(event.occurredAt),
      version: event.version,
    };
  }
  return {
    eventId: event.eventId,
    workspaceId: event.workspaceId,
    conversationId: event.conversationId,
    action: 'unassigned',
    previousAgentId: event.previousAgentId,
    performedBy: event.unassignedBy,
    createdAt: new Date(event.occurredAt),
    version: event.version,
  };
}
