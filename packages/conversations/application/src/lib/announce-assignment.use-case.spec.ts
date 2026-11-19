import { ConversationChange, IConversationEntity } from 'conversations-domain';
import { AnnounceAssignmentUseCase } from './announce-assignment.use-case';
import { InMemoryEventPublisher } from './testing/in-memory-event-publisher';

const created = new Date('2026-11-13T08:00:00.000Z');
const assignedAtA = new Date('2026-11-13T09:00:00.000Z');
const assignedAtB = new Date('2026-11-13T10:00:00.000Z');
const ada = '65f1a2b3c4d5e6f708091a2c';
const grace = '65f1a2b3c4d5e6f708091a2d';

const unassigned = (overrides: Partial<IConversationEntity> = {}): IConversationEntity => ({
  id: '65f1a2b3c4d5e6f708091a2b',
  subject: 'Help',
  status: 'open',
  workspaceId: 'workspace_1',
  createdAt: created,
  updatedAt: created,
  version: 0,
  ...overrides,
});
const assignedTo = (agentId: string, assignedAt: Date, assignedBy: string, version: number): IConversationEntity =>
  unassigned({ assignedAgentId: agentId, assignedAt, assignedBy, updatedAt: assignedAt, version });

const firstAssignment: ConversationChange = {
  changeId: 'change_1',
  before: unassigned(),
  after: assignedTo(ada, assignedAtA, 'user_1', 1),
};

describe('AnnounceAssignmentUseCase', () => {
  let events: InMemoryEventPublisher;
  let useCase: AnnounceAssignmentUseCase;

  beforeEach(() => {
    events = new InMemoryEventPublisher();
    useCase = new AnnounceAssignmentUseCase(events);
  });

  describe('a change that assigns an agent', () => {
    it('publishes one conversation.assigned.v1 event', async () => {
      await useCase.execute(firstAssignment);

      expect(events.published).toEqual([
        {
          type: 'conversation.assigned.v1',
          eventId: 'change_1',
          occurredAt: assignedAtA,
          workspaceId: 'workspace_1',
          conversationId: '65f1a2b3c4d5e6f708091a2b',
          previousAgentId: null,
          agentId: ada,
          assignedBy: 'user_1',
          version: 1,
        },
      ]);
    });

    it('answers true', async () => {
      await expect(useCase.execute(firstAssignment)).resolves.toBe(true);
    });

    it('names the replaced agent on a reassignment', async () => {
      await useCase.execute({
        changeId: 'change_2',
        before: assignedTo(ada, assignedAtA, 'user_1', 1),
        after: assignedTo(grace, assignedAtB, 'user_2', 2),
      });

      expect(events.published[0]).toMatchObject({ previousAgentId: ada, agentId: grace, assignedBy: 'user_2', version: 2 });
    });

    it('uses the id of the change as the id of the event', async () => {
      await useCase.execute({ ...firstAssignment, changeId: 'change_77' });

      expect(events.published[0].eventId).toBe('change_77');
    });

    it('does not remember what it published: the same change again is published again, with the same event id', async () => {
      await useCase.execute(firstAssignment);
      await useCase.execute(firstAssignment);

      expect(events.published).toHaveLength(2);
      expect(events.published[0]).toEqual(events.published[1]);
    });
  });

  describe('a change that is not an assignment', () => {
    it.each([
      ['an agent removed', { changeId: 'c', before: assignedTo(grace, assignedAtB, 'user_2', 2), after: unassigned({ version: 3 }) }],
      ['the same agent saved again', { changeId: 'c', before: assignedTo(grace, assignedAtA, 'user_1', 1), after: assignedTo(grace, assignedAtB, 'user_2', 2) }],
      ['a conversation created with nobody assigned', { changeId: 'c', after: unassigned() }],
      ['another field edited', { changeId: 'c', before: unassigned(), after: unassigned({ subject: 'Renamed', version: 1 }) }],
    ] as [string, ConversationChange][])('publishes nothing for %s, and answers false', async (_label, change) => {
      await expect(useCase.execute(change)).resolves.toBe(false);

      expect(events.published).toEqual([]);
    });
  });

  it('passes a failure to publish on, so whoever feeds the changes can try again', async () => {
    jest.spyOn(events, 'publish').mockRejectedValue(new Error('broker not available'));

    await expect(useCase.execute(firstAssignment)).rejects.toThrow('broker not available');
  });
});
