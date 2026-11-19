import {
  AssignmentNotPermittedError,
  Conversation,
  ConversationConcurrentModificationError,
  ConversationNotFoundError,
  InvalidConversationError,
} from 'conversations-domain';
import {
  UnassignConversationCommand,
  UnassignConversationUseCase,
} from './unassign-conversation.use-case';
import { BarrierConversationRepository } from './testing/barrier-conversation.repository';
import { InMemoryConversationRepository } from './testing/in-memory-conversation.repository';

const id = (n: number) => n.toString(16).padStart(24, '0');
const created = new Date('2026-11-13T08:00:00.000Z');
const assignTime = new Date('2026-11-13T09:00:00.000Z');
const unassignTime = new Date('2026-11-13T10:00:00.000Z');

const conversationId = id(1);
const agentId = id(100);

describe('UnassignConversationUseCase', () => {
  let repository: InMemoryConversationRepository;
  let useCase: UnassignConversationUseCase;

  const command = (
    overrides: Partial<UnassignConversationCommand> = {},
  ): UnassignConversationCommand => ({
    workspaceId: 'workspace_1',
    role: 'manager',
    conversationId,
    ...overrides,
  });

  /** An open conversation assigned to an agent, unless told otherwise. */
  const seed = (
    { status = 'open' as 'open' | 'closed', workspaceId = 'workspace_1', assigned = true } = {},
  ) => {
    const fresh = Conversation.create({
      id: conversationId,
      workspaceId,
      subject: 'Help',
      status,
      now: created,
    });
    // A closed conversation cannot be assigned, so assign the open one first.
    const withAgent = assigned
      ? Conversation.create({ id: conversationId, workspaceId, subject: 'Help', now: created }).assign(
          agentId,
          'user_1',
          assignTime,
        )
      : fresh;
    return repository.save(
      status === 'closed' && assigned
        ? Object.assign(Conversation.restore({ ...withAgent }), { status: 'closed' as const })
        : withAgent,
    );
  };
  const stored = () => repository.findById('workspace_1', conversationId);

  const build = (conversations: InMemoryConversationRepository) =>
    new UnassignConversationUseCase(conversations, { now: () => unassignTime });

  beforeEach(() => {
    repository = new InMemoryConversationRepository();
    useCase = build(repository);
  });

  describe('unassigning', () => {
    it('clears the three assignment fields and touches updatedAt', async () => {
      await seed();

      const result = await useCase.execute(command());

      expect(result.assignedAgentId).toBeUndefined();
      expect(result.assignedAt).toBeUndefined();
      expect(result.assignedBy).toBeUndefined();
      expect(result).toMatchObject({
        id: conversationId,
        status: 'open',
        createdAt: created,
        updatedAt: unassignTime,
      });
      expect(await stored()).toEqual(result);
    });

    it.each(['admin', 'manager'])('lets the %s role unassign', async (role) => {
      await seed();

      const result = await useCase.execute(command({ role }));

      expect(result.assignedAgentId).toBeUndefined();
    });

    it('saves exactly once', async () => {
      await seed();
      const save = jest.spyOn(repository, 'save');

      await useCase.execute(command());

      expect(save).toHaveBeenCalledTimes(1);
    });

    it('does not save when nobody is assigned', async () => {
      await seed({ assigned: false });
      const save = jest.spyOn(repository, 'save');

      const result = await useCase.execute(command());

      expect(save).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: conversationId, updatedAt: created });
    });

    it('does not save the second time when unassigned twice', async () => {
      await seed();
      await useCase.execute(command());
      const save = jest.spyOn(repository, 'save');

      await useCase.execute(command());

      expect(save).not.toHaveBeenCalled();
    });

    it('can unassign a closed conversation', async () => {
      await seed({ status: 'closed' });
      expect((await stored())?.status).toBe('closed');

      const result = await useCase.execute(command());

      expect(result).toMatchObject({ status: 'closed', updatedAt: unassignTime });
      expect(result.assignedAgentId).toBeUndefined();
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
        expect((await stored())?.assignedAgentId).toBe(agentId);
      },
    );

    it('rejects a wrong role even when the id is malformed', async () => {
      await expect(useCase.execute(command({ role: 'agent', conversationId: 'x' }))).rejects.toThrow(
        AssignmentNotPermittedError,
      );
    });
  });

  describe('400 malformed id', () => {
    it.each(['abc', '', 'ZZZZZZZZZZZZZZZZZZZZZZZZ', id(255).toUpperCase()])(
      'rejects the id %j without reading the repository',
      async (badId) => {
        const find = jest.spyOn(repository, 'findById');

        const attempt = useCase.execute(command({ conversationId: badId }));

        await expect(attempt).rejects.toThrow(InvalidConversationError);
        await expect(attempt).rejects.toMatchObject({ field: 'id' });
        expect(find).not.toHaveBeenCalled();
      },
    );
  });

  describe('404 not found', () => {
    it('rejects a conversation that does not exist', async () => {
      await expect(useCase.execute(command())).rejects.toThrow(ConversationNotFoundError);
    });

    it('rejects a conversation of another workspace as not found, without touching it', async () => {
      await seed({ workspaceId: 'workspace_2' });
      const save = jest.spyOn(repository, 'save');

      await expect(useCase.execute(command())).rejects.toThrow(ConversationNotFoundError);
      expect(save).not.toHaveBeenCalled();
      expect((await repository.findById('workspace_2', conversationId))?.assignedAgentId).toBe(agentId);
    });
  });

  describe('simultaneous requests', () => {
    it('saves with the version it read, so a change made meanwhile is detected', async () => {
      await seed();
      const save = jest.spyOn(repository, 'save');

      await useCase.execute(command());

      expect(save).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }), 1);
    });

    it('lets one of two removals that read the same conversation win and rejects the other', async () => {
      const racing = new BarrierConversationRepository(2);
      await racing.save(
        Conversation.create({
          id: conversationId,
          workspaceId: 'workspace_1',
          subject: 'Help',
          now: created,
        }).assign(agentId, 'user_1', assignTime),
      );
      const race = build(racing);

      const outcomes = await Promise.allSettled([race.execute(command()), race.execute(command())]);

      const losers = outcomes.filter((o) => o.status === 'rejected');
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect((losers[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ConversationConcurrentModificationError,
      );
      expect((await racing.findById('workspace_1', conversationId))?.version).toBe(2);
    });
  });

});
