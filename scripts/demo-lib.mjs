// Shared helpers for the demo scripts. Needs Node 20 (global fetch) and the API running.
export const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
export const WORKSPACE = `demo_${Date.now()}`; // a fresh workspace, so a demo never meets old data

export const call = async (method, path, { role = 'manager', user = 'demo_user', body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-user-id': user, 'x-workspace-id': WORKSPACE, 'x-role': role },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

export const createAgent = async (n) =>
  (await call('POST', '/agents', { body: { name: `Agent ${n}`, email: `agent${n}.${Date.now()}@demo.test` } })).body.id;

export const createConversation = async () =>
  (await call('POST', '/conversations', { body: { subject: 'Demo conversation' } })).body.id;

/** Calls `read` every 250 ms until `done(result)` holds, or gives up after `seconds`. */
export const waitFor = async (read, done, seconds = 30) => {
  for (let i = 0; i < seconds * 4; i++) {
    const result = await read();
    if (done(result)) return result;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`gave up after ${seconds}s`);
};

/**
 * What is wrong with a conversation's history? `newestFirst` are the lines as the API lists them;
 * `finalAgentId` is who the conversation ended up assigned to. Empty list means all is well:
 * each line's previous agent is the agent of the line before it, versions rise, and the last
 * line names the agent the conversation really has.
 */
export const chainProblems = (newestFirst, finalAgentId) => {
  if (newestFirst.length === 0) return ['no history lines'];
  const problems = [];
  const oldestFirst = [...newestFirst].reverse();
  oldestFirst.forEach((l, i) => {
    const before = oldestFirst[i - 1];
    if (before && l.previousAgentId !== before.newAgentId)
      problems.push(`line ${i + 1}: previous agent ${l.previousAgentId} is not ${before.newAgentId}`);
    if (before && l.version <= before.version) problems.push(`line ${i + 1}: version ${l.version} did not rise`);
  });
  const newest = newestFirst[0];
  if (newest.newAgentId !== finalAgentId)
    problems.push(`conversation ended on ${finalAgentId}, newest line says ${newest.newAgentId}`);
  return problems;
};
