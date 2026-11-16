import { Conversation, CreateConversationProps } from './conversation';
import { CONVERSATION_STATUSES } from './conversation.entity';
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
