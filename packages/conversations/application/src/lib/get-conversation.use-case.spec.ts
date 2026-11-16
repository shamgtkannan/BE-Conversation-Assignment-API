import {
  Conversation,
  ConversationNotFoundError,
  InvalidConversationError,
} from 'conversations-domain';
import { GetConversationUseCase } from './get-conversation.use-case';
import { InMemoryConversationRepository } from './testing/in-memory-conversation.repository';

const id = (n: number) => n.toString(16).padStart(24, '0');

const seed = (
  repository: InMemoryConversationRepository,
  n: number,
  { workspaceId = 'workspace_1', status = 'open' as 'open' | 'closed' } = {},
) =>
  repository.save(
    Conversation.create({
      id: id(n),
      workspaceId,
      subject: `Conversation ${n}`,
      status,
      now: new Date(Date.UTC(2026, 10, 13, 8, n)),
    }),
  );

describe('GetConversationUseCase', () => {
  let repository: InMemoryConversationRepository;
  let useCase: GetConversationUseCase;

  beforeEach(async () => {
    repository = new InMemoryConversationRepository();
    useCase = new GetConversationUseCase(repository);
    await seed(repository, 1);
    await seed(repository, 2);
  });

  it('returns the conversation with the given id', async () => {
    const conversation = await useCase.execute({ workspaceId: 'workspace_1', id: id(2) });

    expect(conversation).toMatchObject({
      id: id(2),
      workspaceId: 'workspace_1',
      subject: 'Conversation 2',
      status: 'open',
    });
  });

  it('returns a closed conversation too: reading is not restricted by status', async () => {
    await seed(repository, 3, { status: 'closed' });

    const conversation = await useCase.execute({ workspaceId: 'workspace_1', id: id(3) });

    expect(conversation.status).toBe('closed');
  });

  it('reports an unknown id as not found, naming the id', async () => {
    await expect(useCase.execute({ workspaceId: 'workspace_1', id: id(99) })).rejects.toThrow(
      ConversationNotFoundError,
    );
    await expect(useCase.execute({ workspaceId: 'workspace_1', id: id(99) })).rejects.toThrow(
      expect.objectContaining({ id: id(99) }),
    );
  });

  it('reports a conversation of another workspace exactly like a missing one', async () => {
    await seed(repository, 3, { workspaceId: 'workspace_2' });

    const otherWorkspace = useCase.execute({ workspaceId: 'workspace_1', id: id(3) });
    const missing = useCase.execute({ workspaceId: 'workspace_1', id: id(98) });

    await expect(otherWorkspace).rejects.toThrow(ConversationNotFoundError);
    await expect(missing).rejects.toThrow(ConversationNotFoundError);
  });

  it('lets the owning workspace read its own conversation', async () => {
    await seed(repository, 3, { workspaceId: 'workspace_2' });

    const conversation = await useCase.execute({ workspaceId: 'workspace_2', id: id(3) });

    expect(conversation.subject).toBe('Conversation 3');
  });

  it.each(['abc', '', '65F1A2B3C4D5E6F708091A2B', 'conv_123'])(
    'rejects the malformed id %j without reading the repository',
    async (malformed) => {
      const findById = jest.spyOn(repository, 'findById');

      await expect(
        useCase.execute({ workspaceId: 'workspace_1', id: malformed }),
      ).rejects.toThrow(expect.objectContaining({ name: 'InvalidConversationError', field: 'id' }));
      expect(findById).not.toHaveBeenCalled();
    },
  );

  it('uses InvalidConversationError for a malformed id', async () => {
    await expect(useCase.execute({ workspaceId: 'workspace_1', id: 'abc' })).rejects.toThrow(
      InvalidConversationError,
    );
  });
});
