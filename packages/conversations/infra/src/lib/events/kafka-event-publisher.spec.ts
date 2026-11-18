import {
  CONVERSATION_ASSIGNED_V1,
  CONVERSATION_UNASSIGNED_V1,
  ConversationAssigned,
  ConversationUnassigned,
} from 'conversations-domain';
import { CONVERSATION_EVENT_TOPICS, KafkaEventPublisher, KafkaSender } from './kafka-event-publisher';

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

describe('KafkaEventPublisher', () => {
  let send: jest.Mock;
  let publisher: KafkaEventPublisher;

  beforeEach(() => {
    send = jest.fn().mockResolvedValue(undefined);
    publisher = new KafkaEventPublisher({ send } as KafkaSender);
  });

  it('has one topic per event type', () => {
    expect(CONVERSATION_EVENT_TOPICS).toEqual(['conversation.assigned.v1', 'conversation.unassigned.v1']);
  });

  it('sends an assigned event to the conversation.assigned.v1 topic', async () => {
    await publisher.publish(assigned);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ topic: 'conversation.assigned.v1' });
  });

  it('sends an unassigned event to the conversation.unassigned.v1 topic', async () => {
    await publisher.publish(unassigned);

    expect(send.mock.calls[0][0]).toMatchObject({ topic: 'conversation.unassigned.v1' });
  });

  it('keys the message by conversation id, so one conversation stays in order', async () => {
    await publisher.publish(assigned);

    expect(send.mock.calls[0][0].messages).toHaveLength(1);
    expect(send.mock.calls[0][0].messages[0].key).toBe('65f1a2b3c4d5e6f708091a2b');
  });

  it('waits for every in-sync replica (acks = -1)', async () => {
    await publisher.publish(assigned);

    expect(send.mock.calls[0][0].acks).toBe(-1);
  });

  it('sends the whole event as JSON, with the time as an ISO string', async () => {
    await publisher.publish(assigned);

    expect(JSON.parse(send.mock.calls[0][0].messages[0].value)).toEqual({
      ...assigned,
      occurredAt: '2026-11-13T09:00:00.000Z',
    });
  });

  it('keeps previousAgentId as null in the message when nobody was assigned', async () => {
    await publisher.publish(assigned);

    expect(JSON.parse(send.mock.calls[0][0].messages[0].value).previousAgentId).toBeNull();
  });

  it('puts the event id and type in the headers, so a consumer can read them without parsing', async () => {
    await publisher.publish(unassigned);

    expect(send.mock.calls[0][0].messages[0].headers).toEqual({
      eventId: 'event_2',
      type: 'conversation.unassigned.v1',
    });
  });

  it('fails when Kafka cannot take the event, so the caller knows it was not sent', async () => {
    send.mockRejectedValue(new Error('broker not available'));

    await expect(publisher.publish(assigned)).rejects.toThrow('broker not available');
  });
});
