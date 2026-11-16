import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  CONVERSATION_STATUSES,
  ConversationStatus,
  IConversationEntity,
} from 'conversations-domain';
import * as mongoose from 'mongoose';

/**
 * Mongoose data object for the `conversations` collection.
 *
 * Persistence shape of {@link IConversationEntity}; the repository maps between
 * the two so the domain never sees Mongoose types.
 *
 * Soft-delete, domain-event and lock fields are omitted on purpose: there is no
 * delete endpoint, and concurrent-write protection is out of scope for now. For
 * the same reason Mongoose's `__v` version key is switched off, so a stored
 * document holds exactly the listed fields.
 */
@Schema({ collection: 'conversations', versionKey: false })
export class ConversationDo implements IConversationEntity {
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
  subject!: string;

  @Prop({ required: true, type: String, enum: CONVERSATION_STATUSES })
  status!: ConversationStatus;

  // The three assignment fields are absent (not null) while nobody is assigned;
  // the API turns absent into null in its responses.

  /** Id of the assigned agent. A plain string: agents live in another context. */
  @Prop({ required: false, type: String })
  assignedAgentId?: string;

  @Prop({ required: false, type: Date })
  assignedAt?: Date;

  /** Id of the user who made the assignment. */
  @Prop({ required: false, type: String })
  assignedBy?: string;

  /** Set by the application, not by Mongoose timestamps, so tests control the clock. */
  @Prop({ required: true, type: Date })
  createdAt!: Date;

  @Prop({ required: true, type: Date })
  updatedAt!: Date;
}

/** Compiled Mongoose schema for {@link ConversationDo}. */
export const ConversationDoSchema = SchemaFactory.createForClass(ConversationDo);
/** Hydrated Mongoose document of a conversation, as returned by queries. */
export type ConversationDoc = mongoose.HydratedDocument<ConversationDo>;

ConversationDoSchema.set('toObject', { getters: true });
ConversationDoSchema.set('toJSON', { getters: true });

// Cursor-paginated list of a workspace: newest first, _id as tiebreaker.
ConversationDoSchema.index({ workspaceId: 1, createdAt: -1, _id: -1 });
// Filter by status.
ConversationDoSchema.index({ workspaceId: 1, status: 1 });
// Filter by assigned agent.
ConversationDoSchema.index({ workspaceId: 1, assignedAgentId: 1 });
