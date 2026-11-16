import { Conversation, InvalidConversationError } from 'conversations-domain';
import { CreateConversationUseCase } from './create-conversation.use-case';
import { Clock, IdGenerator } from './ports';
import { InMemoryConversationRepository } from './testing/in-memory-conversation.repository';

const now = new Date('2026-11-13T08:30:00.000Z');
const clock: Clock = { now: () => now };

describe('CreateConversationUseCase', () => {
  let repository: InMemoryConversationRepository;
  let useCase: CreateConversationUseCase;

  beforeEach(() => {
    repository = new InMemoryConversationRepository();
    let counter = 0;
    const ids: IdGenerator = { next: () => `conversation_${++counter}` };
    useCase = new CreateConversationUseCase(repository, ids, clock);
  });

  const command = (overrides = {}) => ({
    workspaceId: 'workspace_1',
    subject: 'Unable to log in',
    ...overrides,
  });

  it('creates and saves an open, unassigned conversation in the given workspace', async () => {
    const conversation = await useCase.execute(command());

    expect(conversation).toMatchObject({
      id: 'conversation_1',
      workspaceId: 'workspace_1',
      subject: 'Unable to log in',
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
    expect(conversation.assignedAgentId).toBeUndefined();
    expect(conversation.assignedAt).toBeUndefined();
    expect(conversation.assignedBy).toBeUndefined();
    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]).toBe(conversation);
  });

  it('can create a closed conversation', async () => {
    const conversation = await useCase.execute(command({ status: 'closed' }));

    expect(conversation.status).toBe('closed');
  });

  it('saves the trimmed subject', async () => {
    const conversation = await useCase.execute(command({ subject: '  Unable to log in  ' }));

    expect(conversation.subject).toBe('Unable to log in');
  });

  it('gives every conversation its own id, even with the same subject', async () => {
    const first = await useCase.execute(command());
    const second = await useCase.execute(command());

    expect(first.id).not.toBe(second.id);
    expect(repository.saved).toHaveLength(2);
  });

  it('returns a real Conversation from the domain', async () => {
    expect(await useCase.execute(command())).toBeInstanceOf(Conversation);
  });

  it.each([
    ['a blank subject', { subject: '   ' }],
    ['an unknown status', { status: 'pending' }],
  ])('saves nothing for %s', async (_label, overrides) => {
    await expect(useCase.execute(command(overrides))).rejects.toThrow(InvalidConversationError);

    expect(repository.saved).toHaveLength(0);
  });

  it('does not swallow a failure of the repository', async () => {
    jest.spyOn(repository, 'save').mockRejectedValue(new Error('storage is down'));

    await expect(useCase.execute(command())).rejects.toThrow('storage is down');
  });
});
