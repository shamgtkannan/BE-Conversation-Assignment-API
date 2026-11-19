import {
  AssignedAgentNotFoundError,
  AssignmentNotPermittedError,
  Conversation,
  ConversationClosedError,
  ConversationNotFoundError,
  InvalidConversationError,
} from 'conversations-domain';
import { RequestAssignmentCommand, RequestAssignmentUseCase } from './request-assignment.use-case';
import { InMemoryAgentLookup } from './testing/in-memory-agent-lookup';
import { InMemoryAssignmentRequestPublisher } from './testing/in-memory-assignment-request-publisher';
import { InMemoryConversationRepository } from './testing/in-memory-conversation.repository';

const id = (n: number) => n.toString(16).padStart(24, '0');
const created = new Date('2026-11-13T08:00:00.000Z');
const now = new Date('2026-11-13T09:00:00.000Z');
const conversationId = id(1);
const agentId = id(100);

describe('RequestAssignmentUseCase', () => {
  let publisher: InMemoryAssignmentRequestPublisher;
  let conversations: InMemoryConversationRepository;
  let agents: InMemoryAgentLookup;
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
  const seed = (status: 'open' | 'closed' = 'open', workspaceId = 'workspace_1', conversation = conversationId) =>
    conversations.save(Conversation.create({ id: conversation, workspaceId, subject: 'Help', status, now: created }));

  beforeEach(async () => {
    publisher = new InMemoryAssignmentRequestPublisher();
    conversations = new InMemoryConversationRepository();
    agents = new InMemoryAgentLookup();
    agents.add('workspace_1', agentId);
    await seed();
    counter = 0;
    useCase = new RequestAssignmentUseCase(
      publisher,
      conversations,
      agents,
      { now: () => now },
      { next: () => `command_${++counter}` },
    );
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

    it('still publishes when the agent is already assigned: whether that changes anything is decided where the request is carried out', async () => {
      await conversations.save(
        Conversation.restore((await conversations.findById('workspace_1', conversationId)) as never).assign(agentId, 'user_0', created),
      );

      await useCase.execute(assign());

      expect(publisher.published).toHaveLength(1);
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

    it('does not look for an agent: removing one needs none', async () => {
      const lookup = jest.spyOn(agents, 'exists');

      await useCase.execute(unassign());

      expect(lookup).not.toHaveBeenCalled();
    });

    it('is allowed on a closed conversation, as unassigning always is', async () => {
      await seed('closed', 'workspace_1', id(2));

      await useCase.execute(unassign({ conversationId: id(2) }));

      expect(publisher.published).toHaveLength(1);
    });
  });

  describe('what it refuses without publishing anything', () => {
    it.each(['agent', 'guest', ''])('a role that may not ask: %j', async (role) => {
      await expect(useCase.execute(assign({ role }))).rejects.toBeInstanceOf(AssignmentNotPermittedError);
      await expect(useCase.execute(unassign({ role }))).rejects.toBeInstanceOf(AssignmentNotPermittedError);

      expect(publisher.published).toEqual([]);
    });

    it('a malformed conversation id', async () => {
      await expect(useCase.execute(assign({ conversationId: 'conv_123' }))).rejects.toMatchObject({ field: 'id' });
      await expect(useCase.execute(unassign({ conversationId: 'conv_123' }))).rejects.toBeInstanceOf(InvalidConversationError);

      expect(publisher.published).toEqual([]);
    });

    it('a malformed agent id', async () => {
      await expect(useCase.execute(assign({ agentId: 'agent_456' } as Partial<RequestAssignmentCommand>))).rejects.toMatchObject({
        field: 'assignedAgentId',
      });

      expect(publisher.published).toEqual([]);
    });

    it('a conversation that does not exist', async () => {
      await expect(useCase.execute(assign({ conversationId: id(999) }))).rejects.toBeInstanceOf(ConversationNotFoundError);
      await expect(useCase.execute(unassign({ conversationId: id(999) }))).rejects.toBeInstanceOf(ConversationNotFoundError);

      expect(publisher.published).toEqual([]);
    });

    it("a conversation of another workspace, as if it did not exist", async () => {
      await seed('open', 'workspace_2', id(3));

      await expect(useCase.execute(assign({ conversationId: id(3) }))).rejects.toBeInstanceOf(ConversationNotFoundError);

      expect(publisher.published).toEqual([]);
    });

    it('an agent that does not exist', async () => {
      await expect(
        useCase.execute(assign({ agentId: id(999) } as Partial<RequestAssignmentCommand>)),
      ).rejects.toBeInstanceOf(AssignedAgentNotFoundError);

      expect(publisher.published).toEqual([]);
    });

    it("an agent of another workspace, as if it did not exist", async () => {
      agents.add('workspace_2', id(200));

      await expect(
        useCase.execute(assign({ agentId: id(200) } as Partial<RequestAssignmentCommand>)),
      ).rejects.toBeInstanceOf(AssignedAgentNotFoundError);
    });

    it('assigning a closed conversation', async () => {
      await seed('closed', 'workspace_1', id(2));

      await expect(useCase.execute(assign({ conversationId: id(2) }))).rejects.toBeInstanceOf(ConversationClosedError);

      expect(publisher.published).toEqual([]);
    });
  });

  describe('the order of the checks, so a caller learns nothing it is not entitled to', () => {
    it('role before ids', async () => {
      await expect(useCase.execute(assign({ role: 'agent', conversationId: 'conv_123' }))).rejects.toBeInstanceOf(
        AssignmentNotPermittedError,
      );
    });

    it('ids before reading anything', async () => {
      const find = jest.spyOn(conversations, 'findById');
      const lookup = jest.spyOn(agents, 'exists');

      await expect(useCase.execute(assign({ conversationId: 'conv_123' }))).rejects.toBeInstanceOf(InvalidConversationError);
      await expect(useCase.execute(assign({ agentId: 'agent_456' } as Partial<RequestAssignmentCommand>))).rejects.toBeInstanceOf(
        InvalidConversationError,
      );

      expect(find).not.toHaveBeenCalled();
      expect(lookup).not.toHaveBeenCalled();
    });

    it('a role that may not ask does not cause any read', async () => {
      const find = jest.spyOn(conversations, 'findById');

      await expect(useCase.execute(assign({ role: 'agent' }))).rejects.toBeDefined();

      expect(find).not.toHaveBeenCalled();
    });

    it('conversation before agent', async () => {
      await expect(
        useCase.execute(assign({ conversationId: id(999), agentId: id(998) } as Partial<RequestAssignmentCommand>)),
      ).rejects.toBeInstanceOf(ConversationNotFoundError);
    });

    it('agent before closed', async () => {
      await seed('closed', 'workspace_1', id(2));

      await expect(
        useCase.execute(assign({ conversationId: id(2), agentId: id(998) } as Partial<RequestAssignmentCommand>)),
      ).rejects.toBeInstanceOf(AssignedAgentNotFoundError);
    });
  });

  it('only reads: it never changes a conversation', async () => {
    const save = jest.spyOn(conversations, 'save');

    await useCase.execute(assign());
    await useCase.execute(unassign());

    expect(save).not.toHaveBeenCalled();
  });

  it('fails when the request cannot be published, so the caller knows it was not sent', async () => {
    jest.spyOn(publisher, 'publish').mockRejectedValue(new Error('broker not available'));

    await expect(useCase.execute(assign())).rejects.toThrow('broker not available');
  });

  it('fails when the stored data cannot be read, and publishes nothing', async () => {
    jest.spyOn(conversations, 'findById').mockRejectedValue(new Error('database is down'));

    await expect(useCase.execute(assign())).rejects.toThrow('database is down');

    expect(publisher.published).toEqual([]);
  });
});
