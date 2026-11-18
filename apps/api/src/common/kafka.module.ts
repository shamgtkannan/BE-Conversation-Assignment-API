import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CONVERSATION_EVENT_TOPICS } from 'conversations-infra';
import { Kafka, logLevel } from 'kafkajs';
import { KafkaProducerService } from './kafka-producer.service';

/**
 * The application's Kafka connection, built from environment variables.
 *
 * `KAFKA_BROKERS` (comma-separated `host:port`) says where the cluster is, so it
 * has no default and the app refuses to start without it. `KAFKA_CLIENT_ID` is
 * operational and defaults to `conversation-assignment-api`.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: KafkaProducerService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new KafkaProducerService(
          new Kafka({
            clientId: config.get<string>('KAFKA_CLIENT_ID') ?? 'conversation-assignment-api',
            brokers: config.getOrThrow<string>('KAFKA_BROKERS').split(','),
            // Fail fast with a clear error when Kafka is not running.
            connectionTimeout: 3000,
            requestTimeout: 5000,
            retry: { retries: 2, initialRetryTime: 100 },
            logLevel: logLevel.ERROR,
          }),
          CONVERSATION_EVENT_TOPICS,
        ),
    },
  ],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
