import { AssignmentRequestPublisher } from 'conversations-application';
import { AssignmentRequested, CONVERSATION_ASSIGNMENT_REQUESTED_V1 } from 'conversations-domain';
import { KafkaSender } from './kafka-event-publisher';

/** The Kafka topics assignment requests are published to. */
export const ASSIGNMENT_REQUEST_TOPICS = [CONVERSATION_ASSIGNMENT_REQUESTED_V1];

/**
 * {@link AssignmentRequestPublisher} that writes each request to Kafka.
 *
 * - The topic is the request type.
 * - The message key is the conversation id: Kafka keeps messages with one key in
 *   one partition, in order, so the requests for one conversation are carried out
 *   one at a time, in the order they were made.
 * - The value is the whole request as JSON (the time becomes an ISO string). The
 *   command id and type are also headers.
 * - `acks: -1` makes the send succeed only once every in-sync replica has the message.
 *
 * When Kafka cannot take the request, `publish` rejects, so the caller knows it was not sent.
 */
export class KafkaAssignmentRequestPublisher implements AssignmentRequestPublisher {
  constructor(private readonly sender: KafkaSender) {}

  async publish(request: AssignmentRequested): Promise<void> {
    await this.sender.send({
      topic: request.type,
      acks: -1,
      messages: [
        {
          key: request.conversationId,
          value: JSON.stringify(request),
          headers: { commandId: request.commandId, type: request.type },
        },
      ],
    });
  }
}
