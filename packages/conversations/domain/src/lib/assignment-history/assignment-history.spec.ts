import { CONVERSATION_ASSIGNED_V1, ConversationAssigned } from '../events/conversation-events';
import { ASSIGNMENT_ACTIONS } from './assignment-history.entity';
import { historyEntryFromEvent } from './assignment-history';

const occurredAt = new Date('2026-11-13T09:00:00.000Z');

const assigned = (overrides: Partial<ConversationAssigned> = {}): ConversationAssigned => ({
  type: CONVERSATION_ASSIGNED_V1,
  eventId: 'event_1',
  occurredAt,
  workspaceId: 'workspace_1',
  conversationId: 'conversation_1',
  previousAgentId: null,
  agentId: 'agent_b',
  assignedBy: 'user_1',
  version: 1,
  ...overrides,
});

describe('assignment actions', () => {
  it('are only assigned: removing an agent is not recorded', () => {
    expect([...ASSIGNMENT_ACTIONS]).toEqual(['assigned']);
  });
});

describe('historyEntryFromEvent', () => {
  describe('an assigned event', () => {
    it('becomes an "assigned" line naming the new agent and the user who assigned', () => {
      expect(historyEntryFromEvent(assigned())).toEqual({
        eventId: 'event_1',
        workspaceId: 'workspace_1',
        conversationId: 'conversation_1',
        action: 'assigned',
        newAgentId: 'agent_b',
        performedBy: 'user_1',
        createdAt: occurredAt,
        version: 1,
      });
    });

    it('leaves previousAgentId out when nobody was assigned before (absent, not null)', () => {
      const entry = historyEntryFromEvent(assigned({ previousAgentId: null }));

      expect(entry).not.toHaveProperty('previousAgentId');
    });

    it('keeps the replaced agent on a reassignment', () => {
      const entry = historyEntryFromEvent(assigned({ previousAgentId: 'agent_a', version: 2 }));

      expect(entry).toMatchObject({ previousAgentId: 'agent_a', newAgentId: 'agent_b', version: 2 });
    });
  });

  it('keeps its own copy of the time, so changing the event afterwards does not change the line', () => {
    const event = assigned({ occurredAt: new Date(occurredAt) });

    const entry = historyEntryFromEvent(event);
    event.occurredAt.setUTCFullYear(2000);

    expect(entry.createdAt).toEqual(occurredAt);
  });
});
