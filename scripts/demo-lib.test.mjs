import test from 'node:test';
import assert from 'node:assert/strict';
import { chainProblems } from './demo-lib.mjs';

// history lines as the API returns them: newest first
const line = (previousAgentId, newAgentId, version) => ({ previousAgentId, newAgentId, version });

test('an unbroken chain has no problems', () => {
  const newestFirst = [line('b', 'c', 3), line('a', 'b', 2), line(null, 'a', 1)];
  assert.deepEqual(chainProblems(newestFirst, 'c'), []);
});

test('a line whose previous agent is not the line before it is a problem', () => {
  const newestFirst = [line('x', 'c', 3), line('a', 'b', 2), line(null, 'a', 1)];
  assert.equal(chainProblems(newestFirst, 'c').length, 1);
});

test('versions that do not rise are a problem', () => {
  const newestFirst = [line('b', 'c', 2), line('a', 'b', 2), line(null, 'a', 1)];
  assert.equal(chainProblems(newestFirst, 'c').length, 1);
});

test('the conversation must end on the newest line\'s agent', () => {
  const newestFirst = [line('a', 'b', 2), line(null, 'a', 1)];
  assert.equal(chainProblems(newestFirst, 'a').length, 1);
});

test('no lines is a problem', () => {
  assert.equal(chainProblems([], null).length, 1);
});
