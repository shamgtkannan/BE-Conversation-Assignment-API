/**
 * End-to-end integration test of the assignment history: the real AppModule against
 * a real MongoDB and a real Kafka. Run with `npx nx integration api`.
 *
 * PATCH / DELETE publish an event, the history consumer (a Kafka consumer inside the
 * API) records it, and GET /conversations/:id/assignment-history serves it. The line
 * appears a moment after the request, so reads wait for it. It only touches a database
 * whose name ends in `_test` and drops it afterwards.
 */
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Kafka, Producer, logLevel } from 'kafkajs';
import * as mongoose from 'mongoose';
import { AddressInfo } from 'net';
import { AppModule } from './app.module';
import { createValidationPipe } from './validation-pipe';

const dbName = (process.env['MONGODB_TEST_DATABASE'] ?? 'assignment_test').replace(
  /_test$/,
  '_api_history_test',
);
process.env['MONGODB_HOSTS'] = process.env['MONGODB_TEST_HOSTS'] ?? 'localhost:27017';
process.env['MONGODB_REPLICA_SET'] = process.env['MONGODB_TEST_REPLICA_SET'] ?? 'mongodb-test';
process.env['MONGODB_DATABASE'] = dbName;
const brokers = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');

const ASSIGNED = 'conversation.assigned.v1';

const headers = (role = 'manager', userId = 'user_manager', workspaceId = 'workspace_1') => ({
  'content-type': 'application/json',
  'x-user-id': userId,
  'x-workspace-id': workspaceId,
  'x-role': role,
});

interface ConversationJson {
  id: string;
}

interface LineJson {
  id: string;
  conversationId: string;
  action: string;
  previousAgentId: string | null;
  newAgentId: string | null;
  performedBy: string;
  occurredAt: string;
  version: number;
}

interface PageJson {
  items: LineJson[];
  hasNext: boolean;
  next: string | null;
  hasPrevious: boolean;
  previous: string | null;
}

/** Retries `check` until it stops throwing, because the history is recorded a moment after the request. */
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

describe('assignment history (real app, real MongoDB, real Kafka)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let connection: mongoose.Connection;
  let producer: Producer;

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
    (
      await json<ConversationJson>(
        await send('POST', '/conversations', { subject: 'Help', status }),
      )
    ).id;
  const assign = (id: string, agentId: string, requestHeaders = headers()) =>
    send('PATCH', `/conversations/${id}/assignment`, { agentId }, requestHeaders);
  const unassign = (id: string, requestHeaders = headers()) =>
    send('DELETE', `/conversations/${id}/assignment`, undefined, requestHeaders);
  const history = (id: string, query = '', requestHeaders = headers()) =>
    send('GET', `/conversations/${id}/assignment-history${query}`, undefined, requestHeaders);

  /** Waits until the conversation has `count` history lines, and returns them. */
  const lines = (id: string, count: number) =>
    eventually(async () => {
      const page = await json<PageJson>(await history(id));
      if (page.items.length !== count) throw new Error(`${page.items.length}/${count} lines`);
      return page.items;
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
    producer = new Kafka({
      clientId: 'api-history-test',
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

  it('records an assignment as a history line that names the new agent and the user', async () => {
    const agent = await createAgent('Ada');
    const id = await createConversation();

    expect((await assign(id, agent)).status).toBe(200);

    const [entry] = await lines(id, 1);
    const assignedAt = (
      await json<{ assignedAt: string }>(await send('GET', `/conversations/${id}`))
    ).assignedAt;
    expect(entry).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      conversationId: id,
      action: 'assigned',
      previousAgentId: null,
      newAgentId: agent,
      performedBy: 'user_manager',
      occurredAt: assignedAt,
      version: 1,
    });
  });

  it('keeps the story of a conversation, newest first: a removal leaves no line, and the next assignment has no previous agent', async () => {
    const [ada, grace] = [await createAgent('Ada'), await createAgent('Grace')];
    const id = await createConversation();

    await assign(id, ada, headers('manager', 'user_a'));
    await lines(id, 1);
    await assign(id, grace, headers('admin', 'user_b'));
    await lines(id, 2);
    await unassign(id, headers('manager', 'user_x'));
    await assign(id, ada, headers('manager', 'user_c'));

    const all = await lines(id, 3);
    expect(
      all.map(({ action, previousAgentId, newAgentId, performedBy, version }) => ({
        action,
        previousAgentId,
        newAgentId,
        performedBy,
        version,
      })),
    ).toEqual([
      {
        action: 'assigned',
        previousAgentId: null,
        newAgentId: ada,
        performedBy: 'user_c',
        version: 4,
      },
      {
        action: 'assigned',
        previousAgentId: ada,
        newAgentId: grace,
        performedBy: 'user_b',
        version: 2,
      },
      {
        action: 'assigned',
        previousAgentId: null,
        newAgentId: ada,
        performedBy: 'user_a',
        version: 1,
      },
    ]);
  });

  it('adds no line for requests that changed nothing, failed, or removed an agent', async () => {
    const [ada, grace] = [await createAgent('Ada'), await createAgent('Grace')];
    const id = await createConversation();
    await assign(id, ada);
    await lines(id, 1);

    await assign(id, ada); // same agent again: nothing changed
    await assign(id, ada, headers('agent')); // 403
    await assign(id, new mongoose.Types.ObjectId().toHexString()); // 404
    await unassign(id);
    await assign(id, grace); // a real change, used to know the earlier requests were all handled

    const all = await lines(id, 2);
    expect(all.map((line) => line.newAgentId)).toEqual([grace, ada]);
  });

  it('pages through the history', async () => {
    const [ada, grace, alan] = [
      await createAgent('Ada'),
      await createAgent('Grace'),
      await createAgent('Alan'),
    ];
    const id = await createConversation();
    await assign(id, ada);
    await lines(id, 1);
    await assign(id, grace);
    await lines(id, 2);
    await assign(id, alan);
    await lines(id, 3);

    const first = await json<PageJson>(await history(id, '?limit=2'));
    const second = await json<PageJson>(await history(id, `?limit=2&next=${first.next}`));

    expect(first.items.map((line) => line.version)).toEqual([3, 2]);
    expect(first.hasNext).toBe(true);
    expect(second.items.map((line) => line.version)).toEqual([1]);
    expect(second.hasNext).toBe(false);
  });

  it.each(['agent', 'manager', 'admin'])('lets the %s role read the history', async (role) => {
    const id = await createConversation();

    expect((await history(id, '', headers(role))).status).toBe(200);
  });

  describe('errors', () => {
    it('answers an empty page for a conversation that has no history yet', async () => {
      const id = await createConversation();

      const response = await history(id);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        items: [],
        hasNext: false,
        next: null,
        hasPrevious: false,
        previous: null,
      });
    });

    it('answers 404 for a conversation that does not exist', async () => {
      expect((await history(new mongoose.Types.ObjectId().toHexString())).status).toBe(404);
    });

    it("answers 404 for another workspace's conversation, even though it has history", async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();
      await assign(id, agent);
      await lines(id, 1);

      expect((await history(id, '', headers('manager', 'user_x', 'workspace_2'))).status).toBe(404);
    });

    it('answers 400 for an id that is not an id, and for bad paging', async () => {
      const id = await createConversation();

      expect((await history('conv_123')).status).toBe(400);
      expect((await history(id, '?limit=0')).status).toBe(400);
      expect((await history(id, '?next=not-a-token')).status).toBe(400);
      expect((await history(id, '?unknown=1')).status).toBe(400);
    });

    it('answers 401 without auth headers', async () => {
      const id = await createConversation();

      expect((await history(id, '', {} as ReturnType<typeof headers>)).status).toBe(401);
    });
  });

  describe('events that arrive more than once, or damaged', () => {
    const event = (conversationId: string, overrides: Record<string, unknown> = {}) => ({
      type: ASSIGNED,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      workspaceId: 'workspace_1',
      conversationId,
      previousAgentId: null,
      agentId: new mongoose.Types.ObjectId().toHexString(),
      assignedBy: 'user_replay',
      version: 1,
      ...overrides,
    });
    const publish = (conversationId: string, ...values: (object | string)[]) =>
      producer.send({
        topic: ASSIGNED,
        acks: -1,
        messages: values.map((value) => ({
          key: conversationId,
          value: typeof value === 'string' ? value : JSON.stringify(value),
        })),
      });

    it('records an event once, however many times Kafka delivers it', async () => {
      const id = await createConversation();
      const delivered = event(id);
      const marker = event(id, { version: 2, previousAgentId: delivered.agentId });

      await publish(id, delivered, delivered, delivered, marker);

      expect(await lines(id, 2)).toHaveLength(2);
      expect(
        await connection
          .collection('assignment_history')
          .countDocuments({ eventId: delivered.eventId }),
      ).toBe(1);
    });

    it('skips a damaged message and still records the ones behind it', async () => {
      const id = await createConversation();

      await publish(
        id,
        'this is not json',
        { hello: 'world' },
        { ...event(id), version: 'one' },
        event(id, { version: 1 }),
      );

      expect(await lines(id, 1)).toHaveLength(1);
    });
  });
});
