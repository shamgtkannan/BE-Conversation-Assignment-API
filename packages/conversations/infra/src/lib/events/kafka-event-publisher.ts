import { EventPublisher } from 'conversations-application';
import {
  CONVERSATION_ASSIGNED_V1,
  CONVERSATION_UNASSIGNED_V1,
  ConversationEvent,
} from 'conversations-domain';

/** The Kafka topics conversation events are published to: one per event type. */
export const CONVERSATION_EVENT_TOPICS = [CONVERSATION_ASSIGNED_V1, CONVERSATION_UNASSIGNED_V1];

/** What the publisher needs from a Kafka producer; kafkajs' `Producer` satisfies it. */
export interface KafkaSender {
  send(record: {
    topic: string;
    /** `-1`: every in-sync replica must have the message before the send succeeds. */
    acks?: number;
    messages: { key: string; value: string; headers?: Record<string, string> }[];
  }): Promise<unknown>;
}

/**
 * {@link EventPublisher} that writes each conversation event to Kafka.
 *
 * STUB: nothing is sent yet.
 */
export class KafkaEventPublisher implements EventPublisher {
  constructor(private readonly sender: KafkaSender) {}

  async publish(event: ConversationEvent): Promise<void> {
    void event;
  }
}
