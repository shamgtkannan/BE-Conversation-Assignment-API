import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  CreateAgentUseCase,
  GetAgentUseCase,
  ListAgentsCommand,
  ListAgentsUseCase,
} from 'agents-application';
import { InvalidPageRequestError, Page } from '@shared/core';
import { IAgentEntity } from 'agents-domain';
import { AddressInfo } from 'net';
import { createValidationPipe } from '../../app/validation-pipe';
import { AuthGuard } from '../../auth/auth.guard';
import { DomainExceptionFilter } from '../../common/domain-exception.filter';
import { AgentsController } from './agents.controller';

const agent = (n: number): IAgentEntity => ({
  id: n.toString(16).padStart(24, '0'),
  workspaceId: 'workspace_1',
  name: `Agent ${n}`,
  email: `agent${n}@example.com`,
  createdAt: new Date(Date.UTC(2026, 10, 13, 8, n)),
  updatedAt: new Date(Date.UTC(2026, 10, 13, 8, n)),
});

const page: Page<IAgentEntity> = {
  items: [agent(2), agent(1)],
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

describe('GET /agents', () => {
  let app: INestApplication;
  let baseUrl: string;
  const execute = jest.fn<Promise<Page<IAgentEntity>>, [ListAgentsCommand]>();

  const get = (query = '', headers: Record<string, string> = authHeaders()) =>
    fetch(`${baseUrl}/agents${query}`, { headers });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [
        { provide: ListAgentsUseCase, useValue: { execute } },
        { provide: CreateAgentUseCase, useValue: { execute: jest.fn() } },
        { provide: GetAgentUseCase, useValue: { execute: jest.fn() } },
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
    it('answers 200 with one page of agents', async () => {
      const response = await get();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        items: [
          {
            id: '000000000000000000000002',
            name: 'Agent 2',
            email: 'agent2@example.com',
            workspaceId: 'workspace_1',
            createdAt: '2026-11-13T08:02:00.000Z',
            updatedAt: '2026-11-13T08:02:00.000Z',
          },
          {
            id: '000000000000000000000001',
            name: 'Agent 1',
            email: 'agent1@example.com',
            workspaceId: 'workspace_1',
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

    it('lists the caller\'s workspace, taken from the auth headers', async () => {
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

    it.each(['admin', 'manager', 'agent'])('lets the %s role list agents', async (role) => {
      expect((await get('', authHeaders(role))).status).toBe(200);
    });
  });

  describe('400 Bad Request', () => {
    it.each([
      ['a limit that is not a number', '?limit=abc'],
      ['a fractional limit', '?limit=1.5'],
      ['an empty cursor', '?next='],
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
