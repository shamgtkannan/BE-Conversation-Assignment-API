import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  CreateAgentUseCase,
  GetAgentCommand,
  GetAgentUseCase,
  ListAgentsUseCase,
} from 'agents-application';
import { AgentNotFoundError, IAgentEntity, InvalidAgentError } from 'agents-domain';
import { AddressInfo } from 'net';
import { createValidationPipe } from '../../app/validation-pipe';
import { AuthGuard } from '../../auth/auth.guard';
import { DomainExceptionFilter } from '../../common/domain-exception.filter';
import { AgentsController } from './agents.controller';

const id = '65f1a2b3c4d5e6f708091a2b';

const agent: IAgentEntity = {
  id,
  workspaceId: 'workspace_1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  createdAt: new Date('2026-11-13T08:30:00.000Z'),
  updatedAt: new Date('2026-11-13T08:30:00.000Z'),
};

const authHeaders = (role = 'agent') => ({
  'x-user-id': 'user_123',
  'x-workspace-id': 'workspace_1',
  'x-role': role,
});

describe('GET /agents/:id', () => {
  let app: INestApplication;
  let baseUrl: string;
  const execute = jest.fn<Promise<IAgentEntity>, [GetAgentCommand]>();

  const get = (path: string, headers: Record<string, string> = authHeaders()) =>
    fetch(`${baseUrl}/agents/${path}`, { headers });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [
        { provide: GetAgentUseCase, useValue: { execute } },
        { provide: CreateAgentUseCase, useValue: { execute: jest.fn() } },
        { provide: ListAgentsUseCase, useValue: { execute: jest.fn() } },
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
    execute.mockResolvedValue(agent);
  });

  describe('success', () => {
    it('answers 200 with the agent', async () => {
      const response = await get(id);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        workspaceId: 'workspace_1',
        createdAt: '2026-11-13T08:30:00.000Z',
        updatedAt: '2026-11-13T08:30:00.000Z',
      });
    });

    it('asks for the id in the URL, inside the caller\'s workspace from the auth headers', async () => {
      await get(id);

      expect(execute).toHaveBeenCalledWith({ workspaceId: 'workspace_1', id });
    });

    it.each(['admin', 'manager', 'agent'])('lets the %s role read an agent', async (role) => {
      expect((await get(id, authHeaders(role))).status).toBe(200);
    });
  });

  describe('404 Not Found', () => {
    it('answers 404 when the agent does not exist in the workspace', async () => {
      execute.mockRejectedValue(new AgentNotFoundError(id));

      const response = await get(id);

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        statusCode: 404,
        message: `Agent ${id} was not found`,
        error: 'Not Found',
      });
    });
  });

  describe('400 Bad Request', () => {
    it('answers 400 when the domain finds the id malformed', async () => {
      execute.mockRejectedValue(new InvalidAgentError('id', 'Agent id must be a valid id'));

      const response = await get('abc');

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        statusCode: 400,
        message: 'Agent id must be a valid id',
      });
    });
  });

  describe('401 Unauthorized', () => {
    it('rejects a request without auth headers before reaching the use case', async () => {
      const response = await get(id, {});

      expect(response.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('unexpected failures', () => {
    it('answers 500 without leaking the internal message', async () => {
      execute.mockRejectedValue(new Error('connection to db-prod-7 refused'));

      const response = await get(id);

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain('db-prod-7');
    });
  });
});
