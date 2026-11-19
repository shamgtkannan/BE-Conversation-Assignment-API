import {
  AssignmentRequestPublisher,
} from 'conversations-application';
import { AssignmentRequested, CONVERSATION_ASSIGNMENT_REQUESTED_V1 } from 'conversations-domain';
import { KafkaSender } from './kafka-event-publisher';

/** The Kafka topics assignment requests are published to. */
export const ASSIGNMENT_REQUEST_TOPICS = [CONVERSATION_ASSIGNMENT_REQUESTED_V1];

/**
 * {@link AssignmentRequestPublisher} that writes each request to Kafka.
 *
 * STUB: nothing is sent yet.
 */
export class KafkaAssignmentRequestPublisher implements AssignmentRequestPublisher {
  constructor(private readonly sender: KafkaSender) {
    void this.sender;
  }

  async publish(request: AssignmentRequested): Promise<void> {
    void request;
  }
}
