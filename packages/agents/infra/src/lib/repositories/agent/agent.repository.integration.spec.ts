/**
 * Integration test: talks to a real MongoDB (the replica set from `docker-compose.yml` by default).
 * Run it with `npx nx integration agents-infra`.
 * It only ever touches a database whose name ends in `_test` and drops it afterwards.
 */
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AGENT_REPOSITORY, AgentRepository } from 'agents-application';
import { PageRequest, buildPage } from '@shared/core';
import { Agent, AgentEmailAlreadyExistsError } from 'agents-domain';
import * as mongoose from 'mongoose';
import * as os from 'os';
import { AgentRepositoryModule } from './agent-repository.module';
import { AgentDo } from './schema';

const hosts = process.env['MONGODB_TEST_HOSTS'] ?? 'localhost:27017';
const replicaSet = process.env['MONGODB_TEST_REPLICA_SET'] ?? 'mongodb-test';
// Each integration suite gets its own database (here: assignment_agents_infra_test), because
// nx runs suites in parallel and every suite empties and drops the database it uses.
const dbName = (process.env['MONGODB_TEST_DATABASE'] ?? 'assignment_test').replace(
  /_test$/,
  '_agents_infra_test',
);

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

  describe('findById', () => {
    it('returns the agent as a plain entity', async () => {
      const agent = newAgent();
      await repository.save(agent);

      expect(await repository.findById('workspace_1', agent.id)).toEqual({
        id: agent.id,
        workspaceId: 'workspace_1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        createdAt: now,
        updatedAt: now,
      });
    });

    it('returns null for an id that does not exist', async () => {
      await repository.save(newAgent());

      expect(
        await repository.findById('workspace_1', new mongoose.Types.ObjectId().toHexString()),
      ).toBeNull();
    });

    it('returns null for an agent that belongs to another workspace', async () => {
      const agent = newAgent({ workspaceId: 'workspace_2' });
      await repository.save(agent);

      expect(await repository.findById('workspace_1', agent.id)).toBeNull();
      expect(await repository.findById('workspace_2', agent.id)).not.toBeNull();
    });
  });

  describe('list', () => {
    /** Agent `n`: a higher n is created later; `at` forces a creation time. */
    const seed = (n: number, overrides: Partial<Parameters<typeof Agent.create>[0]> = {}) =>
      repository.save(
        newAgent({
          id: n.toString(16).padStart(24, '0'),
          name: `Agent ${n}`,
          email: `agent${n}@example.com`,
          now: new Date(Date.UTC(2026, 10, 13, 8, n)),
          ...overrides,
        }),
      );
    const page = (input: { limit?: number; next?: string; previous?: string }, ws = 'workspace_1') => {
      const request = PageRequest.create(input);
      return repository.list(ws, request).then((rows) => buildPage(rows, request));
    };
    const names = (rows: { name: string }[]) => rows.map((r) => r.name);

    it('returns a workspace newest first, as plain entities', async () => {
      for (const n of [2, 1, 3]) await seed(n);

      const rows = await repository.list('workspace_1', PageRequest.create({}));

      expect(names(rows)).toEqual(['Agent 3', 'Agent 2', 'Agent 1']);
      expect(rows[0]).toEqual({
        id: (3).toString(16).padStart(24, '0'),
        workspaceId: 'workspace_1',
        name: 'Agent 3',
        email: 'agent3@example.com',
        createdAt: new Date(Date.UTC(2026, 10, 13, 8, 3)),
        updatedAt: new Date(Date.UTC(2026, 10, 13, 8, 3)),
      });
    });

    it('never returns another workspace\'s agents', async () => {
      await seed(1);
      await seed(2, { workspaceId: 'workspace_2' });

      expect(names(await repository.list('workspace_1', PageRequest.create({})))).toEqual(['Agent 1']);
      expect(await repository.list('workspace_3', PageRequest.create({}))).toEqual([]);
    });

    it('fetches at most limit + 1 rows', async () => {
      for (const n of [1, 2, 3, 4, 5]) await seed(n);

      const rows = await repository.list('workspace_1', PageRequest.create({ limit: 2 }));

      expect(names(rows)).toEqual(['Agent 5', 'Agent 4', 'Agent 3']);
    });

    it('pages forward and back through every agent exactly once', async () => {
      for (const n of [1, 2, 3, 4, 5]) await seed(n);

      const first = await page({ limit: 2 });
      const second = await page({ limit: 2, next: first.next as string });
      const third = await page({ limit: 2, next: second.next as string });
      expect([names(first.items), names(second.items), names(third.items)]).toEqual([
        ['Agent 5', 'Agent 4'],
        ['Agent 3', 'Agent 2'],
        ['Agent 1'],
      ]);
      expect(third.hasNext).toBe(false);

      const back = await page({ limit: 2, previous: third.previous as string });
      expect(names(back.items)).toEqual(['Agent 3', 'Agent 2']);
      expect(back.hasNext).toBe(true);
      const backAgain = await page({ limit: 2, previous: back.previous as string });
      expect(names(backAgain.items)).toEqual(['Agent 5', 'Agent 4']);
      expect(backAgain.hasPrevious).toBe(false);
    });

    it('does not repeat or skip agents created at the same instant', async () => {
      const sameTime = new Date(Date.UTC(2026, 10, 13, 9, 0));
      for (const n of [1, 2, 3, 4]) await seed(n, { now: sameTime });

      const seen: string[] = [];
      let next: string | undefined;
      do {
        const result = await page({ limit: 1, next });
        seen.push(...names(result.items));
        next = result.next ?? undefined;
      } while (next);

      expect(seen).toEqual(['Agent 4', 'Agent 3', 'Agent 2', 'Agent 1']);
    });

    it('keeps a cursor from another workspace from revealing that workspace\'s agents', async () => {
      for (const n of [1, 2, 3]) await seed(n);
      for (const n of [4, 5, 6]) await seed(n, { workspaceId: 'workspace_2' });
      const elsewhere = await page({ limit: 1 }, 'workspace_2');

      const result = await page({ next: elsewhere.next as string });

      expect(result.items.length).toBeGreaterThan(0);
      expect(names(result.items).every((name) => ['Agent 1', 'Agent 2', 'Agent 3'].includes(name))).toBe(true);
    });
  });
});
