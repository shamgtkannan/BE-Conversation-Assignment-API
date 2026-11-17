/**
 * End-to-end integration test for GET /agents/:id: the real AppModule against a
 * real MongoDB. Run with `npx nx integration api`. It only touches a database
 * whose name ends in `_test` and drops it afterwards.
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
  process.env['MONGODB_TEST_HOSTS'] ?? 'localhost:27017';
process.env['MONGODB_REPLICA_SET'] = process.env['MONGODB_TEST_REPLICA_SET'] ?? 'mongodb-test';
process.env['MONGODB_DATABASE'] = dbName;

const headers = (workspaceId = 'workspace_1', role = 'manager') => ({
  'content-type': 'application/json',
  'x-user-id': 'user_123',
  'x-workspace-id': workspaceId,
  'x-role': role,
});

describe('GET /agents/:id (real app, real MongoDB)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let connection: mongoose.Connection;

  const create = async (name: string, workspaceId = 'workspace_1') => {
    const response = await fetch(`${baseUrl}/agents`, {
      method: 'POST',
      headers: headers(workspaceId),
      body: JSON.stringify({ name, email: `${name.toLowerCase()}@example.com` }),
    });
    return (await response.json()) as { id: string };
  };
  const get = (id: string, requestHeaders: Record<string, string> = headers()) =>
    fetch(`${baseUrl}/agents/${id}`, { headers: requestHeaders });

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
    await connection.collection('agents').createIndex({ workspaceId: 1, email: 1 }, { unique: true });
  });

  beforeEach(async () => {
    await connection.collection('agents').deleteMany({});
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await app.close();
  });

  it('returns the agent that POST created, field for field', async () => {
    const created = await create('Ada');

    const response = await get(created.id);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: created.id,
      name: 'Ada',
      email: 'ada@example.com',
      workspaceId: 'workspace_1',
    });
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(body.updatedAt).toBe(body.createdAt);
  });

  it('answers 404 for a well-formed id that does not exist', async () => {
    await create('Ada');

    const response = await get(new mongoose.Types.ObjectId().toHexString());

    expect(response.status).toBe(404);
  });

  it('answers 404 for an agent of another workspace, the same as for a missing one', async () => {
    const elsewhere = await create('Zed', 'workspace_2');

    const response = await get(elsewhere.id);
    const missing = await get(new mongoose.Types.ObjectId().toHexString());

    expect(response.status).toBe(404);
    expect(missing.status).toBe(404);
    expect((await response.json()).message).toContain('was not found');
    // The owner still sees it.
    expect((await get(elsewhere.id, headers('workspace_2'))).status).toBe(200);
  });

  it.each([
    ['too short', 'abc'],
    ['25 characters', '65f1a2b3c4d5e6f708091a2b0'],
    ['uppercase hex', '65F1A2B3C4D5E6F708091A2B'],
    ['not hex', 'zzzzzzzzzzzzzzzzzzzzzzzz'],
    ['another id style', 'agent_456'],
  ])('answers 400 for a malformed id (%s)', async (_label, id) => {
    expect((await get(id)).status).toBe(400);
  });

  it('answers 401 without auth headers', async () => {
    const created = await create('Ada');

    expect((await get(created.id, {})).status).toBe(401);
  });

  it.each(['admin', 'manager', 'agent'])('lets the %s role read an agent', async (role) => {
    const created = await create('Ada');

    expect((await get(created.id, headers('workspace_1', role))).status).toBe(200);
  });
});
