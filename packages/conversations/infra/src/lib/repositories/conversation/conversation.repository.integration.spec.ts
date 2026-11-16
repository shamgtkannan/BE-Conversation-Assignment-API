/**
 * Integration test: talks to a real MongoDB (the `docker/compose/mongodb-8.0`
 * replica set by default). Run it with `npx nx integration conversations-infra`.
 * It only ever touches a database whose name ends in `_test` and drops it afterwards.
 */
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { CONVERSATION_REPOSITORY, ConversationRepository } from 'conversations-application';
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

  describe('indexes', () => {
    it('exist in the database', async () => {
      const keys = (await model.collection.indexes()).map((index) => index.key);

      expect(keys).toContainEqual({ workspaceId: 1, createdAt: -1, _id: -1 });
      expect(keys).toContainEqual({ workspaceId: 1, status: 1 });
      expect(keys).toContainEqual({ workspaceId: 1, assignedAgentId: 1 });
    });
  });
});
