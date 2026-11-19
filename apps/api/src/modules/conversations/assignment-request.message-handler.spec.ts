import {
  AssignedAgentNotFoundError,
  AssignRequested,
  AssignmentNotPermittedError,
  ConversationClosedError,
  ConversationConcurrentModificationError,
  ConversationNotFoundError,
  InvalidConversationError,
  UnassignRequested,
} from 'conversations-domain';
import { AssignmentRequestMessageHandler } from './assignment-request.message-handler';

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

const message = (value: unknown) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));

describe('AssignmentRequestMessageHandler', () => {
  let assignUseCase: { execute: jest.Mock };
  let unassignUseCase: { execute: jest.Mock };
  let handler: AssignmentRequestMessageHandler;

  beforeEach(() => {
    assignUseCase = { execute: jest.fn().mockResolvedValue({}) };
    unassignUseCase = { execute: jest.fn().mockResolvedValue({}) };
    handler = new AssignmentRequestMessageHandler(assignUseCase, unassignUseCase);
  });

  describe('carries out a request', () => {
    it('hands an assign request to the assign use case, as the user who asked', async () => {
      await handler.handle(message(assign));

      expect(assignUseCase.execute).toHaveBeenCalledTimes(1);
      expect(assignUseCase.execute).toHaveBeenCalledWith({
        workspaceId: 'workspace_1',
        userId: 'user_1',
        role: 'manager',
        conversationId: '65f1a2b3c4d5e6f708091a2b',
        agentId: '65f1a2b3c4d5e6f708091a2c',
      });
      expect(unassignUseCase.execute).not.toHaveBeenCalled();
    });

    it('hands an unassign request to the unassign use case', async () => {
      await handler.handle(message(unassign));

      expect(unassignUseCase.execute).toHaveBeenCalledWith({
        workspaceId: 'workspace_1',
        role: 'admin',
        conversationId: '65f1a2b3c4d5e6f708091a2b',
      });
      expect(assignUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('finishes a request the use case refuses on business grounds, without failing', () => {
    it.each([
      ['a role that may not assign', new AssignmentNotPermittedError('agent')],
      ['a malformed id', new InvalidConversationError('id', 'Conversation id must be 24 lowercase hexadecimal characters')],
      ['a conversation that does not exist', new ConversationNotFoundError('65f1a2b3c4d5e6f708091a2b')],
      ['an agent that does not exist', new AssignedAgentNotFoundError('65f1a2b3c4d5e6f708091a2c')],
      ['a closed conversation', new ConversationClosedError('65f1a2b3c4d5e6f708091a2b')],
    ])('%s', async (_label, error) => {
      assignUseCase.execute.mockRejectedValue(error);

      await expect(handler.handle(message(assign))).resolves.toBeUndefined();
    });

    it('also when an unassign is refused', async () => {
      unassignUseCase.execute.mockRejectedValue(new ConversationNotFoundError('65f1a2b3c4d5e6f708091a2b'));

      await expect(handler.handle(message(unassign))).resolves.toBeUndefined();
    });
  });

  describe('fails, so the message is delivered again and carried out later', () => {
    it('when another request changed the conversation first', async () => {
      assignUseCase.execute.mockRejectedValue(new ConversationConcurrentModificationError('65f1a2b3c4d5e6f708091a2b'));

      await expect(handler.handle(message(assign))).rejects.toBeInstanceOf(ConversationConcurrentModificationError);
    });

    it('when the database is down', async () => {
      unassignUseCase.execute.mockRejectedValue(new Error('database is down'));

      await expect(handler.handle(message(unassign))).rejects.toThrow('database is down');
    });
  });

  describe('skips what it cannot use, without failing, so the messages behind it are not blocked', () => {
    it.each([
      ['text that is not JSON', message('not json')],
      ['JSON that is not a request', message({ hello: 'world' })],
      ['a request of an action it does not know', message({ ...assign, action: 'close' })],
      ['a request with a damaged field', message({ ...assign, commandId: 5 })],
      ['an event, not a request', message({ ...assign, type: 'conversation.assigned.v1' })],
      ['an empty message (a tombstone)', null],
    ])('%s', async (_label, value) => {
      await expect(handler.handle(value)).resolves.toBeUndefined();

      expect(assignUseCase.execute).not.toHaveBeenCalled();
      expect(unassignUseCase.execute).not.toHaveBeenCalled();
    });
  });
});
