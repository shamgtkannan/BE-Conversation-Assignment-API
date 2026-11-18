import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PageRequest } from '@shared/core';
import { AssignmentHistoryRepository } from 'conversations-application';
import { IAssignmentHistoryEntity, NewAssignmentHistoryEntry } from 'conversations-domain';
import * as mongoose from 'mongoose';
import { AssignmentHistoryDo } from './schema';

/** Every field MongoDB stores for a history line. `id` is the `_id` here. */
type StoredLine = Omit<AssignmentHistoryDo, 'id'>;

/** MongoDB error code for a unique index violation. */
const DUPLICATE_KEY = 11000;

/**
 * Builds the document to store, listing every field explicitly. The two agent
 * fields are only set when the line has them: undefined would otherwise be
 * written as null, and "absent" is what the schema and the validator expect.
 */
const toDocument = (entry: NewAssignmentHistoryEntry): StoredLine => {
  const document: StoredLine = {
    _id: new mongoose.Types.ObjectId(),
    eventId: entry.eventId,
    workspaceId: entry.workspaceId,
    conversationId: entry.conversationId,
    action: entry.action,
    performedBy: entry.performedBy,
    createdAt: entry.createdAt,
    version: entry.version,
  };
  if (entry.previousAgentId !== undefined) document.previousAgentId = entry.previousAgentId;
  if (entry.newAgentId !== undefined) document.newAgentId = entry.newAgentId;
  return document;
};

/** Maps a stored document to the plain entity the application layer knows. */
const toEntity = (doc: StoredLine): IAssignmentHistoryEntity => {
  const entity: IAssignmentHistoryEntity = {
    id: doc._id.toHexString(),
    eventId: doc.eventId,
    workspaceId: doc.workspaceId,
    conversationId: doc.conversationId,
    action: doc.action,
    performedBy: doc.performedBy,
    createdAt: doc.createdAt,
    version: doc.version,
  };
  if (doc.previousAgentId != null) entity.previousAgentId = doc.previousAgentId;
  if (doc.newAgentId != null) entity.newAgentId = doc.newAgentId;
  return entity;
};

/** {@link AssignmentHistoryRepository} backed by MongoDB through Mongoose. */
@Injectable()
export class MongooseAssignmentHistoryRepository implements AssignmentHistoryRepository {
  constructor(
    @InjectModel(AssignmentHistoryDo.name)
    private readonly model: mongoose.Model<AssignmentHistoryDo>,
  ) {}

  /**
   * Inserts the line. The unique index on `eventId` is what makes recording
   * idempotent: when the event was recorded before, the database refuses the
   * insert and this answers `false` instead of failing. Any other failure is
   * passed on.
   */
  async record(entry: NewAssignmentHistoryEntry): Promise<boolean> {
    try {
      await this.model.create(toDocument(entry));
      return true;
    } catch (error) {
      if ((error as { code?: number } | null)?.code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  /**
   * Reads one page of a conversation's history (see the ordering contract on
   * {@link AssignmentHistoryRepository.list}). Both the sort and the cursor
   * comparison use `createdAt` then `_id`, so lines made at the same instant are
   * neither skipped nor repeated. Served by the `{ workspaceId, conversationId,
   * createdAt, _id }` index, which already is in list order.
   */
  async list(
    workspaceId: string,
    conversationId: string,
    request: PageRequest,
  ): Promise<IAssignmentHistoryEntity[]> {
    const backward = request.direction === 'previous';
    const order = backward ? 1 : -1;

    const filter: mongoose.QueryFilter<AssignmentHistoryDo> = { workspaceId, conversationId };
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
}
