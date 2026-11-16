import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CONVERSATION_REPOSITORY, ID_GENERATOR } from 'conversations-application';
import { MongooseConversationRepository } from './conversation.repository';
import { ObjectIdGenerator } from './object-id-generator';
import { ConversationDo, ConversationDoSchema } from './schema';

/**
 * Binds the application's conversation ports to their MongoDB implementations.
 * Needs a Mongoose connection (`MongooseModule.forRoot*`) in the host app.
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
export class ConversationRepositoryModule {}
