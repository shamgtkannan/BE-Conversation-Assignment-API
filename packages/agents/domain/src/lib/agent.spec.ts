import { Agent, CreateAgentProps } from './agent';
import { InvalidAgentError } from './exceptions/invalid-agent.error';

const now = new Date('2026-11-13T08:30:00.000Z');

const props = (overrides: Partial<CreateAgentProps> = {}): CreateAgentProps => ({
  id: '65f1a2b3c4d5e6f708091a2b',
  workspaceId: 'workspace_1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  now,
  ...overrides,
});

describe('Agent.create', () => {
  it('creates an agent from the given values', () => {
    const agent = Agent.create(props());

    expect(agent.id).toBe('65f1a2b3c4d5e6f708091a2b');
    expect(agent.workspaceId).toBe('workspace_1');
    expect(agent.name).toBe('Ada Lovelace');
    expect(agent.email).toBe('ada@example.com');
  });

  it('sets createdAt and updatedAt to the given time', () => {
    const agent = Agent.create(props());

    expect(agent.createdAt).toEqual(now);
    expect(agent.updatedAt).toEqual(now);
  });

  it('keeps its own copy of the time so later changes to the input do not leak in', () => {
    const input = new Date(now);
    const agent = Agent.create(props({ now: input }));

    input.setUTCFullYear(2000);

    expect(agent.createdAt).toEqual(now);
    expect(agent.updatedAt).toEqual(now);
  });

  describe('name', () => {
    it('trims surrounding whitespace', () => {
      expect(Agent.create(props({ name: '  Ada Lovelace  ' })).name).toBe('Ada Lovelace');
    });

    it.each(['', '   ', '\t\n'])('rejects the blank name %j', (name) => {
      expect(() => Agent.create(props({ name }))).toThrow(InvalidAgentError);
      expect(() => Agent.create(props({ name }))).toThrow(
        expect.objectContaining({ field: 'name' }),
      );
    });
  });

  describe('email', () => {
    it('trims surrounding whitespace and lowercases', () => {
      expect(Agent.create(props({ email: '  Ada.Lovelace@Example.COM  ' })).email).toBe(
        'ada.lovelace@example.com',
      );
    });

    it('treats addresses that differ only in letter case as the same address', () => {
      const a = Agent.create(props({ email: 'ADA@example.com' }));
      const b = Agent.create(props({ email: 'ada@EXAMPLE.com' }));

      expect(a.email).toBe(b.email);
    });

    it('keeps plus tags and dots: they can be distinct real mailboxes', () => {
      expect(Agent.create(props({ email: 'ada+support@mail.example.co.uk' })).email).toBe(
        'ada+support@mail.example.co.uk',
      );
      expect(Agent.create(props({ email: 'a.da@example.com' })).email).toBe(
        'a.da@example.com',
      );
    });

    it.each([
      '',
      '   ',
      'not-an-email',
      'ada@',
      '@example.com',
      'ada@example',
      'ada lovelace@example.com',
      'ada@@example.com',
      'ada@exa mple.com',
    ])('rejects the malformed address %j', (email) => {
      expect(() => Agent.create(props({ email }))).toThrow(InvalidAgentError);
      expect(() => Agent.create(props({ email }))).toThrow(
        expect.objectContaining({ field: 'email' }),
      );
    });
  });
});
