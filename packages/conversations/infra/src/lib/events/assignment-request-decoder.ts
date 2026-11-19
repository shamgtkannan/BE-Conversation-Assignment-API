import { AssignmentRequested } from 'conversations-domain';

/** Thrown when a Kafka message is not an assignment request this service understands. */
export class InvalidRequestMessageError extends Error {
  constructor(readonly reason: string) {
    super(`Not an assignment request: ${reason}`);
    this.name = 'InvalidRequestMessageError';
  }
}

/**
 * Reads a Kafka message value written by `KafkaAssignmentRequestPublisher` back
 * into a request (the time becomes a `Date` again). Checks the shape, so a stray
 * or damaged message is rejected here instead of being carried out.
 *
 * STUB: not implemented yet.
 *
 * @throws InvalidRequestMessageError when the value is not a well-formed request.
 */
export function decodeAssignmentRequest(value: string): AssignmentRequested {
  void value;
  throw new Error('not implemented');
}
