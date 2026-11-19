import { ConversationAssigned } from './conversation-events';
import { ConversationChange } from './conversation-change';

/**
 * Says what a change to a conversation means for its assignment: an
 * `conversation.assigned.v1` event when an agent was assigned, otherwise `null`.
 *
 * STUB: not implemented yet.
 */
export function assignedEventFromChange(change: ConversationChange): ConversationAssigned | null {
  void change;
  throw new Error('not implemented');
}
