import { ConversationChange } from 'conversations-domain';
import { ConversationDo } from '../repositories/conversation/schema';

/** Every field MongoDB stores for a conversation. `id` is the `_id` here. */
export type StoredConversation = Omit<ConversationDo, 'id'>;

/**
 * One change as MongoDB's change stream delivers it: the part of the driver's
 * document this service reads. The driver's own change type satisfies it.
 */
export interface RawConversationChange {
  /** The change's own id (the resume token). Its `_data` is the same for everyone who sees the change. */
  _id: { _data: string };
  /** `insert`, `update`, `replace`, `delete`, ... */
  operationType: string;
  /** The document after the change. Absent for a delete. */
  fullDocument?: StoredConversation;
  /** The document just before the change. Absent for an insert. */
  fullDocumentBeforeChange?: StoredConversation;
}

/**
 * Turns a change MongoDB reported into the domain's {@link ConversationChange}:
 * stored documents become plain conversations, and the change's id becomes the
 * change id. Returns `null` for a change that has no document after it (a delete),
 * which says nothing about an assignment.
 *
 * STUB: not implemented yet.
 */
export function toConversationChange(raw: RawConversationChange): ConversationChange | null {
  void raw;
  throw new Error('not implemented');
}
