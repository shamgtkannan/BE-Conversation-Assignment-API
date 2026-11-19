import { ASSIGNMENT_REQUEST_TOPICS } from 'conversations-infra';
import { KafkaTopicConsumer, TopicKafkaClient } from '../../common/kafka-topic-consumer';
import { AssignmentRequestMessageHandler } from './assignment-request.message-handler';

/** The consumer group that carries out assignment requests. */
export const REQUEST_CONSUMER_GROUP = 'conversation-writer';

/** The part of a kafkajs `Kafka` client this consumer uses. */
export type RequestKafkaClient = TopicKafkaClient;

/**
 * Reads assignment requests from Kafka and hands each one to the handler. The
 * first Kafka layer of the design: it turns a request into a saved change.
 *
 * - A new group starts at the newest message, never at the beginning: a request
 *   changes data, so requests from long ago must not be carried out again.
 * - The connection, retry and shutdown behaviour is {@link KafkaTopicConsumer}'s.
 */
export class AssignmentRequestConsumer extends KafkaTopicConsumer {
  constructor(
    kafka: RequestKafkaClient,
    handler: Pick<AssignmentRequestMessageHandler, 'handle'>,
    options: { retryDelayMs?: number } = {},
  ) {
    super(
      kafka,
      { groupId: REQUEST_CONSUMER_GROUP, topics: ASSIGNMENT_REQUEST_TOPICS, fromBeginning: false },
      handler,
      options,
    );
  }
}
