import { CONVERSATION_EVENT_TOPICS } from 'conversations-infra';
import { KafkaTopicConsumer, TopicKafkaClient } from '../../common/kafka-topic-consumer';
import { AssignmentHistoryMessageHandler } from './assignment-history.message-handler';

/** The consumer group that records the history. */
export const HISTORY_CONSUMER_GROUP = 'conversation-history';

/** The part of a kafkajs `Kafka` client this consumer uses. */
export type HistoryKafkaClient = TopicKafkaClient;

/**
 * Reads the conversation events from Kafka and hands each one to the history
 * use case. The second Kafka layer of the design: it reacts to "saved" events.
 *
 * - A new group reads the topics from the beginning, so no event is missed
 *   because the consumer started late; events already recorded are ignored by the
 *   use case.
 * - The connection, retry and shutdown behaviour is {@link KafkaTopicConsumer}'s.
 */
export class AssignmentHistoryConsumer extends KafkaTopicConsumer {
  constructor(
    kafka: HistoryKafkaClient,
    handler: Pick<AssignmentHistoryMessageHandler, 'handle'>,
    options: { retryDelayMs?: number } = {},
  ) {
    super(
      kafka,
      { groupId: HISTORY_CONSUMER_GROUP, topics: CONVERSATION_EVENT_TOPICS, fromBeginning: true },
      handler,
      options,
    );
  }
}
