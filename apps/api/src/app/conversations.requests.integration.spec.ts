/**
 * End-to-end integration test of the command side: the real AppModule against a real
 * MongoDB and a real Kafka. Run with `npx nx integration api`.
 *
 * A request is published to Kafka (the HTTP controllers still write directly for now),
 * the request consumer carries it out, and the change shows up in the conversation, on
 * the event topic, and in the history. It only touches a database whose name ends in
 * `_test` and drops it afterwards.
 */
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { RequestAssignmentUseCase } from 'conversations-application';
import { Kafka, Producer, logLevel } from 'kafkajs';
import * as mongoose from 'mongoose';
import { AddressInfo } from 'net';
import { AppModule } from './app.module';
import { AssignmentRequestConsumer } from '../modules/conversations/assignment-request.consumer';
import { createValidationPipe } from './validation-pipe';

const dbName = (process.env['MONGODB_TEST_DATABASE'] ?? 'assignment_test').replace(
  /_test$/,
  '_api_requests_test',
);
process.env['MONGODB_HOSTS'] = process.env['MONGODB_TEST_HOSTS'] ?? 'localhost:27017';
process.env['MONGODB_REPLICA_SET'] = process.env['MONGODB_TEST_REPLICA_SET'] ?? 'mongodb-test';
process.env['MONGODB_DATABASE'] = dbName;
const brokers = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');

const REQUESTED = 'conversation.assignment-requested.v1';

const headers = (role = 'manager', userId = 'user_manager') => ({
  'content-type': 'application/json',
  'x-user-id': userId,
  'x-workspace-id': 'workspace_1',
  'x-role': role,
});

interface ConversationJson {
  id: string;
  assignedAgentId: string | null;
  assignedBy: string | null;
}

interface LineJson {
  action: string;
  previousAgentId: string | null;
  newAgentId: string | null;
  performedBy: string;
  version: number;
}

/** Retries `check` until it stops throwing, because everything here happens a moment after the request. */
const eventually = async <T>(check: () => Promise<T>, timeoutMs = 25000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
};

describe('assignment requests (real app, real MongoDB, real Kafka)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let connection: mongoose.Connection;
  let producer: Producer;
  let requestAssignment: RequestAssignmentUseCase;

  const send = (method: string, path: string, body?: object, requestHeaders = headers()) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
  const json = async <T>(response: Response) => (await response.json()) as T;
  const createAgent = async (name: string) =>
    (
      await json<{ id: string }>(
        await send('POST', '/agents', { name, email: `${name.toLowerCase()}@example.com` }),
      )
    ).id;
  const createConversation = async (status?: 'open' | 'closed') =>
    (await json<{ id: string }>(await send('POST', '/conversations', { subject: 'Help', status })))
      .id;
  const read = async (id: string) =>
    json<ConversationJson>(await send('GET', `/conversations/${id}`));
  const historyOf = async (id: string) =>
    (
      await json<{ items: LineJson[] }>(
        await send('GET', `/conversations/${id}/assignment-history`),
      )
    ).items;
  const asManager = (conversationId: string) => ({
    workspaceId: 'workspace_1',
    userId: 'user_manager',
    role: 'manager',
    conversationId,
  });
  const requestAssign = (conversationId: string, agentId: string) =>
    requestAssignment.execute({ ...asManager(conversationId), action: 'assign', agentId });
  const requestUnassign = (conversationId: string) =>
    requestAssignment.execute({ ...asManager(conversationId), action: 'unassign' });

  /** Waits until the conversation shows this agent (or none), and returns it. */
  const waitForAgent = (id: string, agentId: string | null) =>
    eventually(async () => {
      const conversation = await read(id);
      if (conversation.assignedAgentId !== agentId)
        throw new Error(`assigned to ${conversation.assignedAgentId}`);
      return conversation;
    });

  beforeAll(async () => {
    if (!dbName.endsWith('_test')) {
      throw new Error(`Refusing to run against "${dbName}": test databases must end in _test`);
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(createValidationPipe());
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    connection = app.get<mongoose.Connection>(getConnectionToken());
    requestAssignment = app.get(RequestAssignmentUseCase);
    // Requests are read from the moment the consumer joins, so wait for it before publishing any.
    await app.get(AssignmentRequestConsumer).ready;
    producer = new Kafka({
      clientId: 'api-requests-test',
      brokers,
      logLevel: logLevel.ERROR,
    }).producer();
    await producer.connect();
  });

  beforeEach(async () => {
    await connection.collection('conversations').deleteMany({});
    await connection.collection('agents').deleteMany({});
    await connection.collection('assignment_history').deleteMany({});
  });

  afterAll(async () => {
    await producer.disconnect();
    await connection.dropDatabase();
    await app.close();
  });

  it('carries out an assign request: the conversation changes, as the user who asked', async () => {
    const agent = await createAgent('Ada');
    const id = await createConversation();

    const { commandId } = await requestAssign(id, agent);

    expect(commandId).toEqual(expect.any(String));
    const conversation = await waitForAgent(id, agent);
    expect(conversation.assignedBy).toBe('user_manager');
  });

  it('does not change the conversation by itself: only the consumer does', async () => {
    const agent = await createAgent('Ada');
    const id = await createConversation();

    // Publishing a request that is never carried out (a role that may not assign, sent raw) changes nothing.
    await producer.send({
      topic: REQUESTED,
      messages: [
        {
          key: id,
          value: JSON.stringify({
            type: REQUESTED,
            commandId: randomUUID(),
            requestedAt: new Date().toISOString(),
            workspaceId: 'workspace_1',
            conversationId: id,
            action: 'assign',
            agentId: agent,
            requestedBy: 'user_x',
            role: 'agent',
          }),
        },
      ],
    });
    await requestAssign(id, agent); // a real one right behind it, so the earlier one was certainly handled

    const conversation = await waitForAgent(id, agent);
    expect(conversation.assignedBy).toBe('user_manager');
    expect(await historyOf(id)).toHaveLength(1);
  });

  it('carries out the whole chain: request, saved change, event, history line', async () => {
    const agent = await createAgent('Ada');
    const id = await createConversation();

    await requestAssign(id, agent);

    const [line] = await eventually(async () => {
      const lines = await historyOf(id);
      if (lines.length !== 1) throw new Error(`${lines.length} lines`);
      return lines;
    });
    expect(line).toMatchObject({
      action: 'assigned',
      previousAgentId: null,
      newAgentId: agent,
      performedBy: 'user_manager',
      version: 1,
    });
  });

  it('carries out an unassign request: the agent is removed, and no history line is made for it', async () => {
    const [agent, other] = [await createAgent('Ada'), await createAgent('Grace')];
    const id = await createConversation();
    await requestAssign(id, agent);
    await waitForAgent(id, agent);

    await requestUnassign(id);
    await waitForAgent(id, null);
    await requestAssign(id, other); // behind the removal: once it shows, the removal was announced or skipped
    await waitForAgent(id, other);

    const lines = await eventually(async () => {
      const found = await historyOf(id);
      if (found.length !== 2) throw new Error(`${found.length} lines`);
      return found;
    });
    expect(lines.map((line) => line.newAgentId)).toEqual([other, agent]);
    expect(lines[0]).toMatchObject({ previousAgentId: null, version: 3 });
  });

  it('carries out the requests for one conversation one at a time, in the order they were made', async () => {
    const agents = await Promise.all(Array.from({ length: 8 }, (_, n) => createAgent(`Racer${n}`)));
    const id = await createConversation();

    for (const agent of agents) await requestAssign(id, agent);

    await waitForAgent(id, agents[agents.length - 1]);
    const lines = await eventually(async () => {
      const found = await historyOf(id);
      if (found.length !== agents.length) throw new Error(`${found.length}/${agents.length} lines`);
      return found;
    });
    // Newest first: versions count down 8..1 and each line's previous agent is the one before.
    expect(lines.map((line) => line.version)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect(lines.map((line) => line.newAgentId)).toEqual([...agents].reverse());
    expect(lines[lines.length - 1].previousAgentId).toBeNull();
  });

  describe('a request that is refused changes nothing, and the requests behind it still run', () => {
    // The use case refuses these before publishing, so they are published by hand: that is what
    // a request looks like when the data changed after the checks (a race).
    const rawAssign = (conversationId: string, agentId: string) => ({
      type: REQUESTED,
      commandId: randomUUID(),
      requestedAt: new Date().toISOString(),
      workspaceId: 'workspace_1',
      conversationId,
      action: 'assign',
      agentId,
      requestedBy: 'user_manager',
      role: 'manager',
    });

    it('for a closed conversation, an unknown conversation and an unknown agent', async () => {
      const agent = await createAgent('Ada');
      const open = await createConversation();
      const closed = await createConversation('closed');

      await producer.send({
        topic: REQUESTED,
        acks: -1,
        messages: [
          rawAssign(closed, agent),
          rawAssign(new mongoose.Types.ObjectId().toHexString(), agent),
          rawAssign(open, new mongoose.Types.ObjectId().toHexString()),
        ].map((value) => ({ key: value.conversationId, value: JSON.stringify(value) })),
      });
      await requestAssign(open, agent); // behind the refused ones

      await waitForAgent(open, agent);
      expect((await read(closed)).assignedAgentId).toBeNull();
      expect(await historyOf(closed)).toEqual([]);
      expect(await historyOf(open)).toHaveLength(1);
    });
  });

  describe('a message that is not a request is skipped, and the requests behind it still run', () => {
    it('for text, other JSON and a damaged request', async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();

      await producer.send({
        topic: REQUESTED,
        messages: [
          'this is not json',
          JSON.stringify({ hello: 'world' }),
          JSON.stringify({ type: REQUESTED, action: 'close' }),
        ].map((value) => ({ key: id, value })),
      });
      await requestAssign(id, agent);

      await waitForAgent(id, agent);
    });
  });

  it('records one history line when the same request is delivered twice, because assigning the same agent again changes nothing', async () => {
    const agent = await createAgent('Ada');
    const id = await createConversation();
    const request = {
      type: REQUESTED,
      commandId: randomUUID(),
      requestedAt: new Date().toISOString(),
      workspaceId: 'workspace_1',
      conversationId: id,
      action: 'assign',
      agentId: agent,
      requestedBy: 'user_manager',
      role: 'manager',
    };

    await producer.send({
      topic: REQUESTED,
      messages: [request, request, request].map((value) => ({
        key: id,
        value: JSON.stringify(value),
      })),
    });
    await requestUnassign(id); // behind them: once it is done, the three copies were certainly handled
    await waitForAgent(id, null);
    const other = await createAgent('Grace');
    await requestAssign(id, other); // a marker: once its line shows, a repeated line would have shown too
    await waitForAgent(id, other);

    const lines = await eventually(async () => {
      const found = await historyOf(id);
      if (found.length !== 2) throw new Error(`${found.length} lines`);
      return found;
    });
    expect(lines.map((line) => line.newAgentId)).toEqual([other, agent]);
  });

  describe('RequestAssignmentUseCase', () => {
    it('refuses what cannot succeed before publishing: a closed conversation, an unknown conversation, an unknown agent', async () => {
      const agent = await createAgent('Ada');
      const open = await createConversation();
      const closed = await createConversation('closed');

      await expect(requestAssign(closed, agent)).rejects.toMatchObject({
        name: 'ConversationClosedError',
      });
      await expect(
        requestAssign(new mongoose.Types.ObjectId().toHexString(), agent),
      ).rejects.toMatchObject({
        name: 'ConversationNotFoundError',
      });
      await expect(
        requestAssign(open, new mongoose.Types.ObjectId().toHexString()),
      ).rejects.toMatchObject({
        name: 'AssignedAgentNotFoundError',
      });

      await requestAssign(open, agent); // a valid one: the refused ones left nothing in front of it
      await waitForAgent(open, agent);
      expect(await historyOf(open)).toHaveLength(1);
    });

    it('refuses a role that may not ask, and sends nothing', async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();

      await expect(
        requestAssignment.execute({
          ...asManager(id),
          role: 'agent',
          action: 'assign',
          agentId: agent,
        }),
      ).rejects.toMatchObject({ name: 'AssignmentNotPermittedError' });
      await requestUnassign(id); // nothing assigned: a harmless request behind it

      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect((await read(id)).assignedAgentId).toBeNull();
    });
  });
});
