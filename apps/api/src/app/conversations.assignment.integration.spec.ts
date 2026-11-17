/**
 * End-to-end integration test for PATCH and DELETE /conversations/:id/assignment:
 * the real AppModule against a real MongoDB. Run with `npx nx integration api`.
 * It only touches a database whose name ends in `_test` and drops it afterwards.
 *
 * The controller specs cover each HTTP case with fake use cases; this file proves
 * the whole chain: roles, the agents lookup, the domain rules, and what is
 * actually stored (assignment fields absent, never null, after an unassign).
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

const headers = (workspaceId = 'workspace_1', role = 'manager', userId = 'user_manager') => ({
  'content-type': 'application/json',
  'x-user-id': userId,
  'x-workspace-id': workspaceId,
  'x-role': role,
});

interface ConversationJson {
  id: string;
  status: string;
  workspaceId: string;
  assignedAgentId: string | null;
  assignedAt: string | null;
  assignedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lets the clock move on, so "unchanged" and "changed" timestamps differ. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('PATCH and DELETE /conversations/:id/assignment (real app, real MongoDB)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let connection: mongoose.Connection;

  const post = async <T>(path: string, body: object, requestHeaders = headers()): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body),
    });
    return (await response.json()) as T;
  };
  const createAgent = (name: string, workspaceId = 'workspace_1') =>
    post<{ id: string }>(
      '/agents',
      { name, email: `${name.toLowerCase()}@example.com` },
      headers(workspaceId),
    ).then((agent) => agent.id);
  const createConversation = (status?: 'open' | 'closed', workspaceId = 'workspace_1') =>
    post<ConversationJson>(
      '/conversations',
      { subject: 'Unable to log in', status },
      headers(workspaceId),
    ).then((conversation) => conversation.id);

  const assign = (id: string, body: unknown, requestHeaders: Record<string, string> = headers()) =>
    fetch(`${baseUrl}/conversations/${id}/assignment`, {
      method: 'PATCH',
      headers: requestHeaders,
      body: JSON.stringify(body),
    });
  const unassign = (id: string, requestHeaders: Record<string, string> = headers()) =>
    fetch(`${baseUrl}/conversations/${id}/assignment`, {
      method: 'DELETE',
      headers: requestHeaders,
    });
  const read = async (id: string, workspaceId = 'workspace_1'): Promise<ConversationJson> =>
    (await fetch(`${baseUrl}/conversations/${id}`, { headers: headers(workspaceId) })).json();
  /** The stored document exactly as MongoDB holds it. */
  const stored = (id: string) =>
    connection.collection('conversations').findOne({ _id: new mongoose.Types.ObjectId(id) });

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
    await connection.collection('conversations').deleteMany({});
    await connection.collection('agents').deleteMany({});
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await app.close();
  });

  describe('PATCH /conversations/:id/assignment', () => {
    it('assigns an agent, recording who did it, and stores it', async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();

      const response = await assign(id, { agentId: agent });
      const body = (await response.json()) as ConversationJson;

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        id,
        status: 'open',
        workspaceId: 'workspace_1',
        assignedAgentId: agent,
        assignedBy: 'user_manager',
      });
      expect(new Date(body.assignedAt as string).toISOString()).toBe(body.assignedAt);
      expect(await stored(id)).toMatchObject({
        assignedAgentId: agent,
        assignedBy: 'user_manager',
        assignedAt: new Date(body.assignedAt as string),
      });
      expect(await read(id)).toEqual(body);
    });

    it('lets an admin assign too, and records the admin', async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();

      const response = await assign(id, { agentId: agent }, headers('workspace_1', 'admin', 'user_admin'));

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ assignedBy: 'user_admin' });
    });

    it('replaces the previous agent on reassignment', async () => {
      const ada = await createAgent('Ada');
      const bob = await createAgent('Bob');
      const id = await createConversation();
      await assign(id, { agentId: ada });
      await tick();

      const response = await assign(id, { agentId: bob }, headers('workspace_1', 'admin', 'user_admin'));
      const body = (await response.json()) as ConversationJson;

      expect(response.status).toBe(200);
      expect(body).toMatchObject({ assignedAgentId: bob, assignedBy: 'user_admin' });
      expect(await stored(id)).toMatchObject({ assignedAgentId: bob, assignedBy: 'user_admin' });
    });

    it('changes nothing when the same agent is assigned twice', async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();
      const first = (await (await assign(id, { agentId: agent })).json()) as ConversationJson;
      const before = await stored(id);
      await tick();

      const again = await assign(id, { agentId: agent }, headers('workspace_1', 'admin', 'user_admin'));

      expect(again.status).toBe(200);
      expect(await again.json()).toEqual(first);
      expect(await stored(id)).toEqual(before);
    });

    it('makes the conversation show up under the assignedAgentId filter', async () => {
      const agent = await createAgent('Ada');
      const assigned = await createConversation();
      await createConversation();
      await assign(assigned, { agentId: agent });

      const list = await fetch(`${baseUrl}/conversations?assignedAgentId=${agent}`, {
        headers: headers(),
      });

      expect(((await list.json()) as { items: ConversationJson[] }).items.map((c) => c.id)).toEqual([
        assigned,
      ]);
    });

    describe('403 Forbidden', () => {
      it('rejects the agent role and leaves the conversation as it was', async () => {
        const agent = await createAgent('Ada');
        const id = await createConversation();

        const response = await assign(id, { agentId: agent }, headers('workspace_1', 'agent'));

        expect(response.status).toBe(403);
        expect(await stored(id)).not.toHaveProperty('assignedAgentId');
      });
    });

    describe('404 Not Found', () => {
      it('rejects an agent that does not exist', async () => {
        const id = await createConversation();

        const response = await assign(id, { agentId: new mongoose.Types.ObjectId().toHexString() });

        expect(response.status).toBe(404);
        expect(await stored(id)).not.toHaveProperty('assignedAgentId');
      });

      it("rejects an agent of another workspace as if it did not exist", async () => {
        const foreign = await createAgent('Eve', 'workspace_2');
        const id = await createConversation();

        const response = await assign(id, { agentId: foreign });

        expect(response.status).toBe(404);
        expect(await stored(id)).not.toHaveProperty('assignedAgentId');
      });

      it('rejects a conversation that does not exist', async () => {
        const agent = await createAgent('Ada');

        const response = await assign(new mongoose.Types.ObjectId().toHexString(), {
          agentId: agent,
        });

        expect(response.status).toBe(404);
      });

      it("rejects another workspace's conversation and does not modify it", async () => {
        const foreignAgent = await createAgent('Eve', 'workspace_2');
        const foreignConversation = await createConversation('open', 'workspace_2');

        const response = await assign(foreignConversation, { agentId: foreignAgent });

        expect(response.status).toBe(404);
        expect(await stored(foreignConversation)).not.toHaveProperty('assignedAgentId');
      });
    });

    describe('409 Conflict', () => {
      it('rejects a closed conversation and leaves it unassigned', async () => {
        const agent = await createAgent('Ada');
        const id = await createConversation('closed');

        const response = await assign(id, { agentId: agent });

        expect(response.status).toBe(409);
        expect(await stored(id)).not.toHaveProperty('assignedAgentId');
      });

      it('rejects reassigning a conversation that was closed after it was assigned', async () => {
        const ada = await createAgent('Ada');
        const bob = await createAgent('Bob');
        const id = await createConversation();
        await assign(id, { agentId: ada });
        await connection
          .collection('conversations')
          .updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { status: 'closed' } });

        const response = await assign(id, { agentId: bob });

        expect(response.status).toBe(409);
        expect(await stored(id)).toMatchObject({ assignedAgentId: ada });
      });
    });

    describe('400 Bad Request', () => {
      it.each([
        ['an empty body', {}],
        ['a missing agentId', { agent: 'x' }],
        ['a non-string agentId', { agentId: 7 }],
        ['an empty agentId', { agentId: '' }],
        ['an agentId that is not an id', { agentId: 'agent_456' }],
        ['an assignedBy in the body', { agentId: 'a'.repeat(24), assignedBy: 'someone_else' }],
        ['a workspaceId in the body', { agentId: 'a'.repeat(24), workspaceId: 'workspace_9' }],
      ])('rejects %s', async (_label, body) => {
        const id = await createConversation();

        const response = await assign(id, body);

        expect(response.status).toBe(400);
        expect(await stored(id)).not.toHaveProperty('assignedAgentId');
      });

      it('rejects a conversation id that is not an id', async () => {
        const agent = await createAgent('Ada');

        expect((await assign('conv_123', { agentId: agent })).status).toBe(400);
      });
    });

    it('answers 401 without auth headers', async () => {
      const id = await createConversation();

      const response = await assign(id, { agentId: 'a'.repeat(24) }, { 'content-type': 'application/json' });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /conversations/:id/assignment', () => {
    /** An open conversation already assigned to a new agent. */
    const assigned = async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();
      await assign(id, { agentId: agent });
      await tick();
      return { id, agent };
    };

    it('clears the assignment: nulls in the response, absent fields in the database', async () => {
      const { id } = await assigned();

      const response = await unassign(id);
      const body = (await response.json()) as ConversationJson;

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        id,
        assignedAgentId: null,
        assignedAt: null,
        assignedBy: null,
      });
      expect(Date.parse(body.updatedAt)).toBeGreaterThan(Date.parse(body.createdAt));
      const document = await stored(id);
      expect(document).not.toHaveProperty('assignedAgentId');
      expect(document).not.toHaveProperty('assignedAt');
      expect(document).not.toHaveProperty('assignedBy');
      expect(await read(id)).toEqual(body);
    });

    it('removes the conversation from the assignedAgentId filter', async () => {
      const { id, agent } = await assigned();
      await unassign(id);

      const list = await fetch(`${baseUrl}/conversations?assignedAgentId=${agent}`, {
        headers: headers(),
      });

      expect(((await list.json()) as { items: unknown[] }).items).toEqual([]);
    });

    it('lets an admin unassign', async () => {
      const { id } = await assigned();

      expect((await unassign(id, headers('workspace_1', 'admin', 'user_admin'))).status).toBe(200);
    });

    it('answers 200 and changes nothing when unassigned twice', async () => {
      const { id } = await assigned();
      const first = await (await unassign(id)).json();
      const before = await stored(id);
      await tick();

      const again = await unassign(id);

      expect(again.status).toBe(200);
      expect(await again.json()).toEqual(first);
      expect(await stored(id)).toEqual(before);
    });

    it('answers 200 for a conversation that was never assigned', async () => {
      const id = await createConversation();

      const response = await unassign(id);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ assignedAgentId: null });
    });

    it('can unassign a conversation that was closed after it was assigned', async () => {
      const { id } = await assigned();
      await connection
        .collection('conversations')
        .updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { status: 'closed' } });

      const response = await unassign(id);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: 'closed', assignedAgentId: null });
    });

    it('allows a new assignment after an unassign', async () => {
      const { id } = await assigned();
      await unassign(id);
      const bob = await createAgent('Bob');

      const response = await assign(id, { agentId: bob }, headers('workspace_1', 'manager', 'user_2'));

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ assignedAgentId: bob, assignedBy: 'user_2' });
    });

    it('rejects the agent role with 403 and keeps the assignment', async () => {
      const { id, agent } = await assigned();

      const response = await unassign(id, headers('workspace_1', 'agent'));

      expect(response.status).toBe(403);
      expect(await stored(id)).toMatchObject({ assignedAgentId: agent });
    });

    it("answers 404 for another workspace's conversation and keeps its assignment", async () => {
      const { id, agent } = await assigned();

      const response = await unassign(id, headers('workspace_2'));

      expect(response.status).toBe(404);
      expect(await stored(id)).toMatchObject({ assignedAgentId: agent });
    });

    it('answers 404 for an id that does not exist', async () => {
      const response = await unassign(new mongoose.Types.ObjectId().toHexString());

      expect(response.status).toBe(404);
    });

    it('answers 400 for an id that is not an id', async () => {
      expect((await unassign('conv_123')).status).toBe(400);
    });

    it('answers 401 without auth headers', async () => {
      const { id } = await assigned();

      expect((await unassign(id, {})).status).toBe(401);
    });
  });
});
