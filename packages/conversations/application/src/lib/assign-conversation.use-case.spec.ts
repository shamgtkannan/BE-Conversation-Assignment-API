import {
  AssignedAgentNotFoundError,
  AssignmentNotPermittedError,
  Conversation,
  ConversationClosedError,
  ConversationConcurrentModificationError,
  ConversationNotFoundError,
  InvalidConversationError,
} from 'conversations-domain';
import {
  AssignConversationCommand,
  AssignConversationUseCase,
} from './assign-conversation.use-case';
import { BarrierConversationRepository } from './testing/barrier-conversation.repository';
import { InMemoryAgentLookup } from './testing/in-memory-agent-lookup';
import { InMemoryConversationRepository } from './testing/in-memory-conversation.repository';

const id = (n: number) => n.toString(16).padStart(24, '0');
const created = new Date('2026-11-13T08:00:00.000Z');
const assignTime = new Date('2026-11-13T09:00:00.000Z');
const reassignTime = new Date('2026-11-13T10:00:00.000Z');

const conversationId = id(1);
const agentA = id(100);
const agentB = id(101);

describe('AssignConversationUseCase', () => {
  let repository: InMemoryConversationRepository;
  let agents: InMemoryAgentLookup;
  let current: Date;
  let useCase: AssignConversationUseCase;

  const command = (
    overrides: Partial<AssignConversationCommand> = {},
  ): AssignConversationCommand => ({
    workspaceId: 'workspace_1',
    userId: 'user_1',
    role: 'manager',
    conversationId,
    agentId: agentA,
    ...overrides,
  });

  const seed = (status: 'open' | 'closed' = 'open', workspaceId = 'workspace_1') =>
    repository.save(
      Conversation.create({ id: conversationId, workspaceId, subject: 'Help', status, now: created }),
    );
  const stored = () => repository.findById('workspace_1', conversationId);

  beforeEach(() => {
    repository = new InMemoryConversationRepository();
    agents = new InMemoryAgentLookup();
    agents.add('workspace_1', agentA);
    agents.add('workspace_1', agentB);
    current = assignTime;
    useCase = new AssignConversationUseCase(repository, agents, { now: () => current });
  });

  describe('assigning', () => {
    it('assigns an open conversation, recording the agent, the user and the time', async () => {
      await seed();

      const result = await useCase.execute(command());

      expect(result).toMatchObject({
        id: conversationId,
        status: 'open',
        assignedAgentId: agentA,
        assignedAt: assignTime,
        assignedBy: 'user_1',
        createdAt: created,
        updatedAt: assignTime,
      });
      expect(await stored()).toEqual(result);
    });

    it.each(['admin', 'manager'])('lets the %s role assign', async (role) => {
      await seed();

      await expect(useCase.execute(command({ role }))).resolves.toMatchObject({
        assignedAgentId: agentA,
      });
    });

    it('replaces the current agent when another one is assigned', async () => {
      await seed();
      await useCase.execute(command());
      current = reassignTime;

      const result = await useCase.execute(command({ agentId: agentB, userId: 'user_2' }));

      expect(result).toMatchObject({
        assignedAgentId: agentB,
        assignedAt: reassignTime,
        assignedBy: 'user_2',
        updatedAt: reassignTime,
      });
      expect(await stored()).toEqual(result);
    });

    it('does not update anything when the same agent is assigned twice', async () => {
      await seed();
      const first = await useCase.execute(command());
      const save = jest.spyOn(repository, 'save');
      current = reassignTime;

      const again = await useCase.execute(command({ userId: 'user_2' }));

      expect(save).not.toHaveBeenCalled();
      expect(again).toEqual(first);
      expect(again).toMatchObject({ assignedAt: assignTime, assignedBy: 'user_1' });
    });

    it('saves exactly once per real change', async () => {
      await seed();
      const save = jest.spyOn(repository, 'save');

      await useCase.execute(command());

      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  describe('403 role', () => {
    it.each(['agent', 'guest', ''])(
      'rejects the role %j before reading anything',
      async (role) => {
        await seed();
        const find = jest.spyOn(repository, 'findById');
        const save = jest.spyOn(repository, 'save');

        await expect(useCase.execute(command({ role }))).rejects.toThrow(AssignmentNotPermittedError);
        expect(find).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
      },
    );

    it('rejects a wrong role even when the ids are malformed', async () => {
      await expect(
        useCase.execute(command({ role: 'agent', conversationId: 'x', agentId: 'y' })),
      ).rejects.toThrow(AssignmentNotPermittedError);
    });
  });

  describe('400 malformed ids', () => {
    it.each([
      ['conversation id', { conversationId: 'abc' }, 'id'],
      ['agent id', { agentId: 'agent-1' }, 'assignedAgentId'],
      ['empty agent id', { agentId: '' }, 'assignedAgentId'],
    ])('rejects a malformed %s without reading the repository', async (_l, overrides, field) => {
      const find = jest.spyOn(repository, 'findById');

      const attempt = useCase.execute(command(overrides));

      await expect(attempt).rejects.toThrow(InvalidConversationError);
      await expect(attempt).rejects.toMatchObject({ field });
      expect(find).not.toHaveBeenCalled();
    });
  });

  describe('404 not found', () => {
    it('rejects a conversation that does not exist', async () => {
      await expect(useCase.execute(command())).rejects.toThrow(ConversationNotFoundError);
    });

    it('rejects a conversation of another workspace as not found, without touching it', async () => {
      await seed('open', 'workspace_2');

      await expect(useCase.execute(command())).rejects.toThrow(ConversationNotFoundError);
      expect(await repository.findById('workspace_2', conversationId)).not.toHaveProperty(
        'assignedAgentId',
        agentA,
      );
    });

    it('rejects an agent that does not exist', async () => {
      await seed();
      const save = jest.spyOn(repository, 'save');

      await expect(useCase.execute(command({ agentId: id(999) }))).rejects.toThrow(
        AssignedAgentNotFoundError,
      );
      expect(save).not.toHaveBeenCalled();
    });

    it('rejects an agent of another workspace as not found', async () => {
      await seed();
      agents.add('workspace_2', id(200));

      await expect(useCase.execute(command({ agentId: id(200) }))).rejects.toThrow(
        AssignedAgentNotFoundError,
      );
    });

    it('reports a missing conversation before a missing agent', async () => {
      await expect(useCase.execute(command({ agentId: id(999) }))).rejects.toThrow(
        ConversationNotFoundError,
      );
    });
  });

  describe('409 closed conversation', () => {
    it('cannot be assigned, and nothing is saved', async () => {
      await seed('closed');
      const save = jest.spyOn(repository, 'save');

      await expect(useCase.execute(command())).rejects.toThrow(ConversationClosedError);
      expect(save).not.toHaveBeenCalled();
    });

    it('reports a missing agent before the closed conversation', async () => {
      await seed('closed');

      await expect(useCase.execute(command({ agentId: id(999) }))).rejects.toThrow(
        AssignedAgentNotFoundError,
      );
    });
  });

  describe('simultaneous requests', () => {
    const raceRepository = async () => {
      const racing = new BarrierConversationRepository(2);
      await racing.save(
        Conversation.create({
          id: conversationId,
          workspaceId: 'workspace_1',
          subject: 'Help',
          now: created,
        }),
      );
      return racing;
    };

    it('saves with the version it read, so a change made meanwhile is detected', async () => {
      await seed();
      const save = jest.spyOn(repository, 'save');

      await useCase.execute(command({ agentId: agentA }));
      await useCase.execute(command({ agentId: agentB }));

      expect(save).toHaveBeenNthCalledWith(1, expect.objectContaining({ version: 1 }), 0);
      expect(save).toHaveBeenNthCalledWith(2, expect.objectContaining({ version: 2 }), 1);
    });

    it('lets one of two assignments that read the same conversation win and rejects the other', async () => {
      const racing = await raceRepository();
      const race = new AssignConversationUseCase(racing, agents, { now: () => current });

      const outcomes = await Promise.allSettled([
        race.execute(command({ agentId: agentA })),
        race.execute(command({ agentId: agentB })),
      ]);

      const winners = outcomes.filter((o) => o.status === 'fulfilled');
      const losers = outcomes.filter((o) => o.status === 'rejected');
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect((losers[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ConversationConcurrentModificationError,
      );
      const winner = (winners[0] as PromiseFulfilledResult<unknown>).value;
      expect(await racing.findById('workspace_1', conversationId)).toEqual(winner);
    });

    it('keeps the winner at version 1: the rejected request writes nothing', async () => {
      const racing = await raceRepository();
      const race = new AssignConversationUseCase(racing, agents, { now: () => current });

      await Promise.allSettled([
        race.execute(command({ agentId: agentA })),
        race.execute(command({ agentId: agentB })),
      ]);

      expect((await racing.findById('workspace_1', conversationId))?.version).toBe(1);
    });
  });
});
