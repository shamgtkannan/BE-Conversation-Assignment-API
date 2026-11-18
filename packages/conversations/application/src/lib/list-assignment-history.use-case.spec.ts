import { InvalidPageRequestError } from '@shared/core';
import {
  Conversation,
  ConversationNotFoundError,
  InvalidConversationError,
  NewAssignmentHistoryEntry,
} from 'conversations-domain';
import { ListAssignmentHistoryCommand, ListAssignmentHistoryUseCase } from './list-assignment-history.use-case';
import { InMemoryAssignmentHistoryRepository } from './testing/in-memory-assignment-history.repository';
import { InMemoryConversationRepository } from './testing/in-memory-conversation.repository';

const id = (n: number) => n.toString(16).padStart(24, '0');
const conversationId = id(1);
const otherConversationId = id(2);

const line = (n: number, overrides: Partial<NewAssignmentHistoryEntry> = {}): NewAssignmentHistoryEntry => ({
  eventId: `event_${n}`,
  workspaceId: 'workspace_1',
  conversationId,
  action: 'assigned',
  newAgentId: id(100 + n),
  performedBy: 'user_1',
  createdAt: new Date(Date.UTC(2026, 10, 13, 9, n)),
  version: n,
  ...overrides,
});

describe('ListAssignmentHistoryUseCase', () => {
  let conversations: InMemoryConversationRepository;
  let history: InMemoryAssignmentHistoryRepository;
  let useCase: ListAssignmentHistoryUseCase;

  const command = (overrides: Partial<ListAssignmentHistoryCommand> = {}): ListAssignmentHistoryCommand => ({
    workspaceId: 'workspace_1',
    conversationId,
    ...overrides,
  });
  const seedConversation = (conversation = conversationId, workspaceId = 'workspace_1') =>
    conversations.save(
      Conversation.create({ id: conversation, workspaceId, subject: 'Help', now: new Date('2026-11-13T08:00:00.000Z') }),
    );
  const versions = (page: { items: { version: number }[] }) => page.items.map((item) => item.version);

  beforeEach(async () => {
    conversations = new InMemoryConversationRepository();
    history = new InMemoryAssignmentHistoryRepository();
    useCase = new ListAssignmentHistoryUseCase(conversations, history);
    await seedConversation();
  });

  it('lists the lines of the conversation, newest first', async () => {
    for (const n of [2, 1, 3]) await history.record(line(n));

    const page = await useCase.execute(command());

    expect(versions(page)).toEqual([3, 2, 1]);
    expect(page).toMatchObject({ hasNext: false, next: null, hasPrevious: false, previous: null });
  });

  it('returns an empty page for a conversation that has no history yet', async () => {
    const page = await useCase.execute(command());

    expect(page).toEqual({ items: [], hasNext: false, next: null, hasPrevious: false, previous: null });
  });

  it('returns only the lines of the asked conversation', async () => {
    await seedConversation(otherConversationId);
    await history.record(line(1));
    await history.record(line(2, { conversationId: otherConversationId }));

    expect(versions(await useCase.execute(command()))).toEqual([1]);
  });

  it("never returns another workspace's lines for the same conversation id", async () => {
    await history.record(line(1));
    await history.record(line(2, { workspaceId: 'workspace_2' }));

    expect(versions(await useCase.execute(command()))).toEqual([1]);
  });

  describe('paging', () => {
    beforeEach(async () => {
      for (const n of [1, 2, 3, 4, 5]) await history.record(line(n));
    });

    it('returns the first page with a next token when there are more', async () => {
      const page = await useCase.execute(command({ limit: 2 }));

      expect(versions(page)).toEqual([5, 4]);
      expect(page.hasNext).toBe(true);
      expect(page.next).toEqual(expect.any(String));
      expect(page.hasPrevious).toBe(false);
    });

    it('walks forward through every line exactly once and back again', async () => {
      const first = await useCase.execute(command({ limit: 2 }));
      const second = await useCase.execute(command({ limit: 2, next: first.next as string }));
      const third = await useCase.execute(command({ limit: 2, next: second.next as string }));

      expect([first, second, third].map(versions)).toEqual([[5, 4], [3, 2], [1]]);
      expect(third.hasNext).toBe(false);

      const back = await useCase.execute(command({ limit: 2, previous: third.previous as string }));
      expect(versions(back)).toEqual([3, 2]);
    });

    it('rejects a limit that is out of range', async () => {
      await expect(useCase.execute(command({ limit: 0 }))).rejects.toBeInstanceOf(InvalidPageRequestError);
      await expect(useCase.execute(command({ limit: 101 }))).rejects.toBeInstanceOf(InvalidPageRequestError);
    });

    it('rejects a token that is not a page token', async () => {
      await expect(useCase.execute(command({ next: 'not-a-token' }))).rejects.toBeInstanceOf(
        InvalidPageRequestError,
      );
    });
  });

  describe('the conversation must exist in the caller workspace', () => {
    it('rejects a conversation that does not exist', async () => {
      await expect(useCase.execute(command({ conversationId: id(999) }))).rejects.toBeInstanceOf(
        ConversationNotFoundError,
      );
    });

    it("rejects another workspace's conversation, even when it has history", async () => {
      await seedConversation(otherConversationId, 'workspace_2');
      await history.record(line(1, { workspaceId: 'workspace_2', conversationId: otherConversationId }));

      await expect(
        useCase.execute(command({ conversationId: otherConversationId })),
      ).rejects.toBeInstanceOf(ConversationNotFoundError);
    });

    it('rejects a malformed id before reading anything', async () => {
      const find = jest.spyOn(conversations, 'findById');
      const list = jest.spyOn(history, 'list');

      await expect(useCase.execute(command({ conversationId: 'conv_123' }))).rejects.toBeInstanceOf(
        InvalidConversationError,
      );

      expect(find).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
    });

    it('does not read the history of a conversation that was not found', async () => {
      const list = jest.spyOn(history, 'list');

      await expect(useCase.execute(command({ conversationId: id(999) }))).rejects.toBeDefined();

      expect(list).not.toHaveBeenCalled();
    });
  });
});
