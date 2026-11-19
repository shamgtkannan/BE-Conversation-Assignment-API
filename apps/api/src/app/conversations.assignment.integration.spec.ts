/**
 * End-to-end integration test for PATCH and DELETE /conversations/:id/assignment:
 * the real AppModule against a real MongoDB and a real Kafka. Run with
 * `npx nx integration api`. It only touches a database whose name ends in `_test` and
 * drops it afterwards.
 *
 * These calls ask for a change and answer `200` at once; the request consumer makes the
 * change a moment later. So what is checked before sending (role, ids, body, the
 * conversation and the agent existing, a closed conversation) is answered by the call
 * itself, and everything about the change waits for it with `eventually`.
 *
 * The controller specs cover each HTTP case with fake use cases; this file proves the
 * whole chain: the checks, the request on Kafka, the change in MongoDB, and what is
 * actually stored (assignment fields absent, never null, after an unassign).
 */
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AssignmentRequestConsumer } from '../modules/conversations/assignment-request.consumer';
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
process.env['MONGODB_HOSTS'] = process.env['MONGODB_TEST_HOSTS'] ?? 'localhost:27017';
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

/** Retries `check` until it stops throwing: the change is made a moment after the request. */
const eventually = async <T>(check: () => Promise<T>, timeoutMs = 20000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
};

describe('PATCH and DELETE /conversations/:id/assignment (real app, real MongoDB, real Kafka)', () => {
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
    // Requests are read from the moment the consumer joins, so wait for it before sending any.
    await app.get(AssignmentRequestConsumer).ready;
  });

  beforeEach(async () => {
    await connection.collection('conversations').deleteMany({});
    await connection.collection('agents').deleteMany({});
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await app.close();
  });

  /** Waits until the stored conversation satisfies `check`. */
  const waitForStored = (
    id: string,
    check: (document: Record<string, unknown> | null) => boolean,
  ) =>
    eventually(async () => {
      const document = (await stored(id)) as Record<string, unknown> | null;
      if (!check(document)) throw new Error('the change has not been made yet');
      return document;
    });
  const waitForAgent = (id: string, agentId: string | null) =>
    waitForStored(id, (document) => (document?.['assignedAgentId'] ?? null) === agentId);
  /** Asks for an assignment, expects it to be accepted, and waits for it to be made. */
  const assignAndWait = async (
    id: string,
    agentId: string,
    requestHeaders: Record<string, string> = headers(),
  ) => {
    expect((await assign(id, { agentId }, requestHeaders)).status).toBe(200);
    return waitForAgent(id, agentId);
  };
  const unassignAndWait = async (
    id: string,
    requestHeaders: Record<string, string> = headers(),
  ) => {
    expect((await unassign(id, requestHeaders)).status).toBe(200);
    return waitForAgent(id, null);
  };

  describe('PATCH /conversations/:id/assignment', () => {
    it('answers that the request was sent, and the conversation is assigned a moment later, recording who asked', async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();

      const response = await assign(id, { agentId: agent });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ commandId: expect.any(String), status: 'requested' });
      const document = await waitForAgent(id, agent);
      expect(document).toMatchObject({ assignedBy: 'user_manager' });
      expect(document?.['assignedAt']).toBeInstanceOf(Date);
      expect(await read(id)).toMatchObject({
        id,
        status: 'open',
        workspaceId: 'workspace_1',
        assignedAgentId: agent,
        assignedBy: 'user_manager',
      });
    });

    it('names each request differently', async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();

      const first = (await (await assign(id, { agentId: agent })).json()) as { commandId: string };
      const second = (await (await assign(id, { agentId: agent })).json()) as { commandId: string };

      expect(first.commandId).not.toBe(second.commandId);
    });

    it('lets an admin assign too, and records the admin', async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();

      const document = await assignAndWait(
        id,
        agent,
        headers('workspace_1', 'admin', 'user_admin'),
      );

      expect(document).toMatchObject({ assignedBy: 'user_admin' });
    });

    it('replaces the previous agent on reassignment', async () => {
      const ada = await createAgent('Ada');
      const bob = await createAgent('Bob');
      const id = await createConversation();
      await assignAndWait(id, ada);

      const document = await assignAndWait(id, bob, headers('workspace_1', 'admin', 'user_admin'));

      expect(document).toMatchObject({ assignedAgentId: bob, assignedBy: 'user_admin' });
    });

    it('changes nothing when the same agent is asked for twice', async () => {
      const [ada, bob] = [await createAgent('Ada'), await createAgent('Bob')];
      const id = await createConversation();
      await assignAndWait(id, ada);

      await assign(id, { agentId: ada }, headers('workspace_1', 'admin', 'user_admin'));
      const document = await assignAndWait(id, bob); // behind it: once this shows, the repeat was handled

      // assign ada = version 1, the repeat changed nothing, assign bob = version 2.
      expect(document).toMatchObject({ version: 2 });
    });

    it('makes the conversation show up under the assignedAgentId filter', async () => {
      const agent = await createAgent('Ada');
      const assigned = await createConversation();
      await createConversation();
      await assignAndWait(assigned, agent);

      const list = await fetch(`${baseUrl}/conversations?assignedAgentId=${agent}`, {
        headers: headers(),
      });

      expect(((await list.json()) as { items: ConversationJson[] }).items.map((c) => c.id)).toEqual(
        [assigned],
      );
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

      it('rejects an agent of another workspace as if it did not exist', async () => {
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
        await assignAndWait(id, ada);
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

      const response = await assign(
        id,
        { agentId: 'a'.repeat(24) },
        { 'content-type': 'application/json' },
      );

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /conversations/:id/assignment', () => {
    /** An open conversation already assigned to a new agent. */
    const assigned = async () => {
      const agent = await createAgent('Ada');
      const id = await createConversation();
      await assignAndWait(id, agent);
      return { id, agent };
    };

    it('answers that the request was sent, and the assignment is cleared a moment later: absent fields in the database', async () => {
      const { id } = await assigned();

      const response = await unassign(id);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ commandId: expect.any(String), status: 'requested' });
      const document = await waitForAgent(id, null);
      expect(document).not.toHaveProperty('assignedAgentId');
      expect(document).not.toHaveProperty('assignedAt');
      expect(document).not.toHaveProperty('assignedBy');
      expect(await read(id)).toMatchObject({
        id,
        assignedAgentId: null,
        assignedAt: null,
        assignedBy: null,
      });
    });

    it('removes the conversation from the assignedAgentId filter', async () => {
      const { id, agent } = await assigned();
      await unassignAndWait(id);

      const list = await fetch(`${baseUrl}/conversations?assignedAgentId=${agent}`, {
        headers: headers(),
      });

      expect(((await list.json()) as { items: unknown[] }).items).toEqual([]);
    });

    it('lets an admin unassign', async () => {
      const { id } = await assigned();

      await unassignAndWait(id, headers('workspace_1', 'admin', 'user_admin'));
    });

    it('changes nothing when asked for twice', async () => {
      const { id } = await assigned();
      await unassignAndWait(id);
      const bob = await createAgent('Bob');

      await unassign(id);
      const document = await assignAndWait(id, bob); // behind it: once this shows, the repeat was handled

      // assign = version 1, unassign = 2, the repeat changed nothing, assign bob = 3.
      expect(document).toMatchObject({ version: 3 });
    });

    it('answers 200 for a conversation that was never assigned, and changes nothing', async () => {
      const id = await createConversation();
      const agent = await createAgent('Ada');

      const response = await unassign(id);
      const document = await assignAndWait(id, agent); // behind it

      expect(response.status).toBe(200);
      expect(document).toMatchObject({ version: 1 });
    });

    it('can unassign a conversation that was closed after it was assigned', async () => {
      const { id } = await assigned();
      await connection
        .collection('conversations')
        .updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { status: 'closed' } });

      const response = await unassign(id);

      expect(response.status).toBe(200);
      expect(await waitForAgent(id, null)).toMatchObject({ status: 'closed' });
    });

    it('allows a new assignment after an unassign', async () => {
      const { id } = await assigned();
      await unassignAndWait(id);
      const bob = await createAgent('Bob');

      const document = await assignAndWait(id, bob, headers('workspace_1', 'manager', 'user_2'));

      expect(document).toMatchObject({ assignedAgentId: bob, assignedBy: 'user_2' });
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

  describe('simultaneous requests', () => {
    const agents = (count: number) =>
      Promise.all(Array.from({ length: count }, (_, n) => createAgent(`Racer${n}`)));

    it('accepts every one, and applies them one at a time, so no change is lost', async () => {
      const id = await createConversation();
      const racers = await agents(10);

      const responses = await Promise.all(racers.map((agentId) => assign(id, { agentId })));

      expect(responses.every((response) => response.status === 200)).toBe(true);
      // Ten different agents asked for in turn: each is a real change, so ten versions.
      const document = await waitForStored(id, (doc) => doc?.['version'] === 10);
      expect(racers).toContain(document?.['assignedAgentId']);
      expect((await stored(id))?.['version']).toBe(10);
    });

    it('keeps an unbroken chain in the history: each line starts from the agent the one before ended with', async () => {
      const id = await createConversation();
      const racers = await agents(10);
      await Promise.all(racers.map((agentId) => assign(id, { agentId })));

      const lines = await eventually(async () => {
        const page = (await (
          await fetch(`${baseUrl}/conversations/${id}/assignment-history?limit=100`, {
            headers: headers(),
          })
        ).json()) as { items: { previousAgentId: string | null; newAgentId: string }[] };
        if (page.items.length !== 10) throw new Error(`${page.items.length}/10 lines`);
        return page.items;
      });

      // Newest first: each line's previous agent is the next line's new agent, and the first had none.
      lines
        .slice(0, -1)
        .forEach((line, n) => expect(line.previousAgentId).toBe(lines[n + 1].newAgentId));
      expect(lines[lines.length - 1].previousAgentId).toBeNull();
      expect(new Set(lines.map((line) => line.newAgentId)).size).toBe(10);
    });

    it('lets simultaneous removals through, clearing the assignment once and never half of it', async () => {
      const id = await createConversation();
      const [agent, other] = await agents(2);
      await assignAndWait(id, agent);

      const responses = await Promise.all(Array.from({ length: 5 }, () => unassign(id)));
      const document = await waitForAgent(id, null);
      const after = await assignAndWait(id, other); // behind them: once it shows, every removal was handled

      expect(responses.every((response) => response.status === 200)).toBe(true);
      expect(document).not.toHaveProperty('assignedAt');
      expect(document).not.toHaveProperty('assignedBy');
      // assign = 1, one removal = 2, the other four changed nothing, assign again = 3.
      expect(after).toMatchObject({ version: 3 });
    });
  });
});
