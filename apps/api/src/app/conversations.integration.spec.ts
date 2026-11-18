/**
 * End-to-end integration test for POST /conversations: the real AppModule against
 * a real MongoDB. Run with `npx nx integration api`. It only touches a database
 * whose name ends in `_test` and drops it afterwards.
 *
 * The controller spec already covers every validation case; this file only
 * proves what needs a real database: what is actually stored.
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

describe('POST /conversations (real app, real MongoDB)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let connection: mongoose.Connection;

  const post = (body: unknown, requestHeaders: Record<string, string> = headers()) =>
    fetch(`${baseUrl}/conversations`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body),
    });
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

  it('answers 201 and stores exactly the specified fields, with no assignment fields', async () => {
    const response = await post({ subject: 'Unable to log in' });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      subject: 'Unable to log in',
      status: 'open',
      workspaceId: 'workspace_1',
      assignedAgentId: null,
      assignedAt: null,
      assignedBy: null,
    });
    expect(body.id).toMatch(/^[0-9a-f]{24}$/);
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(body.updatedAt).toBe(body.createdAt);

    const document = await stored().findOne({ _id: new mongoose.Types.ObjectId(body.id) });
    expect(document).toMatchObject({
      workspaceId: 'workspace_1',
      subject: 'Unable to log in',
      status: 'open',
      createdAt: new Date(body.createdAt),
    });
    // Absent in MongoDB (the API turns them into null), and no Mongoose version key.
    expect(Object.keys(document ?? {}).sort()).toEqual(
      ['_id', 'createdAt', 'status', 'subject', 'updatedAt', 'version', 'workspaceId'].sort(),
    );
  });

  it('stores the trimmed subject and a closed status, in the workspace from the headers', async () => {
    const response = await post(
      { subject: '  Refund request  ', status: 'closed' },
      headers('workspace_7', 'agent'),
    );

    const body = await response.json();
    expect(response.status).toBe(201);
    expect(await stored().findOne({ _id: new mongoose.Types.ObjectId(body.id) })).toMatchObject({
      workspaceId: 'workspace_7',
      subject: 'Refund request',
      status: 'closed',
    });
  });

  it('allows several conversations with the same subject', async () => {
    await post({ subject: 'Same subject' });
    await post({ subject: 'Same subject' });

    expect(await stored().countDocuments()).toBe(2);
  });

  it('answers 400 and stores nothing for a blank subject', async () => {
    expect((await post({ subject: '   ' })).status).toBe(400);
    expect(await stored().countDocuments()).toBe(0);
  });

  it('answers 401 and stores nothing without auth headers', async () => {
    const response = await post({ subject: 'Hello' }, { 'content-type': 'application/json' });

    expect(response.status).toBe(401);
    expect(await stored().countDocuments()).toBe(0);
  });
});
