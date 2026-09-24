import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS, ROUTES, NET, routeAnswer } from '../src/content.js';
import { cidrContains } from '../src/logic/net.js';

test('every choice step has exactly one correct answer and an explanation per option', () => {
  for (const st of STATIONS) {
    for (const step of st.steps.filter((s) => s.type === 'choice')) {
      const correct = step.options.filter((o) => o.correct);
      assert.equal(correct.length, 1, `${st.id}: "${step.text.slice(0, 40)}"`);
      for (const o of step.options) assert.ok(o.why && o.why.length > 10, `${st.id}: missing explanation`);
    }
  }
});

test('order steps have unique items', () => {
  for (const st of STATIONS) {
    for (const step of st.steps.filter((s) => s.type === 'order')) {
      assert.equal(new Set(step.items).size, step.items.length, st.id);
      assert.ok(step.why, `${st.id}: order step needs an explanation`);
    }
  }
});

test('station ids are unique and every station has steps', () => {
  assert.equal(new Set(STATIONS.map((s) => s.id)).size, STATIONS.length);
  for (const st of STATIONS) assert.ok(st.steps.length > 0, st.id);
});

test('the route through the network is consistent', () => {
  // Each router's correct next hop must be the next router in the journey,
  // and the last one must deliver to the server LAN.
  ROUTES.forEach((route, i) => {
    const best = routeAnswer(route);
    assert.ok(best >= 0, `${route.id} has no matching route`);
    assert.ok(cidrContains(route.table[best].dest, NET.server.ip));
    const next = route.options[best];
    assert.equal(next, i < ROUTES.length - 1 ? ROUTES[i + 1].id : 'SW', `${route.id} forwards to ${next}`);
    assert.equal(route.options.length, route.table.length);
  });
  assert.equal(ROUTES.at(-1).frame.dst, NET.server.mac);
});

test('routing steps mark the longest prefix match as correct', () => {
  for (const route of ROUTES) {
    const st = STATIONS.find((s) => s.id === `route-${route.id}`);
    const choice = st.steps.find((s) => s.type === 'choice');
    assert.equal(choice.options.findIndex((o) => o.correct), routeAnswer(route));
  }
});
