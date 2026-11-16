import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConversationRepository } from 'conversations-application';
import { Conversation } from 'conversations-domain';
import * as mongoose from 'mongoose';
import { ConversationDo } from './schema';

/** {@link ConversationRepository} backed by MongoDB through Mongoose. */
@Injectable()
export class MongooseConversationRepository implements ConversationRepository {
  constructor(
    @InjectModel(ConversationDo.name)
    private readonly model: mongoose.Model<ConversationDo>,
  ) {}

  /** Inserts or replaces a conversation by id. Not implemented yet. */
  async save(conversation: Conversation): Promise<void> {
    void conversation;
    void this.model;
    throw new Error('Not implemented');
  }
}
