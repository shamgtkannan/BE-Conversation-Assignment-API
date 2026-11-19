/**
 * Integration test: talks to a real Kafka (the broker from `docker-compose.yml` by default).
 * Run it with `npx nx integration conversations-infra`.
 * The event topics are shared by every run, so each test uses a fresh conversation id as
 * the message key and reads only its own messages.
 */
import { randomUUID } from 'crypto';
import { CONVERSATION_ASSIGNED_V1, ConversationAssigned } from 'conversations-domain';
import { Kafka, Producer, logLevel } from 'kafkajs';
import { CONVERSATION_EVENT_TOPICS, KafkaEventPublisher } from './kafka-event-publisher';
import { EVENT_TOPIC_PARTITIONS, ensureTopics } from './kafka-topics';

const brokers = (process.env['KAFKA_TEST_BROKERS'] ?? 'localhost:9092').split(',');

interface Received {
  partition: number;
  offset: string;
  key: string;
  value: Record<string, unknown>;
  headers: Record<string, string>;
}

describe('KafkaEventPublisher (real Kafka)', () => {
  const kafka = new Kafka({ clientId: 'infra-integration-test', brokers, logLevel: logLevel.ERROR });
  let producer: Producer;
  let publisher: KafkaEventPublisher;
  const consumers: { disconnect(): Promise<void> }[] = [];

  /** Reads `count` messages with this key from the start of the topic. */
  const read = async (topic: string, key: string, count: number): Promise<Received[]> => {
    const consumer = kafka.consumer({ groupId: `infra-test-${randomUUID()}` });
    consumers.push(consumer);
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    const received: Received[] = [];
    return new Promise<Received[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`only ${received.length}/${count} messages`)), 20000);
      void consumer.run({
        eachMessage: async ({ partition, message }) => {
          if (message.key?.toString() !== key) return;
          received.push({
            partition,
            offset: message.offset,
            key,
            value: JSON.parse(message.value?.toString() ?? '{}'),
            headers: Object.fromEntries(
              Object.entries(message.headers ?? {}).map(([name, value]) => [name, String(value)]),
            ),
          });
          if (received.length === count) {
            clearTimeout(timer);
            resolve(received);
          }
        },
      });
    });
  };

  const assigned = (conversationId: string, version: number, previous: string | null = null): ConversationAssigned => ({
    type: CONVERSATION_ASSIGNED_V1,
    eventId: randomUUID(),
    occurredAt: new Date('2026-11-13T09:00:00.000Z'),
    workspaceId: 'workspace_1',
    conversationId,
    previousAgentId: previous,
    agentId: `agent_${version}`,
    assignedBy: 'user_1',
    version,
  });

  beforeAll(async () => {
    producer = kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
    await producer.connect();
    await ensureTopics(kafka.admin(), CONVERSATION_EVENT_TOPICS);
    publisher = new KafkaEventPublisher(producer);
  });

  afterAll(async () => {
    await Promise.all(consumers.map((consumer) => consumer.disconnect()));
    await producer.disconnect();
  });

  it('delivers an assigned event to its topic with the key, headers and JSON value', async () => {
    const conversationId = randomUUID();
    const event = assigned(conversationId, 1);

    await publisher.publish(event);

    const [message] = await read(CONVERSATION_ASSIGNED_V1, conversationId, 1);
    expect(message.value).toEqual({ ...event, occurredAt: '2026-11-13T09:00:00.000Z' });
    expect(message.headers).toEqual({ eventId: event.eventId, type: CONVERSATION_ASSIGNED_V1 });
  });

  it('keeps the events of one conversation in one partition, in the order they were published', async () => {
    const conversationId = randomUUID();
    for (const version of [1, 2, 3, 4, 5]) {
      await publisher.publish(assigned(conversationId, version, version > 1 ? `agent_${version - 1}` : null));
    }

    const messages = await read(CONVERSATION_ASSIGNED_V1, conversationId, 5);

    expect(new Set(messages.map((m) => m.partition)).size).toBe(1);
    const inOrder = [...messages].sort((a, b) => Number(a.offset) - Number(b.offset));
    expect(inOrder.map((m) => m.value['version'])).toEqual([1, 2, 3, 4, 5]);
  });

  it('spreads different conversations over the partitions', async () => {
    const keys = Array.from({ length: 12 }, () => randomUUID());
    for (const key of keys) await publisher.publish(assigned(key, 1));

    const partitions = new Set<number>();
    for (const key of keys) partitions.add((await read(CONVERSATION_ASSIGNED_V1, key, 1))[0].partition);

    expect(partitions.size).toBeGreaterThan(1);
  });

  describe('ensureTopics', () => {
    const topic = `infra-test-topic-${randomUUID()}`;

    afterAll(async () => {
      const admin = kafka.admin();
      await admin.connect();
      await admin.deleteTopics({ topics: [topic] });
      await admin.disconnect();
    });

    it('creates a missing topic with the agreed number of partitions, and can run again', async () => {
      await ensureTopics(kafka.admin(), [topic]);
      await expect(ensureTopics(kafka.admin(), [topic])).resolves.toBeUndefined();

      const admin = kafka.admin();
      await admin.connect();
      const { topics } = await admin.fetchTopicMetadata({ topics: [topic] });
      await admin.disconnect();
      expect(topics[0].partitions).toHaveLength(EVENT_TOPIC_PARTITIONS);
    });

    it('has the event topics ready', async () => {
      const admin = kafka.admin();
      await admin.connect();
      const names = await admin.listTopics();
      await admin.disconnect();
      expect(names).toEqual(expect.arrayContaining(CONVERSATION_EVENT_TOPICS));
    });
  });

  it('rejects when Kafka cannot be reached, so the caller knows the event was not sent', async () => {
    const lost = new Kafka({
      brokers: ['localhost:1'],
      connectionTimeout: 500,
      retry: { retries: 0 },
      logLevel: logLevel.NOTHING,
    }).producer();

    await expect(new KafkaEventPublisher(lost).publish(assigned(randomUUID(), 1))).rejects.toBeDefined();
  });
});
