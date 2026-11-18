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
 * - The topic is the event type, so each kind of event has its own topic.
 * - The message key is the conversation id: Kafka keeps messages with one key in
 *   one partition, in order, so a conversation's events are read in the order they happened.
 * - The value is the whole event as JSON (dates become ISO strings). The event id and
 *   type are also headers, so a consumer can read them without parsing the value.
 * - `acks: -1` makes the send succeed only once every in-sync replica has the message.
 *
 * When Kafka cannot take the event, `publish` rejects, so the caller knows it was not sent.
 */
export class KafkaEventPublisher implements EventPublisher {
  constructor(private readonly sender: KafkaSender) {}

  async publish(event: ConversationEvent): Promise<void> {
    await this.sender.send({
      topic: event.type,
      acks: -1,
      messages: [
        {
          key: event.conversationId,
          value: JSON.stringify(event),
          headers: { eventId: event.eventId, type: event.type },
        },
      ],
    });
  }
}
