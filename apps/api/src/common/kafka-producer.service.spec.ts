import { KafkaClient, KafkaProducerService } from './kafka-producer.service';

const record = {
  topic: 'conversation.assigned.v1',
  acks: -1,
  messages: [{ key: 'conversation_1', value: '{}' }],
};

describe('KafkaProducerService', () => {
  let producer: { connect: jest.Mock; send: jest.Mock; disconnect: jest.Mock };
  let admin: { connect: jest.Mock; createTopics: jest.Mock; disconnect: jest.Mock };
  let service: KafkaProducerService;

  beforeEach(() => {
    producer = {
      connect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue([{ topicName: 'x' }]),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    admin = {
      connect: jest.fn().mockResolvedValue(undefined),
      createTopics: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    const kafka = { producer: jest.fn(() => producer), admin: jest.fn(() => admin) };
    service = new KafkaProducerService(kafka as unknown as KafkaClient, ['conversation.assigned.v1']);
  });

  it('asks for an idempotent producer that keeps one request in flight, so retries never reorder or duplicate', () => {
    const producerFactory = jest.fn(() => producer);
    new KafkaProducerService(
      { producer: producerFactory, admin: () => admin } as unknown as KafkaClient,
      [],
    );

    expect(producerFactory).toHaveBeenCalledWith({ idempotent: true, maxInFlightRequests: 1 });
  });

  describe('send', () => {
    it('connects the first time, creates the topics, and sends the record', async () => {
      await service.send(record);

      expect(producer.connect).toHaveBeenCalledTimes(1);
      expect(admin.createTopics).toHaveBeenCalledTimes(1);
      expect(producer.send).toHaveBeenCalledWith(record);
    });

    it('creates the topics before the first send', async () => {
      await service.send(record);

      expect(admin.createTopics.mock.invocationCallOrder[0]).toBeLessThan(
        producer.send.mock.invocationCallOrder[0],
      );
    });

    it('connects only once for many sends, including ones made at the same time', async () => {
      await Promise.all([service.send(record), service.send(record), service.send(record)]);
      await service.send(record);

      expect(producer.connect).toHaveBeenCalledTimes(1);
      expect(producer.send).toHaveBeenCalledTimes(4);
    });

    it('fails when Kafka is not reachable, and tries again on the next send', async () => {
      producer.connect.mockRejectedValueOnce(new Error('connection refused'));

      await expect(service.send(record)).rejects.toThrow('connection refused');
      await expect(service.send(record)).resolves.toBeDefined();

      expect(producer.connect).toHaveBeenCalledTimes(2);
    });

    it('passes a failed send on to the caller', async () => {
      producer.send.mockRejectedValue(new Error('not enough replicas'));

      await expect(service.send(record)).rejects.toThrow('not enough replicas');
    });
  });

  describe('onModuleInit', () => {
    it('connects and creates the topics up front', async () => {
      await service.onModuleInit();

      expect(producer.connect).toHaveBeenCalledTimes(1);
      expect(admin.createTopics).toHaveBeenCalledTimes(1);
    });

    it('does not fail the start when Kafka is down, so the API still starts', async () => {
      admin.connect.mockRejectedValue(new Error('connection refused'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('still works later, once Kafka is back', async () => {
      admin.connect.mockRejectedValueOnce(new Error('connection refused'));
      await service.onModuleInit();

      await service.send(record);

      expect(producer.send).toHaveBeenCalledWith(record);
    });
  });

  describe('onApplicationShutdown', () => {
    it('disconnects a connected producer', async () => {
      await service.send(record);

      await service.onApplicationShutdown();

      expect(producer.disconnect).toHaveBeenCalledTimes(1);
    });

    it('does nothing when it never connected', async () => {
      await service.onApplicationShutdown();

      expect(producer.disconnect).not.toHaveBeenCalled();
    });
  });
});
