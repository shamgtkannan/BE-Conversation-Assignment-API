import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConversationRepository } from 'conversations-application';
import { Conversation, IConversationEntity } from 'conversations-domain';
import * as mongoose from 'mongoose';
import { ConversationDo } from './schema';

/** Every field MongoDB stores for a conversation. `id` is the `_id` here. */
type StoredConversation = Omit<ConversationDo, 'id'>;

/**
 * Builds the document to store, listing every field explicitly.
 *
 * The three assignment fields are only set when the conversation has them:
 * undefined would otherwise be written as null, and "absent" is what the schema
 * and the API contract expect for an unassigned conversation.
 */
const toDocument = (conversation: Conversation): StoredConversation => {
  const document: StoredConversation = {
    _id: new mongoose.Types.ObjectId(conversation.id),
    workspaceId: conversation.workspaceId,
    subject: conversation.subject,
    status: conversation.status,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };

  if (conversation.assignedAgentId !== undefined) {
    document.assignedAgentId = conversation.assignedAgentId;
  }
  if (conversation.assignedAt !== undefined) {
    document.assignedAt = conversation.assignedAt;
  }
  if (conversation.assignedBy !== undefined) {
    document.assignedBy = conversation.assignedBy;
  }
  return document;
};

/** {@link ConversationRepository} backed by MongoDB through Mongoose. */
@Injectable()
export class MongooseConversationRepository implements ConversationRepository {
  constructor(
    @InjectModel(ConversationDo.name)
    private readonly model: mongoose.Model<ConversationDo>,
  ) {}

  /** Finds one conversation by id inside a workspace. Not implemented yet. */
  async findById(workspaceId: string, id: string): Promise<IConversationEntity | null> {
    void workspaceId;
    void id;
    void this.model;
    throw new Error('Not implemented');
  }

  /**
   * Inserts the conversation, or replaces the stored one with the same id.
   *
   * The match is on id and workspace together. A conversation whose id exists in
   * another workspace therefore does not match, the upsert tries to insert, and
   * the duplicate `_id` makes the database refuse: one workspace can never
   * overwrite another's conversation.
   */
  async save(conversation: Conversation): Promise<void> {
    await this.model.replaceOne(
      { _id: new mongoose.Types.ObjectId(conversation.id), workspaceId: conversation.workspaceId },
      toDocument(conversation),
      { upsert: true, runValidators: true },
    );
  }
}
