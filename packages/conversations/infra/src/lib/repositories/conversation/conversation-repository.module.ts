import { Module, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel, MongooseModule } from '@nestjs/mongoose';
import { CONVERSATION_REPOSITORY, ID_GENERATOR } from 'conversations-application';
import { MongooseConversationRepository } from './conversation.repository';
import { ObjectIdGenerator } from './object-id-generator';
import * as mongoose from 'mongoose';
import { ConversationDo, ConversationDoSchema } from './schema';
import { ensureConversationValidator } from './validator';

/**
 * Binds the application's conversation ports to their MongoDB implementations.
 * Needs a Mongoose connection (`MongooseModule.forRoot*`) in the host app.
 * On start it also sets the collection validator, so MongoDB enforces the
 * single-document rules itself.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: ConversationDo.name, schema: ConversationDoSchema }]),
  ],
  providers: [
    { provide: CONVERSATION_REPOSITORY, useClass: MongooseConversationRepository },
    { provide: ID_GENERATOR, useClass: ObjectIdGenerator },
  ],
  exports: [CONVERSATION_REPOSITORY, ID_GENERATOR],
})
export class ConversationRepositoryModule implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: mongoose.Connection,
    @InjectModel(ConversationDo.name) private readonly model: mongoose.Model<ConversationDo>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.connection.db) throw new Error('MongoDB connection is not ready');
    // Mongoose creates the collection and builds its indexes in the background. MongoDB
    // refuses to change a collection while an index build runs on it, so wait for that first.
    // A failed index build (for example a duplicate email in older data) stops the start
    // here instead of leaving the API running without its unique index.
    await this.model.init();
    await ensureConversationValidator(this.connection.db);
  }
}
