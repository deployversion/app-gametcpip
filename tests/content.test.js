import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { buildContent } from '../src/shared/content.js';
import { SCENARIOS } from '../src/shared/scenarios.js';
import { cidrContains } from '../src/shared/logic/net.js';

// Every scenario builds its own lesson, so every check runs once per scenario.
for (const scenario of SCENARIOS) {
  const { STATIONS, ROUTES, NET, FIREWALL, routeAnswer } = buildContent(scenario);
  const test = (name, fn) => nodeTest(`${scenario.id}: ${name}`, fn);

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

  test('every question has a topic for the learning report', () => {
    for (const st of STATIONS) {
      for (const step of st.steps.filter((s) => s.type !== 'info')) assert.ok(step.topic, `${st.id} step without topic`);
    }
  });

  test('the packet loss detour sits between R1 and R4', () => {
    const ids = STATIONS.map((s) => s.id);
    assert.equal(ids.indexOf('net-loss'), ids.indexOf('route-R1') + 1);
    assert.equal(ids.indexOf('route-R4'), ids.indexOf('net-loss') + 1);
    const loss = STATIONS.find((s) => s.id === 'net-loss');
    assert.ok(loss.steps.at(-1).onSolve, 'loss station must trigger the retransmission');
  });

  test('the firewall question marks the first matching rule', () => {
    const st = STATIONS.find((s) => s.id === 'recv-internet');
    const fw = st.steps.find((s) => s.topic === 'Firewall rules');
    const correct = fw.options.findIndex((o) => o.correct);
    assert.equal(FIREWALL[correct].port, NET.dstPort);
  });

  test('the scenario questions are part of the lesson', () => {
    const texts = STATIONS.flatMap((st) => st.steps.map((step) => step.text));
    assert.ok(texts.includes(scenario.appQuestion.text));
    assert.ok(texts.includes(scenario.recvQuestion.text));
    assert.equal(NET.server.name, scenario.server);
  });
}

nodeTest('every scenario has its own world page and all worlds are used', () => {
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
  assert.deepEqual(SCENARIOS.map((s) => s.world).sort(), readdirSync('worlds').sort());
  for (const s of SCENARIOS) {
    const html = readFileSync(`worlds/${s.world}/index.html`, 'utf8');
    assert.ok(html.includes(`data-scenario="${s.id}"`), `${s.world} page does not declare ${s.id}`);
    assert.ok(html.includes(`src="/src/worlds/${s.world}/main.js"`), `${s.world} page loads the wrong script`);
    assert.ok(s.facts.length >= 3, `${s.id} needs real-life facts`);
  }
});

// Glossary orbs must sit on each world's walkable path.
for (const { world } of SCENARIOS) {
  nodeTest(`${world}: glossary orbs are unique and reachable`, async () => {
    const glossaryFile = existsSync(`src/worlds/${world}/glossary.js`) ? `../src/worlds/${world}/glossary.js` : '../src/shared/glossary.js';
    const { GLOSSARY } = await import(glossaryFile);
    const { PATH_HALF_WIDTH, SIDE_BOUNDS, STATION_X } = await import(`../src/worlds/${world}/world.js`);
    assert.equal(new Set(GLOSSARY.map((g) => g.id)).size, GLOSSARY.length);
    for (const g of GLOSSARY) {
      assert.ok(Math.abs(g.z) <= PATH_HALF_WIDTH, `${g.id} off the path`);
      const [lo, hi] = g.x < 20 ? SIDE_BOUNDS.sender : SIDE_BOUNDS.receiver;
      assert.ok(g.x >= lo && g.x <= hi, `${g.id} outside the walkable area`);
      for (const x of Object.values(STATION_X)) {
        assert.ok(Math.hypot(g.x - x, g.z + 5.5) > 3, `${g.id} overlaps a station`);
      }
    }
  });
}
