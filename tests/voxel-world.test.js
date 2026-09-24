import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECRETS } from '../src/worlds/voxel/secrets.js';
import {
  PATH_HALF_WIDTH, EXPLORE_HALF_WIDTH, SIDE_BOUNDS, GATE_X, STATION_X, PLATEAUS, heightAt,
} from '../src/worlds/voxel/layout.js';
import { generateWorld, makeGround } from '../src/worlds/voxel/voxel/terrain.js';

const world = generateWorld();
const ground = makeGround(world.grid, world.heights);

test('the path is made of whole blocks: plateaus are flat and ramps are stairs', () => {
  for (const p of PLATEAUS) {
    for (let x = p.x0; x < p.x1; x++) assert.equal(heightAt(x + 0.5), p.h, `x=${x}`);
  }
  for (let x = -124; x < 146; x++) {
    assert.ok(Number.isInteger(heightAt(x)));
    assert.ok(Math.abs(heightAt(x + 1) - heightAt(x)) <= 1 || (x > -3 && x < 45), `step too high at x=${x}`);
  }
});

test('the voxel ground matches the path height under every station', () => {
  for (const x of Object.values(STATION_X)) {
    for (const z of [-8, -5.5, 0, 5, 8]) assert.equal(ground.terrain(x, z), heightAt(x), `x=${x} z=${z}`);
  }
});

test('hidden chests are unique, off the path and reachable before a gate', () => {
  assert.equal(new Set(SECRETS.map((s) => s.id)).size, SECRETS.length);
  const gates = Object.values(GATE_X);
  for (const s of SECRETS) {
    const az = Math.abs(s.z);
    assert.ok(az > PATH_HALF_WIDTH + 2 && az <= EXPLORE_HALF_WIDTH, `${s.id} is not in the explore zone`);
    const [lo, hi] = s.x < 20 ? SIDE_BOUNDS.sender : SIDE_BOUNDS.receiver;
    assert.ok(s.x >= lo && s.x <= hi, `${s.id} outside the walkable area`);
    assert.ok(gates.every((g) => Math.abs(g - s.x) > 2), `${s.id} sits in a gate`);
    assert.ok(ground.terrain(s.x, s.z) >= 0, `${s.id} is under water`);
  }
});

test('a walker can get from the path to every chest', () => {
  // Breadth-first search over block columns using the game's own step rule.
  for (const s of SECRETS) {
    const [lo, hi] = s.x < 20 ? SIDE_BOUNDS.sender : SIDE_BOUNDS.receiver;
    const gateLimits = Object.values(GATE_X).filter((g) => g > s.x);
    const maxX = Math.min(hi, ...gateLimits.map((g) => g - 1.2));
    const start = [Math.floor(s.x), 0, heightAt(s.x)];
    const key = (x, z) => `${x},${z}`;
    const seen = new Set([key(start[0], start[1])]);
    const queue = [start];
    let found = false;
    while (queue.length && !found) {
      const [x, z, feet] = queue.shift();
      if (Math.abs(x + 0.5 - s.x) < 2 && Math.abs(z + 0.5 - s.z) < 2) found = true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx + 0.5 < lo || nx + 0.5 > maxX || Math.abs(nz + 0.5) > EXPLORE_HALF_WIDTH || seen.has(key(nx, nz))) continue;
        const g = ground.step(nx + 0.5, nz + 0.5, feet);
        if (g === null) continue;
        seen.add(key(nx, nz));
        queue.push([nx, nz, g]);
      }
    }
    assert.ok(found, `${s.id} cannot be reached`);
  }
});
