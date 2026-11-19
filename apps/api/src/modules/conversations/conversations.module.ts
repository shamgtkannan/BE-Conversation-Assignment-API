import { Module } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import {
  AGENT_LOOKUP,
  ASSIGNMENT_HISTORY_REPOSITORY,
  ASSIGNMENT_REQUEST_PUBLISHER,
  AgentLookup,
  AnnounceAssignmentUseCase,
  AssignConversationUseCase,
  AssignmentHistoryRepository,
  AssignmentRequestPublisher,
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
  RequestAssignmentUseCase,
  UnassignConversationUseCase,
} from 'conversations-application';
import { GetAgentUseCase } from 'agents-application';
import {
  AssignmentHistoryRepositoryModule,
  ConversationChangeWatcher,
  ConversationDo,
  ConversationRepositoryModule,
  KafkaAssignmentRequestPublisher,
  KafkaEventPublisher,
  openConversationChangeStream,
} from 'conversations-infra';
import { Kafka } from 'kafkajs';
import * as mongoose from 'mongoose';
import { KAFKA_CLIENT, KafkaModule } from '../../common/kafka.module';
import { KafkaProducerService } from '../../common/kafka-producer.service';
import { SystemClock } from '../../common/system-clock';
import { AgentsModule } from '../agents/agents.module';
import { AgentsBackedAgentLookup } from './agents-backed-agent-lookup';
import { AssignmentController } from './assignment.controller';
import { AssignmentHistoryConsumer } from './assignment-history.consumer';
import { AssignmentHistoryController } from './assignment-history.controller';
import { AssignmentHistoryMessageHandler } from './assignment-history.message-handler';
import { AssignmentRequestConsumer } from './assignment-request.consumer';
import { AssignmentRequestMessageHandler } from './assignment-request.message-handler';
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
  controllers: [ConversationsController, AssignmentController, AssignmentHistoryController],
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
      useFactory: (conversations: ConversationRepository, agents: AgentLookup, clock: Clock) =>
        new AssignConversationUseCase(conversations, agents, clock),
      inject: [CONVERSATION_REPOSITORY, AGENT_LOOKUP, CLOCK],
    },
    {
      provide: UnassignConversationUseCase,
      useFactory: (conversations: ConversationRepository, clock: Clock) =>
        new UnassignConversationUseCase(conversations, clock),
      inject: [CONVERSATION_REPOSITORY, CLOCK],
    },
    {
      provide: AnnounceAssignmentUseCase,
      useFactory: (events: EventPublisher) => new AnnounceAssignmentUseCase(events),
      inject: [EVENT_PUBLISHER],
    },
    {
      // Where assignment events come from: every change to a conversation in MongoDB, whoever
      // makes it, is read from the change stream and announced if it assigned an agent.
      provide: ConversationChangeWatcher,
      useFactory: (model: mongoose.Model<ConversationDo>, announce: AnnounceAssignmentUseCase) =>
        new ConversationChangeWatcher(
          () => openConversationChangeStream(model),
          (change) => announce.execute(change),
        ),
      inject: [getModelToken(ConversationDo.name), AnnounceAssignmentUseCase],
    },
    {
      provide: ASSIGNMENT_REQUEST_PUBLISHER,
      useFactory: (producer: KafkaProducerService) => new KafkaAssignmentRequestPublisher(producer),
      inject: [KafkaProducerService],
    },
    {
      provide: RequestAssignmentUseCase,
      useFactory: (
        requests: AssignmentRequestPublisher,
        conversations: ConversationRepository,
        agents: AgentLookup,
        clock: Clock,
        ids: IdGenerator,
      ) => new RequestAssignmentUseCase(requests, conversations, agents, clock, ids),
      inject: [
        ASSIGNMENT_REQUEST_PUBLISHER,
        CONVERSATION_REPOSITORY,
        AGENT_LOOKUP,
        CLOCK,
        ID_GENERATOR,
      ],
    },
    {
      provide: AssignmentRequestMessageHandler,
      useFactory: (assign: AssignConversationUseCase, unassign: UnassignConversationUseCase) =>
        new AssignmentRequestMessageHandler(assign, unassign),
      inject: [AssignConversationUseCase, UnassignConversationUseCase],
    },
    {
      provide: AssignmentRequestConsumer,
      useFactory: (kafka: Kafka, handler: AssignmentRequestMessageHandler) =>
        new AssignmentRequestConsumer(kafka, handler),
      inject: [KAFKA_CLIENT, AssignmentRequestMessageHandler],
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
