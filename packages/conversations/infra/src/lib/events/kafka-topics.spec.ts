import { EVENT_TOPIC_PARTITIONS, KafkaTopicAdmin, ensureTopics } from './kafka-topics';

describe('ensureTopics', () => {
  let admin: jest.Mocked<KafkaTopicAdmin>;

  beforeEach(() => {
    admin = {
      connect: jest.fn().mockResolvedValue(undefined),
      createTopics: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('creates each topic with 3 partitions and one replica, and waits for leaders', async () => {
    await ensureTopics(admin, ['a.v1', 'b.v1']);

    expect(EVENT_TOPIC_PARTITIONS).toBe(3);
    expect(admin.createTopics).toHaveBeenCalledWith({
      topics: [
        { topic: 'a.v1', numPartitions: 3, replicationFactor: 1 },
        { topic: 'b.v1', numPartitions: 3, replicationFactor: 1 },
      ],
      waitForLeaders: true,
    });
  });

  it('connects before creating and disconnects afterwards', async () => {
    await ensureTopics(admin, ['a.v1']);

    expect(admin.connect.mock.invocationCallOrder[0]).toBeLessThan(
      admin.createTopics.mock.invocationCallOrder[0],
    );
    expect(admin.createTopics.mock.invocationCallOrder[0]).toBeLessThan(
      admin.disconnect.mock.invocationCallOrder[0],
    );
  });

  it('is fine when the topics already exist (kafka answers false)', async () => {
    admin.createTopics.mockResolvedValue(false);

    await expect(ensureTopics(admin, ['a.v1'])).resolves.toBeUndefined();
  });

  it('disconnects and passes the error on when creating fails', async () => {
    admin.createTopics.mockRejectedValue(new Error('broker not available'));

    await expect(ensureTopics(admin, ['a.v1'])).rejects.toThrow('broker not available');
    expect(admin.disconnect).toHaveBeenCalled();
  });

  it('passes the error on when it cannot even connect', async () => {
    admin.connect.mockRejectedValue(new Error('connection refused'));

    await expect(ensureTopics(admin, ['a.v1'])).rejects.toThrow('connection refused');
  });
});
