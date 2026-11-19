import { CONVERSATION_ASSIGNED_V1, ConversationAssigned } from 'conversations-domain';
import { AssignmentHistoryMessageHandler } from './assignment-history.message-handler';

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

const message = (value: unknown) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));

describe('AssignmentHistoryMessageHandler', () => {
  let execute: jest.Mock;
  let handler: AssignmentHistoryMessageHandler;

  beforeEach(() => {
    execute = jest.fn().mockResolvedValue(true);
    handler = new AssignmentHistoryMessageHandler({ execute });
  });

  it('hands an assigned event to the use case, with the time as a Date', async () => {
    await handler.handle(message(assigned));

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(assigned);
  });

  it('is fine when the event was already recorded (the use case answers false)', async () => {
    execute.mockResolvedValue(false);

    await expect(handler.handle(message(assigned))).resolves.toBeUndefined();
  });

  describe('skips what it cannot use, without failing, so the messages behind it are not blocked', () => {
    it.each([
      ['text that is not JSON', message('not json')],
      ['JSON that is not an event', message({ hello: 'world' })],
      ['an event of a type it does not know', message({ ...assigned, type: 'conversation.closed.v1' })],
      [
        'an unassigned event, which is no longer produced',
        message({
          type: 'conversation.unassigned.v1',
          eventId: 'event_2',
          occurredAt: '2026-11-13T10:00:00.000Z',
          workspaceId: 'workspace_1',
          conversationId: '65f1a2b3c4d5e6f708091a2b',
          previousAgentId: '65f1a2b3c4d5e6f708091a2c',
          unassignedBy: 'user_2',
          version: 2,
        }),
      ],
      ['an event with a damaged field', message({ ...assigned, version: 'one' })],
      ['an empty message (a tombstone)', null],
    ])('%s', async (_label, value) => {
      await expect(handler.handle(value)).resolves.toBeUndefined();

      expect(execute).not.toHaveBeenCalled();
    });
  });

  it('fails when recording fails, so the message is delivered again later', async () => {
    execute.mockRejectedValue(new Error('database is down'));

    await expect(handler.handle(message(assigned))).rejects.toThrow('database is down');
  });
});
