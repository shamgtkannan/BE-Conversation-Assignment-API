/**
 * Integration test: talks to a real MongoDB (the replica set from `docker-compose.yml` by default).
 * Run it with `npx nx integration conversations-infra`.
 * It only ever touches a database whose name ends in `_test` and drops it afterwards.
 *
 * Proves what the unit tests can only fake: that MongoDB's change stream, with the
 * before and after images switched on at startup, reports the repository's own saves
 * as changes the domain can read.
 */
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { CONVERSATION_REPOSITORY, ConversationRepository } from 'conversations-application';
import { Conversation, ConversationChange, assignedEventFromChange } from 'conversations-domain';
import * as mongoose from 'mongoose';
import * as os from 'os';
import { ConversationRepositoryModule } from '../repositories/conversation/conversation-repository.module';
import { ConversationDo } from '../repositories/conversation/schema';
import { ConversationChangeWatcher } from './conversation-change-watcher';
import { openConversationChangeStream } from './open-conversation-change-stream';

const hosts = process.env['MONGODB_TEST_HOSTS'] ?? 'localhost:27017';
const replicaSet = process.env['MONGODB_TEST_REPLICA_SET'] ?? 'mongodb-test';
const dbName = (process.env['MONGODB_TEST_DATABASE'] ?? 'assignment_test').replace(
  /_test$/,
  '_change_stream_infra_test',
);

const now = new Date('2026-11-13T08:30:00.000Z');
const ada = '65f1a2b3c4d5e6f708091a2c';
const grace = '65f1a2b3c4d5e6f708091a2d';

const until = async (condition: () => boolean, timeoutMs = 10000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the condition');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

describe('ConversationChangeWatcher (real MongoDB)', () => {
  let moduleRef: TestingModule;
  let repository: ConversationRepository;
  let model: mongoose.Model<ConversationDo>;
  let changes: ConversationChange[];
  let watcher: ConversationChangeWatcher;
  let running: Promise<void>;

  const newConversation = () =>
    Conversation.create({
      id: new mongoose.Types.ObjectId().toHexString(),
      workspaceId: 'workspace_1',
      subject: 'Unable to log in',
      now,
    });
  const mine = (conversation: Conversation) =>
    changes.filter((change) => change.after.id === conversation.id);

  beforeAll(async () => {
    if (!dbName.endsWith('_test')) {
      throw new Error(`Refusing to run against "${dbName}": test databases must end in _test`);
    }
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(`mongodb://${hosts}`, {
          dbName,
          replicaSet,
          serverSelectionTimeoutMS: 5000,
          runtimeAdapters: { os }, // Jest cannot run the driver's dynamic import('os')
        }),
        ConversationRepositoryModule,
      ],
    }).compile();
    await moduleRef.init();
    repository = moduleRef.get<ConversationRepository>(CONVERSATION_REPOSITORY);
    model = moduleRef.get<mongoose.Model<ConversationDo>>(getModelToken(ConversationDo.name));
  });

  beforeEach(async () => {
    changes = [];
    watcher = new ConversationChangeWatcher(
      () => openConversationChangeStream(model),
      async (change) => {
        changes.push(change);
      },
      { retryDelayMs: 50 },
    );
    running = watcher.start();
    await watcher.ready;
  });

  afterEach(async () => {
    await watcher.onApplicationShutdown();
    await running;
  });

  afterAll(async () => {
    await model.db.dropDatabase();
    await moduleRef.close();
  });

  describe('switching the images on', () => {
    it('is done when the repository module starts', async () => {
      const database = model.db.db;
      if (!database) throw new Error('MongoDB connection is not ready');
      const [info] = await database
        .listCollections({ name: 'conversations' }, { nameOnly: false })
        .toArray();

      expect(
        (info.options as { changeStreamPreAndPostImages?: { enabled: boolean } })
          .changeStreamPreAndPostImages,
      ).toEqual({
        enabled: true,
      });
    });
  });

  describe("what the stream reports about the repository's own saves", () => {
    it('reports a new conversation as a change with no before', async () => {
      const conversation = newConversation();

      await repository.save(conversation);

      await until(() => mine(conversation).length === 1);
      const [change] = mine(conversation);
      expect(change).not.toHaveProperty('before');
      expect(change.after).toMatchObject({
        id: conversation.id,
        workspaceId: 'workspace_1',
        version: 0,
      });
      expect(change.after).not.toHaveProperty('assignedAgentId');
    });

    it('reports an assignment with the conversation before and after it', async () => {
      const conversation = newConversation();
      await repository.save(conversation);

      await repository.save(conversation.assign(ada, 'user_1', now), 0);

      await until(() => mine(conversation).length === 2);
      const change = mine(conversation)[1];
      expect(change.before).toMatchObject({ id: conversation.id, version: 0 });
      expect(change.before).not.toHaveProperty('assignedAgentId');
      expect(change.after).toMatchObject({
        assignedAgentId: ada,
        assignedBy: 'user_1',
        assignedAt: now,
        version: 1,
      });
    });

    it('reports a reassignment with the replaced agent in the before', async () => {
      const first = newConversation().assign(ada, 'user_1', now);
      await repository.save(first, undefined);
      await repository.save(first.assign(grace, 'user_2', now), 1);

      await until(() => mine(first).length === 2);

      const change = mine(first)[1];
      expect(change.before?.assignedAgentId).toBe(ada);
      expect(change.after.assignedAgentId).toBe(grace);
    });

    it('reports an unassignment as a change with no agent after', async () => {
      const assigned = newConversation().assign(ada, 'user_1', now);
      await repository.save(assigned);
      await repository.save(assigned.unassign(now), 1);

      await until(() => mine(assigned).length === 2);

      const change = mine(assigned)[1];
      expect(change.before?.assignedAgentId).toBe(ada);
      expect(change.after).not.toHaveProperty('assignedAgentId');
    });

    it('reports the changes of one conversation in the order they were saved', async () => {
      const conversation = newConversation();
      await repository.save(conversation);
      let current = conversation;
      for (let version = 0; version < 5; version++) {
        const next = current.assign(version % 2 === 0 ? ada : grace, 'user_1', now);
        await repository.save(next, version);
        current = next;
      }

      await until(() => mine(conversation).length === 6);

      expect(mine(conversation).map((change) => change.after.version)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('says nothing about a delete', async () => {
      const conversation = newConversation();
      await repository.save(conversation);
      await until(() => mine(conversation).length === 1);

      await model.deleteOne({ _id: new mongoose.Types.ObjectId(conversation.id) });
      const marker = newConversation();
      await repository.save(marker);

      await until(() => mine(marker).length === 1);
      expect(mine(conversation)).toHaveLength(1);
    });
  });

  describe('the changes, read by the domain rule', () => {
    it('make exactly one conversation.assigned.v1 event per assignment, and none for anything else', async () => {
      const conversation = newConversation();
      await repository.save(conversation);
      const assigned = conversation.assign(ada, 'user_1', now);
      await repository.save(assigned, 0);
      const reassigned = assigned.assign(grace, 'user_2', now);
      await repository.save(reassigned, 1);
      await repository.save(reassigned.unassign(now), 2);
      await until(() => mine(conversation).length === 4);

      const events = mine(conversation).map((change) => assignedEventFromChange(change));

      expect(events[0]).toBeNull(); // created
      expect(events[1]).toMatchObject({
        previousAgentId: null,
        agentId: ada,
        assignedBy: 'user_1',
        version: 1,
      });
      expect(events[2]).toMatchObject({
        previousAgentId: ada,
        agentId: grace,
        assignedBy: 'user_2',
        version: 2,
      });
      expect(events[3]).toBeNull(); // unassigned
    });

    it('give the same event id to the same change however many streams see it', async () => {
      const second: ConversationChange[] = [];
      const other = new ConversationChangeWatcher(
        () => openConversationChangeStream(model),
        async (change) => {
          second.push(change);
        },
        { retryDelayMs: 50 },
      );
      const otherRunning = other.start();
      await other.ready;
      try {
        const conversation = newConversation();
        await repository.save(conversation);
        await repository.save(conversation.assign(ada, 'user_1', now), 0);

        await until(
          () =>
            mine(conversation).length === 2 &&
            second.filter((c) => c.after.id === conversation.id).length === 2,
        );

        const here = mine(conversation).map((change) => change.changeId);
        const there = second
          .filter((c) => c.after.id === conversation.id)
          .map((change) => change.changeId);
        expect(here).toEqual(there);
        expect(new Set(here).size).toBe(2);
      } finally {
        await other.onApplicationShutdown();
        await otherRunning;
      }
    });
  });

  describe('starting', () => {
    it('does not replay what was saved before the stream was opened', async () => {
      const early = newConversation();
      await repository.save(early);
      await until(() => mine(early).length === 1);
      await watcher.onApplicationShutdown();
      await running;
      const late: ConversationChange[] = [];
      const fresh = new ConversationChangeWatcher(
        () => openConversationChangeStream(model),
        async (change) => {
          late.push(change);
        },
        { retryDelayMs: 50 },
      );
      const freshRunning = fresh.start();
      await fresh.ready;
      try {
        const next = newConversation();
        await repository.save(next);

        await until(() => late.some((change) => change.after.id === next.id));
        expect(late.some((change) => change.after.id === early.id)).toBe(false);
      } finally {
        await fresh.onApplicationShutdown();
        await freshRunning;
      }
    });
  });
});
