import { CONVERSATION_ASSIGNED_V1, ConversationAssigned } from 'conversations-domain';
import { RecordAssignmentHistoryUseCase } from './record-assignment-history.use-case';
import { InMemoryAssignmentHistoryRepository } from './testing/in-memory-assignment-history.repository';

const at = new Date('2026-11-13T09:00:00.000Z');

const assigned = (overrides: Partial<ConversationAssigned> = {}): ConversationAssigned => ({
  type: CONVERSATION_ASSIGNED_V1,
  eventId: 'event_1',
  occurredAt: at,
  workspaceId: 'workspace_1',
  conversationId: 'conversation_1',
  previousAgentId: null,
  agentId: 'agent_a',
  assignedBy: 'user_1',
  version: 1,
  ...overrides,
});

describe('RecordAssignmentHistoryUseCase', () => {
  let repository: InMemoryAssignmentHistoryRepository;
  let useCase: RecordAssignmentHistoryUseCase;

  beforeEach(() => {
    repository = new InMemoryAssignmentHistoryRepository();
    useCase = new RecordAssignmentHistoryUseCase(repository);
  });

  it('records an assigned event as a history line', async () => {
    await useCase.execute(assigned());

    expect(repository.lines).toEqual([
      {
        id: expect.any(String),
        eventId: 'event_1',
        workspaceId: 'workspace_1',
        conversationId: 'conversation_1',
        action: 'assigned',
        newAgentId: 'agent_a',
        performedBy: 'user_1',
        createdAt: at,
        version: 1,
      },
    ]);
  });

  it('records a reassignment with the replaced agent', async () => {
    await useCase.execute(assigned({ previousAgentId: 'agent_a', agentId: 'agent_b', version: 2 }));

    expect(repository.lines[0]).toMatchObject({
      action: 'assigned',
      previousAgentId: 'agent_a',
      newAgentId: 'agent_b',
    });
  });

  it('answers true when it recorded the event', async () => {
    await expect(useCase.execute(assigned())).resolves.toBe(true);
  });

  it('records an event once, however often it is delivered', async () => {
    await useCase.execute(assigned());
    const again = await useCase.execute(assigned());

    expect(again).toBe(false);
    expect(repository.lines).toHaveLength(1);
  });

  it('records different events of the same conversation as different lines', async () => {
    await useCase.execute(assigned());
    await useCase.execute(assigned({ eventId: 'event_2', previousAgentId: 'agent_a', version: 2 }));

    expect(repository.lines.map((line) => line.version)).toEqual([1, 2]);
  });

  it('passes a storage failure on, so the event is delivered again later', async () => {
    jest.spyOn(repository, 'record').mockRejectedValue(new Error('database is down'));

    await expect(useCase.execute(assigned())).rejects.toThrow('database is down');
  });
});
