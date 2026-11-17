import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { IAgentEntity } from 'agents-domain';

/**
 * Mongoose data object for the `agents` collection.
 *
 * Persistence shape of {@link IAgentEntity}; the repository maps between the
 * two so the domain never sees Mongoose types.
 *
 * Soft-delete, domain-event and lock fields are omitted on purpose: agents are
 * only created and read, so there are no later mutations to guard. Mongoose's
 * `__v` version key is switched off for the same reason, so a stored document
 * holds exactly the listed fields.
 */
@Schema({ collection: 'agents', versionKey: false })
export class AgentDo implements IAgentEntity {
  _id!: mongoose.Types.ObjectId;

  /** String form of `_id`, so callers never handle ObjectId directly. */
  get id(): string {
    return this._id?.toString();
  }
  set id(value: string) {
    this._id = new mongoose.Types.ObjectId(value);
  }

  /** Plain string, not an ObjectId: it comes from the auth context header. */
  @Prop({ required: true, type: String })
  workspaceId!: string;

  @Prop({ required: true, type: String })
  name!: string;

  /** Stored as given; trimming and lowercasing happen in the domain, not here. */
  @Prop({ required: true, type: String })
  email!: string;

  /** Set by the application, not by Mongoose timestamps, so tests control the clock. */
  @Prop({ required: true, type: Date })
  createdAt!: Date;

  @Prop({ required: true, type: Date })
  updatedAt!: Date;
}

/** Compiled Mongoose schema for {@link AgentDo}. */
export const AgentDoSchema = SchemaFactory.createForClass(AgentDo);
/** Hydrated Mongoose document of an agent, as returned by queries. */
export type AgentDoc = mongoose.HydratedDocument<AgentDo>;

AgentDoSchema.set('toObject', { getters: true });
AgentDoSchema.set('toJSON', { getters: true });

// One email per workspace; the same address may exist in other workspaces.
AgentDoSchema.index({ workspaceId: 1, email: 1 }, { unique: true });
// Cursor-paginated list: newest first, _id as tiebreaker.
AgentDoSchema.index({ workspaceId: 1, createdAt: -1, _id: -1 });
