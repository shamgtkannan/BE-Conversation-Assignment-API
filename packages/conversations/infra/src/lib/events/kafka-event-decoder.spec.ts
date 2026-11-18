import {
  CONVERSATION_ASSIGNED_V1,
  CONVERSATION_UNASSIGNED_V1,
  ConversationAssigned,
  ConversationUnassigned,
} from 'conversations-domain';
import { InvalidEventMessageError, decodeConversationEvent } from './kafka-event-decoder';

const assigned: ConversationAssigned = {
  type: CONVERSATION_ASSIGNED_V1,
  eventId: 'event_1',
  occurredAt: new Date('2026-11-13T09:00:00.000Z'),
  workspaceId: 'workspace_1',
  conversationId: '65f1a2b3c4d5e6f708091a2b',
  previousAgentId: null,
  agentId: '65f1a2b3c4d5e6f708091a2c',
  assignedBy: 'user_1',
  version: 1,
};

const unassigned: ConversationUnassigned = {
  type: CONVERSATION_UNASSIGNED_V1,
  eventId: 'event_2',
  occurredAt: new Date('2026-11-13T10:00:00.000Z'),
  workspaceId: 'workspace_1',
  conversationId: '65f1a2b3c4d5e6f708091a2b',
  previousAgentId: '65f1a2b3c4d5e6f708091a2c',
  unassignedBy: 'user_2',
  version: 2,
};

const wire = (event: object) => JSON.stringify(event);

describe('decodeConversationEvent', () => {
  it('reads back an assigned event, with the time as a Date again', () => {
    expect(decodeConversationEvent(wire(assigned))).toEqual(assigned);
    expect(decodeConversationEvent(wire(assigned)).occurredAt).toBeInstanceOf(Date);
  });

  it('keeps previousAgentId null when nobody was assigned before', () => {
    const event = decodeConversationEvent(wire(assigned)) as ConversationAssigned;

    expect(event.previousAgentId).toBeNull();
  });

  it('reads back a reassignment, which names the replaced agent', () => {
    const reassigned = { ...assigned, previousAgentId: '65f1a2b3c4d5e6f708091a2d', version: 2 };

    expect(decodeConversationEvent(wire(reassigned))).toEqual(reassigned);
  });

  it('reads back an unassigned event', () => {
    expect(decodeConversationEvent(wire(unassigned))).toEqual(unassigned);
  });

  it('ignores fields it does not know, so a newer producer does not break an older consumer', () => {
    const decoded = decodeConversationEvent(wire({ ...assigned, somethingNew: 'x' }));

    expect(decoded).toEqual(assigned);
    expect(decoded).not.toHaveProperty('somethingNew');
  });

  describe('rejects a message that is not a well-formed event', () => {
    const rejects = (value: string) =>
      expect(() => decodeConversationEvent(value)).toThrow(InvalidEventMessageError);

    it.each([
      ['text that is not JSON', 'not json'],
      ['an empty value', ''],
      ['JSON null', 'null'],
      ['a JSON array', '[]'],
      ['a JSON string', '"hello"'],
      ['an object without a type', wire({ ...assigned, type: undefined })],
      ['an unknown event type', wire({ ...assigned, type: 'conversation.closed.v1' })],
    ])('%s', (_label, value) => rejects(value));

    it.each(['eventId', 'occurredAt', 'workspaceId', 'conversationId', 'agentId', 'assignedBy', 'version'])(
      'an assigned event without %s',
      (field) => rejects(wire({ ...assigned, [field]: undefined })),
    );

    it.each(['eventId', 'occurredAt', 'workspaceId', 'conversationId', 'previousAgentId', 'unassignedBy', 'version'])(
      'an unassigned event without %s',
      (field) => rejects(wire({ ...unassigned, [field]: undefined })),
    );

    it.each([
      ['an empty event id', { eventId: '' }],
      ['an empty workspace id', { workspaceId: '' }],
      ['an empty agent id', { agentId: '' }],
      ['an event id that is a number', { eventId: 5 }],
      ['a time that is not a date', { occurredAt: 'yesterday' }],
      ['a time that is a number', { occurredAt: 1763000000000 }],
      ['a version that is a string', { version: '1' }],
      ['a version of 0', { version: 0 }],
      ['a version that is not whole', { version: 1.5 }],
      ['a previous agent that is a number', { previousAgentId: 7 }],
    ])('an assigned event with %s', (_label, overrides) => rejects(wire({ ...assigned, ...overrides })));

    it('an unassigned event whose previous agent is null, because it must name who was removed', () => {
      rejects(wire({ ...unassigned, previousAgentId: null }));
    });
  });

  it('says why a message was rejected', () => {
    expect(() => decodeConversationEvent('not json')).toThrow(/Not a conversation event/);
  });
});
