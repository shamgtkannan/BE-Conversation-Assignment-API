import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AgentRepository } from 'agents-application';
import { PageRequest } from '@shared/core';
import { Agent, AgentEmailAlreadyExistsError, IAgentEntity } from 'agents-domain';
import * as mongoose from 'mongoose';
import { AgentDo } from './schema';

/** MongoDB error code for a unique index violation. */
const DUPLICATE_KEY = 11000;

/** True when `error` is Mongo's duplicate-key error on the email index. */
const isDuplicateEmail = (error: unknown): boolean => {
  const e = error as { code?: number; keyPattern?: Record<string, unknown> } | null;
  return e?.code === DUPLICATE_KEY && e.keyPattern?.['email'] !== undefined;
};

/** The stored fields of an agent, as a plain (lean) document. */
type StoredAgent = Pick<
  AgentDo,
  '_id' | 'workspaceId' | 'name' | 'email' | 'createdAt' | 'updatedAt'
>;

/** Maps a stored document to the plain entity the application layer knows. */
const toEntity = (doc: StoredAgent): IAgentEntity => ({
  id: doc._id.toHexString(),
  workspaceId: doc.workspaceId,
  name: doc.name,
  email: doc.email,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/** {@link AgentRepository} backed by MongoDB through Mongoose. */
@Injectable()
export class MongooseAgentRepository implements AgentRepository {
  constructor(
    @InjectModel(AgentDo.name)
    private readonly model: mongoose.Model<AgentDo>,
  ) {}

  /**
   * Finds one agent by id inside a workspace. Filtering on `workspaceId` too
   * means an agent of another workspace is simply not found. Served by `_id`.
   */
  async findById(workspaceId: string, id: string): Promise<IAgentEntity | null> {
    const doc = await this.model
      .findOne({ _id: new mongoose.Types.ObjectId(id), workspaceId })
      .lean();
    return doc ? toEntity(doc) : null;
  }

  /**
   * Reads one page of a workspace's agents (see the ordering contract on
   * {@link AgentRepository.list}). Both the sort and the cursor comparison use
   * `createdAt` then `_id`, so agents created at the same instant are neither
   * skipped nor repeated. Served by the `{ workspaceId, createdAt, _id }` index.
   */
  async list(workspaceId: string, request: PageRequest): Promise<IAgentEntity[]> {
    const backward = request.direction === 'previous';
    const order = backward ? 1 : -1;

    const filter: mongoose.QueryFilter<AgentDo> = { workspaceId };
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
   * Inserts the agent. Uniqueness of `{ workspaceId, email }` is enforced by the
   * database index, so concurrent duplicates cannot both succeed.
   */
  async save(agent: Agent): Promise<void> {
    try {
      await this.model.create({
        _id: new mongoose.Types.ObjectId(agent.id),
        workspaceId: agent.workspaceId,
        name: agent.name,
        email: agent.email,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      });
    } catch (error) {
      if (isDuplicateEmail(error)) {
        throw new AgentEmailAlreadyExistsError(agent.email);
      }
      throw error;
    }
  }
}
