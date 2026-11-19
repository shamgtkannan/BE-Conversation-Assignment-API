import { Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Consumer } from 'kafkajs';

/** The part of a kafkajs `Kafka` client a consumer uses. */
export type TopicKafkaClient = { consumer(config: { groupId: string }): Consumer };

/** What a consumer reads, and how it joins. */
export interface TopicConsumerConfig {
  /** The consumer group: each message is handled by one running member of it. */
  groupId: string;
  topics: string[];
  /** Whether a group that has no saved position yet starts at the oldest message (true) or at new ones (false). */
  fromBeginning: boolean;
}

/**
 * Reads messages from Kafka topics and hands each value to a handler.
 *
 * - Starts in the background, so the API starts while Kafka is down; until Kafka
 *   is back it keeps trying, with a fresh consumer each time.
 * - A message the handler fails on is not committed: Kafka delivers it again.
 * - `ready` resolves once the consumer is running, so a test can wait for it.
 */
export class KafkaTopicConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger: Logger;
  private consumer?: Consumer;
  private stopped = false;
  private markReady!: () => void;

  /** Resolves when the consumer has joined its group and is reading. */
  readonly ready = new Promise<void>((resolve) => (this.markReady = resolve));

  constructor(
    private readonly kafka: TopicKafkaClient,
    private readonly config: TopicConsumerConfig,
    private readonly handler: { handle(value: Buffer | null): Promise<void> },
    private readonly options: { retryDelayMs?: number } = {},
  ) {
    this.logger = new Logger(`${KafkaTopicConsumer.name}:${config.groupId}`);
  }

  /** Starts in the background: the API must start even when Kafka is down. */
  onModuleInit(): void {
    void this.start();
  }

  /** Connects and runs; while Kafka is unreachable, tries again after a delay. */
  async start(): Promise<void> {
    const retryDelayMs = this.options.retryDelayMs ?? 5000;
    while (!this.stopped) {
      const consumer = this.kafka.consumer({ groupId: this.config.groupId });
      try {
        await consumer.connect();
        if (this.stopped) {
          await consumer.disconnect();
          return;
        }
        await consumer.subscribe({
          topics: this.config.topics,
          fromBeginning: this.config.fromBeginning,
        });
        await consumer.run({
          eachMessage: async ({ message }) => this.handler.handle(message.value),
        });
        this.consumer = consumer;
        this.markReady();
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
