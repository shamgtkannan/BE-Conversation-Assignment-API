import { Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Consumer } from 'kafkajs';
import { AssignmentRequestMessageHandler } from './assignment-request.message-handler';

/** The consumer group that carries out assignment requests. */
export const REQUEST_CONSUMER_GROUP = 'conversation-writer';

/** The part of a kafkajs `Kafka` client this consumer uses. */
export type RequestKafkaClient = { consumer(config: { groupId: string }): Consumer };

/**
 * Reads assignment requests from Kafka and hands each one to the handler. The
 * first Kafka layer of the design: it turns a request into a saved change.
 *
 * STUB: nothing is consumed yet.
 */
export class AssignmentRequestConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AssignmentRequestConsumer.name);

  constructor(
    private readonly kafka: RequestKafkaClient,
    private readonly handler: Pick<AssignmentRequestMessageHandler, 'handle'>,
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
