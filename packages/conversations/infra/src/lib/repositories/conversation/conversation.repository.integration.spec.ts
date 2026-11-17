/**
 * Integration test: talks to a real MongoDB (the `docker/compose/mongodb-8.0`
 * replica set by default). Run it with `npx nx integration conversations-infra`.
 * It only ever touches a database whose name ends in `_test` and drops it afterwards.
 */
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { PageRequest, buildPage } from '@shared/core';
import { CONVERSATION_REPOSITORY, ConversationFilter, ConversationRepository } from 'conversations-application';
import { Conversation } from 'conversations-domain';
import * as mongoose from 'mongoose';
import * as os from 'os';
import { ConversationRepositoryModule } from './conversation-repository.module';
import { ConversationDo } from './schema';

const hosts = process.env['MONGODB_TEST_HOSTS'] ?? 'mongodb1:27801,mongodb2:27802,mongodb3:27803';
const replicaSet = process.env['MONGODB_TEST_REPLICA_SET'] ?? 'mongodb-test';
// Each integration suite gets its own database (here: assignment_conversations_infra_test),
// because nx runs suites in parallel and every suite empties and drops the database it uses.
const dbName = (process.env['MONGODB_TEST_DATABASE'] ?? 'assignment_test').replace(
  /_test$/,
  '_conversations_infra_test',
);

const now = new Date('2026-11-13T08:30:00.000Z');

const newConversation = (overrides: Partial<Parameters<typeof Conversation.create>[0]> = {}) =>
  Conversation.create({
    id: new mongoose.Types.ObjectId().toHexString(),
    workspaceId: 'workspace_1',
    subject: 'Unable to log in',
    now,
    ...overrides,
  });

describe('MongooseConversationRepository (real MongoDB)', () => {
  let moduleRef: TestingModule;
  let repository: ConversationRepository;
  let model: mongoose.Model<ConversationDo>;

  /** The stored document exactly as MongoDB holds it, with no Mongoose in between. */
  const rawDocument = (id: string) =>
    model.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });

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
    await model.init(); // wait for the indexes to exist before testing them
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await model.db.dropDatabase();
    await moduleRef.close();
  });

  describe('save a new conversation', () => {
    it('stores it as a document whose _id is the conversation id', async () => {
      const conversation = newConversation();

      await repository.save(conversation);

      const stored = await rawDocument(conversation.id);
      expect(stored).toMatchObject({
        workspaceId: 'workspace_1',
        subject: 'Unable to log in',
        status: 'open',
        createdAt: now,
        updatedAt: now,
      });
      expect(stored?._id.toString()).toBe(conversation.id);
    });

    it('leaves the three assignment fields out of the document, not set to null', async () => {
      const conversation = newConversation();

      await repository.save(conversation);

      const stored = await rawDocument(conversation.id);
      expect(Object.keys(stored ?? {}).sort()).toEqual(
        ['_id', 'createdAt', 'status', 'subject', 'updatedAt', 'workspaceId'].sort(),
      );
    });

    it('stores a closed conversation', async () => {
      const conversation = newConversation({ status: 'closed' });

      await repository.save(conversation);

      expect((await rawDocument(conversation.id))?.['status']).toBe('closed');
    });

    it('allows many conversations with the same subject', async () => {
      await repository.save(newConversation());
      await repository.save(newConversation());

      expect(await model.countDocuments()).toBe(2);
    });
  });

  describe('save an existing conversation', () => {
    it('replaces the stored one instead of adding another', async () => {
      const id = new mongoose.Types.ObjectId().toHexString();
      await repository.save(newConversation({ id, subject: 'First subject' }));

      await repository.save(newConversation({ id, subject: 'Second subject', status: 'closed' }));

      expect(await model.countDocuments()).toBe(1);
      expect(await rawDocument(id)).toMatchObject({ subject: 'Second subject', status: 'closed' });
    });

    it('drops assignment fields that are no longer set, rather than keeping or nulling them', async () => {
      const id = new mongoose.Types.ObjectId();
      await model.collection.insertOne({
        _id: id,
        workspaceId: 'workspace_1',
        subject: 'Unable to log in',
        status: 'open',
        assignedAgentId: '65f1a2b3c4d5e6f708091a2b',
        assignedAt: now,
        assignedBy: 'user_123',
        createdAt: now,
        updatedAt: now,
      });

      await repository.save(newConversation({ id: id.toHexString() }));

      const stored = await rawDocument(id.toHexString());
      expect(stored).not.toHaveProperty('assignedAgentId');
      expect(stored).not.toHaveProperty('assignedAt');
      expect(stored).not.toHaveProperty('assignedBy');
    });

    it('leaves other conversations alone', async () => {
      const other = newConversation({ subject: 'Other' });
      await repository.save(other);

      await repository.save(newConversation());

      expect((await rawDocument(other.id))?.['subject']).toBe('Other');
    });

    it('refuses to overwrite a conversation that belongs to another workspace', async () => {
      const id = new mongoose.Types.ObjectId().toHexString();
      await repository.save(newConversation({ id, workspaceId: 'workspace_2', subject: 'Theirs' }));

      await expect(
        repository.save(newConversation({ id, workspaceId: 'workspace_1', subject: 'Mine' })),
      ).rejects.toThrow();

      expect(await rawDocument(id)).toMatchObject({
        workspaceId: 'workspace_2',
        subject: 'Theirs',
      });
    });
  });

  describe('findById', () => {
    it('returns a saved conversation as a plain entity with the assignment fields absent', async () => {
      const conversation = newConversation();
      await repository.save(conversation);

      const found = await repository.findById('workspace_1', conversation.id);

      expect(found).toEqual({
        id: conversation.id,
        workspaceId: 'workspace_1',
        subject: 'Unable to log in',
        status: 'open',
        createdAt: now,
        updatedAt: now,
      });
      // Absent, not null and not a Mongoose property: the domain's "unassigned".
      expect(found?.assignedAgentId).toBeUndefined();
      expect(found?.assignedAt).toBeUndefined();
      expect(found?.assignedBy).toBeUndefined();
    });

    it('returns exactly the entity fields: no _id, no Mongoose internals', async () => {
      const conversation = newConversation();
      await repository.save(conversation);

      const found = await repository.findById('workspace_1', conversation.id);

      expect(Object.keys(found ?? {}).sort()).toEqual(
        ['createdAt', 'id', 'status', 'subject', 'updatedAt', 'workspaceId'].sort(),
      );
    });

    it('reads the assignment fields of an assigned conversation', async () => {
      const id = new mongoose.Types.ObjectId();
      const assignedAt = new Date('2026-11-13T09:00:00.000Z');
      await model.collection.insertOne({
        _id: id,
        workspaceId: 'workspace_1',
        subject: 'Unable to log in',
        status: 'open',
        assignedAgentId: '65f1a2b3c4d5e6f708091a2b',
        assignedAt,
        assignedBy: 'user_123',
        createdAt: now,
        updatedAt: assignedAt,
      });

      const found = await repository.findById('workspace_1', id.toHexString());

      expect(found).toEqual({
        id: id.toHexString(),
        workspaceId: 'workspace_1',
        subject: 'Unable to log in',
        status: 'open',
        assignedAgentId: '65f1a2b3c4d5e6f708091a2b',
        assignedAt,
        assignedBy: 'user_123',
        createdAt: now,
        updatedAt: assignedAt,
      });
      expect(found?.assignedAt).toBeInstanceOf(Date);
    });

    it('reads a closed conversation', async () => {
      const conversation = newConversation({ status: 'closed' });
      await repository.save(conversation);

      expect((await repository.findById('workspace_1', conversation.id))?.status).toBe('closed');
    });

    it('returns null for an id that does not exist', async () => {
      await repository.save(newConversation());

      expect(
        await repository.findById('workspace_1', new mongoose.Types.ObjectId().toHexString()),
      ).toBeNull();
    });

    it('returns null for a conversation of another workspace, and the owner still finds it', async () => {
      const conversation = newConversation({ workspaceId: 'workspace_2' });
      await repository.save(conversation);

      expect(await repository.findById('workspace_1', conversation.id)).toBeNull();
      expect(await repository.findById('workspace_2', conversation.id)).not.toBeNull();
    });
  });

  describe('list', () => {
    const id = (n: number) => n.toString(16).padStart(24, '0');
    /** Conversation `n`: a higher n is created later; `agent` makes it assigned. */
    const seed = async (
      n: number,
      overrides: Partial<Parameters<typeof Conversation.create>[0]> = {},
      agent?: number,
    ) => {
      const conversation = Conversation.create({
        id: id(n),
        workspaceId: 'workspace_1',
        subject: `Conversation ${n}`,
        now: new Date(Date.UTC(2026, 10, 13, 8, n)),
        ...overrides,
      });
      if (agent !== undefined) {
        // Assignment is not built yet, so seed the three fields directly.
        Object.assign(conversation, {
          assignedAgentId: id(agent),
          assignedAt: conversation.createdAt,
          assignedBy: 'user_1',
        });
      }
      await repository.save(conversation);
    };
    const page = (
      input: { limit?: number; next?: string; previous?: string },
      filter: ConversationFilter = {},
      workspaceId = 'workspace_1',
    ) => {
      const request = PageRequest.create(input);
      return repository.list(workspaceId, filter, request).then((rows) => buildPage(rows, request));
    };
    const subjects = (rows: { subject: string }[]) => rows.map((r) => r.subject);

    it('returns a workspace newest first, as plain entities', async () => {
      for (const n of [2, 1, 3]) await seed(n);

      const rows = await repository.list('workspace_1', {}, PageRequest.create({}));

      expect(subjects(rows)).toEqual(['Conversation 3', 'Conversation 2', 'Conversation 1']);
      expect(rows[0]).toEqual({
        id: id(3),
        workspaceId: 'workspace_1',
        subject: 'Conversation 3',
        status: 'open',
        createdAt: new Date(Date.UTC(2026, 10, 13, 8, 3)),
        updatedAt: new Date(Date.UTC(2026, 10, 13, 8, 3)),
      });
    });

    it('keeps the assignment fields on assigned conversations', async () => {
      await seed(1, {}, 9);

      const [row] = await repository.list('workspace_1', {}, PageRequest.create({}));

      expect(row).toMatchObject({ assignedAgentId: id(9), assignedBy: 'user_1' });
      expect(row.assignedAt).toEqual(new Date(Date.UTC(2026, 10, 13, 8, 1)));
    });

    it("never returns another workspace's conversations", async () => {
      await seed(1);
      await seed(2, { workspaceId: 'workspace_2' });

      expect(subjects(await repository.list('workspace_1', {}, PageRequest.create({})))).toEqual([
        'Conversation 1',
      ]);
      expect(await repository.list('workspace_3', {}, PageRequest.create({}))).toEqual([]);
    });

    it('fetches at most limit + 1 rows', async () => {
      for (const n of [1, 2, 3, 4, 5]) await seed(n);

      const rows = await repository.list('workspace_1', {}, PageRequest.create({ limit: 2 }));

      expect(subjects(rows)).toEqual(['Conversation 5', 'Conversation 4', 'Conversation 3']);
    });

    it('pages forward and back through every conversation exactly once', async () => {
      for (const n of [1, 2, 3, 4, 5]) await seed(n);

      const first = await page({ limit: 2 });
      const second = await page({ limit: 2, next: first.next as string });
      const third = await page({ limit: 2, next: second.next as string });
      expect([first, second, third].map((p) => subjects(p.items))).toEqual([
        ['Conversation 5', 'Conversation 4'],
        ['Conversation 3', 'Conversation 2'],
        ['Conversation 1'],
      ]);
      expect(third.hasNext).toBe(false);

      const back = await page({ limit: 2, previous: third.previous as string });
      expect(subjects(back.items)).toEqual(['Conversation 3', 'Conversation 2']);
      const backAgain = await page({ limit: 2, previous: back.previous as string });
      expect(subjects(backAgain.items)).toEqual(['Conversation 5', 'Conversation 4']);
      expect(backAgain.hasPrevious).toBe(false);
    });

    it('does not repeat or skip conversations created at the same instant', async () => {
      const now = new Date(Date.UTC(2026, 10, 13, 9, 0));
      for (const n of [1, 2, 3, 4]) await seed(n, { now });

      const seen: string[] = [];
      let next: string | undefined;
      do {
        const result = await page({ limit: 1, next });
        seen.push(...subjects(result.items));
        next = result.next ?? undefined;
      } while (next);

      expect(seen).toEqual(['Conversation 4', 'Conversation 3', 'Conversation 2', 'Conversation 1']);
    });

    it("keeps a cursor from another workspace from revealing that workspace's data", async () => {
      for (const n of [1, 2, 3]) await seed(n);
      for (const n of [4, 5, 6]) await seed(n, { workspaceId: 'workspace_2' });
      const elsewhere = await page({ limit: 1 }, {}, 'workspace_2');

      const result = await page({ next: elsewhere.next as string });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every((c) => c.workspaceId === 'workspace_1')).toBe(true);
    });

    describe('filters', () => {
      beforeEach(async () => {
        await seed(1, {}, 9);
        await seed(2, { status: 'closed' }, 9);
        await seed(3, {}, 8);
        await seed(4);
        await seed(5, { workspaceId: 'workspace_2' }, 9);
      });

      it('filters by status', async () => {
        expect(subjects((await page({}, { status: 'open' })).items)).toEqual([
          'Conversation 4',
          'Conversation 3',
          'Conversation 1',
        ]);
        expect(subjects((await page({}, { status: 'closed' })).items)).toEqual(['Conversation 2']);
      });

      it('filters by assigned agent', async () => {
        expect(subjects((await page({}, { assignedAgentId: id(9) })).items)).toEqual([
          'Conversation 2',
          'Conversation 1',
        ]);
      });

      it('combines both filters', async () => {
        expect(
          subjects((await page({}, { status: 'open', assignedAgentId: id(9) })).items),
        ).toEqual(['Conversation 1']);
      });

      it('pages through a filtered list without leaving the filter', async () => {
        const first = await page({ limit: 2 }, { status: 'open' });
        const second = await page({ limit: 2, next: first.next as string }, { status: 'open' });

        expect(subjects(first.items)).toEqual(['Conversation 4', 'Conversation 3']);
        expect(subjects(second.items)).toEqual(['Conversation 1']);
        expect(second.hasNext).toBe(false);
      });
    });
  });

  describe('indexes', () => {
    it('exist in the database', async () => {
      const keys = (await model.collection.indexes()).map((index) => index.key);

      expect(keys).toContainEqual({ workspaceId: 1, createdAt: -1, _id: -1 });
      expect(keys).toContainEqual({ workspaceId: 1, status: 1, createdAt: -1, _id: -1 });
      expect(keys).toContainEqual({ workspaceId: 1, assignedAgentId: 1, createdAt: -1, _id: -1 });
    });
  });
});
