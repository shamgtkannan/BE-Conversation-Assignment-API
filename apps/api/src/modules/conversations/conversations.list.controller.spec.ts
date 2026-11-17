import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { InvalidPageRequestError, Page } from '@shared/core';
import {
  AssignConversationUseCase,
  CreateConversationUseCase,
  GetConversationUseCase,
  ListConversationsCommand,
  ListConversationsUseCase,
} from 'conversations-application';
import { IConversationEntity, InvalidConversationError } from 'conversations-domain';
import { AddressInfo } from 'net';
import { createValidationPipe } from '../../app/validation-pipe';
import { AuthGuard } from '../../auth/auth.guard';
import { DomainExceptionFilter } from '../../common/domain-exception.filter';
import { ConversationsController } from './conversations.controller';

const conversation = (n: number, assigned = false): IConversationEntity => ({
  id: n.toString(16).padStart(24, '0'),
  subject: `Conversation ${n}`,
  status: 'open',
  workspaceId: 'workspace_1',
  ...(assigned && {
    assignedAgentId: '0000000000000000000000aa',
    assignedAt: new Date(Date.UTC(2026, 10, 13, 9, n)),
    assignedBy: 'user_123',
  }),
  createdAt: new Date(Date.UTC(2026, 10, 13, 8, n)),
  updatedAt: new Date(Date.UTC(2026, 10, 13, 8, n)),
});

const page: Page<IConversationEntity> = {
  items: [conversation(2, true), conversation(1)],
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

describe('GET /conversations', () => {
  let app: INestApplication;
  let baseUrl: string;
  const execute = jest.fn<Promise<Page<IConversationEntity>>, [ListConversationsCommand]>();

  const get = (query = '', headers: Record<string, string> = authHeaders()) =>
    fetch(`${baseUrl}/conversations${query}`, { headers });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        { provide: ListConversationsUseCase, useValue: { execute } },
        { provide: CreateConversationUseCase, useValue: { execute: jest.fn() } },
        { provide: GetConversationUseCase, useValue: { execute: jest.fn() } },
        { provide: AssignConversationUseCase, useValue: { execute: jest.fn() } },
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
    it('answers 200 with one page of conversations, null for absent assignment fields', async () => {
      const response = await get();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        items: [
          {
            id: '000000000000000000000002',
            subject: 'Conversation 2',
            status: 'open',
            workspaceId: 'workspace_1',
            assignedAgentId: '0000000000000000000000aa',
            assignedAt: '2026-11-13T09:02:00.000Z',
            assignedBy: 'user_123',
            createdAt: '2026-11-13T08:02:00.000Z',
            updatedAt: '2026-11-13T08:02:00.000Z',
          },
          {
            id: '000000000000000000000001',
            subject: 'Conversation 1',
            status: 'open',
            workspaceId: 'workspace_1',
            assignedAgentId: null,
            assignedAt: null,
            assignedBy: null,
            createdAt: '2026-11-13T08:01:00.000Z',
            updatedAt: '2026-11-13T08:01:00.000Z',
          },
        ],
        hasNext: true,
        next: 'next_token',
        hasPrevious: false,
        previous: null,
      });
    });

    it('answers 200 with an empty page', async () => {
      execute.mockResolvedValue({
        items: [],
        hasNext: false,
        next: null,
        hasPrevious: false,
        previous: null,
      });

      const response = await get();

      expect(response.status).toBe(200);
      expect((await response.json()).items).toEqual([]);
    });

    it("lists the caller's workspace, taken from the auth headers", async () => {
      await get();

      expect(execute).toHaveBeenCalledWith({ workspaceId: 'workspace_1' });
    });

    it('passes the paging parameters on, with limit as a number', async () => {
      await get('?limit=5&next=abc');
      await get('?previous=def');

      expect(execute).toHaveBeenNthCalledWith(1, {
        workspaceId: 'workspace_1',
        limit: 5,
        next: 'abc',
      });
      expect(execute).toHaveBeenNthCalledWith(2, { workspaceId: 'workspace_1', previous: 'def' });
    });

    it('passes the status and assignedAgentId filters on', async () => {
      await get('?status=closed&assignedAgentId=0000000000000000000000aa&limit=2');

      expect(execute).toHaveBeenCalledWith({
        workspaceId: 'workspace_1',
        status: 'closed',
        assignedAgentId: '0000000000000000000000aa',
        limit: 2,
      });
    });

    it.each(['admin', 'manager', 'agent'])('lets the %s role list conversations', async (role) => {
      expect((await get('', authHeaders(role))).status).toBe(200);
    });
  });

  describe('400 Bad Request', () => {
    it.each([
      ['a limit that is not a number', '?limit=abc'],
      ['a fractional limit', '?limit=1.5'],
      ['an empty cursor', '?next='],
      ['an empty status', '?status='],
      ['an empty assignedAgentId', '?assignedAgentId='],
      ['an unknown parameter', '?foo=1'],
      ['a workspaceId, which must come from the auth context', '?workspaceId=workspace_9'],
    ])('rejects %s without reaching the use case', async (_label, query) => {
      const response = await get(query);

      expect(response.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    });

    it('answers 400 when the domain rejects the paging parameters', async () => {
      execute.mockRejectedValue(
        new InvalidPageRequestError('limit', 'limit must be a whole number from 1 to 100'),
      );

      const response = await get('?limit=0');

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        statusCode: 400,
        message: 'limit must be a whole number from 1 to 100',
      });
    });

    it('answers 400 when the domain rejects a filter value', async () => {
      execute.mockRejectedValue(
        new InvalidConversationError('status', 'Conversation status must be one of: open, closed'),
      );

      const response = await get('?status=pending');

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        statusCode: 400,
        message: 'Conversation status must be one of: open, closed',
      });
    });
  });

  describe('401 Unauthorized', () => {
    it('rejects a request without auth headers before reaching the use case', async () => {
      const response = await get('', {});

      expect(response.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('unexpected failures', () => {
    it('answers 500 without leaking the internal message', async () => {
      execute.mockRejectedValue(new Error('connection to db-prod-7 refused'));

      const response = await get();

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain('db-prod-7');
    });
  });
});
