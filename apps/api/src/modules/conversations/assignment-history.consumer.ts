import { Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Consumer } from 'kafkajs';
import { AssignmentHistoryMessageHandler } from './assignment-history.message-handler';

/** The consumer group that records the history. */
export const HISTORY_CONSUMER_GROUP = 'conversation-history';

/** The part of a kafkajs `Kafka` client this consumer uses. */
export type HistoryKafkaClient = { consumer(config: { groupId: string }): Consumer };

/**
 * Reads the conversation events from Kafka and hands each one to the history
 * use case. The second Kafka layer of the design: it reacts to "saved" events.
 *
 * STUB: nothing is consumed yet.
 */
export class AssignmentHistoryConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AssignmentHistoryConsumer.name);

  constructor(
    private readonly kafka: HistoryKafkaClient,
    private readonly handler: Pick<AssignmentHistoryMessageHandler, 'handle'>,
    private readonly options: { retryDelayMs?: number } = {},
  ) {
    void this.kafka;
    void this.handler;
    void this.options;
    void this.logger;
  }

  /** Starts in the background: the API must start even when Kafka is down. */
  onModuleInit(): void {
    // STUB
  }

  /** Connects and runs; while Kafka is unreachable, tries again after a delay. */
  async start(): Promise<void> {
    // STUB
  }

  async onApplicationShutdown(): Promise<void> {
    // STUB
  }
}
