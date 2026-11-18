import { Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Admin, Producer } from 'kafkajs';
import { KafkaSender } from 'conversations-infra';

/** The part of a kafkajs `Kafka` client this service uses. */
export type KafkaClient = { producer(config: object): Producer; admin(): Admin };

/**
 * The application's single Kafka producer. Connects on first use, not at start,
 * so the API still starts while Kafka is down; a failed attempt is retried on
 * the next send.
 *
 * STUB: nothing is connected or sent yet.
 */
export class KafkaProducerService implements KafkaSender, OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaProducerService.name);

  constructor(
    private readonly kafka: KafkaClient,
    private readonly topics: string[],
  ) {
    void this.kafka;
    void this.topics;
    void this.logger;
  }

  async onModuleInit(): Promise<void> {
    // STUB
  }

  async send(record: Parameters<KafkaSender['send']>[0]): Promise<unknown> {
    void record;
    throw new Error('not implemented');
  }

  async onApplicationShutdown(): Promise<void> {
    // STUB
  }
}
