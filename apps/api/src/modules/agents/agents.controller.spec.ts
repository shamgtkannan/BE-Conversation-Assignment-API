import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { CreateAgentCommand, CreateAgentUseCase, ListAgentsUseCase } from 'agents-application';
import { AgentEmailAlreadyExistsError, IAgentEntity, InvalidAgentError } from 'agents-domain';
import { AddressInfo } from 'net';
import { createValidationPipe } from '../../app/validation-pipe';
import { AuthGuard } from '../../auth/auth.guard';
import { DomainExceptionFilter } from '../../common/domain-exception.filter';
import { AgentsController } from './agents.controller';

const savedAgent: IAgentEntity = {
  id: '65f1a2b3c4d5e6f708091a2b',
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

describe('POST /agents', () => {
  let app: INestApplication;
  let baseUrl: string;
  const execute = jest.fn<Promise<IAgentEntity>, [CreateAgentCommand]>();

  const post = (body: unknown, headers: Record<string, string> = authHeaders()) =>
    fetch(`${baseUrl}/agents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [
        { provide: CreateAgentUseCase, useValue: { execute } },
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
    execute.mockResolvedValue(savedAgent);
  });

  describe('success', () => {
    it('answers 201 with the created agent', async () => {
      const response = await post({ name: 'Ada Lovelace', email: 'ada@example.com' });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        id: '65f1a2b3c4d5e6f708091a2b',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        workspaceId: 'workspace_1',
        createdAt: '2026-11-13T08:30:00.000Z',
        updatedAt: '2026-11-13T08:30:00.000Z',
      });
    });

    it('takes the workspace from the auth context and the rest from the body', async () => {
      await post({ name: 'Ada Lovelace', email: 'ada@example.com' });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith({
        workspaceId: 'workspace_1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      });
    });

    it.each(['admin', 'manager', 'agent'])('lets the %s role create an agent', async (role) => {
      const response = await post(
        { name: 'Ada Lovelace', email: 'ada@example.com' },
        authHeaders(role),
      );

      expect(response.status).toBe(201);
    });
  });

  describe('400 Bad Request', () => {
    it.each([
      ['an empty body', {}],
      ['a missing name', { email: 'ada@example.com' }],
      ['a missing email', { name: 'Ada Lovelace' }],
      ['an empty name', { name: '', email: 'ada@example.com' }],
      ['a name that is not a string', { name: 42, email: 'ada@example.com' }],
      ['an email that is not a string', { name: 'Ada Lovelace', email: 42 }],
      ['a malformed email', { name: 'Ada Lovelace', email: 'not-an-email' }],
    ])('rejects %s', async (_label, body) => {
      const response = await post(body);

      expect(response.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    });

    it.each(['workspaceId', 'id', 'createdAt', 'role'])(
      'rejects a body that sets %s, which must not come from the client',
      async (field) => {
        const response = await post({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          [field]: 'workspace_999',
        });

        expect(response.status).toBe(400);
        expect(execute).not.toHaveBeenCalled();
      },
    );

    it('answers 400 when the domain rejects the data', async () => {
      execute.mockRejectedValue(new InvalidAgentError('name', 'Agent name must not be blank'));

      const response = await post({ name: '   ', email: 'ada@example.com' });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        statusCode: 400,
        message: 'Agent name must not be blank',
      });
    });
  });

  describe('401 Unauthorized', () => {
    it('rejects a request without auth headers before reaching the use case', async () => {
      const response = await post({ name: 'Ada Lovelace', email: 'ada@example.com' }, {});

      expect(response.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an unknown role', async () => {
      const response = await post(
        { name: 'Ada Lovelace', email: 'ada@example.com' },
        authHeaders('owner'),
      );

      expect(response.status).toBe(401);
    });
  });

  describe('409 Conflict', () => {
    it('answers 409 when the email already exists in the workspace', async () => {
      execute.mockRejectedValue(new AgentEmailAlreadyExistsError('ada@example.com'));

      const response = await post({ name: 'Ada Lovelace', email: 'ada@example.com' });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ statusCode: 409 });
    });
  });

  describe('unexpected failures', () => {
    it('answers 500 without leaking the internal message', async () => {
      execute.mockRejectedValue(new Error('connection to db-prod-7 refused'));

      const response = await post({ name: 'Ada Lovelace', email: 'ada@example.com' });

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain('db-prod-7');
    });
  });
});
