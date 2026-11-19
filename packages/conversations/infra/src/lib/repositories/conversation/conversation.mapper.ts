import { IConversationEntity } from 'conversations-domain';
import { ConversationDo } from './schema';

/** Every field MongoDB stores for a conversation. `id` is the `_id` here. */
export type StoredConversation = Omit<ConversationDo, 'id'>;

/**
 * Maps a stored document to the plain entity the application layer knows,
 * listing every field explicitly. The three assignment fields are only set when
 * the document has them, so an unassigned conversation keeps them absent (the
 * domain's meaning of "unassigned"), never null.
 */
export const toEntity = (doc: StoredConversation): IConversationEntity => {
  const entity: IConversationEntity = {
    id: doc._id.toHexString(),
    workspaceId: doc.workspaceId,
    subject: doc.subject,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    // Documents stored before the version existed count as version 0.
    version: doc.version ?? 0,
  };

  if (doc.assignedAgentId != null) {
    entity.assignedAgentId = doc.assignedAgentId;
  }
  if (doc.assignedAt != null) {
    entity.assignedAt = doc.assignedAt;
  }
  if (doc.assignedBy != null) {
    entity.assignedBy = doc.assignedBy;
  }
  return entity;
};
