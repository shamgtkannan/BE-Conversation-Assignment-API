import { Conversation, CreateConversationProps } from './conversation';
import { CONVERSATION_STATUSES } from './conversation.entity';
import { ConversationClosedError } from './exceptions/conversation-closed.error';
import { InvalidConversationError } from './exceptions/invalid-conversation.error';

const now = new Date('2026-11-13T08:30:00.000Z');

const props = (overrides: Partial<CreateConversationProps> = {}): CreateConversationProps => ({
  id: '65f1a2b3c4d5e6f708091a2b',
  workspaceId: 'workspace_1',
  subject: 'Unable to log in',
  now,
  ...overrides,
});

describe('conversation statuses', () => {
  it('are open and closed', () => {
    expect([...CONVERSATION_STATUSES]).toEqual(['open', 'closed']);
  });
});

describe('Conversation.create', () => {
  it('creates a conversation from the given values', () => {
    const conversation = Conversation.create(props());

    expect(conversation.id).toBe('65f1a2b3c4d5e6f708091a2b');
    expect(conversation.workspaceId).toBe('workspace_1');
    expect(conversation.subject).toBe('Unable to log in');
  });

  it('starts open when no status is given', () => {
    expect(Conversation.create(props()).status).toBe('open');
  });

  it.each(CONVERSATION_STATUSES)('can start as %s', (status) => {
    expect(Conversation.create(props({ status })).status).toBe(status);
  });

  it('starts with nobody assigned: all three assignment fields are absent', () => {
    const conversation = Conversation.create(props());

    expect(conversation.assignedAgentId).toBeUndefined();
    expect(conversation.assignedAt).toBeUndefined();
    expect(conversation.assignedBy).toBeUndefined();
  });

  it('sets createdAt and updatedAt to the given time', () => {
    const conversation = Conversation.create(props());

    expect(conversation.createdAt).toEqual(now);
    expect(conversation.updatedAt).toEqual(now);
  });

  it('keeps its own copy of the time so later changes to the input do not leak in', () => {
    const input = new Date(now);
    const conversation = Conversation.create(props({ now: input }));

    input.setUTCFullYear(2000);

    expect(conversation.createdAt).toEqual(now);
    expect(conversation.updatedAt).toEqual(now);
    expect(conversation.createdAt).not.toBe(conversation.updatedAt);
  });

  describe('subject', () => {
    it('trims surrounding whitespace and keeps the text inside', () => {
      expect(Conversation.create(props({ subject: '  Can\'t  log in\n' })).subject).toBe(
        "Can't  log in",
      );
    });

    it.each(['', '   ', '\t\n'])('rejects the blank subject %j', (subject) => {
      expect(() => Conversation.create(props({ subject }))).toThrow(InvalidConversationError);
      expect(() => Conversation.create(props({ subject }))).toThrow(
        expect.objectContaining({ field: 'subject' }),
      );
    });
  });

  describe('status', () => {
    it.each(['pending', 'OPEN', '', 'archived'])('rejects the unknown status %j', (status) => {
      expect(() =>
        Conversation.create(props({ status: status as unknown as 'open' })),
      ).toThrow(expect.objectContaining({ name: 'InvalidConversationError', field: 'status' }));
    });
  });
});

describe('Conversation.assign', () => {
  const agentA = '65f1a2b3c4d5e6f708091a2c';
  const agentB = '65f1a2b3c4d5e6f708091a2d';
  const later = new Date('2026-11-13T09:00:00.000Z');
  const evenLater = new Date('2026-11-13T10:00:00.000Z');

  it('assigns an unassigned conversation, recording who and when', () => {
    const assigned = Conversation.create(props()).assign(agentA, 'user_1', later);

    expect(assigned).toMatchObject({
      id: '65f1a2b3c4d5e6f708091a2b',
      subject: 'Unable to log in',
      status: 'open',
      workspaceId: 'workspace_1',
      assignedAgentId: agentA,
      assignedAt: later,
      assignedBy: 'user_1',
      createdAt: now,
      updatedAt: later,
    });
  });

  it('leaves the original conversation untouched', () => {
    const original = Conversation.create(props());

    original.assign(agentA, 'user_1', later);

    expect(original.assignedAgentId).toBeUndefined();
    expect(original.updatedAt).toEqual(now);
  });

  it('replaces the current agent, assignedAt and assignedBy on reassignment', () => {
    const first = Conversation.create(props()).assign(agentA, 'user_1', later);

    const second = first.assign(agentB, 'user_2', evenLater);

    expect(second).toMatchObject({
      assignedAgentId: agentB,
      assignedAt: evenLater,
      assignedBy: 'user_2',
      createdAt: now,
      updatedAt: evenLater,
    });
  });

  it('changes nothing when the same agent is assigned again', () => {
    const first = Conversation.create(props()).assign(agentA, 'user_1', later);

    const again = first.assign(agentA, 'user_2', evenLater);

    expect(again).toBe(first);
    expect(again).toMatchObject({ assignedAt: later, assignedBy: 'user_1', updatedAt: later });
  });

  it('copies the dates it is given, so the caller cannot change them afterwards', () => {
    const at = new Date(later);
    const assigned = Conversation.create(props()).assign(agentA, 'user_1', at);

    at.setUTCFullYear(2000);

    expect(assigned.assignedAt).toEqual(later);
    expect(assigned.updatedAt).toEqual(later);
  });

  describe('closed conversations', () => {
    const closed = () => Conversation.create(props({ status: 'closed' }));

    it('cannot be assigned', () => {
      expect(() => closed().assign(agentA, 'user_1', later)).toThrow(ConversationClosedError);
      expect(() => closed().assign(agentA, 'user_1', later)).toThrow(
        'Conversation 65f1a2b3c4d5e6f708091a2b is closed and cannot be assigned',
      );
    });

    it('cannot be reassigned, not even to the same agent', () => {
      const withAgent = Object.assign(closed(), { assignedAgentId: agentA });

      expect(() => withAgent.assign(agentB, 'user_1', later)).toThrow(ConversationClosedError);
      expect(() => withAgent.assign(agentA, 'user_1', later)).toThrow(ConversationClosedError);
    });
  });
});

describe('Conversation.restore', () => {
  it('rebuilds an unassigned conversation, leaving the assignment fields absent', () => {
    const entity = { ...Conversation.create(props()) };

    const restored = Conversation.restore(entity);

    expect(restored).toBeInstanceOf(Conversation);
    expect(restored).toMatchObject({ id: '65f1a2b3c4d5e6f708091a2b', status: 'open', createdAt: now });
    expect(restored.assignedAgentId).toBeUndefined();
    expect(restored.assignedAt).toBeUndefined();
    expect(restored.assignedBy).toBeUndefined();
  });

  it('rebuilds an assigned conversation with all its fields', () => {
    const assigned = Conversation.create(props()).assign('65f1a2b3c4d5e6f708091a2c', 'user_1', now);

    expect(Conversation.restore({ ...assigned })).toEqual(assigned);
  });

  it('can be assigned again after restoring', () => {
    const restored = Conversation.restore({ ...Conversation.create(props()) });

    expect(restored.assign('65f1a2b3c4d5e6f708091a2c', 'user_1', now).assignedBy).toBe('user_1');
  });
});

describe('Conversation.unassign', () => {
  const agentA = '65f1a2b3c4d5e6f708091a2c';
  const assignedAt = new Date('2026-11-13T09:00:00.000Z');
  const later = new Date('2026-11-13T11:00:00.000Z');
  const assigned = () => Conversation.create(props()).assign(agentA, 'user_1', assignedAt);

  it('clears the three assignment fields and touches updatedAt', () => {
    const unassigned = assigned().unassign(later);

    expect(unassigned.assignedAgentId).toBeUndefined();
    expect(unassigned.assignedAt).toBeUndefined();
    expect(unassigned.assignedBy).toBeUndefined();
    expect(unassigned).toMatchObject({
      id: '65f1a2b3c4d5e6f708091a2b',
      subject: 'Unable to log in',
      status: 'open',
      workspaceId: 'workspace_1',
      createdAt: now,
      updatedAt: later,
    });
  });

  it('leaves the original conversation untouched', () => {
    const original = assigned();

    original.unassign(later);

    expect(original).toMatchObject({ assignedAgentId: agentA, updatedAt: assignedAt });
  });

  it('changes nothing for a conversation nobody is assigned to', () => {
    const fresh = Conversation.create(props());

    const result = fresh.unassign(later);

    expect(result).toBe(fresh);
    expect(result.updatedAt).toEqual(now);
  });

  it('changes nothing when unassigned twice', () => {
    const once = assigned().unassign(later);

    expect(once.unassign(new Date('2026-11-13T12:00:00.000Z'))).toBe(once);
  });

  it('is allowed on a closed conversation, because only assigning is frozen', () => {
    const closedAndAssigned = Object.assign(Conversation.create(props({ status: 'closed' })), {
      assignedAgentId: agentA,
      assignedAt,
      assignedBy: 'user_1',
    });

    const result = closedAndAssigned.unassign(later);

    expect(result.status).toBe('closed');
    expect(result.assignedAgentId).toBeUndefined();
    expect(result.updatedAt).toEqual(later);
  });

  it('copies the date it is given, so the caller cannot change it afterwards', () => {
    const at = new Date(later);
    const result = assigned().unassign(at);

    at.setUTCFullYear(2000);

    expect(result.updatedAt).toEqual(later);
  });

  it('can be assigned again afterwards', () => {
    const again = assigned().unassign(later).assign(agentA, 'user_2', later);

    expect(again).toMatchObject({ assignedAgentId: agentA, assignedBy: 'user_2', assignedAt: later });
  });
});

describe('Conversation version', () => {
  const agentA = '65f1a2b3c4d5e6f708091a2c';
  const agentB = '65f1a2b3c4d5e6f708091a2d';
  const later = new Date('2026-11-13T09:00:00.000Z');

  it('starts at 0', () => {
    expect(Conversation.create(props()).version).toBe(0);
  });

  it('goes up by one when an agent is assigned', () => {
    const assigned = Conversation.create(props()).assign(agentA, 'user_1', later);

    expect(assigned.version).toBe(1);
  });

  it('goes up by one on every reassignment', () => {
    const reassigned = Conversation.create(props())
      .assign(agentA, 'user_1', later)
      .assign(agentB, 'user_1', later);

    expect(reassigned.version).toBe(2);
  });

  it('stays the same when the same agent is assigned again, because nothing changed', () => {
    const assigned = Conversation.create(props()).assign(agentA, 'user_1', later);

    expect(assigned.assign(agentA, 'user_1', later).version).toBe(1);
  });

  it('goes up by one when the agent is removed', () => {
    const unassigned = Conversation.create(props()).assign(agentA, 'user_1', later).unassign(later);

    expect(unassigned.version).toBe(2);
  });

  it('stays the same when nobody was assigned, because nothing changed', () => {
    expect(Conversation.create(props()).unassign(later).version).toBe(0);
  });

  it('leaves the original conversation at its own version', () => {
    const original = Conversation.create(props());

    original.assign(agentA, 'user_1', later);

    expect(original.version).toBe(0);
  });

  it('is kept when a stored conversation is restored, and counts on from there', () => {
    const stored = { ...Conversation.create(props()).assign(agentA, 'user_1', later) };

    const restored = Conversation.restore(stored);

    expect(restored.version).toBe(1);
    expect(restored.assign(agentB, 'user_1', later).version).toBe(2);
  });
});
