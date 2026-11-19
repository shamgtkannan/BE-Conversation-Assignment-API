import { AssignRequested, UnassignRequested } from 'conversations-domain';
import { KafkaSender } from './kafka-event-publisher';
import { ASSIGNMENT_REQUEST_TOPICS, KafkaAssignmentRequestPublisher } from './kafka-assignment-request-publisher';

const assign: AssignRequested = {
  type: 'conversation.assignment-requested.v1',
  commandId: 'command_1',
  requestedAt: new Date('2026-11-13T09:00:00.000Z'),
  workspaceId: 'workspace_1',
  conversationId: '65f1a2b3c4d5e6f708091a2b',
  action: 'assign',
  agentId: '65f1a2b3c4d5e6f708091a2c',
  requestedBy: 'user_1',
  role: 'manager',
};

const unassign: UnassignRequested = {
  type: 'conversation.assignment-requested.v1',
  commandId: 'command_2',
  requestedAt: new Date('2026-11-13T10:00:00.000Z'),
  workspaceId: 'workspace_1',
  conversationId: '65f1a2b3c4d5e6f708091a2b',
  action: 'unassign',
  requestedBy: 'user_2',
  role: 'admin',
};

describe('KafkaAssignmentRequestPublisher', () => {
  let send: jest.Mock;
  let publisher: KafkaAssignmentRequestPublisher;

  beforeEach(() => {
    send = jest.fn().mockResolvedValue(undefined);
    publisher = new KafkaAssignmentRequestPublisher({ send } as KafkaSender);
  });

  it('has one topic for assignment requests', () => {
    expect(ASSIGNMENT_REQUEST_TOPICS).toEqual(['conversation.assignment-requested.v1']);
  });

  it('sends the request to the conversation.assignment-requested.v1 topic', async () => {
    await publisher.publish(assign);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ topic: 'conversation.assignment-requested.v1' });
  });

  it('keys the message by conversation id, so the requests of one conversation are carried out in order', async () => {
    await publisher.publish(assign);

    expect(send.mock.calls[0][0].messages).toHaveLength(1);
    expect(send.mock.calls[0][0].messages[0].key).toBe('65f1a2b3c4d5e6f708091a2b');
  });

  it('waits for every in-sync replica (acks = -1)', async () => {
    await publisher.publish(assign);

    expect(send.mock.calls[0][0].acks).toBe(-1);
  });

  it('sends the whole request as JSON, with the time as an ISO string', async () => {
    await publisher.publish(assign);

    expect(JSON.parse(send.mock.calls[0][0].messages[0].value)).toEqual({
      ...assign,
      requestedAt: '2026-11-13T09:00:00.000Z',
    });
  });

  it('sends an unassign request, which has no agent', async () => {
    await publisher.publish(unassign);

    const value = JSON.parse(send.mock.calls[0][0].messages[0].value);
    expect(value).toMatchObject({ action: 'unassign', requestedBy: 'user_2' });
    expect(value).not.toHaveProperty('agentId');
  });

  it('puts the command id and type in the headers', async () => {
    await publisher.publish(unassign);

    expect(send.mock.calls[0][0].messages[0].headers).toEqual({
      commandId: 'command_2',
      type: 'conversation.assignment-requested.v1',
    });
  });

  it('fails when Kafka cannot take the request, so the caller knows it was not sent', async () => {
    send.mockRejectedValue(new Error('broker not available'));

    await expect(publisher.publish(assign)).rejects.toThrow('broker not available');
  });
});
