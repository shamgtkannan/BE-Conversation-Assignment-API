import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AssignConversationUseCase,
  CreateConversationUseCase,
  GetConversationCommand,
  GetConversationUseCase,
  ListConversationsUseCase,
  UnassignConversationUseCase,
} from 'conversations-application';
import {
  ConversationNotFoundError,
  IConversationEntity,
  InvalidConversationError,
} from 'conversations-domain';
import { AddressInfo } from 'net';
import { createValidationPipe } from '../../app/validation-pipe';
import { AuthGuard } from '../../auth/auth.guard';
import { DomainExceptionFilter } from '../../common/domain-exception.filter';
import { ConversationsController } from './conversations.controller';

const id = '65f1a2b3c4d5e6f708091a2b';

const unassigned: IConversationEntity = {
  id,
  subject: 'Unable to log in',
  status: 'open',
  workspaceId: 'workspace_1',
  createdAt: new Date('2026-11-13T08:30:00.000Z'),
  updatedAt: new Date('2026-11-13T08:30:00.000Z'),
};

const assigned: IConversationEntity = {
  ...unassigned,
  assignedAgentId: '65f1a2b3c4d5e6f708091a2c',
  assignedAt: new Date('2026-11-13T09:00:00.000Z'),
  assignedBy: 'user_123',
  updatedAt: new Date('2026-11-13T09:00:00.000Z'),
};

const authHeaders = (role = 'agent') => ({
  'x-user-id': 'user_123',
  'x-workspace-id': 'workspace_1',
  'x-role': role,
});

describe('GET /conversations/:id', () => {
  let app: INestApplication;
  let baseUrl: string;
  const execute = jest.fn<Promise<IConversationEntity>, [GetConversationCommand]>();

  const get = (path: string, headers: Record<string, string> = authHeaders()) =>
    fetch(`${baseUrl}/conversations/${path}`, { headers });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        { provide: GetConversationUseCase, useValue: { execute } },
        { provide: CreateConversationUseCase, useValue: { execute: jest.fn() } },
        { provide: ListConversationsUseCase, useValue: { execute: jest.fn() } },
        { provide: AssignConversationUseCase, useValue: { execute: jest.fn() } },
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
    execute.mockResolvedValue(unassigned);
  });

  describe('success', () => {
    it('answers 200 with an unassigned conversation, the assignment fields being null', async () => {
      const response = await get(id);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id,
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

    it('answers 200 with the assignment fields of an assigned conversation', async () => {
      execute.mockResolvedValue(assigned);

      const response = await get(id);

      expect(await response.json()).toMatchObject({
        assignedAgentId: '65f1a2b3c4d5e6f708091a2c',
        assignedAt: '2026-11-13T09:00:00.000Z',
        assignedBy: 'user_123',
        updatedAt: '2026-11-13T09:00:00.000Z',
      });
    });

    it('asks for the id in the URL, inside the caller\'s workspace from the auth headers', async () => {
      await get(id);

      expect(execute).toHaveBeenCalledWith({ workspaceId: 'workspace_1', id });
    });

    it.each(['admin', 'manager', 'agent'])('lets the %s role read a conversation', async (role) => {
      expect((await get(id, authHeaders(role))).status).toBe(200);
    });
  });

  describe('404 Not Found', () => {
    it('answers 404 when the conversation does not exist in the workspace', async () => {
      execute.mockRejectedValue(new ConversationNotFoundError(id));

      const response = await get(id);

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        statusCode: 404,
        message: `Conversation ${id} was not found`,
        error: 'Not Found',
      });
    });
  });

  describe('400 Bad Request', () => {
    it('answers 400 when the domain finds the id malformed', async () => {
      execute.mockRejectedValue(
        new InvalidConversationError('id', 'Conversation id must be a valid id'),
      );

      const response = await get('abc');

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        statusCode: 400,
        message: 'Conversation id must be a valid id',
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
