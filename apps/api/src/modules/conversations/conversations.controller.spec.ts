import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  CreateConversationCommand,
  CreateConversationUseCase,
  GetConversationUseCase,
} from 'conversations-application';
import { IConversationEntity, InvalidConversationError } from 'conversations-domain';
import { AddressInfo } from 'net';
import { createValidationPipe } from '../../app/validation-pipe';
import { AuthGuard } from '../../auth/auth.guard';
import { DomainExceptionFilter } from '../../common/domain-exception.filter';
import { ConversationsController } from './conversations.controller';

const created: IConversationEntity = {
  id: '65f1a2b3c4d5e6f708091a2b',
  subject: 'Unable to log in',
  status: 'open',
  workspaceId: 'workspace_1',
  createdAt: new Date('2026-11-13T08:30:00.000Z'),
  updatedAt: new Date('2026-11-13T08:30:00.000Z'),
};

const authHeaders = (role = 'agent') => ({
  'x-user-id': 'user_123',
  'x-workspace-id': 'workspace_1',
  'x-role': role,
});

describe('POST /conversations', () => {
  let app: INestApplication;
  let baseUrl: string;
  const execute = jest.fn<Promise<IConversationEntity>, [CreateConversationCommand]>();

  const post = (body: unknown, headers: Record<string, string> = authHeaders()) =>
    fetch(`${baseUrl}/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        { provide: CreateConversationUseCase, useValue: { execute } },
        { provide: GetConversationUseCase, useValue: { execute: jest.fn() } },
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
    execute.mockResolvedValue(created);
  });

  describe('success', () => {
    it('answers 201 with the conversation, the assignment fields being null', async () => {
      const response = await post({ subject: 'Unable to log in' });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
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

    it('takes the workspace from the auth context and the rest from the body', async () => {
      await post({ subject: 'Unable to log in', status: 'closed' });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith({
        workspaceId: 'workspace_1',
        subject: 'Unable to log in',
        status: 'closed',
      });
    });

    it('leaves the status to the use case when the body has none', async () => {
      await post({ subject: 'Unable to log in' });

      expect(execute).toHaveBeenCalledWith({
        workspaceId: 'workspace_1',
        subject: 'Unable to log in',
      });
    });

    it.each(['open', 'closed'])('accepts the status %s', async (status) => {
      expect((await post({ subject: 'Hello', status })).status).toBe(201);
    });

    it.each(['admin', 'manager', 'agent'])('lets the %s role create a conversation', async (role) => {
      expect((await post({ subject: 'Hello' }, authHeaders(role))).status).toBe(201);
    });
  });

  describe('400 Bad Request', () => {
    it.each([
      ['an empty body', {}],
      ['a missing subject', { status: 'open' }],
      ['an empty subject', { subject: '' }],
      ['a subject that is not a string', { subject: 42 }],
      ['an unknown status', { subject: 'Hello', status: 'pending' }],
      ['a status in the wrong case', { subject: 'Hello', status: 'OPEN' }],
      ['a status that is not a string', { subject: 'Hello', status: 1 }],
    ])('rejects %s', async (_label, body) => {
      const response = await post(body);

      expect(response.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    });

    it.each(['workspaceId', 'assignedBy', 'assignedAgentId', 'assignedAt', 'id', 'createdAt', 'updatedAt'])(
      'rejects a body that sets %s, which must not come from the client',
      async (field) => {
        const response = await post({ subject: 'Hello', [field]: 'anything' });

        expect(response.status).toBe(400);
        expect(execute).not.toHaveBeenCalled();
      },
    );

    it('answers 400 with the message when the domain rejects the data', async () => {
      execute.mockRejectedValue(
        new InvalidConversationError('subject', 'Conversation subject must not be blank'),
      );

      const response = await post({ subject: '   ' });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        statusCode: 400,
        message: 'Conversation subject must not be blank',
        error: 'Bad Request',
      });
    });
  });

  describe('401 Unauthorized', () => {
    it('rejects a request without auth headers before reaching the use case', async () => {
      const response = await post({ subject: 'Hello' }, {});

      expect(response.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an unknown role', async () => {
      const response = await post({ subject: 'Hello' }, authHeaders('owner'));

      expect(response.status).toBe(401);
    });
  });

  describe('unexpected failures', () => {
    it('answers 500 without leaking the internal message', async () => {
      execute.mockRejectedValue(new Error('connection to db-prod-7 refused'));

      const response = await post({ subject: 'Hello' });

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain('db-prod-7');
    });
  });
});
