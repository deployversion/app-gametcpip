import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rushQuestion, makeRng } from '../src/logic/rush.js';
import { cidrContains, parseCidr } from '../src/logic/net.js';

test('every Router Rush question has exactly one longest match', () => {
  const rng = makeRng(42);
  for (let i = 0; i < 3000; i++) {
    const level = i % 3;
    const { dest, table, answer } = rushQuestion(rng, level);
    assert.ok(answer >= 0, `no match for ${dest}`);
    const matchingLengths = table.filter((r) => cidrContains(r.dest, dest)).map((r) => parseCidr(r.dest).prefix);
    const longest = Math.max(...matchingLengths);
    assert.equal(matchingLengths.filter((l) => l === longest).length, 1, `tie for ${dest}`);
    assert.equal(parseCidr(table[answer].dest).prefix, longest);
    assert.equal(new Set(table.map((r) => r.dest)).size, table.length, 'duplicate prefixes');
    assert.equal(new Set(table.map((r) => r.hop)).size, table.length, 'duplicate interfaces');
    assert.ok(table.length >= 3);
  }
});

test('the generator is deterministic for a seed', () => {
  assert.deepEqual(rushQuestion(makeRng(7), 2), rushQuestion(makeRng(7), 2));
});

test('questions are not always won by the same prefix length', () => {
  const rng = makeRng(1);
  const lengths = new Set();
  for (let i = 0; i < 200; i++) {
    const q = rushQuestion(rng, 2);
    lengths.add(parseCidr(q.table[q.answer].dest).prefix);
  }
  assert.ok(lengths.size >= 3, [...lengths].join(','));
});
