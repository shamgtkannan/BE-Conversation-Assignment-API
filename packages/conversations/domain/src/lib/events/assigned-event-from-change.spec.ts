import { IConversationEntity } from '../conversation.entity';
import { assignedEventFromChange } from './assigned-event-from-change';
import { ConversationChange } from './conversation-change';

const created = new Date('2026-11-13T08:00:00.000Z');
const assignedAtA = new Date('2026-11-13T09:00:00.000Z');
const assignedAtB = new Date('2026-11-13T10:00:00.000Z');
const ada = '65f1a2b3c4d5e6f708091a2c';
const grace = '65f1a2b3c4d5e6f708091a2d';

const unassigned = (overrides: Partial<IConversationEntity> = {}): IConversationEntity => ({
  id: '65f1a2b3c4d5e6f708091a2b',
  subject: 'Unable to log in',
  status: 'open',
  workspaceId: 'workspace_1',
  createdAt: created,
  updatedAt: created,
  version: 0,
  ...overrides,
});

const assignedTo = (
  agentId: string,
  assignedAt: Date,
  assignedBy: string,
  version: number,
  overrides: Partial<IConversationEntity> = {},
): IConversationEntity =>
  unassigned({ assignedAgentId: agentId, assignedAt, assignedBy, updatedAt: assignedAt, version, ...overrides });

const change = (before: IConversationEntity | undefined, after: IConversationEntity, changeId = 'change_1'): ConversationChange => ({
  changeId,
  ...(before && { before }),
  after,
});

describe('assignedEventFromChange', () => {
  describe('an agent was assigned', () => {
    it('announces the first assignment, with no previous agent', () => {
      const event = assignedEventFromChange(change(unassigned(), assignedTo(ada, assignedAtA, 'user_1', 1)));

      expect(event).toEqual({
        type: 'conversation.assigned.v1',
        eventId: 'change_1',
        occurredAt: assignedAtA,
        workspaceId: 'workspace_1',
        conversationId: '65f1a2b3c4d5e6f708091a2b',
        previousAgentId: null,
        agentId: ada,
        assignedBy: 'user_1',
        version: 1,
      });
    });

    it('names the replaced agent on a reassignment', () => {
      const event = assignedEventFromChange(
        change(assignedTo(ada, assignedAtA, 'user_1', 1), assignedTo(grace, assignedAtB, 'user_2', 2)),
      );

      expect(event).toMatchObject({
        previousAgentId: ada,
        agentId: grace,
        assignedBy: 'user_2',
        occurredAt: assignedAtB,
        version: 2,
      });
    });

    it('announces an assignment that arrives with the conversation itself (no before), with no previous agent', () => {
      const event = assignedEventFromChange(change(undefined, assignedTo(ada, assignedAtA, 'user_1', 1)));

      expect(event).toMatchObject({ previousAgentId: null, agentId: ada, eventId: 'change_1' });
    });

    it('announces an assignment made after an agent was removed, with no previous agent', () => {
      // The change reports only what the conversation was just before: nobody.
      const event = assignedEventFromChange(change(unassigned({ version: 2 }), assignedTo(grace, assignedAtB, 'user_2', 3)));

      expect(event).toMatchObject({ previousAgentId: null, agentId: grace, version: 3 });
    });
  });

  describe('nothing is announced', () => {
    it('for a conversation created with nobody assigned', () => {
      expect(assignedEventFromChange(change(undefined, unassigned()))).toBeNull();
    });

    it('when another field changed and the agent stayed the same', () => {
      const before = assignedTo(grace, assignedAtB, 'user_2', 2);
      const after = { ...before, subject: 'Renamed', updatedAt: new Date('2026-11-13T11:00:00.000Z'), version: 3 };

      expect(assignedEventFromChange(change(before, after))).toBeNull();
    });

    it('when the same agent is saved again with a new time or user, because the agent did not change', () => {
      const before = assignedTo(grace, assignedAtA, 'user_1', 1);
      const after = assignedTo(grace, assignedAtB, 'user_2', 2);

      expect(assignedEventFromChange(change(before, after))).toBeNull();
    });

    it('when the agent was removed', () => {
      const before = assignedTo(grace, assignedAtB, 'user_2', 2);

      expect(assignedEventFromChange(change(before, unassigned({ version: 3 })))).toBeNull();
    });

    it('when nothing about the assignment changed on an unassigned conversation', () => {
      expect(assignedEventFromChange(change(unassigned(), unassigned({ subject: 'Renamed', version: 1 })))).toBeNull();
    });

    it('when the agent field is set but who assigned and when are missing, because that is not a valid assignment', () => {
      const incomplete = unassigned({ assignedAgentId: ada, version: 1 });

      expect(assignedEventFromChange(change(unassigned(), incomplete))).toBeNull();
    });
  });

  describe('the event id', () => {
    it('is the id of the change, so the same change always gives the same event', () => {
      const same = change(unassigned(), assignedTo(ada, assignedAtA, 'user_1', 1), 'change_42');

      expect(assignedEventFromChange(same)?.eventId).toBe('change_42');
      expect(assignedEventFromChange(same)).toEqual(assignedEventFromChange({ ...same }));
    });

    it('differs between changes', () => {
      const after = assignedTo(ada, assignedAtA, 'user_1', 1);

      const first = assignedEventFromChange(change(unassigned(), after, 'change_1'));
      const second = assignedEventFromChange(change(unassigned(), after, 'change_2'));

      expect(first?.eventId).not.toBe(second?.eventId);
    });
  });

  describe('it only reads', () => {
    it('does not change the conversations it is given', () => {
      const before = Object.freeze(unassigned());
      const after = Object.freeze(assignedTo(ada, assignedAtA, 'user_1', 1));

      expect(() => assignedEventFromChange(change(before, after))).not.toThrow();
    });

    it('keeps its own copy of the time, so changing the conversation afterwards does not change the event', () => {
      const after = assignedTo(ada, new Date(assignedAtA), 'user_1', 1);

      const event = assignedEventFromChange(change(unassigned(), after));
      (after.assignedAt as Date).setUTCFullYear(2000);

      expect(event?.occurredAt).toEqual(assignedAtA);
    });
  });
});
