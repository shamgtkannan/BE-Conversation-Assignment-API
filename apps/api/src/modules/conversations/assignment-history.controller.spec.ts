import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { InvalidPageRequestError, Page } from '@shared/core';
import {
  ListAssignmentHistoryCommand,
  ListAssignmentHistoryUseCase,
} from 'conversations-application';
import {
  ConversationNotFoundError,
  IAssignmentHistoryEntity,
  InvalidConversationError,
} from 'conversations-domain';
import { AddressInfo } from 'net';
import { createValidationPipe } from '../../app/validation-pipe';
import { AuthGuard } from '../../auth/auth.guard';
import { DomainExceptionFilter } from '../../common/domain-exception.filter';
import { AssignmentHistoryController } from './assignment-history.controller';

const conversationId = '65f1a2b3c4d5e6f708091a2b';
const agentA = '65f1a2b3c4d5e6f708091a2c';
const agentB = '65f1a2b3c4d5e6f708091a2d';

const reassigned: IAssignmentHistoryEntity = {
  id: '000000000000000000000002',
  eventId: 'event_2',
  workspaceId: 'workspace_1',
  conversationId,
  action: 'assigned',
  previousAgentId: agentA,
  newAgentId: agentB,
  performedBy: 'user_2',
  createdAt: new Date('2026-11-13T10:00:00.000Z'),
  version: 2,
};

const first: IAssignmentHistoryEntity = {
  id: '000000000000000000000001',
  eventId: 'event_1',
  workspaceId: 'workspace_1',
  conversationId,
  action: 'assigned',
  newAgentId: agentA,
  performedBy: 'user_1',
  createdAt: new Date('2026-11-13T09:00:00.000Z'),
  version: 1,
};

const removed: IAssignmentHistoryEntity = {
  id: '000000000000000000000003',
  eventId: 'event_3',
  workspaceId: 'workspace_1',
  conversationId,
  action: 'unassigned',
  previousAgentId: agentB,
  performedBy: 'user_3',
  createdAt: new Date('2026-11-13T11:00:00.000Z'),
  version: 3,
};

const page: Page<IAssignmentHistoryEntity> = {
  items: [removed, reassigned, first],
  hasNext: true,
  next: 'next_token',
  hasPrevious: false,
  previous: null,
};

const authHeaders = (role = 'agent') => ({
  'x-user-id': 'user_123',
  'x-workspace-id': 'workspace_1',
  'x-role': role,
});

describe('GET /conversations/:id/assignment-history', () => {
  let app: INestApplication;
  let baseUrl: string;
  const execute = jest.fn<Promise<Page<IAssignmentHistoryEntity>>, [ListAssignmentHistoryCommand]>();

  const get = (query = '', headers: Record<string, string> = authHeaders(), id = conversationId) =>
    fetch(`${baseUrl}/conversations/${id}/assignment-history${query}`, { headers });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AssignmentHistoryController],
      providers: [
        { provide: ListAssignmentHistoryUseCase, useValue: { execute } },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: DomainExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(createValidationPipe());
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue(page);
  });

  describe('success', () => {
    it('answers 200 with one page, naming agents and user, with null where there was no agent', async () => {
      const response = await get();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        items: [
          {
            id: '000000000000000000000003',
            conversationId,
            action: 'unassigned',
            previousAgentId: agentB,
            newAgentId: null,
            performedBy: 'user_3',
            occurredAt: '2026-11-13T11:00:00.000Z',
            version: 3,
          },
          {
            id: '000000000000000000000002',
            conversationId,
            action: 'assigned',
            previousAgentId: agentA,
            newAgentId: agentB,
            performedBy: 'user_2',
            occurredAt: '2026-11-13T10:00:00.000Z',
            version: 2,
          },
          {
            id: '000000000000000000000001',
            conversationId,
            action: 'assigned',
            previousAgentId: null,
            newAgentId: agentA,
            performedBy: 'user_1',
            occurredAt: '2026-11-13T09:00:00.000Z',
            version: 1,
          },
        ],
        hasNext: true,
        next: 'next_token',
        hasPrevious: false,
        previous: null,
      });
    });

    it('does not expose the event id or the workspace', async () => {
      const body = (await (await get()).json()) as { items: object[] };

      for (const item of body.items) {
        expect(item).not.toHaveProperty('eventId');
        expect(item).not.toHaveProperty('workspaceId');
      }
    });

    it('answers an empty page for a conversation without history', async () => {
      execute.mockResolvedValue({ items: [], hasNext: false, next: null, hasPrevious: false, previous: null });

      const response = await get();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ items: [], hasNext: false, next: null, hasPrevious: false, previous: null });
    });
  });

  describe('what it asks of the use case', () => {
    it('takes the workspace from the auth headers and the conversation from the path', async () => {
      await get();

      expect(execute).toHaveBeenCalledWith({
        workspaceId: 'workspace_1',
        conversationId,
        limit: undefined,
        next: undefined,
        previous: undefined,
      });
    });

    it('passes the paging parameters on, with the limit as a number', async () => {
      await get('?limit=5&next=abc');

      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, next: 'abc' }));
    });

    it.each(['agent', 'manager', 'admin'])('lets the %s role read', async (role) => {
      expect((await get('', authHeaders(role))).status).toBe(200);
    });
  });

  describe('errors', () => {
    it('answers 401 without auth headers, before touching the use case', async () => {
      const response = await get('', {});

      expect(response.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    });

    it.each(['?limit=abc', '?limit=1.5', '?next=', '?previous=', '?status=open', '?workspaceId=other'])(
      'answers 400 for the query %s, before touching the use case',
      async (query) => {
        const response = await get(query);

        expect(response.status).toBe(400);
        expect(execute).not.toHaveBeenCalled();
      },
    );

    it('answers 404 when the conversation is not in the workspace', async () => {
      execute.mockRejectedValue(new ConversationNotFoundError(conversationId));

      expect((await get()).status).toBe(404);
    });

    it('answers 400 for a malformed conversation id', async () => {
      execute.mockRejectedValue(new InvalidConversationError('id', 'Conversation id must be 24 lowercase hexadecimal characters'));

      expect((await get('', authHeaders(), 'conv_123')).status).toBe(400);
    });

    it('answers 400 for a limit or token the domain rejects', async () => {
      execute.mockRejectedValue(new InvalidPageRequestError('limit', 'Limit is out of range'));

      expect((await get('?limit=500')).status).toBe(400);
    });
  });
});
