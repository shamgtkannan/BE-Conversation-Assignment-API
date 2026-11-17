import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AssignConversationCommand,
  AssignConversationUseCase,
  CreateConversationUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  UnassignConversationUseCase,
} from 'conversations-application';
import {
  AssignedAgentNotFoundError,
  AssignmentNotPermittedError,
  ConversationClosedError,
  ConversationNotFoundError,
  IConversationEntity,
  InvalidConversationError,
} from 'conversations-domain';
import { AddressInfo } from 'net';
import { createValidationPipe } from '../../app/validation-pipe';
import { AuthGuard } from '../../auth/auth.guard';
import { DomainExceptionFilter } from '../../common/domain-exception.filter';
import { ConversationsController } from './conversations.controller';

const conversationId = '65f1a2b3c4d5e6f708091a2b';
const agentId = '65f1a2b3c4d5e6f708091a2c';

const assigned: IConversationEntity = {
  id: conversationId,
  subject: 'Unable to log in',
  status: 'open',
  workspaceId: 'workspace_1',
  assignedAgentId: agentId,
  assignedAt: new Date('2026-11-13T09:00:00.000Z'),
  assignedBy: 'user_123',
  createdAt: new Date('2026-11-13T08:30:00.000Z'),
  updatedAt: new Date('2026-11-13T09:00:00.000Z'),
};

const authHeaders = (role = 'manager') => ({
  'content-type': 'application/json',
  'x-user-id': 'user_123',
  'x-workspace-id': 'workspace_1',
  'x-role': role,
});

describe('PATCH /conversations/:id/assignment', () => {
  let app: INestApplication;
  let baseUrl: string;
  const execute = jest.fn<Promise<IConversationEntity>, [AssignConversationCommand]>();

  const patch = (
    body: unknown = { agentId },
    headers: Record<string, string> = authHeaders(),
    path = conversationId,
  ) =>
    fetch(`${baseUrl}/conversations/${path}/assignment`, {
      method: 'PATCH',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        { provide: AssignConversationUseCase, useValue: { execute } },
        { provide: CreateConversationUseCase, useValue: { execute: jest.fn() } },
        { provide: GetConversationUseCase, useValue: { execute: jest.fn() } },
        { provide: ListConversationsUseCase, useValue: { execute: jest.fn() } },
        { provide: UnassignConversationUseCase, useValue: { execute: jest.fn() } },
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
    execute.mockResolvedValue(assigned);
  });

  describe('200 OK', () => {
    it('answers with the assigned conversation', async () => {
      const response = await patch();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: conversationId,
        subject: 'Unable to log in',
        status: 'open',
        workspaceId: 'workspace_1',
        assignedAgentId: agentId,
        assignedAt: '2026-11-13T09:00:00.000Z',
        assignedBy: 'user_123',
        createdAt: '2026-11-13T08:30:00.000Z',
        updatedAt: '2026-11-13T09:00:00.000Z',
      });
    });

    it('takes workspace, user and role from the auth headers, ids from the request', async () => {
      await patch();

      expect(execute).toHaveBeenCalledWith({
        workspaceId: 'workspace_1',
        userId: 'user_123',
        role: 'manager',
        conversationId,
        agentId,
      });
    });

    it('hands the role to the use case, which decides who may assign', async () => {
      await patch({ agentId }, authHeaders('agent'));

      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ role: 'agent' }));
    });
  });

  describe('400 Bad Request', () => {
    it.each([
      ['a missing body', ''],
      ['an empty object', {}],
      ['a missing agentId', { agent: agentId }],
      ['a non-string agentId', { agentId: 7 }],
      ['an empty agentId', { agentId: '' }],
      ['a null agentId', { agentId: null }],
      ['an extra field', { agentId, assignedBy: 'someone_else' }],
      ['a workspaceId in the body', { agentId, workspaceId: 'workspace_9' }],
      ['malformed JSON', '{ agentId:'],
    ])('rejects %s without reaching the use case', async (_label, body) => {
      const response = await patch(body);

      expect(response.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    });

    it('answers 400 when the domain rejects an id', async () => {
      execute.mockRejectedValue(
        new InvalidConversationError('id', 'Conversation id must be 24 lowercase hexadecimal characters'),
      );

      const response = await patch({ agentId }, authHeaders(), 'abc');

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        statusCode: 400,
        message: 'Conversation id must be 24 lowercase hexadecimal characters',
      });
    });
  });

  describe('domain failures', () => {
    it.each([
      [new AssignmentNotPermittedError('agent'), 403, 'Forbidden'],
      [new ConversationNotFoundError(conversationId), 404, 'Not Found'],
      [new AssignedAgentNotFoundError(agentId), 404, 'Not Found'],
      [new ConversationClosedError(conversationId), 409, 'Conflict'],
    ])('answers %s with %i', async (error, statusCode, reason) => {
      execute.mockRejectedValue(error);

      const response = await patch();

      expect(response.status).toBe(statusCode);
      expect(await response.json()).toEqual({ statusCode, message: error.message, error: reason });
    });
  });

  describe('401 Unauthorized', () => {
    it('rejects a request without auth headers before reaching the use case', async () => {
      const response = await patch({ agentId }, { 'content-type': 'application/json' });

      expect(response.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('unexpected failures', () => {
    it('answers 500 without leaking the internal message', async () => {
      execute.mockRejectedValue(new Error('connection to db-prod-7 refused'));

      const response = await patch();

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain('db-prod-7');
    });
  });
});
