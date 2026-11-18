import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ASSIGNMENT_ACTIONS, AssignmentAction, IAssignmentHistoryEntity } from 'conversations-domain';
import * as mongoose from 'mongoose';

/**
 * Mongoose data object for the `assignment_history` collection.
 *
 * Persistence shape of {@link IAssignmentHistoryEntity}; the repository maps
 * between the two so the domain never sees Mongoose types. Lines are only ever
 * added, never changed, so there is no `updatedAt` and Mongoose's `__v` key is off.
 */
@Schema({ collection: 'assignment_history', versionKey: false })
export class AssignmentHistoryDo implements IAssignmentHistoryEntity {
  _id!: mongoose.Types.ObjectId;

  /** String form of `_id`, so callers never handle ObjectId directly. */
  get id(): string {
    return this._id?.toString();
  }
  set id(value: string) {
    this._id = new mongoose.Types.ObjectId(value);
  }

  /** Id of the event this line was made from; unique, so an event is recorded once. */
  @Prop({ required: true, type: String })
  eventId!: string;

  /** Plain string, not an ObjectId: it comes from the auth context header. */
  @Prop({ required: true, type: String })
  workspaceId!: string;

  /** Plain string: the conversation may be long gone, and this line must not depend on it. */
  @Prop({ required: true, type: String })
  conversationId!: string;

  @Prop({ required: true, type: String, enum: ASSIGNMENT_ACTIONS })
  action!: AssignmentAction;

  // Absent (not null) when there was no agent before / there is none after.
  @Prop({ required: false, type: String })
  previousAgentId?: string;

  @Prop({ required: false, type: String })
  newAgentId?: string;

  @Prop({ required: true, type: String })
  performedBy!: string;

  /** When the change happened (the event's `occurredAt`); the list is ordered by it. */
  @Prop({ required: true, type: Date })
  createdAt!: Date;

  /** Version of the conversation after the change. */
  @Prop({ required: true, type: Number })
  version!: number;
}

/** Compiled Mongoose schema for {@link AssignmentHistoryDo}. */
export const AssignmentHistoryDoSchema = SchemaFactory.createForClass(AssignmentHistoryDo);
/** Hydrated Mongoose document of a history line, as returned by queries. */
export type AssignmentHistoryDoc = mongoose.HydratedDocument<AssignmentHistoryDo>;

AssignmentHistoryDoSchema.set('toObject', { getters: true });
AssignmentHistoryDoSchema.set('toJSON', { getters: true });

// One line per event: a repeated delivery of the same event is refused by the database.
AssignmentHistoryDoSchema.index({ eventId: 1 }, { unique: true });
// One conversation's history, newest first, _id as tiebreaker.
AssignmentHistoryDoSchema.index({ workspaceId: 1, conversationId: 1, createdAt: -1, _id: -1 });
