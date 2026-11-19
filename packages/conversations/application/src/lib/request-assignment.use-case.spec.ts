import { AssignmentNotPermittedError, InvalidConversationError } from 'conversations-domain';
import { RequestAssignmentCommand, RequestAssignmentUseCase } from './request-assignment.use-case';
import { InMemoryAssignmentRequestPublisher } from './testing/in-memory-assignment-request-publisher';

const id = (n: number) => n.toString(16).padStart(24, '0');
const now = new Date('2026-11-13T09:00:00.000Z');
const conversationId = id(1);
const agentId = id(100);

describe('RequestAssignmentUseCase', () => {
  let publisher: InMemoryAssignmentRequestPublisher;
  let counter: number;
  let useCase: RequestAssignmentUseCase;

  const assign = (overrides: Partial<RequestAssignmentCommand> = {}): RequestAssignmentCommand =>
    ({
      action: 'assign',
      workspaceId: 'workspace_1',
      userId: 'user_1',
      role: 'manager',
      conversationId,
      agentId,
      ...overrides,
    }) as RequestAssignmentCommand;
  const unassign = (overrides: Partial<RequestAssignmentCommand> = {}): RequestAssignmentCommand =>
    ({
      action: 'unassign',
      workspaceId: 'workspace_1',
      userId: 'user_1',
      role: 'manager',
      conversationId,
      ...overrides,
    }) as RequestAssignmentCommand;

  beforeEach(() => {
    publisher = new InMemoryAssignmentRequestPublisher();
    counter = 0;
    useCase = new RequestAssignmentUseCase(publisher, { now: () => now }, { next: () => `command_${++counter}` });
  });

  describe('asking for an assignment', () => {
    it('publishes one request naming the user, the role, the conversation and the agent', async () => {
      await useCase.execute(assign());

      expect(publisher.published).toEqual([
        {
          type: 'conversation.assignment-requested.v1',
          commandId: 'command_1',
          requestedAt: now,
          workspaceId: 'workspace_1',
          conversationId,
          action: 'assign',
          agentId,
          requestedBy: 'user_1',
          role: 'manager',
        },
      ]);
    });

    it('answers with the name of the request it made', async () => {
      await expect(useCase.execute(assign())).resolves.toEqual({ commandId: 'command_1' });
    });

    it.each(['admin', 'manager'])('lets the %s role ask', async (role) => {
      await useCase.execute(assign({ role }));

      expect(publisher.published).toHaveLength(1);
    });

    it('gives every request its own id', async () => {
      const first = await useCase.execute(assign());
      const second = await useCase.execute(assign());

      expect(first.commandId).not.toBe(second.commandId);
    });
  });

  describe('asking for the agent to be removed', () => {
    it('publishes one unassign request, which carries no agent', async () => {
      await useCase.execute(unassign());

      expect(publisher.published).toEqual([
        {
          type: 'conversation.assignment-requested.v1',
          commandId: 'command_1',
          requestedAt: now,
          workspaceId: 'workspace_1',
          conversationId,
          action: 'unassign',
          requestedBy: 'user_1',
          role: 'manager',
        },
      ]);
      expect(publisher.published[0]).not.toHaveProperty('agentId');
    });

    it('answers with the name of the request it made', async () => {
      await expect(useCase.execute(unassign())).resolves.toEqual({ commandId: 'command_1' });
    });
  });

  describe('what it refuses without publishing anything', () => {
    it.each(['agent', 'guest', ''])('a role that may not ask: %j', async (role) => {
      await expect(useCase.execute(assign({ role }))).rejects.toBeInstanceOf(AssignmentNotPermittedError);
      await expect(useCase.execute(unassign({ role }))).rejects.toBeInstanceOf(AssignmentNotPermittedError);

      expect(publisher.published).toEqual([]);
    });

    it('a malformed conversation id', async () => {
      await expect(useCase.execute(assign({ conversationId: 'conv_123' }))).rejects.toMatchObject({
        field: 'id',
      });
      await expect(useCase.execute(unassign({ conversationId: 'conv_123' }))).rejects.toBeInstanceOf(
        InvalidConversationError,
      );

      expect(publisher.published).toEqual([]);
    });

    it('a malformed agent id', async () => {
      await expect(useCase.execute(assign({ agentId: 'agent_456' } as Partial<RequestAssignmentCommand>))).rejects.toMatchObject({
        field: 'assignedAgentId',
      });

      expect(publisher.published).toEqual([]);
    });

    it('checks the role before the ids, so a caller without the right learns nothing', async () => {
      await expect(
        useCase.execute(assign({ role: 'agent', conversationId: 'conv_123' })),
      ).rejects.toBeInstanceOf(AssignmentNotPermittedError);
    });
  });

  it('does not look at stored data: whether the conversation or the agent exists is decided where the request is carried out', async () => {
    await useCase.execute(assign({ conversationId: id(999), agentId: id(998) } as Partial<RequestAssignmentCommand>));

    expect(publisher.published).toHaveLength(1);
  });

  it('fails when the request cannot be published, so the caller knows it was not sent', async () => {
    jest.spyOn(publisher, 'publish').mockRejectedValue(new Error('broker not available'));

    await expect(useCase.execute(assign())).rejects.toThrow('broker not available');
  });
});
