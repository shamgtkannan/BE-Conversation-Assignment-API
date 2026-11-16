/**
 * End-to-end integration test: the real AppModule (guard, pipe, filter, use
 * case, repository) against a real MongoDB. Run with `npx nx integration api`.
 * It only touches a database whose name ends in `_test` and drops it afterwards.
 */
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import * as mongoose from 'mongoose';
import { AppModule } from './app.module';
import { createValidationPipe } from './validation-pipe';

// Each integration suite gets its own database (here: assignment_api_test), because nx runs
// suites in parallel and every suite empties and drops the database it uses.
const dbName = (process.env['MONGODB_TEST_DATABASE'] ?? 'assignment_test').replace(
  /_test$/,
  '_api_test',
);

// Point the app at the test database before the module reads its config.
process.env['MONGODB_HOSTS'] =
  process.env['MONGODB_TEST_HOSTS'] ?? 'mongodb1:27801,mongodb2:27802,mongodb3:27803';
process.env['MONGODB_REPLICA_SET'] = process.env['MONGODB_TEST_REPLICA_SET'] ?? 'mongodb-test';
process.env['MONGODB_DATABASE'] = dbName;

const headers = (workspaceId = 'workspace_1', role = 'manager') => ({
  'content-type': 'application/json',
  'x-user-id': 'user_123',
  'x-workspace-id': workspaceId,
  'x-role': role,
});

describe('POST /agents (real app, real MongoDB)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let connection: mongoose.Connection;

  const post = (body: unknown, requestHeaders: Record<string, string> = headers()) =>
    fetch(`${baseUrl}/agents`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    if (!dbName.endsWith('_test')) {
      throw new Error(`Refusing to run against "${dbName}": test databases must end in _test`);
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(createValidationPipe());
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    connection = app.get<mongoose.Connection>(getConnectionToken());
    await connection.collection('agents').createIndex(
      { workspaceId: 1, email: 1 },
      { unique: true },
    );
  });

  beforeEach(async () => {
    await connection.collection('agents').deleteMany({});
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await app.close();
  });

  it('creates the agent, answers 201 and stores it in the database', async () => {
    const response = await post({ name: 'Ada Lovelace', email: 'ada@example.com' });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      workspaceId: 'workspace_1',
    });
    expect(body.id).toMatch(/^[0-9a-f]{24}$/);
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(body.updatedAt).toBe(body.createdAt);

    const stored = await connection
      .collection('agents')
      .findOne({ _id: new mongoose.Types.ObjectId(body.id) });
    expect(stored).toMatchObject({
      workspaceId: 'workspace_1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(stored?.['createdAt']).toEqual(new Date(body.createdAt));
  });

  it('stores the email trimmed and lowercased', async () => {
    const response = await post({ name: 'Ada Lovelace', email: 'ADA@Example.com' });

    expect(response.status).toBe(201);
    expect((await response.json()).email).toBe('ada@example.com');
  });

  it('takes the workspace from the auth headers', async () => {
    const response = await post(
      { name: 'Grace Hopper', email: 'grace@example.com' },
      headers('workspace_7', 'agent'),
    );

    expect((await response.json()).workspaceId).toBe('workspace_7');
  });

  it('answers 409 for a duplicate email in the same workspace, whatever its case', async () => {
    await post({ name: 'Ada Lovelace', email: 'ada@example.com' });

    const response = await post({ name: 'Ada Again', email: 'ADA@example.com' });

    expect(response.status).toBe(409);
    expect(await connection.collection('agents').countDocuments()).toBe(1);
  });

  it('allows the same email in another workspace', async () => {
    await post({ name: 'Ada Lovelace', email: 'ada@example.com' });

    const response = await post(
      { name: 'Ada Lovelace', email: 'ada@example.com' },
      headers('workspace_2'),
    );

    expect(response.status).toBe(201);
    expect(await connection.collection('agents').countDocuments()).toBe(2);
  });

  it('answers 400 and stores nothing for an invalid body', async () => {
    expect((await post({ name: 'Ada Lovelace', email: 'nope' })).status).toBe(400);
    expect((await post({ name: '   ', email: 'ada@example.com' })).status).toBe(400);
    expect(
      (await post({ name: 'Ada', email: 'ada@example.com', workspaceId: 'workspace_9' })).status,
    ).toBe(400);
    expect(await connection.collection('agents').countDocuments()).toBe(0);
  });

  it('answers 401 and stores nothing without auth headers', async () => {
    const response = await post(
      { name: 'Ada Lovelace', email: 'ada@example.com' },
      { 'content-type': 'application/json' },
    );

    expect(response.status).toBe(401);
    expect(await connection.collection('agents').countDocuments()).toBe(0);
  });
});
