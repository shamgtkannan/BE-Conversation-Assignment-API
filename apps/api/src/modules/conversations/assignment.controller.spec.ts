import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  RequestAssignmentCommand,
  RequestAssignmentResult,
  RequestAssignmentUseCase,
} from 'conversations-application';
import {
  AssignedAgentNotFoundError,
  AssignmentNotPermittedError,
  AssignmentRequestNotSentError,
  ConversationClosedError,
  ConversationNotFoundError,
  InvalidConversationError,
} from 'conversations-domain';
import { AddressInfo } from 'net';
import { createValidationPipe } from '../../app/validation-pipe';
import { AuthGuard } from '../../auth/auth.guard';
import { DomainExceptionFilter } from '../../common/domain-exception.filter';
import { AssignmentController } from './assignment.controller';

const conversationId = '65f1a2b3c4d5e6f708091a2b';
const agentId = '65f1a2b3c4d5e6f708091a2c';

const authHeaders = (role = 'manager') => ({
  'content-type': 'application/json',
  'x-user-id': 'user_123',
  'x-workspace-id': 'workspace_1',
  'x-role': role,
});

describe('assignment requests over HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
  const execute = jest.fn<Promise<RequestAssignmentResult>, [RequestAssignmentCommand]>();

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
  const del = (headers: Record<string, string> = authHeaders(), path = conversationId) =>
    fetch(`${baseUrl}/conversations/${path}/assignment`, { method: 'DELETE', headers });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AssignmentController],
      providers: [
        { provide: RequestAssignmentUseCase, useValue: { execute } },
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
    execute.mockResolvedValue({ commandId: 'command_1' });
  });

  describe('PATCH /conversations/:id/assignment', () => {
    describe('200 OK', () => {
      it('answers that the request was sent, naming it, and does not describe the conversation', async () => {
        const response = await patch();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ commandId: 'command_1', status: 'requested' });
      });

      it('asks for an assignment as the user who called, in their workspace', async () => {
        await patch();

        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledWith({
          action: 'assign',
          workspaceId: 'workspace_1',
          userId: 'user_123',
          role: 'manager',
          conversationId,
          agentId,
        });
      });

      it('hands the role to the use case, which decides who may ask', async () => {
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

    describe('what the checks before sending can answer', () => {
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

    describe('503 Service Unavailable', () => {
      it('answers 503 when the request could not be sent, without leaking why', async () => {
        execute.mockRejectedValue(new AssignmentRequestNotSentError(new Error('broker kafka-prod-3 refused')));

        const response = await patch();
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(body).toEqual({
          statusCode: 503,
          message: 'The assignment request could not be sent, please try again',
          error: 'Service Unavailable',
        });
        expect(JSON.stringify(body)).not.toContain('kafka-prod-3');
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

  describe('DELETE /conversations/:id/assignment', () => {
    describe('200 OK', () => {
      it('answers that the request was sent, naming it, and does not describe the conversation', async () => {
        const response = await del();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ commandId: 'command_1', status: 'requested' });
      });

      it('asks for the agent to be removed, as the user who called, in their workspace', async () => {
        await del();

        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledWith({
          action: 'unassign',
          workspaceId: 'workspace_1',
          userId: 'user_123',
          role: 'manager',
          conversationId,
        });
      });

      it('hands the role to the use case, which decides who may ask', async () => {
        await del(authHeaders('agent'));

        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ role: 'agent' }));
      });
    });

    describe('what the checks before sending can answer', () => {
      it.each([
        [new AssignmentNotPermittedError('agent'), 403, 'Forbidden'],
        [new ConversationNotFoundError(conversationId), 404, 'Not Found'],
        [new InvalidConversationError('id', 'Conversation id must be 24 lowercase hexadecimal characters'), 400, 'Bad Request'],
      ])('answers %s with %i', async (error, statusCode, reason) => {
        execute.mockRejectedValue(error);

        const response = await del();

        expect(response.status).toBe(statusCode);
        expect(await response.json()).toEqual({ statusCode, message: error.message, error: reason });
      });
    });

    it('answers 503 when the request could not be sent', async () => {
      execute.mockRejectedValue(new AssignmentRequestNotSentError(new Error('broker refused')));

      const response = await del();

      expect(response.status).toBe(503);
    });

    it('answers 401 without auth headers, before reaching the use case', async () => {
      const response = await del({});

      expect(response.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    });

    it('answers 500 without leaking the internal message', async () => {
      execute.mockRejectedValue(new Error('connection to db-prod-7 refused'));

      const response = await del();

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain('db-prod-7');
    });
  });
});
