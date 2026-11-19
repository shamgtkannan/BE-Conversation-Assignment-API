/**
 * End-to-end integration test: the real AppModule against a real MongoDB and a real
 * Kafka. Run with `npx nx integration api`. Proves that an assignment leaves exactly
 * one `conversation.assigned.v1` event on its topic, made by the change stream from what was
 * saved in MongoDB (not by the code that saved it), and that requests that change nothing, and
 * unassignments, leave none. It only touches a database whose name ends
 * in `_test` and drops it afterwards.
 *
 * Events are made a moment after the save, so "nothing was published" is checked after a marker
 * assignment's own event has arrived: the change stream works in order, so by then every earlier
 * change has been announced or skipped, and counting the messages (the high watermarks) is exact.
 */
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { ConversationChangeWatcher } from 'conversations-infra';
import { Kafka, logLevel } from 'kafkajs';
import * as mongoose from 'mongoose';
import { AddressInfo } from 'net';
import { KafkaProducerService } from '../common/kafka-producer.service';
import { AppModule } from './app.module';
import { createValidationPipe } from './validation-pipe';

const dbName = (process.env['MONGODB_TEST_DATABASE'] ?? 'assignment_test').replace(
  /_test$/,
  '_api_events_test',
);
process.env['MONGODB_HOSTS'] = process.env['MONGODB_TEST_HOSTS'] ?? 'localhost:27017';
process.env['MONGODB_REPLICA_SET'] = process.env['MONGODB_TEST_REPLICA_SET'] ?? 'mongodb-test';
process.env['MONGODB_DATABASE'] = dbName;
const brokers = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');

const ASSIGNED = 'conversation.assigned.v1';

const headers = (role = 'manager', userId = 'user_manager') => ({
  'content-type': 'application/json',
  'x-user-id': userId,
  'x-workspace-id': 'workspace_1',
  'x-role': role,
});

interface ConversationJson {
  id: string;
  assignedAgentId: string | null;
  assignedAt: string | null;
}

interface Received {
  partition: number;
  offset: string;
  value: Record<string, unknown>;
}

describe('assignment events on Kafka (real app, real MongoDB, real Kafka)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let connection: mongoose.Connection;
  const kafka = new Kafka({ clientId: 'api-events-test', brokers, logLevel: logLevel.ERROR });
  const consumers: { disconnect(): Promise<void> }[] = [];

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

  /** Total number of messages ever written to both event topics. */
  const published = async () => {
    const admin = kafka.admin();
    await admin.connect();
    try {
      let total = 0;
      for (const partition of await admin.fetchTopicOffsets(ASSIGNED))
        total += Number(partition.high);
      return total;
    } finally {
      await admin.disconnect();
    }
  };

  /**
   * Waits until everything saved so far has been announced. The change stream hands changes over
   * one at a time, in order, so once a marker assignment's event is on the topic, the events of
   * every earlier change are there too: after this, a count of messages is exact.
   */
  let markers = 0;
  const settle = async () => {
    const agent = await createAgent(`Marker${++markers}`);
    const id = await createConversation();
    await assign(id, agent);
    await read(ASSIGNED, id, 1);
  };

  /** Reads `count` messages with this key from the start of the topic. */
  const read = async (topic: string, key: string, count: number): Promise<Received[]> => {
    const consumer = kafka.consumer({ groupId: `api-test-${randomUUID()}` });
    consumers.push(consumer);
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    const received: Received[] = [];
    return new Promise<Received[]>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`only ${received.length}/${count} messages`)),
        20000,
      );
      void consumer.run({
        eachMessage: async ({ partition, message }) => {
          if (message.key?.toString() !== key) return;
          received.push({
            partition,
            offset: message.offset,
            value: JSON.parse(message.value?.toString() ?? '{}'),
          });
          if (received.length === count) {
            clearTimeout(timer);
            resolve(received);
          }
        },
      });
    });
  };

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
    // Changes are announced from the moment the stream is open, so wait for it before saving any.
    await app.get(ConversationChangeWatcher).ready;
  });

  beforeEach(async () => {
    await connection.collection('conversations').deleteMany({});
    await connection.collection('agents').deleteMany({});
  });

  afterAll(async () => {
    await Promise.all(consumers.map((consumer) => consumer.disconnect()));
    await connection.dropDatabase();
    await app.close();
  });

  it('publishes conversation.assigned.v1 after an assignment, describing exactly what was stored', async () => {
    const agent = await createAgent('Ada');
    const id = await createConversation();

    const response = await assign(id, agent);
    const body = await json<ConversationJson>(response);

    expect(response.status).toBe(200);
    const [message] = await read(ASSIGNED, id, 1);
    expect(message.value).toEqual({
      type: ASSIGNED,
      eventId: expect.any(String),
      occurredAt: body.assignedAt,
      workspaceId: 'workspace_1',
      conversationId: id,
      previousAgentId: null,
      agentId: agent,
      assignedBy: 'user_manager',
      version: 1,
    });
  });

  it('names the replaced agent and counts the version on a reassignment, in the same partition', async () => {
    const [ada, grace] = [await createAgent('Ada'), await createAgent('Grace')];
    const id = await createConversation();

    await assign(id, ada);
    await assign(id, grace, headers('admin', 'user_admin'));

    const messages = (await read(ASSIGNED, id, 2)).sort(
      (a, b) => Number(a.offset) - Number(b.offset),
    );
    expect(messages[1].value).toMatchObject({
      previousAgentId: ada,
      agentId: grace,
      assignedBy: 'user_admin',
      version: 2,
    });
    expect(messages[0].partition).toBe(messages[1].partition);
    expect(messages[0].value['eventId']).not.toBe(messages[1].value['eventId']);
  });

  it('announces an assignment that was saved straight in the database, not through the API', async () => {
    const agent = await createAgent('Ada');
    const id = await createConversation();
    const assignedAt = new Date('2026-11-13T09:00:00.000Z');

    await connection
      .collection('conversations')
      .updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { $set: { assignedAgentId: agent, assignedAt, assignedBy: 'user_script', version: 1 } },
      );

    const [message] = await read(ASSIGNED, id, 1);
    expect(message.value).toMatchObject({
      type: ASSIGNED,
      conversationId: id,
      previousAgentId: null,
      agentId: agent,
      assignedBy: 'user_script',
      occurredAt: assignedAt.toISOString(),
      version: 1,
    });
  });

  it('announces nothing when an agent is removed', async () => {
    const agent = await createAgent('Ada');
    const id = await createConversation();
    await assign(id, agent);
    await read(ASSIGNED, id, 1);
    const before = await published();

    expect((await unassign(id, headers('manager', 'user_remover'))).status).toBe(200);
    await settle();

    expect(await published()).toBe(before + 1);
  });

  it('announces an assignment exactly once', async () => {
    const agent = await createAgent('Ada');
    const id = await createConversation();
    const before = await published();

    await assign(id, agent);
    await settle();

    expect(await published()).toBe(before + 2);
  });

  describe('publishes nothing when nothing changed or the request failed', () => {
    it('for assigning the agent who is already assigned', async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();
      await assign(id, agent);
      const before = await published();

      expect((await assign(id, agent)).status).toBe(200);

      await settle();
      expect(await published()).toBe(before + 1);
    });

    it('for unassigning a conversation nobody is assigned to', async () => {
      const id = await createConversation();
      const before = await published();

      expect((await unassign(id)).status).toBe(200);

      await settle();
      expect(await published()).toBe(before + 1);
    });

    it('for a role that may not assign (403)', async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();
      const before = await published();

      expect((await assign(id, agent, headers('agent'))).status).toBe(403);

      await settle();
      expect(await published()).toBe(before + 1);
    });

    it('for an unknown conversation or agent (404) and a closed conversation (409)', async () => {
      const agent = await createAgent('Ada');
      const open = await createConversation();
      const closed = await createConversation('closed');
      const before = await published();

      expect((await assign(new mongoose.Types.ObjectId().toHexString(), agent)).status).toBe(404);
      expect((await assign(open, new mongoose.Types.ObjectId().toHexString())).status).toBe(404);
      expect((await assign(closed, agent)).status).toBe(409);

      await settle();
      expect(await published()).toBe(before + 1);
    });

    it('for an invalid body (400)', async () => {
      const id = await createConversation();
      const before = await published();

      expect((await send('PATCH', `/conversations/${id}/assignment`, {})).status).toBe(400);

      await settle();
      expect(await published()).toBe(before + 1);
    });
  });

  it('publishes exactly one event per successful change when ten requests race', async () => {
    const agents = await Promise.all(
      Array.from({ length: 10 }, (_, n) => createAgent(`Racer${n}`)),
    );
    const id = await createConversation();
    const before = await published();

    const statuses = (await Promise.all(agents.map((agent) => assign(id, agent)))).map(
      (r) => r.status,
    );

    const succeeded = statuses.filter((status) => status === 200).length;
    expect(statuses.every((status) => status === 200 || status === 409)).toBe(true);
    await settle();
    expect(await published()).toBe(before + succeeded + 1);
    const events = await read(ASSIGNED, id, succeeded);
    expect(events.map((event) => event.value['version']).sort()).toEqual(
      Array.from({ length: succeeded }, (_, n) => n + 1),
    );
  });

  describe('KafkaProducerService when Kafka is not there', () => {
    const lost = () =>
      new KafkaProducerService(
        // An idempotent producer must be allowed at least one retry.
        new Kafka({
          brokers: ['localhost:1'],
          connectionTimeout: 500,
          retry: { retries: 1, initialRetryTime: 50 },
          logLevel: logLevel.NOTHING,
        }),
        [ASSIGNED],
      );

    it('lets the application start anyway', async () => {
      await expect(lost().onModuleInit()).resolves.toBeUndefined();
    });

    it('fails the send, so the caller knows the event did not go out', async () => {
      await expect(
        lost().send({ topic: ASSIGNED, messages: [{ key: 'k', value: '{}' }] }),
      ).rejects.toBeDefined();
    });
  });
});
