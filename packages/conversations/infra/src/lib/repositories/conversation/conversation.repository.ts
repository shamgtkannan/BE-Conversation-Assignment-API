import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PageRequest } from '@shared/core';
import { ConversationFilter, ConversationRepository } from 'conversations-application';
import {
  Conversation,
  ConversationConcurrentModificationError,
  IConversationEntity,
} from 'conversations-domain';
import * as mongoose from 'mongoose';
import { StoredConversation, toEntity } from './conversation.mapper';
import { ConversationDo } from './schema';

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
    version: conversation.version,
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

  /**
   * Finds one conversation by id inside a workspace. Filtering on `workspaceId`
   * too means a conversation of another workspace is simply not found. Served
   * by the `_id` index.
   */
  async findById(workspaceId: string, id: string): Promise<IConversationEntity | null> {
    const doc = await this.model
      .findOne({ _id: new mongoose.Types.ObjectId(id), workspaceId })
      .lean();
    return doc ? toEntity(doc) : null;
  }

  /**
   * Reads one page of a workspace's conversations (see the ordering contract on
   * {@link ConversationRepository.list}). Both the sort and the cursor comparison
   * use `createdAt` then `_id`, so conversations created at the same instant are
   * neither skipped nor repeated. Each filter has an index that already ends in
   * `createdAt, _id`, so a filtered page needs no extra sort.
   */
  async list(
    workspaceId: string,
    { status, assignedAgentId }: ConversationFilter,
    request: PageRequest,
  ): Promise<IConversationEntity[]> {
    const backward = request.direction === 'previous';
    const order = backward ? 1 : -1;

    const filter: mongoose.QueryFilter<ConversationDo> = { workspaceId };
    if (status !== undefined) filter.status = status;
    if (assignedAgentId !== undefined) filter.assignedAgentId = assignedAgentId;
    if (request.cursor) {
      const { createdAt, id } = request.cursor;
      const _id = new mongoose.Types.ObjectId(id);
      filter.$or = backward
        ? [{ createdAt: { $gt: createdAt } }, { createdAt, _id: { $gt: _id } }]
        : [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: _id } }];
    }

    const docs = await this.model
      .find(filter)
      .sort({ createdAt: order, _id: order })
      .limit(request.fetchSize)
      .lean();

    return docs.map(toEntity);
  }

  /**
   * Without `expectedVersion`: inserts the conversation, or replaces the stored
   * one with the same id.
   *
   * With it: replaces the stored conversation only if its version is still
   * `expectedVersion`, in one atomic database operation, so of several requests
   * that read the same version exactly one is written. Documents stored before
   * the version existed have none, which counts as 0.
   *
   * The match is on id and workspace together. A conversation whose id exists in
   * another workspace therefore does not match: the unversioned upsert tries to
   * insert and the duplicate `_id` makes the database refuse, so one workspace can
   * never overwrite another's conversation.
   *
   * @throws ConversationConcurrentModificationError when the versioned write matched nothing.
   */
  async save(conversation: Conversation, expectedVersion?: number): Promise<void> {
    const filter: mongoose.QueryFilter<ConversationDo> = {
      _id: new mongoose.Types.ObjectId(conversation.id),
      workspaceId: conversation.workspaceId,
    };
    if (expectedVersion === undefined) {
      await this.model.replaceOne(filter, toDocument(conversation), {
        upsert: true,
        runValidators: true,
      });
      return;
    }

    filter.version = expectedVersion === 0 ? { $in: [0, null] } : expectedVersion;
    const result = await this.model.replaceOne(filter, toDocument(conversation), {
      runValidators: true,
    });
    if (result.matchedCount === 0) {
      throw new ConversationConcurrentModificationError(conversation.id);
    }
  }
}
