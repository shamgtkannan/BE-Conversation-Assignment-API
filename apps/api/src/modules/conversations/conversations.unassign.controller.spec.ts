import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AssignConversationUseCase,
  CreateConversationUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  UnassignConversationCommand,
  UnassignConversationUseCase,
} from 'conversations-application';
import {
  AssignmentNotPermittedError,
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

/** What the use case returns: the assignment fields are absent in the domain. */
const unassigned: IConversationEntity = {
  id: conversationId,
  subject: 'Unable to log in',
  status: 'open',
  workspaceId: 'workspace_1',
  createdAt: new Date('2026-11-13T08:30:00.000Z'),
  updatedAt: new Date('2026-11-13T10:00:00.000Z'),
  version: 0,
};

const authHeaders = (role = 'manager') => ({
  'x-user-id': 'user_123',
  'x-workspace-id': 'workspace_1',
  'x-role': role,
});

describe('DELETE /conversations/:id/assignment', () => {
  let app: INestApplication;
  let baseUrl: string;
  const execute = jest.fn<Promise<IConversationEntity>, [UnassignConversationCommand]>();

  const del = (headers: Record<string, string> = authHeaders(), path = conversationId) =>
    fetch(`${baseUrl}/conversations/${path}/assignment`, { method: 'DELETE', headers });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        { provide: UnassignConversationUseCase, useValue: { execute } },
        { provide: AssignConversationUseCase, useValue: { execute: jest.fn() } },
        { provide: CreateConversationUseCase, useValue: { execute: jest.fn() } },
        { provide: GetConversationUseCase, useValue: { execute: jest.fn() } },
        { provide: ListConversationsUseCase, useValue: { execute: jest.fn() } },
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
    execute.mockResolvedValue(unassigned);
  });

  describe('200 OK', () => {
    it('answers with the conversation, the assignment fields as explicit null', async () => {
      const response = await del();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: conversationId,
        subject: 'Unable to log in',
        status: 'open',
        workspaceId: 'workspace_1',
        assignedAgentId: null,
        assignedAt: null,
        assignedBy: null,
        createdAt: '2026-11-13T08:30:00.000Z',
        updatedAt: '2026-11-13T10:00:00.000Z',
      });
    });

    it('takes workspace and role from the auth headers, the id from the path', async () => {
      await del();

      expect(execute).toHaveBeenCalledWith({
        workspaceId: 'workspace_1',
        role: 'manager',
        conversationId,
      });
    });

    it('hands the role to the use case, which decides who may unassign', async () => {
      await del(authHeaders('agent'));

      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ role: 'agent' }));
    });
  });

  describe('domain failures', () => {
    it.each([
      [new AssignmentNotPermittedError('agent'), 403, 'Forbidden'],
      [new ConversationNotFoundError(conversationId), 404, 'Not Found'],
      [
        new InvalidConversationError('id', 'Conversation id must be 24 lowercase hexadecimal characters'),
        400,
        'Bad Request',
      ],
    ])('answers %s with %i', async (error, statusCode, reason) => {
      execute.mockRejectedValue(error);

      const response = await del();

      expect(response.status).toBe(statusCode);
      expect(await response.json()).toEqual({ statusCode, message: error.message, error: reason });
    });
  });

  describe('401 Unauthorized', () => {
    it('rejects a request without auth headers before reaching the use case', async () => {
      const response = await del({});

      expect(response.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('unexpected failures', () => {
    it('answers 500 without leaking the internal message', async () => {
      execute.mockRejectedValue(new Error('connection to db-prod-7 refused'));

      const response = await del();

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain('db-prod-7');
    });
  });
});
