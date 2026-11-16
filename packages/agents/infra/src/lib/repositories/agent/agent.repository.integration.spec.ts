/**
 * Integration test: talks to a real MongoDB (the `docker/compose/mongodb-8.0`
 * replica set by default). Run it with `npx nx integration agents-infra`.
 * It only ever touches a database whose name ends in `_test` and drops it afterwards.
 */
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AGENT_REPOSITORY, AgentRepository } from 'agents-application';
import { Agent, AgentEmailAlreadyExistsError } from 'agents-domain';
import * as mongoose from 'mongoose';
import * as os from 'os';
import { AgentRepositoryModule } from './agent-repository.module';
import { AgentDo } from './schema';

const hosts = process.env['MONGODB_TEST_HOSTS'] ?? 'mongodb1:27801,mongodb2:27802,mongodb3:27803';
const replicaSet = process.env['MONGODB_TEST_REPLICA_SET'] ?? 'mongodb-test';
const dbName = process.env['MONGODB_TEST_DATABASE'] ?? 'assignment_test';

const now = new Date('2026-11-13T08:30:00.000Z');

const newAgent = (overrides: Partial<Parameters<typeof Agent.create>[0]> = {}) =>
  Agent.create({
    id: new mongoose.Types.ObjectId().toHexString(),
    workspaceId: 'workspace_1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    now,
    ...overrides,
  });

describe('MongooseAgentRepository (real MongoDB)', () => {
  let moduleRef: TestingModule;
  let repository: AgentRepository;
  let model: mongoose.Model<AgentDo>;

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
        AgentRepositoryModule,
      ],
    }).compile();
    await moduleRef.init();

    repository = moduleRef.get<AgentRepository>(AGENT_REPOSITORY);
    model = moduleRef.get<mongoose.Model<AgentDo>>(getModelToken(AgentDo.name));
    await model.init(); // wait for the unique index to exist before testing it
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await model.db.dropDatabase();
    await moduleRef.close();
  });

  it('saves an agent as a document with the agent id as _id', async () => {
    const agent = newAgent();

    await repository.save(agent);

    const stored = await model.findById(agent.id).lean();
    expect(stored).toMatchObject({
      workspaceId: 'workspace_1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      createdAt: now,
      updatedAt: now,
    });
    expect(stored?._id.toString()).toBe(agent.id);
  });

  it('rejects a second agent with the same email in the same workspace', async () => {
    await repository.save(newAgent());

    await expect(repository.save(newAgent())).rejects.toThrow(AgentEmailAlreadyExistsError);
    expect(await model.countDocuments()).toBe(1);
  });

  it('treats a differently cased email as the same address (the domain lowercases it)', async () => {
    await repository.save(newAgent());

    await expect(repository.save(newAgent({ email: 'ADA@Example.com' }))).rejects.toThrow(
      AgentEmailAlreadyExistsError,
    );
  });

  it('allows the same email in a different workspace', async () => {
    await repository.save(newAgent());

    await repository.save(newAgent({ workspaceId: 'workspace_2' }));

    expect(await model.countDocuments()).toBe(2);
  });

  it('lets exactly one of two simultaneous saves of the same email win', async () => {
    const results = await Promise.allSettled([
      repository.save(newAgent()),
      repository.save(newAgent()),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(AgentEmailAlreadyExistsError);
    expect(await model.countDocuments()).toBe(1);
  });

  it('has the unique index on { workspaceId, email } in the database', async () => {
    const indexes = await model.collection.indexes();

    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { workspaceId: 1, email: 1 }, unique: true }),
    );
  });
});
