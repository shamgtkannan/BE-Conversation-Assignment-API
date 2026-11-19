import { AssignRequested, UnassignRequested } from 'conversations-domain';
import { InvalidRequestMessageError, decodeAssignmentRequest } from './assignment-request-decoder';

const assign: AssignRequested = {
  type: 'conversation.assignment-requested.v1',
  commandId: 'command_1',
  requestedAt: new Date('2026-11-13T09:00:00.000Z'),
  workspaceId: 'workspace_1',
  conversationId: '65f1a2b3c4d5e6f708091a2b',
  action: 'assign',
  agentId: '65f1a2b3c4d5e6f708091a2c',
  requestedBy: 'user_1',
  role: 'manager',
};

const unassign: UnassignRequested = {
  type: 'conversation.assignment-requested.v1',
  commandId: 'command_2',
  requestedAt: new Date('2026-11-13T10:00:00.000Z'),
  workspaceId: 'workspace_1',
  conversationId: '65f1a2b3c4d5e6f708091a2b',
  action: 'unassign',
  requestedBy: 'user_2',
  role: 'admin',
};

const wire = (message: object) => JSON.stringify(message);

describe('decodeAssignmentRequest', () => {
  it('reads back an assign request, with the time as a Date again', () => {
    expect(decodeAssignmentRequest(wire(assign))).toEqual(assign);
    expect(decodeAssignmentRequest(wire(assign)).requestedAt).toBeInstanceOf(Date);
  });

  it('reads back an unassign request, which has no agent', () => {
    const decoded = decodeAssignmentRequest(wire(unassign));

    expect(decoded).toEqual(unassign);
    expect(decoded).not.toHaveProperty('agentId');
  });

  it('ignores fields it does not know, so a newer producer does not break an older consumer', () => {
    const decoded = decodeAssignmentRequest(wire({ ...assign, somethingNew: 'x' }));

    expect(decoded).toEqual(assign);
    expect(decoded).not.toHaveProperty('somethingNew');
  });

  it('drops an agent id sent with an unassign request', () => {
    expect(decodeAssignmentRequest(wire({ ...unassign, agentId: '65f1a2b3c4d5e6f708091a2c' }))).not.toHaveProperty(
      'agentId',
    );
  });

  describe('rejects a message that is not a well-formed request', () => {
    const rejects = (value: string) =>
      expect(() => decodeAssignmentRequest(value)).toThrow(InvalidRequestMessageError);

    it.each([
      ['text that is not JSON', 'not json'],
      ['an empty value', ''],
      ['JSON null', 'null'],
      ['a JSON array', '[]'],
      ['a JSON string', '"hello"'],
      ['an object without a type', wire({ ...assign, type: undefined })],
      ['an unknown type', wire({ ...assign, type: 'conversation.assigned.v1' })],
      ['an unknown action', wire({ ...assign, action: 'close' })],
      ['no action', wire({ ...assign, action: undefined })],
    ])('%s', (_label, value) => rejects(value));

    it.each(['commandId', 'requestedAt', 'workspaceId', 'conversationId', 'requestedBy', 'role', 'agentId'])(
      'an assign request without %s',
      (field) => rejects(wire({ ...assign, [field]: undefined })),
    );

    it.each(['commandId', 'requestedAt', 'workspaceId', 'conversationId', 'requestedBy', 'role'])(
      'an unassign request without %s',
      (field) => rejects(wire({ ...unassign, [field]: undefined })),
    );

    it.each([
      ['an empty command id', { commandId: '' }],
      ['an empty workspace id', { workspaceId: '' }],
      ['an empty agent id', { agentId: '' }],
      ['an empty role', { role: '' }],
      ['a command id that is a number', { commandId: 5 }],
      ['a time that is not a date', { requestedAt: 'yesterday' }],
      ['a time that is a number', { requestedAt: 1763000000000 }],
    ])('an assign request with %s', (_label, overrides) => rejects(wire({ ...assign, ...overrides })));
  });

  it('says why a message was rejected', () => {
    expect(() => decodeAssignmentRequest('not json')).toThrow(/Not an assignment request/);
  });
});
