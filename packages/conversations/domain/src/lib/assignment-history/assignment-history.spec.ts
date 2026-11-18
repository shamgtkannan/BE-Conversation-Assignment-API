import {
  CONVERSATION_ASSIGNED_V1,
  CONVERSATION_UNASSIGNED_V1,
  ConversationAssigned,
  ConversationUnassigned,
} from '../events/conversation-events';
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

const unassigned = (overrides: Partial<ConversationUnassigned> = {}): ConversationUnassigned => ({
  type: CONVERSATION_UNASSIGNED_V1,
  eventId: 'event_2',
  occurredAt,
  workspaceId: 'workspace_1',
  conversationId: 'conversation_1',
  previousAgentId: 'agent_b',
  unassignedBy: 'user_2',
  version: 2,
  ...overrides,
});

describe('assignment actions', () => {
  it('are assigned and unassigned', () => {
    expect([...ASSIGNMENT_ACTIONS]).toEqual(['assigned', 'unassigned']);
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

  describe('an unassigned event', () => {
    it('becomes an "unassigned" line naming the removed agent and the user who removed it', () => {
      expect(historyEntryFromEvent(unassigned())).toEqual({
        eventId: 'event_2',
        workspaceId: 'workspace_1',
        conversationId: 'conversation_1',
        action: 'unassigned',
        previousAgentId: 'agent_b',
        performedBy: 'user_2',
        createdAt: occurredAt,
        version: 2,
      });
    });

    it('has no new agent (absent, not null)', () => {
      expect(historyEntryFromEvent(unassigned())).not.toHaveProperty('newAgentId');
    });
  });

  it('keeps its own copy of the time, so changing the event afterwards does not change the line', () => {
    const event = assigned({ occurredAt: new Date(occurredAt) });

    const entry = historyEntryFromEvent(event);
    event.occurredAt.setUTCFullYear(2000);

    expect(entry.createdAt).toEqual(occurredAt);
  });
});
