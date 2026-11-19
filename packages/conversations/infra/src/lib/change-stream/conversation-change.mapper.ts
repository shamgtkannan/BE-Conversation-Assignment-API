import { ConversationChange } from 'conversations-domain';
import { StoredConversation, toEntity } from '../repositories/conversation/conversation.mapper';

export type { StoredConversation };

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
 * which says nothing about an assignment. The conversations are read the way the
 * repository reads them, so an assignment stored as null, or a document from before
 * the version existed, comes out the same here as there.
 */
export function toConversationChange(raw: RawConversationChange): ConversationChange | null {
  const { fullDocument, fullDocumentBeforeChange } = raw;
  if (!fullDocument) {
    return null;
  }
  return {
    changeId: raw._id._data,
    ...(fullDocumentBeforeChange && { before: toEntity(fullDocumentBeforeChange) }),
    after: toEntity(fullDocument),
  };
}
