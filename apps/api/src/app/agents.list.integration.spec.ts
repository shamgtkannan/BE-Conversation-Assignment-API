/**
 * End-to-end integration test for GET /agents: the real AppModule against a real
 * MongoDB. Run with `npx nx integration api`. It only touches a database whose
 * name ends in `_test` and drops it afterwards.
 */
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import * as mongoose from 'mongoose';
import { AppModule } from './app.module';
import { createValidationPipe } from './validation-pipe';

const dbName = process.env['MONGODB_TEST_DATABASE'] ?? 'assignment_test';

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

interface AgentJson {
  id: string;
  name: string;
  workspaceId: string;
}
interface PageJson {
  items: AgentJson[];
  hasNext: boolean;
  next: string | null;
  hasPrevious: boolean;
  previous: string | null;
}

describe('GET /agents (real app, real MongoDB)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let connection: mongoose.Connection;

  const create = (name: string, workspaceId = 'workspace_1') =>
    fetch(`${baseUrl}/agents`, {
      method: 'POST',
      headers: headers(workspaceId),
      body: JSON.stringify({ name, email: `${name.toLowerCase().replace(/\s/g, '')}@example.com` }),
    });
  const get = (query = '', requestHeaders: Record<string, string> = headers()) =>
    fetch(`${baseUrl}/agents${query}`, { headers: requestHeaders });
  const getPage = async (query = ''): Promise<PageJson> => (await get(query)).json();
  const names = (page: PageJson) => page.items.map((a) => a.name);

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

  it('lists the agents created through POST, newest first', async () => {
    for (const name of ['Ada', 'Bob', 'Cleo']) await create(name);

    const response = await get();
    const page = (await response.json()) as PageJson;

    expect(response.status).toBe(200);
    expect(names(page)).toEqual(['Cleo', 'Bob', 'Ada']);
    expect(page).toMatchObject({ hasNext: false, next: null, hasPrevious: false, previous: null });
    expect(page.items[0]).toMatchObject({
      workspaceId: 'workspace_1',
      email: 'cleo@example.com',
    });
    expect(page.items[0].id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('answers 200 with an empty page for a workspace with no agents', async () => {
    const response = await get('', headers('workspace_nobody'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [],
      hasNext: false,
      next: null,
      hasPrevious: false,
      previous: null,
    });
  });

  it('only lists the caller\'s workspace', async () => {
    await create('Ada');
    await create('Zed', 'workspace_2');

    expect(names(await getPage())).toEqual(['Ada']);
    const other = (await (await get('', headers('workspace_2'))).json()) as PageJson;
    expect(names(other)).toEqual(['Zed']);
  });

  it('pages forward and back with the tokens in the response', async () => {
    for (const name of ['A1', 'A2', 'A3', 'A4', 'A5']) await create(name);

    const first = await getPage('?limit=2');
    const second = await getPage(`?limit=2&next=${first.next}`);
    const third = await getPage(`?limit=2&next=${second.next}`);

    expect([names(first), names(second), names(third)]).toEqual([
      ['A5', 'A4'],
      ['A3', 'A2'],
      ['A1'],
    ]);
    expect(first).toMatchObject({ hasNext: true, hasPrevious: false });
    expect(third).toMatchObject({ hasNext: false, hasPrevious: true });

    const back = await getPage(`?limit=2&previous=${third.previous}`);
    expect(names(back)).toEqual(['A3', 'A2']);
    const backAgain = await getPage(`?limit=2&previous=${back.previous}`);
    expect(names(backAgain)).toEqual(['A5', 'A4']);
    expect(backAgain.hasPrevious).toBe(false);
  });

  it('does not let a cursor from another workspace reveal that workspace\'s agents', async () => {
    await create('Ada');
    await create('Bob');
    for (const name of ['Xan', 'Yul', 'Zed']) await create(name, 'workspace_2');
    const elsewhere = (await (await get('?limit=1', headers('workspace_2'))).json()) as PageJson;

    const page = await getPage(`?next=${elsewhere.next}`);

    expect(page.items.every((a) => a.workspaceId === 'workspace_1')).toBe(true);
  });

  it.each([
    ['limit=0'],
    ['limit=101'],
    ['limit=abc'],
    ['next=garbage'],
    ['previous=garbage'],
    ['workspaceId=workspace_9'],
  ])('answers 400 for ?%s', async (query) => {
    expect((await get(`?${query}`)).status).toBe(400);
  });

  it('answers 400 when both cursors are sent', async () => {
    await create('Ada');
    await create('Bob');
    const first = await getPage('?limit=1');

    const response = await get(`?next=${first.next}&previous=${first.next}`);

    expect(response.status).toBe(400);
  });

  it('answers 401 without auth headers', async () => {
    expect((await get('', {})).status).toBe(401);
  });

  it.each(['admin', 'manager', 'agent'])('lets the %s role list agents', async (role) => {
    expect((await get('', headers('workspace_1', role))).status).toBe(200);
  });
});
