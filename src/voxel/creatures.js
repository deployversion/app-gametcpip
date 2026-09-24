import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { LIGHTHOUSE } from './terrain.js';

// Blocky wildlife: sheep graze the sender's highlands, chickens scratch
// around the receiver's mesa and gulls circle the lighthouse.

const lambert = (color) => new THREE.MeshLambertMaterial({ color });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

function makeSheep() {
  const g = new THREE.Group();
  const wool = lambert('#ececec');
  const skin = lambert('#b59a82');
  const legs = [];
  g.add(box(0.9, 0.75, 1.3, wool, 0, 0.95, 0));
  const head = new THREE.Group();
  head.position.set(0, 1.15, 0.75);
  head.add(box(0.55, 0.55, 0.5, skin, 0, 0, 0.1), box(0.62, 0.3, 0.3, wool, 0, 0.25, -0.05));
  head.add(box(0.08, 0.08, 0.02, lambert('#1b1b1b'), -0.16, 0.05, 0.36), box(0.08, 0.08, 0.02, lambert('#1b1b1b'), 0.16, 0.05, 0.36));
  g.add(head);
  for (const [x, z] of [[-0.28, 0.45], [0.28, 0.45], [-0.28, -0.45], [0.28, -0.45]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.6, z);
    leg.add(box(0.22, 0.6, 0.22, skin, 0, -0.3, 0));
    g.add(leg);
    legs.push(leg);
  }
  return { group: g, legs, head, speed: 1.1 };
}

function makeChicken() {
  const g = new THREE.Group();
  const white = lambert('#f7f7f2');
  const legs = [];
  g.add(box(0.45, 0.42, 0.6, white, 0, 0.55, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.9, 0.28);
  head.add(box(0.3, 0.4, 0.25, white), box(0.3, 0.1, 0.18, lambert('#f2a33a'), 0, 0.02, 0.2), box(0.12, 0.14, 0.08, lambert('#d6342c'), 0, -0.12, 0.16));
  g.add(head);
  for (const x of [-0.11, 0.11]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.34, 0);
    leg.add(box(0.06, 0.34, 0.06, lambert('#e8a33a'), 0, -0.17, 0));
    g.add(leg);
    legs.push(leg);
  }
  return { group: g, legs, head, speed: 1.4 };
}

function makeGull() {
  const g = new THREE.Group();
  const white = lambert('#ffffff');
  g.add(box(0.3, 0.25, 0.9, white));
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.x = 0.15 * s;
    w.add(box(1.1, 0.06, 0.4, lambert('#dfe4ea'), 0.55 * s, 0, 0));
    g.add(w);
    wings.push({ w, s });
  }
  return { group: g, wings };
}

// Herds wander inside rectangles well away from the paved path.
const HERDS = [
  { make: makeSheep, n: 4, x: [-124, -92], z: [13, 26] },
  { make: makeSheep, n: 3, x: [-76, -60], z: [13, 24] },
  { make: makeSheep, n: 3, x: [-50, -30], z: [-22, -13] },
  { make: makeChicken, n: 4, x: [46, 60], z: [12, 20] },
  { make: makeChicken, n: 3, x: [98, 112], z: [13, 24] },
  { make: makeChicken, n: 4, x: [122, 146], z: [-22, -13] },
];

export function buildCreatures(scene, ground) {
  const rnd = mulberry32(4242);
  const animals = [];
  for (const herd of HERDS) {
    for (let i = 0; i < herd.n; i++) {
      const a = herd.make();
      a.home = herd;
      a.pos = new THREE.Vector3(herd.x[0] + rnd() * (herd.x[1] - herd.x[0]), 0, herd.z[0] + rnd() * (herd.z[1] - herd.z[0]));
      a.pos.y = ground.terrain(a.pos.x, a.pos.z);
      a.target = null;
      a.idle = rnd() * 3;
      a.phase = rnd() * 10;
      a.group.position.copy(a.pos);
      a.group.rotation.y = rnd() * Math.PI * 2;
      scene.add(a.group);
      animals.push(a);
    }
  }

  const gulls = Array.from({ length: 5 }, (_, i) => {
    const gull = makeGull();
    gull.r = 9 + i * 3;
    gull.h = LIGHTHOUSE.height + 6 + (i % 3) * 3;
    gull.speed = 0.25 + i * 0.04;
    gull.phase = i * 1.3;
    scene.add(gull.group);
    return gull;
  });

  return {
    update(t, dt) {
      for (const a of animals) {
        if (!a.target) {
          a.idle -= dt;
          if (a.idle <= 0) {
            const { x, z } = a.home;
            a.target = new THREE.Vector3(x[0] + rnd() * (x[1] - x[0]), 0, z[0] + rnd() * (z[1] - z[0]));
          }
        }
        let moving = false;
        if (a.target) {
          const dx = a.target.x - a.pos.x;
          const dz = a.target.z - a.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.3) {
            a.target = null;
            a.idle = 1.5 + rnd() * 4;
          } else {
            const step = Math.min(d, a.speed * dt);
            const nx = a.pos.x + (dx / d) * step;
            const nz = a.pos.z + (dz / d) * step;
            const ny = ground.step(nx, nz, a.pos.y, 1);
            if (ny === null || ny < 0) {
              a.target = null;
              a.idle = 0.5;
            } else {
              a.pos.set(nx, ny, nz);
              moving = true;
              const heading = Math.atan2(dx, dz);
              let diff = heading - a.group.rotation.y;
              diff = Math.atan2(Math.sin(diff), Math.cos(diff));
              a.group.rotation.y += diff * Math.min(1, dt * 6);
            }
          }
        }
        a.group.position.x = a.pos.x;
        a.group.position.z = a.pos.z;
        a.group.position.y += (a.pos.y - a.group.position.y) * Math.min(1, dt * 10);
        const swing = moving ? Math.sin(t * 9 + a.phase) * 0.6 : 0;
        a.legs.forEach((leg, i) => { leg.rotation.x = i % 2 ? swing : -swing; });
        // grazing / pecking while idle
        a.head.rotation.x = moving ? 0 : Math.max(0, Math.sin(t * 1.3 + a.phase)) * 0.7;
      }
      for (const g of gulls) {
        const ang = t * g.speed + g.phase;
        g.group.position.set(LIGHTHOUSE.x + Math.cos(ang) * g.r, g.h + Math.sin(t * 0.8 + g.phase) * 1.2, LIGHTHOUSE.z + Math.sin(ang) * g.r);
        g.group.rotation.y = -ang;
        g.group.rotation.z = -0.25;
        const flap = Math.sin(t * 6 + g.phase) * 0.5;
        for (const { w, s } of g.wings) w.rotation.z = flap * s;
      }
    },
  };
}
