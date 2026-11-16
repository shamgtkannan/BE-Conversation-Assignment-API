import { Schema, SchemaFactory } from '@nestjs/mongoose';
import { ConversationStatus, IConversationEntity } from 'conversations-domain';
import * as mongoose from 'mongoose';

/**
 * Mongoose data object for the `conversations` collection.
 * Early version: only the collection; fields, id mapping and indexes come next.
 */
@Schema({ collection: 'conversations' })
export class ConversationDo implements IConversationEntity {
  _id!: mongoose.Types.ObjectId;
  id!: string;
  subject!: string;
  status!: ConversationStatus;
  workspaceId!: string;
  assignedAgentId?: string;
  assignedAt?: Date;
  assignedBy?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const ConversationDoSchema = SchemaFactory.createForClass(ConversationDo);
export type ConversationDoc = mongoose.HydratedDocument<ConversationDo>;
