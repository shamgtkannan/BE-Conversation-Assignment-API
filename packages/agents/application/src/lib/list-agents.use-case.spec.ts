import { InvalidPageRequestError } from '@shared/core';
import { Agent, IAgentEntity } from 'agents-domain';
import { ListAgentsUseCase } from './list-agents.use-case';
import { InMemoryAgentRepository } from './testing/in-memory-agent.repository';

/** Saves agent number `n` (higher = created later) unless a time is forced. */
const seed = async (
  repository: InMemoryAgentRepository,
  n: number,
  { workspaceId = 'workspace_1', at = Date.UTC(2026, 10, 13, 8, n) } = {},
) =>
  repository.save(
    Agent.create({
      id: n.toString(16).padStart(24, '0'),
      workspaceId,
      name: `Agent ${n}`,
      email: `agent${n}@example.com`,
      now: new Date(at),
    }),
  );

const names = (items: IAgentEntity[]) => items.map((a) => a.name);

describe('ListAgentsUseCase', () => {
  let repository: InMemoryAgentRepository;
  let useCase: ListAgentsUseCase;

  beforeEach(() => {
    repository = new InMemoryAgentRepository();
    useCase = new ListAgentsUseCase(repository);
  });

  it('lists a workspace newest first with no neighbours when everything fits', async () => {
    for (const n of [1, 2, 3]) await seed(repository, n);

    const page = await useCase.execute({ workspaceId: 'workspace_1' });

    expect(names(page.items)).toEqual(['Agent 3', 'Agent 2', 'Agent 1']);
    expect(page).toMatchObject({ hasNext: false, next: null, hasPrevious: false, previous: null });
  });

  it('returns an empty page for a workspace with no agents', async () => {
    const page = await useCase.execute({ workspaceId: 'workspace_empty' });

    expect(page).toEqual({
      items: [],
      hasNext: false,
      next: null,
      hasPrevious: false,
      previous: null,
    });
  });

  it('only lists agents of the given workspace', async () => {
    await seed(repository, 1);
    await seed(repository, 2, { workspaceId: 'workspace_2' });

    const page = await useCase.execute({ workspaceId: 'workspace_1' });

    expect(names(page.items)).toEqual(['Agent 1']);
  });

  it('defaults to 20 agents per page', async () => {
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

    expect([names(first.items), names(second.items), names(third.items)]).toEqual([
      ['Agent 5', 'Agent 4'],
      ['Agent 3', 'Agent 2'],
      ['Agent 1'],
    ]);
    expect(third.hasNext).toBe(false);

    const back = await read({ previous: third.previous as string });
    expect(names(back.items)).toEqual(['Agent 3', 'Agent 2']);
    expect(back.hasNext).toBe(true);

    const backAgain = await read({ previous: back.previous as string });
    expect(names(backAgain.items)).toEqual(['Agent 5', 'Agent 4']);
    expect(backAgain.hasPrevious).toBe(false);
  });

  it('returns agents created at the same instant exactly once each across pages', async () => {
    const sameTime = Date.UTC(2026, 10, 13, 9, 0);
    for (const n of [1, 2, 3, 4]) await seed(repository, n, { at: sameTime });

    const seen: string[] = [];
    let next: string | undefined;
    do {
      const page = await useCase.execute({ workspaceId: 'workspace_1', limit: 1, next });
      seen.push(...names(page.items));
      next = page.next ?? undefined;
    } while (next);

    expect(seen).toEqual(['Agent 4', 'Agent 3', 'Agent 2', 'Agent 1']);
  });

  it('does not let a cursor from another workspace reveal its agents', async () => {
    for (const n of [1, 2, 3]) await seed(repository, n);
    for (const n of [4, 5, 6]) await seed(repository, n, { workspaceId: 'workspace_2' });
    const elsewhere = await useCase.execute({ workspaceId: 'workspace_2', limit: 1 });

    // A token only carries a position, so it cannot widen the query to another workspace.
    const page = await useCase.execute({
      workspaceId: 'workspace_1',
      next: elsewhere.next as string,
    });

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((a) => a.workspaceId === 'workspace_1')).toBe(true);
  });

  describe('invalid requests', () => {
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

    it('rejects both cursors at once', async () => {
      await seed(repository, 1);
      const { next } = await useCase.execute({ workspaceId: 'workspace_1', limit: 1 });

      await expect(
        useCase.execute({ workspaceId: 'workspace_1', next: next ?? 'x', previous: next ?? 'x' }),
      ).rejects.toThrow(InvalidPageRequestError);
    });
  });
});
