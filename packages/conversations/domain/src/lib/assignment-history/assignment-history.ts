import { ConversationEvent } from '../events/conversation-events';
import { NewAssignmentHistoryEntry } from './assignment-history.entity';

/**
 * Turns a conversation event into the history line that records it.
 *
 * STUB: not implemented yet.
 */
export function historyEntryFromEvent(event: ConversationEvent): NewAssignmentHistoryEntry {
  void event;
  throw new Error('not implemented');
}
