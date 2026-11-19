import { Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { CONVERSATION_EVENT_TOPICS } from 'conversations-infra';
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
 * - One group, so each event is handled by one running copy of the API.
 * - A new group reads the topics from the beginning, so no event is missed
 *   because the consumer started late; events already recorded are ignored by the
 *   use case.
 * - Starts in the background, so the API starts while Kafka is down; until Kafka
 *   is back it keeps trying.
 * - A message the handler fails on is not committed: Kafka delivers it again.
 */
export class AssignmentHistoryConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AssignmentHistoryConsumer.name);
  private consumer?: Consumer;
  private stopped = false;

  constructor(
    private readonly kafka: HistoryKafkaClient,
    private readonly handler: Pick<AssignmentHistoryMessageHandler, 'handle'>,
    private readonly options: { retryDelayMs?: number } = {},
  ) {}

  /** Starts in the background: the API must start even when Kafka is down. */
  onModuleInit(): void {
    void this.start();
  }

  /** Connects and runs; while Kafka is unreachable, tries again after a delay. */
  async start(): Promise<void> {
    const retryDelayMs = this.options.retryDelayMs ?? 5000;
    while (!this.stopped) {
      const consumer = this.kafka.consumer({ groupId: HISTORY_CONSUMER_GROUP });
      try {
        await consumer.connect();
        if (this.stopped) {
          await consumer.disconnect();
          return;
        }
        await consumer.subscribe({ topics: CONVERSATION_EVENT_TOPICS, fromBeginning: true });
        await consumer.run({
          eachMessage: async ({ message }) => this.handler.handle(message.value),
        });
        this.consumer = consumer;
        return;
      } catch (error) {
        this.logger.warn(`Cannot consume yet, trying again in ${retryDelayMs} ms: ${String(error)}`);
        await consumer.disconnect().catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.consumer) {
      const consumer = this.consumer;
      this.consumer = undefined;
      await consumer.disconnect();
    }
  }
}
