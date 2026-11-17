/**
 * End-to-end integration test for GET /conversations: the real AppModule
 * against a real MongoDB. Run with `npx nx integration api`. It only touches a
 * database whose name ends in `_test` and drops it afterwards.
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

interface ConversationJson {
  id: string;
  subject: string;
  status: string;
  workspaceId: string;
  assignedAgentId: string | null;
}
interface PageJson {
  items: ConversationJson[];
  hasNext: boolean;
  next: string | null;
  hasPrevious: boolean;
  previous: string | null;
}

describe('GET /conversations (real app, real MongoDB)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let connection: mongoose.Connection;

  const create = async (subject: string, status?: string, workspaceId = 'workspace_1') => {
    const response = await fetch(`${baseUrl}/conversations`, {
      method: 'POST',
      headers: headers(workspaceId),
      body: JSON.stringify({ subject, status }),
    });
    return (await response.json()) as ConversationJson;
  };
  const get = (query = '', requestHeaders: Record<string, string> = headers()) =>
    fetch(`${baseUrl}/conversations${query}`, { headers: requestHeaders });
  const getPage = async (query = ''): Promise<PageJson> => (await get(query)).json();
  const subjects = (page: PageJson) => page.items.map((c) => c.subject);
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

  it('lists the conversations created through POST, newest first', async () => {
    for (const subject of ['First', 'Second', 'Third']) await create(subject);

    const response = await get();
    const page = (await response.json()) as PageJson;

    expect(response.status).toBe(200);
    expect(subjects(page)).toEqual(['Third', 'Second', 'First']);
    expect(page).toMatchObject({ hasNext: false, next: null, hasPrevious: false, previous: null });
    expect(page.items[0]).toMatchObject({
      workspaceId: 'workspace_1',
      status: 'open',
      assignedAgentId: null,
    });
    expect(page.items[0].id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('returns an empty page when the workspace has none', async () => {
    expect(await getPage()).toEqual({
      items: [],
      hasNext: false,
      next: null,
      hasPrevious: false,
      previous: null,
    });
  });

  it('never lists another workspace', async () => {
    await create('Mine');
    await create('Theirs', undefined, 'workspace_2');

    expect(subjects(await getPage())).toEqual(['Mine']);
  });

  it('pages forward and back with the returned tokens', async () => {
    for (const subject of ['A', 'B', 'C', 'D', 'E']) await create(subject);

    const first = await getPage('?limit=2');
    const second = await getPage(`?limit=2&next=${first.next}`);
    const third = await getPage(`?limit=2&next=${second.next}`);

    expect([subjects(first), subjects(second), subjects(third)]).toEqual([
      ['E', 'D'],
      ['C', 'B'],
      ['A'],
    ]);
    expect(third.hasNext).toBe(false);
    expect(subjects(await getPage(`?limit=2&previous=${third.previous}`))).toEqual(['C', 'B']);
  });

  it('filters by status', async () => {
    await create('Open one');
    await create('Closed one', 'closed');
    await create('Open two', 'open');

    expect(subjects(await getPage('?status=closed'))).toEqual(['Closed one']);
    expect(subjects(await getPage('?status=open'))).toEqual(['Open two', 'Open one']);
  });

  it('filters by assigned agent', async () => {
    const agent = new mongoose.Types.ObjectId();
    const assigned = await create('Assigned');
    await create('Unassigned');
    // Assignment endpoints are not built yet, so assign directly in the database.
    await stored().updateOne(
      { _id: new mongoose.Types.ObjectId(assigned.id) },
      { $set: { assignedAgentId: agent.toHexString(), assignedAt: new Date(), assignedBy: 'u1' } },
    );

    const page = await getPage(`?assignedAgentId=${agent.toHexString()}`);

    expect(subjects(page)).toEqual(['Assigned']);
    expect(page.items[0].assignedAgentId).toBe(agent.toHexString());
  });

  it('answers 400 for a bad filter or paging value, and 401 without auth', async () => {
    expect((await get('?status=pending')).status).toBe(400);
    expect((await get('?assignedAgentId=agent-1')).status).toBe(400);
    expect((await get('?limit=0')).status).toBe(400);
    expect((await get('?next=garbage!')).status).toBe(400);
    expect((await get('', {})).status).toBe(401);
  });
});
