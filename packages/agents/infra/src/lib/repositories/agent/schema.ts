import { Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { IAgentEntity } from 'agents-domain';

// Early version: collection only. Fields, id mapping and indexes come next (TDD red).
@Schema({ collection: 'agents' })
export class AgentDo implements IAgentEntity {
  _id!: mongoose.Types.ObjectId;
  id!: string;
  workspaceId!: string;
  name!: string;
  email!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const AgentDoSchema = SchemaFactory.createForClass(AgentDo);
export type AgentDoc = mongoose.HydratedDocument<AgentDo>;
