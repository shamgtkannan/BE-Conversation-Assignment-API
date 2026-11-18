import { IConversationEntity } from 'conversations-domain';
import { toConversationPageResponse, toConversationResponse } from './conversation.response';

const unassigned: IConversationEntity = {
  id: '65f1a2b3c4d5e6f708091a2b',
  subject: 'Unable to log in',
  status: 'open',
  workspaceId: 'workspace_1',
  createdAt: new Date('2026-11-13T08:30:00.000Z'),
  updatedAt: new Date('2026-11-13T08:30:00.000Z'),
  version: 0,
};

const assigned: IConversationEntity = {
  ...unassigned,
  assignedAgentId: '65f1a2b3c4d5e6f708091a2c',
  assignedAt: new Date('2026-11-13T09:00:00.000Z'),
  assignedBy: 'user_123',
  updatedAt: new Date('2026-11-13T09:00:00.000Z'),
  version: 0,
};

describe('toConversationResponse', () => {
  it('maps an unassigned conversation, with the assignment fields as explicit null', () => {
    expect(toConversationResponse(unassigned)).toEqual({
      id: '65f1a2b3c4d5e6f708091a2b',
      subject: 'Unable to log in',
      status: 'open',
      workspaceId: 'workspace_1',
      assignedAgentId: null,
      assignedAt: null,
      assignedBy: null,
      createdAt: '2026-11-13T08:30:00.000Z',
      updatedAt: '2026-11-13T08:30:00.000Z',
    });
  });

  it('includes the three assignment keys in the JSON even when unassigned', () => {
    const json = JSON.parse(JSON.stringify(toConversationResponse(unassigned)));

    expect(json).toHaveProperty('assignedAgentId', null);
    expect(json).toHaveProperty('assignedAt', null);
    expect(json).toHaveProperty('assignedBy', null);
  });

  it('maps an assigned conversation, with the assignment time as an ISO string', () => {
    expect(toConversationResponse(assigned)).toEqual({
      id: '65f1a2b3c4d5e6f708091a2b',
      subject: 'Unable to log in',
      status: 'open',
      workspaceId: 'workspace_1',
      assignedAgentId: '65f1a2b3c4d5e6f708091a2c',
      assignedAt: '2026-11-13T09:00:00.000Z',
      assignedBy: 'user_123',
      createdAt: '2026-11-13T08:30:00.000Z',
      updatedAt: '2026-11-13T09:00:00.000Z',
    });
  });

  it('keeps a closed status', () => {
    expect(toConversationResponse({ ...unassigned, status: 'closed' }).status).toBe('closed');
  });

  it('exposes exactly the specified fields and nothing else', () => {
    const withExtras = { ...assigned, internalNote: 'secret', __v: 3 } as IConversationEntity;

    expect(Object.keys(toConversationResponse(withExtras)).sort()).toEqual(
      [
        'assignedAgentId',
        'assignedAt',
        'assignedBy',
        'createdAt',
        'id',
        'status',
        'subject',
        'updatedAt',
        'workspaceId',
      ].sort(),
    );
  });
});

describe('toConversationPageResponse', () => {
  it('maps every item and keeps the paging fields', () => {
    expect(
      toConversationPageResponse({
        items: [assigned, unassigned],
        hasNext: true,
        next: 'next_token',
        hasPrevious: false,
        previous: null,
      }),
    ).toEqual({
      items: [toConversationResponse(assigned), toConversationResponse(unassigned)],
      hasNext: true,
      next: 'next_token',
      hasPrevious: false,
      previous: null,
    });
  });
});
