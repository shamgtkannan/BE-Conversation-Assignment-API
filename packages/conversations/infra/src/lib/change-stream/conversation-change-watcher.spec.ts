import * as mongoose from 'mongoose';
import { ConversationChange } from 'conversations-domain';
import { RawConversationChange, StoredConversation } from './conversation-change.mapper';
import { ConversationChangeWatcher, RawChangeStream } from './conversation-change-watcher';

const created = new Date('2026-11-13T08:00:00.000Z');
const assignedAt = new Date('2026-11-13T09:00:00.000Z');
const ada = '65f1a2b3c4d5e6f708091a2c';

const stored = (version: number, assigned: boolean): StoredConversation => ({
  _id: new mongoose.Types.ObjectId('65f1a2b3c4d5e6f708091a2b'),
  workspaceId: 'workspace_1',
  subject: 'Help',
  status: 'open',
  createdAt: created,
  updatedAt: created,
  version,
  ...(assigned && { assignedAgentId: ada, assignedAt, assignedBy: 'user_1' }),
});

/** A change as MongoDB reports it; `n` makes its id and its version. */
const raw = (n: number): RawConversationChange => ({
  _id: { _data: `change_${n}` },
  operationType: 'replace',
  fullDocument: stored(n, true),
  fullDocumentBeforeChange: stored(n - 1, false),
});

/** A stream the test controls: it hands out the changes it is given, and fails or closes on demand. */
const fakeStream = () => {
  const queue: RawConversationChange[] = [];
  let waiting: { resolve: (c: RawConversationChange) => void; reject: (e: Error) => void } | undefined;
  let failure: Error | undefined;
  const stream = {
    closed: false,
    tryNext: jest.fn(async (): Promise<RawConversationChange | null> => queue.shift() ?? null),
    next: jest.fn(
      () =>
        new Promise<RawConversationChange>((resolve, reject) => {
          if (failure) return reject(failure);
          if (stream.closed) return reject(new Error('ChangeStream is closed'));
          const next = queue.shift();
          if (next) return resolve(next);
          waiting = { resolve, reject };
        }),
    ),
    close: jest.fn(async () => {
      stream.closed = true;
      waiting?.reject(new Error('ChangeStream is closed'));
      waiting = undefined;
    }),
  };
  return {
    stream: stream as RawChangeStream & typeof stream,
    push: (change: RawConversationChange) => {
      if (waiting) {
        waiting.resolve(change);
        waiting = undefined;
      } else {
        queue.push(change);
      }
    },
    fail: (error: Error) => {
      failure = error;
      waiting?.reject(error);
      waiting = undefined;
    },
  };
};

const until = async (condition: () => boolean, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the condition');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
};

describe('ConversationChangeWatcher', () => {
  let handled: ConversationChange[];
  let handle: jest.Mock;
  let watcher: ConversationChangeWatcher;
  let running: Promise<void> | undefined;

  const begin = (open: () => RawChangeStream | Promise<RawChangeStream>) => {
    watcher = new ConversationChangeWatcher(open, handle, { retryDelayMs: 1 });
    running = watcher.start();
    return watcher;
  };

  beforeEach(() => {
    handled = [];
    handle = jest.fn(async (change: ConversationChange) => {
      handled.push(change);
    });
    running = undefined;
  });

  afterEach(async () => {
    await watcher?.onApplicationShutdown();
    await running;
  });

  describe('opening the stream', () => {
    it('opens a stream and is ready once it is open', async () => {
      const { stream } = fakeStream();

      begin(() => stream);
      await watcher.ready;

      expect(stream.tryNext).toHaveBeenCalledTimes(1);
    });

    it('is not ready while the stream is still being opened', async () => {
      const { stream } = fakeStream();
      let release!: () => void;
      stream.tryNext.mockReturnValueOnce(new Promise((resolve) => (release = () => resolve(null))));
      let ready = false;

      begin(() => stream);
      void watcher.ready.then(() => (ready = true));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(ready).toBe(false);

      release();
      await watcher.ready;
    });

    it('handles a change that is already waiting when the stream opens', async () => {
      const { stream } = fakeStream();
      stream.tryNext.mockResolvedValueOnce(raw(1));

      begin(() => stream);

      await until(() => handled.length === 1);
      expect(handled[0].changeId).toBe('change_1');
    });

    it('tries again after a delay when the stream cannot be opened', async () => {
      const { stream } = fakeStream();
      const open = jest.fn().mockRejectedValueOnce(new Error('MongoDB is not ready')).mockResolvedValue(stream);

      begin(open);
      await watcher.ready;

      expect(open).toHaveBeenCalledTimes(2);
    });
  });

  describe('handling changes', () => {
    it('hands each change to the handler as a conversation change', async () => {
      const { stream, push } = fakeStream();
      begin(() => stream);
      await watcher.ready;

      push(raw(1));
      await until(() => handled.length === 1);

      expect(handled[0]).toMatchObject({
        changeId: 'change_1',
        before: { id: '65f1a2b3c4d5e6f708091a2b', version: 0 },
        after: { id: '65f1a2b3c4d5e6f708091a2b', assignedAgentId: ada, version: 1 },
      });
    });

    it('hands over the changes in the order they arrive', async () => {
      const { stream, push } = fakeStream();
      begin(() => stream);
      await watcher.ready;

      [1, 2, 3, 4].forEach((n) => push(raw(n)));
      await until(() => handled.length === 4);

      expect(handled.map((change) => change.changeId)).toEqual(['change_1', 'change_2', 'change_3', 'change_4']);
    });

    it('skips a change that says nothing about a conversation (a delete), and goes on', async () => {
      const { stream, push } = fakeStream();
      begin(() => stream);
      await watcher.ready;

      push({ _id: { _data: 'deleted' }, operationType: 'delete', fullDocumentBeforeChange: stored(1, true) });
      push(raw(2));
      await until(() => handled.length === 1);

      expect(handled.map((change) => change.changeId)).toEqual(['change_2']);
    });
  });

  describe('when the handler fails', () => {
    it('tries the same change again until it works', async () => {
      const { stream, push } = fakeStream();
      handle.mockRejectedValueOnce(new Error('broker not available')).mockRejectedValueOnce(new Error('broker not available'));
      begin(() => stream);
      await watcher.ready;

      push(raw(1));
      await until(() => handle.mock.calls.length === 3);

      expect(handle.mock.calls.map(([change]) => change.changeId)).toEqual(['change_1', 'change_1', 'change_1']);
    });

    it('does not skip or reorder: later changes wait until the failing one has gone through', async () => {
      const { stream, push } = fakeStream();
      const order: string[] = [];
      let failures = 2;
      handle.mockImplementation(async (change: ConversationChange) => {
        if (change.changeId === 'change_1' && failures-- > 0) throw new Error('broker not available');
        order.push(change.changeId);
      });
      begin(() => stream);
      await watcher.ready;

      push(raw(1));
      push(raw(2));
      await until(() => order.length === 2);

      expect(order).toEqual(['change_1', 'change_2']);
    });

    it('keeps the stream open while it retries, so no change is lost', async () => {
      const { stream, push } = fakeStream();
      handle.mockRejectedValueOnce(new Error('broker not available'));
      begin(() => stream);
      await watcher.ready;

      push(raw(1));
      await until(() => handle.mock.calls.length === 2);

      expect(stream.close).not.toHaveBeenCalled();
    });
  });

  describe('when the stream fails', () => {
    it('closes it, opens a new one after a delay and carries on', async () => {
      const first = fakeStream();
      const second = fakeStream();
      const open = jest.fn().mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
      begin(open);
      await watcher.ready;

      first.fail(new Error('connection lost'));
      await until(() => open.mock.calls.length === 2);
      await until(() => second.stream.tryNext.mock.calls.length === 1);
      second.push(raw(5));
      await until(() => handled.length === 1);

      expect(first.stream.close).toHaveBeenCalled();
      expect(handled[0].changeId).toBe('change_5');
    });

    it('keeps trying while MongoDB stays unreachable', async () => {
      const first = fakeStream();
      const recovered = fakeStream();
      const open = jest
        .fn()
        .mockResolvedValueOnce(first.stream)
        .mockRejectedValueOnce(new Error('MongoDB is not reachable'))
        .mockRejectedValueOnce(new Error('MongoDB is not reachable'))
        .mockResolvedValue(recovered.stream);
      begin(open);
      await watcher.ready;

      first.fail(new Error('connection lost'));
      await until(() => open.mock.calls.length === 4);

      expect(open).toHaveBeenCalledTimes(4);
    });
  });

  describe('onApplicationShutdown', () => {
    it('closes the stream and stops', async () => {
      const { stream } = fakeStream();
      begin(() => stream);
      await watcher.ready;

      await watcher.onApplicationShutdown();
      await running;

      expect(stream.close).toHaveBeenCalled();
    });

    it('does not open another stream afterwards', async () => {
      const { stream } = fakeStream();
      const open = jest.fn().mockResolvedValue(stream);
      begin(open);
      await watcher.ready;

      await watcher.onApplicationShutdown();
      await running;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(open).toHaveBeenCalledTimes(1);
    });

    it('stops retrying a change that keeps failing', async () => {
      const { stream, push } = fakeStream();
      handle.mockRejectedValue(new Error('broker not available'));
      begin(() => stream);
      await watcher.ready;
      push(raw(1));
      await until(() => handle.mock.calls.length >= 2);

      await watcher.onApplicationShutdown();
      await running;
      const calls = handle.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(handle.mock.calls.length).toBe(calls);
    });

    it('is fine when it never started', async () => {
      const idle = new ConversationChangeWatcher(() => fakeStream().stream, handle, { retryDelayMs: 1 });

      await expect(idle.onApplicationShutdown()).resolves.toBeUndefined();
    });
  });

  describe('onModuleInit', () => {
    it('does not hold up the start of the application, even when MongoDB cannot be reached', () => {
      const open = jest.fn().mockRejectedValue(new Error('MongoDB is not reachable'));
      watcher = new ConversationChangeWatcher(open, handle, { retryDelayMs: 1 });

      expect(() => watcher.onModuleInit()).not.toThrow();
    });
  });
});
