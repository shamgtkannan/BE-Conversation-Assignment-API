import { AssignmentRequested, CONVERSATION_ASSIGNMENT_REQUESTED_V1 } from 'conversations-domain';

/** Thrown when a Kafka message is not an assignment request this service understands. */
export class InvalidRequestMessageError extends Error {
  constructor(readonly reason: string) {
    super(`Not an assignment request: ${reason}`);
    this.name = 'InvalidRequestMessageError';
  }
}

type Fields = Record<string, unknown>;

// shortcut: these two small readers repeat the ones in kafka-event-decoder.ts, which throw a
// different error; share them when a third decoder appears.

/** A field that must be a non-empty string. */
const text = (fields: Fields, name: string): string => {
  const value = fields[name];
  if (typeof value !== 'string' || value === '') {
    throw new InvalidRequestMessageError(`"${name}" must be a non-empty string`);
  }
  return value;
};

/** A timestamp sent as an ISO string. */
const time = (fields: Fields, name: string): Date => {
  const date = new Date(text(fields, name));
  if (Number.isNaN(date.getTime())) {
    throw new InvalidRequestMessageError(`"${name}" must be a date`);
  }
  return date;
};

/**
 * Reads a Kafka message value written by `KafkaAssignmentRequestPublisher` back
 * into a request (the time becomes a `Date` again). Checks the shape, so a stray
 * or damaged message is rejected here instead of being carried out. Fields it does
 * not know are dropped, and an unassign request never keeps an agent id.
 *
 * @throws InvalidRequestMessageError when the value is not a well-formed request.
 */
export function decodeAssignmentRequest(value: string): AssignmentRequested {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new InvalidRequestMessageError('the value is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidRequestMessageError('the value is not a JSON object');
  }
  const fields = parsed as Fields;
  if (fields['type'] !== CONVERSATION_ASSIGNMENT_REQUESTED_V1) {
    throw new InvalidRequestMessageError(`unknown type ${JSON.stringify(fields['type'])}`);
  }

  const common = {
    type: CONVERSATION_ASSIGNMENT_REQUESTED_V1,
    commandId: text(fields, 'commandId'),
    requestedAt: time(fields, 'requestedAt'),
    workspaceId: text(fields, 'workspaceId'),
    conversationId: text(fields, 'conversationId'),
    requestedBy: text(fields, 'requestedBy'),
    role: text(fields, 'role'),
  } as const;

  switch (fields['action']) {
    case 'assign':
      return { ...common, action: 'assign', agentId: text(fields, 'agentId') };
    case 'unassign':
      return { ...common, action: 'unassign' };
    default:
      throw new InvalidRequestMessageError(`unknown action ${JSON.stringify(fields['action'])}`);
  }
}
