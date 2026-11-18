import { Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Admin, Producer } from 'kafkajs';
import { KafkaSender, ensureTopics } from 'conversations-infra';

/** The part of a kafkajs `Kafka` client this service uses. */
export type KafkaClient = { producer(config: object): Producer; admin(): Admin };

/**
 * The application's single Kafka producer.
 *
 * - Idempotent with one request in flight, so Kafka's own retries can neither
 *   duplicate nor reorder a message.
 * - Connects (and creates the topics) on first use, not at start, so the API still
 *   starts while Kafka is down. A failed attempt is forgotten and retried on the next send.
 * - `send` fails when Kafka cannot take the message; the caller decides what that means.
 */
export class KafkaProducerService implements KafkaSender, OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly producer: Producer;
  private ready?: Promise<void>;
  private connected = false;

  constructor(
    private readonly kafka: KafkaClient,
    private readonly topics: string[],
  ) {
    this.producer = kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
  }

  /** Connects early when Kafka is up; when it is not, the start goes on and the first send retries. */
  async onModuleInit(): Promise<void> {
    try {
      await this.connect();
    } catch (error) {
      this.logger.warn(`Kafka is not reachable yet, will retry on the first send: ${String(error)}`);
    }
  }

  async send(record: Parameters<KafkaSender['send']>[0]): Promise<unknown> {
    await this.connect();
    return this.producer.send(record);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.connected) {
      this.connected = false;
      await this.producer.disconnect();
    }
  }

  /** One shared attempt, so sends made at the same time do not each connect. */
  private connect(): Promise<void> {
    this.ready ??= (async () => {
      await ensureTopics(this.kafka.admin(), this.topics);
      await this.producer.connect();
      this.connected = true;
    })().catch((error: unknown) => {
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }
}
