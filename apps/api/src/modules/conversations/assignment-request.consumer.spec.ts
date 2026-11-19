import { CONVERSATION_ASSIGNMENT_REQUESTED_V1 } from 'conversations-domain';
import {
  AssignmentRequestConsumer,
  REQUEST_CONSUMER_GROUP,
  RequestKafkaClient,
} from './assignment-request.consumer';

type EachMessage = (payload: { topic: string; partition: number; message: { value: Buffer | null } }) => Promise<void>;

describe('AssignmentRequestConsumer', () => {
  let consumer: { connect: jest.Mock; subscribe: jest.Mock; run: jest.Mock; stop: jest.Mock; disconnect: jest.Mock };
  let consumerFactory: jest.Mock;
  let handle: jest.Mock;
  let requests: AssignmentRequestConsumer;

  beforeEach(() => {
    consumer = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    consumerFactory = jest.fn(() => consumer);
    handle = jest.fn().mockResolvedValue(undefined);
    requests = new AssignmentRequestConsumer(
      { consumer: consumerFactory } as unknown as RequestKafkaClient,
      { handle },
      { retryDelayMs: 1 },
    );
  });

  // Tests that start the consumer against a Kafka that never connects must not leave its retry loop running.
  afterEach(async () => {
    await requests.onApplicationShutdown();
  });

  it('belongs to the conversation-writer group', async () => {
    await requests.start();

    expect(REQUEST_CONSUMER_GROUP).toBe('conversation-writer');
    expect(consumerFactory).toHaveBeenCalledWith({ groupId: 'conversation-writer' });
  });

  it('subscribes to the request topic from now on, never from the beginning, so old requests are not carried out again', async () => {
    await requests.start();

    expect(consumer.subscribe).toHaveBeenCalledWith({
      topics: [CONVERSATION_ASSIGNMENT_REQUESTED_V1],
      fromBeginning: false,
    });
  });

  it('connects, subscribes, then runs', async () => {
    await requests.start();

    const order = [consumer.connect, consumer.subscribe, consumer.run].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(consumer.run).toHaveBeenCalledTimes(1);
  });

  it('hands the value of each message to the handler', async () => {
    await requests.start();
    const { eachMessage } = consumer.run.mock.calls[0][0] as { eachMessage: EachMessage };

    await eachMessage({ topic: CONVERSATION_ASSIGNMENT_REQUESTED_V1, partition: 0, message: { value: Buffer.from('{}') } });

    expect(handle).toHaveBeenCalledWith(Buffer.from('{}'));
  });

  it('lets a handler failure through, so Kafka delivers the message again', async () => {
    handle.mockRejectedValue(new Error('database is down'));
    await requests.start();
    const { eachMessage } = consumer.run.mock.calls[0][0] as { eachMessage: EachMessage };

    await expect(
      eachMessage({ topic: CONVERSATION_ASSIGNMENT_REQUESTED_V1, partition: 0, message: { value: Buffer.from('{}') } }),
    ).rejects.toThrow('database is down');
  });

  describe('when Kafka is not reachable', () => {
    it('does not hold up the start of the application', () => {
      consumer.connect.mockReturnValue(new Promise(() => undefined)); // never answers

      expect(() => requests.onModuleInit()).not.toThrow();
    });

    it('does not fail the start when connecting fails', () => {
      consumer.connect.mockRejectedValue(new Error('connection refused'));

      expect(() => requests.onModuleInit()).not.toThrow();
    });

    it('tries again until Kafka is back, then runs', async () => {
      consumer.connect
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockRejectedValueOnce(new Error('connection refused'));

      await requests.start();

      expect(consumer.connect).toHaveBeenCalledTimes(3);
      expect(consumer.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('onApplicationShutdown', () => {
    it('stops and disconnects a running consumer', async () => {
      await requests.start();

      await requests.onApplicationShutdown();

      expect(consumer.disconnect).toHaveBeenCalledTimes(1);
    });

    it('stops trying to connect once the application is shutting down', async () => {
      consumer.connect.mockRejectedValue(new Error('connection refused'));
      const started = requests.start();

      await requests.onApplicationShutdown();
      await started;
      const attempts = consumer.connect.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(consumer.connect.mock.calls.length).toBe(attempts);
      expect(consumer.run).not.toHaveBeenCalled();
    });
  });
});
