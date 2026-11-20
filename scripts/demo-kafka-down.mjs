// npm run demo:kafka-down  (API, MongoDB and Kafka must be running; it stops and restarts Kafka itself)
import { execSync } from 'node:child_process';
import { call, createAgent, createConversation, waitFor } from './demo-lib.mjs';

const compose = (cmd) => execSync(`docker compose ${cmd}`, { stdio: 'inherit' });
const show = (label, r) => console.log(`  ${label.padEnd(34)} -> ${r.status}`);
let failed = false;
const expect = (label, r, status) => {
  show(label, r);
  if (r.status !== status) { failed = true; console.log(`    expected ${status}`); }
};

const agentId = await createAgent(1);
const conversationId = await createConversation();
const path = `/conversations/${conversationId}`;
const assign = () => call('PATCH', `${path}/assignment`, { body: { agentId } });

try {
  console.log('Stopping Kafka...');
  compose('stop kafka');
  console.log('While Kafka is down:');
  const t = Date.now();
  expect('PATCH assignment', await assign(), 503);
  console.log(`    (answered in ${Date.now() - t} ms, nothing was changed)`);
  expect('PATCH as agent role (check)', await call('PATCH', `${path}/assignment`, { role: 'agent', body: { agentId } }), 403);
  expect('PATCH unknown agent (check)', await call('PATCH', `${path}/assignment`, { body: { agentId: 'a'.repeat(24) } }), 404);
  expect('GET conversation (read)', await call('GET', path), 200);
  const still = (await call('GET', path)).body;
  if (still.assignedAgentId !== null) { failed = true; console.log('    the conversation was changed!'); }
} finally {
  console.log('Starting Kafka...');
  compose('start kafka');
}

console.log('After Kafka is back:');
await waitFor(async () => (await assign()).status, (s) => s === 200, 60);
console.log('  PATCH assignment                   -> 200');
const done = await waitFor(async () => (await call('GET', path)).body, (c) => c.assignedAgentId === agentId, 30);
console.log(`  conversation now assigned to ...${done.assignedAgentId.slice(-6)}`);

console.log(failed ? '\nFAILED' : '\nOK: Kafka down gives 503 and changes nothing; reads and checks still work; it recovers by itself.');
process.exit(failed ? 1 : 0);
