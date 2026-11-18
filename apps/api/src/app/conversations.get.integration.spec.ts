/**
 * End-to-end integration test for GET /conversations/:id: the real AppModule
 * against a real MongoDB. Run with `npx nx integration api`. It only touches a
 * database whose name ends in `_test` and drops it afterwards.
 *
 * The controller spec covers the HTTP cases with a fake use case; this file
 * proves the whole chain reads what POST actually stored.
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

describe('GET /conversations/:id (real app, real MongoDB)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let connection: mongoose.Connection;

  const create = async (body: object, workspaceId = 'workspace_1') => {
    const response = await fetch(`${baseUrl}/conversations`, {
      method: 'POST',
      headers: headers(workspaceId),
      body: JSON.stringify(body),
    });
    return (await response.json()) as { id: string };
  };
  const get = (id: string, requestHeaders: Record<string, string> = headers()) =>
    fetch(`${baseUrl}/conversations/${id}`, { headers: requestHeaders });
  const stored = () => connection.collection('conversations');

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
  });

  beforeEach(async () => {
    await stored().deleteMany({});
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await app.close();
  });

  it('returns the conversation that POST created, with the assignment fields as null', async () => {
    const created = await create({ subject: 'Unable to log in' });

    const response = await get(created.id);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: created.id,
      subject: 'Unable to log in',
      status: 'open',
      workspaceId: 'workspace_1',
      assignedAgentId: null,
      assignedAt: null,
      assignedBy: null,
    });
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(body.updatedAt).toBe(body.createdAt);
  });

  it('returns a closed conversation', async () => {
    const created = await create({ subject: 'Old issue', status: 'closed' });

    expect((await (await get(created.id)).json()).status).toBe('closed');
  });

  it('returns the assignment fields of an assigned conversation', async () => {
    const id = new mongoose.Types.ObjectId();
    await stored().insertOne({
      _id: id,
      workspaceId: 'workspace_1',
      subject: 'Unable to log in',
      status: 'open',
      assignedAgentId: '65f1a2b3c4d5e6f708091a2b',
      assignedAt: new Date('2026-11-13T09:00:00.000Z'),
      assignedBy: 'user_123',
      createdAt: new Date('2026-11-13T08:30:00.000Z'),
      updatedAt: new Date('2026-11-13T09:00:00.000Z'),
      version: 1,
    });

    const body = await (await get(id.toHexString())).json();

    expect(body).toMatchObject({
      assignedAgentId: '65f1a2b3c4d5e6f708091a2b',
      assignedAt: '2026-11-13T09:00:00.000Z',
      assignedBy: 'user_123',
    });
  });

  it('answers 404 for a well-formed id that does not exist', async () => {
    await create({ subject: 'Hello' });

    const response = await get(new mongoose.Types.ObjectId().toHexString());

    expect(response.status).toBe(404);
  });

  it('answers 404 for a conversation of another workspace, the same as for a missing one', async () => {
    const elsewhere = await create({ subject: 'Theirs' }, 'workspace_2');

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
    ['another id style', 'conv_123'],
  ])('answers 400 for a malformed id (%s)', async (_label, id) => {
    expect((await get(id)).status).toBe(400);
  });

  it('answers 401 without auth headers', async () => {
    const created = await create({ subject: 'Hello' });

    expect((await get(created.id, {})).status).toBe(401);
  });

  it.each(['admin', 'manager', 'agent'])('lets the %s role read a conversation', async (role) => {
    const created = await create({ subject: 'Hello' });

    expect((await get(created.id, headers('workspace_1', role))).status).toBe(200);
  });
});
