import { Module } from '@nestjs/common';
import {
  CLOCK,
  CONVERSATION_REPOSITORY,
  Clock,
  ConversationRepository,
  CreateConversationUseCase,
  GetConversationUseCase,
  ID_GENERATOR,
  IdGenerator,
} from 'conversations-application';
import { ConversationRepositoryModule } from 'conversations-infra';
import { SystemClock } from '../../common/system-clock';
import { ConversationsController } from './conversations.controller';

/**
 * Wires the conversations feature: ports are bound to MongoDB adapters by
 * `ConversationRepositoryModule`, and the use cases, plain classes without Nest
 * decorators, are assembled here with `useFactory`.
 */
@Module({
  imports: [ConversationRepositoryModule],
  controllers: [ConversationsController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: CreateConversationUseCase,
      useFactory: (conversations: ConversationRepository, ids: IdGenerator, clock: Clock) =>
        new CreateConversationUseCase(conversations, ids, clock),
      inject: [CONVERSATION_REPOSITORY, ID_GENERATOR, CLOCK],
    },
    {
      provide: GetConversationUseCase,
      useFactory: (conversations: ConversationRepository) =>
        new GetConversationUseCase(conversations),
      inject: [CONVERSATION_REPOSITORY],
    },
  ],
})
export class ConversationsModule {}
