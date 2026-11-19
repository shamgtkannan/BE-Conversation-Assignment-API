import {
  CONVERSATION_ASSIGNED_V1,
  ConversationEvent,
} from 'conversations-domain';

/** Thrown when a Kafka message is not a conversation event this service understands. */
export class InvalidEventMessageError extends Error {
  constructor(readonly reason: string) {
    super(`Not a conversation event: ${reason}`);
    this.name = 'InvalidEventMessageError';
  }
}

type Fields = Record<string, unknown>;

/** A field that must be a non-empty string. */
const text = (fields: Fields, name: string): string => {
  const value = fields[name];
  if (typeof value !== 'string' || value === '') {
    throw new InvalidEventMessageError(`"${name}" must be a non-empty string`);
  }
  return value;
};

/** A timestamp sent as an ISO string. */
const time = (fields: Fields, name: string): Date => {
  const date = new Date(text(fields, name));
  if (Number.isNaN(date.getTime())) {
    throw new InvalidEventMessageError(`"${name}" must be a date`);
  }
  return date;
};

/** The conversation version after the change: a whole number, 1 or more. */
const version = (fields: Fields): number => {
  const value = fields['version'];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new InvalidEventMessageError('"version" must be a whole number of 1 or more');
  }
  return value;
};

/**
 * Reads a Kafka message value written by `KafkaEventPublisher` back into a
 * conversation event (the time becomes a `Date` again). Checks the shape, so a
 * stray or damaged message is rejected here instead of being stored. Fields it
 * does not know are dropped, so a newer producer does not break this consumer.
 *
 * @throws InvalidEventMessageError when the value is not a well-formed event.
 */
export function decodeConversationEvent(value: string): ConversationEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new InvalidEventMessageError('the value is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidEventMessageError('the value is not a JSON object');
  }
  const fields = parsed as Fields;

  const common = {
    eventId: text(fields, 'eventId'),
    occurredAt: time(fields, 'occurredAt'),
    workspaceId: text(fields, 'workspaceId'),
    conversationId: text(fields, 'conversationId'),
    version: version(fields),
  };

  switch (fields['type']) {
    case CONVERSATION_ASSIGNED_V1:
      return {
        type: CONVERSATION_ASSIGNED_V1,
        ...common,
        // null means nobody was assigned before.
        previousAgentId: fields['previousAgentId'] === null ? null : text(fields, 'previousAgentId'),
        agentId: text(fields, 'agentId'),
        assignedBy: text(fields, 'assignedBy'),
      };
    default:
      throw new InvalidEventMessageError(`unknown event type ${JSON.stringify(fields['type'])}`);
  }
}
