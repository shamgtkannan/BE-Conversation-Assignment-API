import { Module } from '@nestjs/common';
import {
  AGENT_LOOKUP,
  ASSIGNMENT_HISTORY_REPOSITORY,
  AgentLookup,
  AssignConversationUseCase,
  AssignmentHistoryRepository,
  CLOCK,
  CONVERSATION_REPOSITORY,
  Clock,
  ConversationRepository,
  CreateConversationUseCase,
  EVENT_PUBLISHER,
  EventPublisher,
  GetConversationUseCase,
  ID_GENERATOR,
  IdGenerator,
  ListAssignmentHistoryUseCase,
  ListConversationsUseCase,
  RecordAssignmentHistoryUseCase,
  UnassignConversationUseCase,
} from 'conversations-application';
import { GetAgentUseCase } from 'agents-application';
import {
  AssignmentHistoryRepositoryModule,
  ConversationRepositoryModule,
  KafkaEventPublisher,
} from 'conversations-infra';
import { Kafka } from 'kafkajs';
import { KAFKA_CLIENT, KafkaModule } from '../../common/kafka.module';
import { KafkaProducerService } from '../../common/kafka-producer.service';
import { SystemClock } from '../../common/system-clock';
import { AgentsModule } from '../agents/agents.module';
import { AgentsBackedAgentLookup } from './agents-backed-agent-lookup';
import { AssignmentHistoryConsumer } from './assignment-history.consumer';
import { AssignmentHistoryController } from './assignment-history.controller';
import { AssignmentHistoryMessageHandler } from './assignment-history.message-handler';
import { ConversationsController } from './conversations.controller';

/**
 * Wires the conversations feature: ports are bound to MongoDB adapters by
 * `ConversationRepositoryModule` and events go to Kafka through `KafkaEventPublisher`, and the use cases, plain classes without Nest
 * decorators, are assembled here with `useFactory`.
 */
@Module({
  imports: [
    ConversationRepositoryModule,
    AssignmentHistoryRepositoryModule,
    AgentsModule,
    KafkaModule,
  ],
  controllers: [ConversationsController, AssignmentHistoryController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: EVENT_PUBLISHER,
      useFactory: (producer: KafkaProducerService) => new KafkaEventPublisher(producer),
      inject: [KafkaProducerService],
    },
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
    {
      provide: AGENT_LOOKUP,
      useFactory: (getAgent: GetAgentUseCase) => new AgentsBackedAgentLookup(getAgent),
      inject: [GetAgentUseCase],
    },
    {
      provide: AssignConversationUseCase,
      useFactory: (
        conversations: ConversationRepository,
        agents: AgentLookup,
        clock: Clock,
        events: EventPublisher,
        ids: IdGenerator,
      ) => new AssignConversationUseCase(conversations, agents, clock, events, ids),
      inject: [CONVERSATION_REPOSITORY, AGENT_LOOKUP, CLOCK, EVENT_PUBLISHER, ID_GENERATOR],
    },
    {
      provide: UnassignConversationUseCase,
      useFactory: (
        conversations: ConversationRepository,
        clock: Clock,
        events: EventPublisher,
        ids: IdGenerator,
      ) => new UnassignConversationUseCase(conversations, clock, events, ids),
      inject: [CONVERSATION_REPOSITORY, CLOCK, EVENT_PUBLISHER, ID_GENERATOR],
    },
    {
      provide: RecordAssignmentHistoryUseCase,
      useFactory: (history: AssignmentHistoryRepository) =>
        new RecordAssignmentHistoryUseCase(history),
      inject: [ASSIGNMENT_HISTORY_REPOSITORY],
    },
    {
      provide: ListAssignmentHistoryUseCase,
      useFactory: (conversations: ConversationRepository, history: AssignmentHistoryRepository) =>
        new ListAssignmentHistoryUseCase(conversations, history),
      inject: [CONVERSATION_REPOSITORY, ASSIGNMENT_HISTORY_REPOSITORY],
    },
    {
      provide: AssignmentHistoryMessageHandler,
      useFactory: (record: RecordAssignmentHistoryUseCase) =>
        new AssignmentHistoryMessageHandler(record),
      inject: [RecordAssignmentHistoryUseCase],
    },
    {
      provide: AssignmentHistoryConsumer,
      useFactory: (kafka: Kafka, handler: AssignmentHistoryMessageHandler) =>
        new AssignmentHistoryConsumer(kafka, handler),
      inject: [KAFKA_CLIENT, AssignmentHistoryMessageHandler],
    },
    {
      provide: ListConversationsUseCase,
      useFactory: (conversations: ConversationRepository) =>
        new ListConversationsUseCase(conversations),
      inject: [CONVERSATION_REPOSITORY],
    },
  ],
})
export class ConversationsModule {}
