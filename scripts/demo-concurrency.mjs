// npm run demo:concurrency [N]  (API, MongoDB and Kafka must be running)
// Sends N assignment requests for ONE conversation at the same moment, to N different agents.
import { call, createAgent, createConversation, waitFor, chainProblems } from './demo-lib.mjs';

const N = Number(process.argv[2] ?? 10);
const conversationId = await createConversation();
const agents = await Promise.all(Array.from({ length: N }, (_, i) => createAgent(i + 1)));
const path = `/conversations/${conversationId}`;

console.log(`Sending ${N} PATCH requests at once for conversation ${conversationId}...`);
const started = Date.now();
const answers = await Promise.all(agents.map((agentId) => call('PATCH', `${path}/assignment`, { body: { agentId } })));
const counts = {};
for (const a of answers) counts[a.status] = (counts[a.status] ?? 0) + 1;
console.log(`Answers after ${Date.now() - started} ms:`, counts, '(200 = request sent; none is lost to a clash)');

const history = await waitFor(
  async () => (await call('GET', `${path}/assignment-history?limit=100`)).body,
  (h) => h.items.length >= N,
);
const conversation = (await call('GET', path)).body;

console.log('\nHistory, oldest first (each line must start where the one before ended):');
[...history.items].reverse().forEach((l) =>
  console.log(`  v${String(l.version).padEnd(3)} ${String(l.previousAgentId).slice(-6).padStart(6)} -> ${l.newAgentId.slice(-6)}`));
console.log(`\nConversation ended on agent ...${conversation.assignedAgentId.slice(-6)}, at version ${history.items[0].version}.`);

const problems = chainProblems(history.items, conversation.assignedAgentId);
if (history.items.length !== N) problems.push(`expected ${N} history lines, found ${history.items.length}`);
if (problems.length) {
  console.log('\nFAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`\nOK: all ${N} requests were applied one after another, none was lost, and the history chain is unbroken.`);
