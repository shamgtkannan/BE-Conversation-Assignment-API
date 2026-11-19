import { ConversationEvent } from '../events/conversation-events';
import { NewAssignmentHistoryEntry } from './assignment-history.entity';

/**
 * Turns a conversation event into the history line that records it: an "assigned"
 * line with the new agent and the user who assigned. The replaced agent is left
 * out when nobody was assigned before. The time is copied, so changing the event
 * afterwards cannot change the line.
 */
export function historyEntryFromEvent(event: ConversationEvent): NewAssignmentHistoryEntry {
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
