import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveQuality, TIERS } from '../src/shared/perf.js';

const run = (q, fps, seconds) => {
  for (let t = 0; t < seconds; t += 1 / fps) q.sample(1 / fps);
};

test('a smooth device keeps full quality', () => {
  const q = new AdaptiveQuality({ tier: 0 });
  run(q, 60, 20);
  assert.equal(q.tier, 0);
});

test('a slow device steps down one tier at a time, to the floor', () => {
  const changes = [];
  const q = new AdaptiveQuality({ tier: 0, onChange: (t, auto) => changes.push([t.name, auto]) });
  run(q, 20, 7);
  assert.equal(q.tier, 1);
  run(q, 20, 60);
  assert.equal(q.tier, TIERS.length - 1);
  assert.deepEqual(changes.map((c) => c[1]), [true, true, true]);
});

test('manual mode never auto-tunes, and long hitches are ignored', () => {
  const q = new AdaptiveQuality({ tier: 0, auto: false });
  run(q, 15, 30);
  assert.equal(q.tier, 0);
  const a = new AdaptiveQuality({ tier: 0 });
  for (let i = 0; i < 20; i++) a.sample(2);
  assert.equal(a.tier, 0);
});
