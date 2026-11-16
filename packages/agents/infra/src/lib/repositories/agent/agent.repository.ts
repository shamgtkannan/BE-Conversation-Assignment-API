import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AgentRepository } from 'agents-application';
import { Agent, AgentEmailAlreadyExistsError } from 'agents-domain';
import * as mongoose from 'mongoose';
import { AgentDo } from './schema';

/** MongoDB error code for a unique index violation. */
const DUPLICATE_KEY = 11000;

/** True when `error` is Mongo's duplicate-key error on the email index. */
const isDuplicateEmail = (error: unknown): boolean => {
  const e = error as { code?: number; keyPattern?: Record<string, unknown> } | null;
  return e?.code === DUPLICATE_KEY && e.keyPattern?.['email'] !== undefined;
};

/** {@link AgentRepository} backed by MongoDB through Mongoose. */
@Injectable()
export class MongooseAgentRepository implements AgentRepository {
  constructor(
    @InjectModel(AgentDo.name)
    private readonly model: mongoose.Model<AgentDo>,
  ) {}

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
