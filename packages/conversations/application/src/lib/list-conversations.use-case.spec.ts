import { InvalidPageRequestError } from '@shared/core';
import { Conversation, IConversationEntity, InvalidConversationError } from 'conversations-domain';
import { ListConversationsUseCase } from './list-conversations.use-case';
import { InMemoryConversationRepository } from './testing/in-memory-conversation.repository';

const id = (n: number) => n.toString(16).padStart(24, '0');

/** Saves conversation `n` (higher = created later); `agent` makes it assigned. */
const seed = async (
  repository: InMemoryConversationRepository,
  n: number,
  {
    workspaceId = 'workspace_1',
    status = 'open' as 'open' | 'closed',
    agent = undefined as number | undefined,
    at = Date.UTC(2026, 10, 13, 8, n),
  } = {},
) => {
  const conversation = Conversation.create({
    id: id(n),
    workspaceId,
    subject: `Conversation ${n}`,
    status,
    now: new Date(at),
  });
  if (agent !== undefined) {
    // Assignment is not built yet, so seed the three fields directly.
    Object.assign(conversation, {
      assignedAgentId: id(agent),
      assignedAt: new Date(at),
      assignedBy: 'user_1',
    });
  }
  await repository.save(conversation);
};

const subjects = (items: IConversationEntity[]) => items.map((c) => c.subject);

describe('ListConversationsUseCase', () => {
  let repository: InMemoryConversationRepository;
  let useCase: ListConversationsUseCase;

  beforeEach(() => {
    repository = new InMemoryConversationRepository();
    useCase = new ListConversationsUseCase(repository);
  });

  it('lists a workspace newest first with no neighbours when everything fits', async () => {
    for (const n of [1, 2, 3]) await seed(repository, n);

    const page = await useCase.execute({ workspaceId: 'workspace_1' });

    expect(subjects(page.items)).toEqual(['Conversation 3', 'Conversation 2', 'Conversation 1']);
    expect(page).toMatchObject({ hasNext: false, next: null, hasPrevious: false, previous: null });
  });

  it('returns an empty page for a workspace with no conversations', async () => {
    expect(await useCase.execute({ workspaceId: 'workspace_empty' })).toEqual({
      items: [],
      hasNext: false,
      next: null,
      hasPrevious: false,
      previous: null,
    });
  });

  it('only lists conversations of the given workspace', async () => {
    await seed(repository, 1);
    await seed(repository, 2, { workspaceId: 'workspace_2' });

    const page = await useCase.execute({ workspaceId: 'workspace_1' });

    expect(subjects(page.items)).toEqual(['Conversation 1']);
  });

  it('defaults to 20 conversations per page', async () => {
    for (let n = 1; n <= 25; n++) await seed(repository, n);

    const page = await useCase.execute({ workspaceId: 'workspace_1' });

    expect(page.items).toHaveLength(20);
    expect(page.hasNext).toBe(true);
  });

  it('pages forward and back through the tokens it returns', async () => {
    for (let n = 1; n <= 5; n++) await seed(repository, n);
    const read = (input: { next?: string; previous?: string } = {}) =>
      useCase.execute({ workspaceId: 'workspace_1', limit: 2, ...input });

    const first = await read();
    const second = await read({ next: first.next as string });
    const third = await read({ next: second.next as string });

    expect([subjects(first.items), subjects(second.items), subjects(third.items)]).toEqual([
      ['Conversation 5', 'Conversation 4'],
      ['Conversation 3', 'Conversation 2'],
      ['Conversation 1'],
    ]);
    expect(third.hasNext).toBe(false);

    const back = await read({ previous: third.previous as string });
    expect(subjects(back.items)).toEqual(['Conversation 3', 'Conversation 2']);
    expect(back.hasNext).toBe(true);
  });

  it('returns conversations created at the same instant exactly once each', async () => {
    const sameTime = Date.UTC(2026, 10, 13, 9, 0);
    for (const n of [1, 2, 3, 4]) await seed(repository, n, { at: sameTime });

    const seen: string[] = [];
    let next: string | undefined;
    do {
      const page = await useCase.execute({ workspaceId: 'workspace_1', limit: 1, next });
      seen.push(...subjects(page.items));
      next = page.next ?? undefined;
    } while (next);

    expect(seen).toEqual(['Conversation 4', 'Conversation 3', 'Conversation 2', 'Conversation 1']);
  });

  describe('filters', () => {
    beforeEach(async () => {
      await seed(repository, 1, { status: 'open', agent: 9 });
      await seed(repository, 2, { status: 'closed', agent: 9 });
      await seed(repository, 3, { status: 'open', agent: 8 });
      await seed(repository, 4, { status: 'open' });
      await seed(repository, 5, { status: 'open', agent: 9, workspaceId: 'workspace_2' });
    });

    it('filters by status', async () => {
      const open = await useCase.execute({ workspaceId: 'workspace_1', status: 'open' });
      const closed = await useCase.execute({ workspaceId: 'workspace_1', status: 'closed' });

      expect(subjects(open.items)).toEqual(['Conversation 4', 'Conversation 3', 'Conversation 1']);
      expect(subjects(closed.items)).toEqual(['Conversation 2']);
    });

    it('filters by assigned agent', async () => {
      const page = await useCase.execute({ workspaceId: 'workspace_1', assignedAgentId: id(9) });

      expect(subjects(page.items)).toEqual(['Conversation 2', 'Conversation 1']);
    });

    it('combines both filters', async () => {
      const page = await useCase.execute({
        workspaceId: 'workspace_1',
        status: 'open',
        assignedAgentId: id(9),
      });

      expect(subjects(page.items)).toEqual(['Conversation 1']);
    });

    it('keeps the filter while paging', async () => {
      const first = await useCase.execute({ workspaceId: 'workspace_1', status: 'open', limit: 2 });
      const second = await useCase.execute({
        workspaceId: 'workspace_1',
        status: 'open',
        limit: 2,
        next: first.next as string,
      });

      expect(subjects(first.items)).toEqual(['Conversation 4', 'Conversation 3']);
      expect(subjects(second.items)).toEqual(['Conversation 1']);
    });

    it('returns an empty page when nothing matches', async () => {
      const page = await useCase.execute({ workspaceId: 'workspace_1', assignedAgentId: id(7) });

      expect(page.items).toEqual([]);
    });
  });

  describe('invalid requests', () => {
    it.each([
      ['an unknown status', { status: 'pending' }],
      ['an empty status', { status: '' }],
      ['a malformed assigned agent id', { assignedAgentId: 'agent-1' }],
    ])('rejects %s without reading the repository', async (_label, filter) => {
      const list = jest.spyOn(repository, 'list');

      await expect(useCase.execute({ workspaceId: 'workspace_1', ...filter })).rejects.toThrow(
        InvalidConversationError,
      );
      expect(list).not.toHaveBeenCalled();
    });

    it.each([0, 101, 1.5])('rejects the limit %p without reading the repository', async (limit) => {
      const list = jest.spyOn(repository, 'list');

      await expect(useCase.execute({ workspaceId: 'workspace_1', limit })).rejects.toThrow(
        InvalidPageRequestError,
      );
      expect(list).not.toHaveBeenCalled();
    });

    it('rejects a malformed cursor', async () => {
      await expect(
        useCase.execute({ workspaceId: 'workspace_1', next: 'garbage!' }),
      ).rejects.toThrow(InvalidPageRequestError);
    });
  });
});
