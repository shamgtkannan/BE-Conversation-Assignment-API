/**
 * Integration test: talks to a real MongoDB (the replica set from `docker-compose.yml` by default).
 * Run it with `npx nx integration conversations-infra`.
 * It only ever touches a database whose name ends in `_test` and drops it afterwards.
 */
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { PageRequest, buildPage } from '@shared/core';
import { ASSIGNMENT_HISTORY_REPOSITORY, AssignmentHistoryRepository } from 'conversations-application';
import { NewAssignmentHistoryEntry } from 'conversations-domain';
import * as mongoose from 'mongoose';
import * as os from 'os';
import { AssignmentHistoryRepositoryModule } from './assignment-history-repository.module';
import { AssignmentHistoryDo } from './schema';

const hosts = process.env['MONGODB_TEST_HOSTS'] ?? 'localhost:27017';
const replicaSet = process.env['MONGODB_TEST_REPLICA_SET'] ?? 'mongodb-test';
// Each integration suite gets its own database, because nx runs suites in parallel and
// every suite empties and drops the database it uses.
const dbName = (process.env['MONGODB_TEST_DATABASE'] ?? 'assignment_test').replace(
  /_test$/,
  '_assignment_history_infra_test',
);

const conversationId = '65f1a2b3c4d5e6f708091a2b';
const agent = (n: number) => n.toString(16).padStart(24, '0');

const line = (n: number, overrides: Partial<NewAssignmentHistoryEntry> = {}): NewAssignmentHistoryEntry => ({
  eventId: `event_${n}`,
  workspaceId: 'workspace_1',
  conversationId,
  action: 'assigned',
  newAgentId: agent(n),
  performedBy: 'user_1',
  createdAt: new Date(Date.UTC(2026, 10, 13, 9, n)),
  version: n,
  ...overrides,
});

describe('MongooseAssignmentHistoryRepository (real MongoDB)', () => {
  let moduleRef: TestingModule;
  let repository: AssignmentHistoryRepository;
  let model: mongoose.Model<AssignmentHistoryDo>;

  /** The stored documents exactly as MongoDB holds them, with no Mongoose in between. */
  const rawDocuments = () => model.collection.find({}).toArray();

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
        AssignmentHistoryRepositoryModule,
      ],
    }).compile();
    await moduleRef.init();

    repository = moduleRef.get<AssignmentHistoryRepository>(ASSIGNMENT_HISTORY_REPOSITORY);
    model = moduleRef.get<mongoose.Model<AssignmentHistoryDo>>(getModelToken(AssignmentHistoryDo.name));
    await model.init();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await model.db.dropDatabase();
    await moduleRef.close();
  });

  describe('record', () => {
    it('stores the line and answers true', async () => {
      await expect(repository.record(line(1))).resolves.toBe(true);

      expect(await rawDocuments()).toEqual([
        {
          _id: expect.any(mongoose.Types.ObjectId),
          eventId: 'event_1',
          workspaceId: 'workspace_1',
          conversationId,
          action: 'assigned',
          newAgentId: agent(1),
          performedBy: 'user_1',
          createdAt: new Date(Date.UTC(2026, 10, 13, 9, 1)),
          version: 1,
        },
      ]);
    });

    it('leaves the replaced agent out of the document when there was none, rather than storing null', async () => {
      await repository.record(line(1));
      await repository.record(line(2, { previousAgentId: agent(1) }));

      const [first, second] = await rawDocuments();
      expect(first).not.toHaveProperty('previousAgentId');
      expect(second).toMatchObject({ previousAgentId: agent(1), newAgentId: agent(2) });
    });

    it('stores the version as an integer', async () => {
      await repository.record(line(1));

      const [{ type }] = await model.collection
        .aggregate<{ type: string }>([{ $project: { type: { $type: '$version' } } }])
        .toArray();

      expect(type).toBe('int');
    });

    it('records an event once: the same event again answers false and stores nothing', async () => {
      await repository.record(line(1));

      await expect(repository.record(line(1))).resolves.toBe(false);

      expect(await model.countDocuments()).toBe(1);
    });

    it('records different events of one conversation as different lines', async () => {
      await repository.record(line(1));
      await expect(repository.record(line(2))).resolves.toBe(true);

      expect(await model.countDocuments()).toBe(2);
    });

    it('lets exactly one of several simultaneous deliveries of the same event record it', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => repository.record(line(1))));

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await model.countDocuments()).toBe(1);
    });

    it('passes on a failure that is not a duplicate, instead of hiding it', async () => {
      await expect(repository.record(line(1, { action: 'reassigned' as never }))).rejects.toBeDefined();

      expect(await model.countDocuments()).toBe(0);
    });
  });

  describe('list', () => {
    const request = (input: { limit?: number; next?: string; previous?: string } = {}) => PageRequest.create(input);
    const page = (input: { limit?: number; next?: string; previous?: string } = {}, conversation = conversationId, workspace = 'workspace_1') => {
      const pageRequest = request(input);
      return repository.list(workspace, conversation, pageRequest).then((rows) => buildPage(rows, pageRequest));
    };
    const versions = (rows: { version: number }[]) => rows.map((row) => row.version);

    it('returns a conversation newest first, as plain entities', async () => {
      for (const n of [2, 1, 3]) await repository.record(line(n));

      const rows = await repository.list('workspace_1', conversationId, request());

      expect(versions(rows)).toEqual([3, 2, 1]);
      expect(rows[0]).toEqual({
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        eventId: 'event_3',
        workspaceId: 'workspace_1',
        conversationId,
        action: 'assigned',
        newAgentId: agent(3),
        performedBy: 'user_1',
        createdAt: new Date(Date.UTC(2026, 10, 13, 9, 3)),
        version: 3,
      });
    });

    it('keeps an absent replaced agent absent (not null) in the entity', async () => {
      await repository.record(line(1));
      await repository.record(line(2, { previousAgentId: agent(1) }));

      const [reassigned, first] = await repository.list('workspace_1', conversationId, request());

      expect(first.previousAgentId).toBeUndefined();
      expect(reassigned.previousAgentId).toBe(agent(1));
    });

    it('returns only the asked conversation of the asked workspace', async () => {
      await repository.record(line(1));
      await repository.record(line(2, { conversationId: '65f1a2b3c4d5e6f708091a99' }));
      await repository.record(line(3, { workspaceId: 'workspace_2' }));

      expect(versions(await repository.list('workspace_1', conversationId, request()))).toEqual([1]);
      expect(await repository.list('workspace_3', conversationId, request())).toEqual([]);
    });

    it('fetches at most limit + 1 rows', async () => {
      for (const n of [1, 2, 3, 4, 5]) await repository.record(line(n));

      const rows = await repository.list('workspace_1', conversationId, request({ limit: 2 }));

      expect(versions(rows)).toEqual([5, 4, 3]);
    });

    it('pages forward and back through every line exactly once', async () => {
      for (const n of [1, 2, 3, 4, 5]) await repository.record(line(n));

      const first = await page({ limit: 2 });
      const second = await page({ limit: 2, next: first.next as string });
      const third = await page({ limit: 2, next: second.next as string });
      const back = await page({ limit: 2, previous: third.previous as string });

      expect([first, second, third].map((p) => versions(p.items))).toEqual([[5, 4], [3, 2], [1]]);
      expect(versions(back.items)).toEqual([3, 2]);
    });

    it('does not repeat or skip lines made at the same instant', async () => {
      const instant = new Date(Date.UTC(2026, 10, 13, 9, 0));
      for (const n of [1, 2, 3, 4]) await repository.record(line(n, { createdAt: instant }));

      const seen: number[] = [];
      let next: string | undefined;
      do {
        const current = await page({ limit: 1, next });
        seen.push(...versions(current.items));
        next = current.next ?? undefined;
      } while (next);

      expect([...seen].sort()).toEqual([1, 2, 3, 4]);
    });

    it("does not let a cursor from another conversation reveal that conversation's lines", async () => {
      for (const n of [1, 2, 3]) await repository.record(line(n));
      for (const n of [4, 5, 6]) await repository.record(line(n, { conversationId: '65f1a2b3c4d5e6f708091a99' }));
      const other = await page({ limit: 1 }, '65f1a2b3c4d5e6f708091a99');

      const rows = await page({ next: other.next as string });

      expect(rows.items.every((row) => row.conversationId === conversationId)).toBe(true);
    });
  });

  describe('indexes', () => {
    it('exist in the database', async () => {
      const keys = (await model.collection.indexes()).map((index) => index.key);

      expect(keys).toContainEqual({ eventId: 1 });
      expect(keys).toContainEqual({ workspaceId: 1, conversationId: 1, createdAt: -1, _id: -1 });
    });

    it('make the event id unique', async () => {
      const index = (await model.collection.indexes()).find((i) => i.name === 'eventId_1');

      expect(index?.unique).toBe(true);
    });
  });

  describe('collection validator (documents written straight to MongoDB, bypassing the repository)', () => {
    const FAILED_VALIDATION = 121;
    const base = () => ({
      eventId: 'raw_event',
      workspaceId: 'workspace_1',
      conversationId,
      performedBy: 'user_1',
      createdAt: new Date(),
      version: 1,
    });
    const assigned = () => ({ ...base(), action: 'assigned', newAgentId: agent(1) });
    const insert = (doc: object) => model.collection.insertOne(doc);
    const refused = (doc: object) =>
      expect(insert(doc)).rejects.toMatchObject({ code: FAILED_VALIDATION });

    it('is set on the collection', async () => {
      const database = model.db.db;
      if (!database) throw new Error('MongoDB connection is not ready');
      const [info] = await database.listCollections({ name: 'assignment_history' }, { nameOnly: false }).toArray();

      expect((info.options as { validator?: unknown }).validator).toBeDefined();
    });

    it('accepts a first assignment and a reassignment', async () => {
      await expect(insert(assigned())).resolves.toBeDefined();
      await expect(insert({ ...assigned(), eventId: 'e2', previousAgentId: agent(2) })).resolves.toBeDefined();
    });

    it.each(['eventId', 'workspaceId', 'conversationId', 'action', 'newAgentId', 'performedBy', 'createdAt', 'version'])(
      'refuses a line without %s',
      async (field) => {
        const doc: Record<string, unknown> = assigned();
        delete doc[field];

        await refused(doc);
      },
    );

    it('refuses null agents, an unknown action, a version below 1, and fields beyond the schema', async () => {
      await refused({ ...assigned(), previousAgentId: null });
      await refused({ ...assigned(), action: 'reassigned' });
      await refused({ ...assigned(), action: 'unassigned' });
      await refused({ ...assigned(), version: 0 });
      await refused({ ...assigned(), extra: 'x' });
    });
  });
});
