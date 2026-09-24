import * as THREE from 'three';
import { LAYERS, STATIONS } from './content.js';
import { makeLabel, gridTexture } from './labels.js';
import { GLOSSARY } from './glossary.js';
import { buildEnvironment, makeShuttle, DECK_HALF } from './environment.js';
import {
  makeSpaceSky, makeSun, makePlanet, makeAsteroids, makeSpaceTraffic, makeShootingStars, makeDistantStations, SUN_DIR,
} from './space.js';

// The world is the TCP/IP stack turned into two space stations. Alice's
// station, Terra-1, orbits a blue planet: its four layer decks step *down*
// towards the airlock. The network is open space, an asteroid belt crossed by
// relay satellites and laser links. Kepler Station, where catpics.example
// lives, orbits a ringed gas giant: its decks step back *up*.

export const PATH_HALF_WIDTH = 12.5;

const ROOM = { app: 'the Bridge', transport: 'the Cargo Bay', internet: 'the Nav Deck', link: 'Engineering' };
export { DECK_HALF };

const PROFILE = {
  sender: [[-124, 15], [-88, 15], [-78, 10], [-58, 10], [-48, 5], [-28, 5], [-18, 0], [-2, 0]],
  receiver: [[44, 0], [60, 0], [70, 5], [86, 5], [96, 10], [112, 10], [122, 15], [146, 15]],
};

export const PLATEAUS = [
  { side: 'sender', layer: 'app', x0: -124, x1: -88, h: 15 },
  { side: 'sender', layer: 'transport', x0: -78, x1: -58, h: 10 },
  { side: 'sender', layer: 'internet', x0: -48, x1: -28, h: 5 },
  { side: 'sender', layer: 'link', x0: -18, x1: -2, h: 0 },
  { side: 'receiver', layer: 'link', x0: 44, x1: 60, h: 0 },
  { side: 'receiver', layer: 'internet', x0: 70, x1: 86, h: 5 },
  { side: 'receiver', layer: 'transport', x0: 96, x1: 112, h: 10 },
  { side: 'receiver', layer: 'app', x0: 122, x1: 146, h: 15 },
];

export const STATION_X = {
  'send-app': -100,
  'send-transport': -68,
  'send-internet': -38,
  'send-link': -10,
  'recv-link': 52,
  'recv-internet': 78,
  'recv-transport': 104,
  'recv-app': 132,
};

// A locked gate at the downhill/uphill exit of each plateau.
export const GATE_X = {
  'send-app': -88,
  'send-transport': -58,
  'send-internet': -28,
  'send-link': -2,
  'recv-link': 60,
  'recv-internet': 86,
  'recv-transport': 112,
};

export const SIDE_BOUNDS = { sender: [-121, -2.5], receiver: [45.5, 143] };
export const SPAWN = { sender: new THREE.Vector3(-116, 0, 0), receiver: new THREE.Vector3(47, 0, 0) };
export const NETWORK_EDGE = { sender: new THREE.Vector3(-2, 0, 0), receiver: new THREE.Vector3(46, 0, 0) };

export const NODES = {
  GW: [5, 0],
  R1: [16, 0],
  R2: [26, -15],
  R3: [25, 15],
  R4: [32, 0],
  R5: [14, -17],
  R6: [39, -14],
  SW: [41, 3],
};
const NODE_LABELS = {
  GW: 'Home router · relay', R1: 'R1 · ISP relay', R2: 'R2', R3: 'R3', R4: 'R4 · backbone', R5: 'R5', R6: 'R6', SW: 'Server LAN hub',
};
export const LINKS = [['GW', 'R1'], ['R1', 'R2'], ['R1', 'R3'], ['R1', 'R4'], ['R1', 'R5'], ['R2', 'R4'], ['R3', 'R4'], ['R4', 'R6'], ['R4', 'SW'], ['R5', 'R2'], ['R6', 'SW']];
const NODE_Y = 1.2;

export function heightAt(x) {
  const pts = x < 20 ? PROFILE.sender : PROFILE.receiver;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

export function nodePosition(id) {
  const [x, z] = NODES[id];
  return new THREE.Vector3(x, NODE_Y, z);
}

export function buildWorld(scene) {
  const walkables = [];
  const animated = [];
  const stations = new Map();
  const gates = new Map();
  const routers = new Map();

  // --- space, light --------------------------------------------------------
  scene.background = new THREE.Color('#010208');
  scene.fog = new THREE.Fog('#03040d', 180, 560);
  // Blue earthshine from below, starlight from above.
  scene.add(new THREE.HemisphereLight('#b8c8ff', '#1d4a8a', 0.9));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#9a7bff', 0.6);
  rim.position.copy(SUN_DIR).multiplyScalar(-100).setY(30);
  scene.add(rim);

  const sky = makeSpaceSky();
  scene.add(sky.mesh);
  const sunDisc = makeSun();
  scene.add(sunDisc.group);
  animated.push((t) => {
    sky.update(t);
    sky.mesh.position.copy(sun.target.position);
  });

  // Terra: Alice's home planet, filling the view below her station.
  const terra = makePlanet({ radius: 260, kind: 'terra', atmosphere: '#5fb4ff', spin: 0.004, seed: 1.7 });
  terra.group.position.set(-20, -330, 130);
  terra.group.rotation.z = 0.3;
  // Kepler: the ringed gas giant behind the server's station.
  const kepler = makePlanet({ radius: 95, kind: 'giant', tint: '#ffd9b0', atmosphere: '#ffb070', rings: true, spin: 0.01, seed: 4.2 });
  kepler.group.position.set(250, 60, -330);
  // Luna: a small grey moon off to the side.
  const luna = makePlanet({ radius: 26, kind: 'moon', atmosphere: null, spin: 0.02, seed: 9.1 });
  luna.group.position.set(-330, 130, -300);
  scene.add(terra.group, kepler.group, luna.group);
  const planetLabel = (text, pos) => {
    const l = makeLabel(text, { size: 7, color: '#cfe2ff', bg: null, font: 700 });
    l.material.fog = false;
    l.position.copy(pos);
    scene.add(l);
  };
  planetLabel('KEPLER · catpics.example', new THREE.Vector3(250, 180, -330));
  planetLabel('TERRA · Alice', new THREE.Vector3(-120, -60, 150));
  animated.push((t) => {
    terra.update(t);
    kepler.update(t);
    luna.update(t);
  });
  scene.add(makeSpaceTraffic(animated), makeShootingStars(animated), makeDistantStations(animated));

  // --- station hulls ------------------------------------------------------
  // Each station is the stepped deck profile extruded into a hull that ends a
  // few metres under the lowest deck, with a truss keel hanging below it.
  const hullMat = new THREE.MeshStandardMaterial({ map: hullTexture(), color: '#aab4d8', roughness: 0.55, metalness: 0.55 });
  for (const side of ['sender', 'receiver']) {
    const pts = PROFILE[side];
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], -7);
    // sits a little under the deck plates so the two never fight
    pts.forEach(([x, y]) => shape.lineTo(x, y - 0.3));
    shape.lineTo(pts[pts.length - 1][0], -7);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: DECK_HALF * 2, bevelEnabled: false });
    geo.translate(0, 0, -DECK_HALF);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 16, uv.getY(i) / 16);
    const mesh = new THREE.Mesh(geo, hullMat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    walkables.push(mesh);
    scene.add(makeKeel(pts[0][0], pts[pts.length - 1][0], animated));
  }

  for (const p of PLATEAUS) {
    const layer = LAYERS[p.layer];
    const w = p.x1 - p.x0;
    const d = DECK_HALF * 2;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.2, d),
      new THREE.MeshStandardMaterial({
        map: deckTexture(layer.color, w / 6, d / 6),
        emissive: new THREE.Color(layer.color),
        emissiveIntensity: 0.03,
        roughness: 0.45,
        metalness: 0.5,
      }),
    );
    top.position.set((p.x0 + p.x1) / 2, p.h + 0.02, 0);
    top.receiveShadow = true;
    scene.add(top);
    walkables.push(top);

    // glowing rim along both long edges, with guard-rail posts
    for (const z of [-d / 2, d / 2]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: layer.color }));
      rim.position.set((p.x0 + p.x1) / 2, p.h + 0.1, z);
      scene.add(rim);
    }
    const posts = Math.floor(w / 3);
    const railPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), new THREE.MeshStandardMaterial({ color: '#8f9bd0', metalness: 0.9, roughness: 0.3 }), posts);
    const m = new THREE.Matrix4();
    for (let i = 0; i < posts; i++) {
      m.makeTranslation(p.x0 + 1.5 + i * (w - 3) / Math.max(1, posts - 1), p.h + 0.6, d / 2 - 0.1);
      railPosts.setMatrixAt(i, m);
    }
    scene.add(railPosts);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w - 2, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: layer.color, transparent: true, opacity: 0.7 }));
    rail.position.set((p.x0 + p.x1) / 2, p.h + 1.15, d / 2 - 0.1);
    scene.add(rail);

    // big layer sign on a gantry behind the deck
    const sign = makeLabel(`DECK ${layer.num} · ${layer.name.toUpperCase()}\n${ROOM[p.layer]}`, { color: layer.color, size: 2, font: 800, border: layer.color });
    sign.position.set((p.x0 + p.x1) / 2, p.h + 17, -DECK_HALF - 3);
    scene.add(sign);
    const pdu = makeLabel(`unit: ${layer.pdu}`, { color: '#cfd6ff', size: 1.1, bg: null });
    pdu.position.set((p.x0 + p.x1) / 2, p.h + 13.4, -DECK_HALF - 3);
    scene.add(pdu);
  }

  const sideTitle = (text, x, y = 34) => {
    const l = makeLabel(text, { color: '#ffffff', size: 3, font: 800, bg: null });
    l.position.set(x, y, -20);
    scene.add(l);
  };
  sideTitle('TERRA-1 STATION · going DOWN the stack', -64);
  sideTitle('KEPLER STATION · going UP the stack', 96);
  sideTitle('OPEN SPACE · THE NETWORK', 21, 22);

  scene.add(makeHabitatRing(new THREE.Vector3(-64, 16, -62), 30, '#b56cff', animated));
  scene.add(makeSolarArray(new THREE.Vector3(-128, 12, -8), -1, animated));
  scene.add(makeSolarArray(new THREE.Vector3(150, 12, -8), 1, animated));
  scene.add(makeBigDish(new THREE.Vector3(104, 26, -52), animated));
  scene.add(makeThrusters(-125.5, 4, -1, animated), makeThrusters(147.5, 4, 1, animated));

  scene.add(makeLaptop());
  scene.add(makeServerRack(animated));

  // --- stations ------------------------------------------------------------
  for (const st of STATIONS) {
    if (st.side === 'network') continue;
    const x = STATION_X[st.id];
    const h = heightAt(x);
    const color = LAYERS[st.layer].color;
    const group = new THREE.Group();
    group.position.set(x, h, -5.5);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2.2, 1.2, 32),
      new THREE.MeshStandardMaterial({ color: '#252c63', metalness: 0.5, roughness: 0.4 }),
    );
    base.position.y = 0.6;
    base.castShadow = true;
    group.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.2;
    group.add(ring);

    const iconGeo = {
      app: new THREE.IcosahedronGeometry(0.9),
      transport: new THREE.TorusGeometry(0.7, 0.25, 12, 32),
      internet: new THREE.OctahedronGeometry(0.95),
      link: new THREE.BoxGeometry(1.2, 1.2, 1.2),
    }[st.layer];
    const icon = new THREE.Mesh(iconGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.3 }));
    icon.position.y = 3;
    icon.castShadow = true;
    group.add(icon);

    const beacon = makeBeacon(color);
    group.add(beacon);

    const label = makeLabel(st.title, { color, size: 0.9, border: color });
    label.position.y = 5;
    group.add(label);

    scene.add(group);
    const entry = { id: st.id, group, icon, beacon, position: new THREE.Vector3(x, h, -5.5), clickTargets: [base, icon] };
    stations.set(st.id, entry);
    animated.push((t) => {
      icon.rotation.y = t * 0.8;
      icon.position.y = 3 + Math.sin(t * 2 + x) * 0.2;
      beacon.material.opacity = beacon.visible ? 0.18 + Math.sin(t * 3) * 0.06 : 0;
    });
  }

  // --- gates ---------------------------------------------------------------
  for (const [id, x] of Object.entries(GATE_X)) {
    const st = STATIONS.find((s) => s.id === id);
    const color = LAYERS[st.layer].color;
    const h = heightAt(x - 0.5);
    const gate = new THREE.Group();
    gate.position.set(x, h, 0);
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(DECK_HALF * 2, 5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    field.rotation.y = Math.PI / 2;
    field.position.y = 2.5;
    gate.add(field);
    for (const z of [-DECK_HALF, DECK_HALF]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.6, 0.6), new THREE.MeshStandardMaterial({ color: '#2b3370', emissive: color, emissiveIntensity: 0.4 }));
      post.position.set(0, 2.8, z);
      gate.add(post);
    }
    const lock = makeLabel('🔒 solve the station to pass', { color: '#fff', size: 0.7 });
    lock.position.y = 5.8;
    gate.add(lock);
    scene.add(gate);
    gates.set(id, { x, group: gate, field, open: false });
    animated.push((t) => {
      field.material.opacity = 0.22 + Math.sin(t * 4 + x) * 0.08;
    });
  }

  // --- network: open space between the stations --------------------------
  const beltDrift = new THREE.Vector3();
  // The asteroid belt drifts slowly through the gap, below the relay lanes.
  scene.add(makeAsteroids(260, () => {
    const x = -10 + Math.random() * 70;
    const z = (Math.random() - 0.5) * 150;
    const y = -30 + Math.random() * 22 - Math.max(0, 20 - Math.abs(z)) * 0.4;
    return new THREE.Vector3(x, y, z);
  }, animated, { drift: (p, t) => beltDrift.set(p.x + Math.sin(t * 0.05 + p.z) * 2, p.y + Math.sin(t * 0.2 + p.x) * 0.6, THREE.MathUtils.euclideanModulo(p.z + t * 0.8 + 75, 150) - 75) }));
  // A wide, sparse outer belt for depth.
  scene.add(makeAsteroids(180, () => {
    const a = Math.random() * Math.PI * 2;
    const r = 120 + Math.random() * 90;
    return new THREE.Vector3(21 + Math.cos(a) * r, -40 + (Math.random() - 0.5) * 30, Math.sin(a) * r);
  }, animated, { minSize: 1, maxSize: 7 }));

  // Laser links: a bright core inside a soft additive glow. The core's
  // material color is what the game flashes while you ride a link.
  const cables = new Map();
  const glowMat = new THREE.MeshBasicMaterial({ color: '#4be1ff', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  const addCable = (a, b, key) => {
    const curve = new THREE.LineCurve3(a, b);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 1, 0.06, 6), new THREE.MeshBasicMaterial({ color: '#4be1ff', transparent: true, opacity: 0.9 }));
    const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 1, 0.28, 8), glowMat);
    mesh.add(halo);
    scene.add(mesh);
    if (key) cables.set(key, mesh);
  };
  addCable(new THREE.Vector3(-2, 1.2, 0), nodePosition('GW'), 'LAN-GW');
  addCable(nodePosition('SW'), new THREE.Vector3(44, 1.2, 0), 'SW-LAN');
  for (const [a, b] of LINKS) addCable(nodePosition(a), nodePosition(b), `${a}-${b}`);
  animated.push((t) => { glowMat.opacity = 0.14 + Math.sin(t * 6) * 0.04; });

  // Routers are relay satellites: a gold-foil bus, two solar wings and a dish.
  for (const id of Object.keys(NODES)) {
    const pos = nodePosition(id);
    const g = new THREE.Group();
    g.position.copy(pos);
    const isSwitch = id === 'SW';
    const { sat, body, wings } = makeSatellite(isSwitch);
    g.add(sat);
    if (!isSwitch) {
      const arrows = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 6, 4), new THREE.MeshBasicMaterial({ color: '#bfe9ff' }));
      arrows.rotation.x = Math.PI / 2;
      g.add(arrows);
      animated.push((t) => { arrows.rotation.z = t; });
    }
    const phase = pos.x * 0.3;
    animated.push((t) => {
      sat.position.y = Math.sin(t * 0.7 + phase) * 0.25;
      sat.rotation.y = Math.sin(t * 0.2 + phase) * 0.15;
      for (const w of wings) w.rotation.x = Math.sin(t * 0.3 + phase) * 0.3;
    });
    const label = makeLabel(NODE_LABELS[id], { color: '#bfe9ff', size: 0.75 });
    label.position.y = 2.6;
    g.add(label);
    const beacon = makeBeacon('#4be1ff');
    beacon.visible = false;
    g.add(beacon);
    scene.add(g);
    routers.set(id, { id, group: g, beacon, body });
    animated.push(() => { beacon.material.opacity = beacon.visible ? 0.2 : 0; });
  }

  scene.add(makeBitDust(animated));
  scene.add(makeTraffic(animated));

  const env = buildEnvironment(scene, PLATEAUS, animated);
  const colliders = [
    ...env.colliders,
    { x: -119, z: -13, r: 4 }, // laptop
    { x: 142, z: -9, r: 3.2 }, // server rack
  ];

  // Ferry pads (explore mode): step on one to fly across the network.
  const ferries = new Map();
  for (const [side, x] of [['sender', -5], ['receiver', 57]]) {
    const pad = new THREE.Group();
    pad.position.set(x, heightAt(x) + 0.12, 8);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 40), new THREE.MeshBasicMaterial({ color: '#4be1ff', transparent: true, opacity: 0.7 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    ring.rotation.x = Math.PI / 2;
    const label = makeLabel(side === 'sender' ? 'Shuttle → Kepler Station' : 'Shuttle → Terra-1', { size: 0.5, color: '#bfe9ff' });
    label.position.y = 2.2;
    pad.add(disc, ring, label);
    pad.visible = false;
    scene.add(pad);
    ferries.set(side, { side, group: pad, position: pad.position });
    animated.push((t) => {
      ring.position.y = 0.3 + ((t * 0.8) % 1) * 1.5;
      ring.material.opacity = 1 - ((t * 0.8) % 1);
      ring.material.transparent = true;
    });
  }

  // The explore-mode shuttle that carries you between the stations.
  const shuttle = makeShuttle('#4be1ff');
  shuttle.scale.setScalar(0.8);
  shuttle.visible = false;
  scene.add(shuttle);

  // --- knowledge orbs ------------------------------------------------------
  const orbs = new Map();
  for (const entry of GLOSSARY) {
    const color = LAYERS[entry.layer].color;
    const g = new THREE.Group();
    g.position.set(entry.x, heightAt(entry.x) + 1.6, entry.z);
    const gem = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 1.2, roughness: 0.2, transparent: true }),
    );
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color, transparent: true }));
    const q = makeLabel('?', { size: 0.9, color, bg: null, font: 900 });
    q.position.y = 1.3;
    g.add(gem, halo, q);
    scene.add(g);
    orbs.set(entry.id, { entry, group: g, gem, halo, collected: false });
    const phase = entry.x * 0.37;
    animated.push((t) => {
      if (!g.visible) return;
      gem.rotation.y = t * 1.5 + phase;
      gem.rotation.x = t * 0.7;
      halo.rotation.x = Math.PI / 2 + Math.sin(t + phase) * 0.4;
      g.position.y = heightAt(entry.x) + 1.6 + Math.sin(t * 2 + phase) * 0.25;
    });
  }

  return {
    orbs,
    colliders,
    ferries,
    shuttle,
    sun,
    walkables,
    stations,
    gates,
    routers,
    cables,
    update(t, dt) {
      for (const fn of animated) fn(t, dt);
    },
  };
}

// Other people's packets zipping along every cable in the network.
function makeTraffic(animated) {
  const adjacency = {};
  for (const [a, b] of LINKS) {
    (adjacency[a] ??= []).push(b);
    (adjacency[b] ??= []).push(a);
  }
  const ids = Object.keys(adjacency);
  const count = 48;
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.35, 0.35, 0.35),
    new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    count,
  );
  const palette = ['#4be1ff', '#b56cff', '#ff8a3d', '#35d07f', '#ffd166'].map((c) => new THREE.Color(c));
  const movers = Array.from({ length: count }, (_, i) => {
    const from = ids[i % ids.length];
    const to = adjacency[from][Math.floor(Math.random() * adjacency[from].length)];
    mesh.setColorAt(i, palette[i % palette.length]);
    return { from, to, t: Math.random(), speed: 0.25 + Math.random() * 0.5 };
  });
  const m = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  animated.push((t, dt = 1 / 60) => {
    movers.forEach((mv, i) => {
      mv.t += mv.speed * dt;
      if (mv.t >= 1) {
        mv.t = 0;
        mv.from = mv.to;
        const next = adjacency[mv.from];
        mv.to = next[Math.floor(Math.random() * next.length)];
      }
      a.copy(nodePosition(mv.from));
      b.copy(nodePosition(mv.to));
      a.lerp(b, mv.t);
      a.y += 0.35;
      m.makeTranslation(a.x, a.y, a.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}

function makeBeacon(color) {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 60, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  beacon.position.y = 30;
  return beacon;
}

// Drifting 0/1 motes over the network abyss.
function makeBitDust(animated) {
  const group = new THREE.Group();
  const mk = (ch) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4be1ff';
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 32, 34);
    const t = new THREE.CanvasTexture(c);
    return new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.5, depthWrite: false });
  };
  const mats = [mk('0'), mk('1')];
  const bits = [];
  for (let i = 0; i < 140; i++) {
    const s = new THREE.Sprite(mats[i % 2]);
    s.scale.setScalar(0.8);
    s.position.set(-2 + Math.random() * 46, -7 + Math.random() * 12, -25 + Math.random() * 50);
    s.userData.speed = 0.3 + Math.random() * 0.8;
    group.add(s);
    bits.push(s);
  }
  animated.push((t, dt = 1 / 60) => {
    for (const b of bits) {
      b.position.y += b.userData.speed * dt;
      if (b.position.y > 6) b.position.y = -7;
    }
  });
  return group;
}

function makeLaptop() {
  const g = new THREE.Group();
  // At the start of the path, screen turned towards the player.
  g.position.set(-119, 15, -13);
  g.rotation.y = 0.5;
  g.scale.setScalar(0.75);
  const mat = new THREE.MeshStandardMaterial({ color: '#c9cfe6', metalness: 0.7, roughness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 8), mat);
  base.position.y = 0.25;
  g.add(base);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 0.4), mat);
  lid.position.set(0, 4.2, -4);
  lid.rotation.x = -0.15;
  g.add(lid);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f6ff'; ctx.fillRect(0, 0, 512, 320);
  ctx.fillStyle = '#dde2f5'; ctx.fillRect(0, 0, 512, 44);
  ctx.fillStyle = '#fff'; ctx.fillRect(16, 9, 480, 26);
  ctx.fillStyle = '#1b2150'; ctx.font = '18px sans-serif'; ctx.fillText('🔒 https://catpics.example/cat.png', 26, 28);
  ctx.font = 'bold 34px sans-serif'; ctx.fillText('Loading…', 180, 170);
  ctx.font = '80px sans-serif'; ctx.fillText('🐱', 210, 270);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(11, 7), new THREE.MeshBasicMaterial({ map: tex, color: '#9aa0b8' }));
  screen.position.set(0, 4.2, -3.78);
  screen.rotation.x = -0.15;
  g.add(screen);
  return g;
}

function makeServerRack(animated) {
  const g = new THREE.Group();
  g.position.set(142, 15, -9);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(4, 12, 5), new THREE.MeshStandardMaterial({ color: '#1c1f33', metalness: 0.6, roughness: 0.4 }));
  rack.position.y = 6;
  g.add(rack);
  const leds = [];
  for (let i = 0; i < 8; i++) {
    const unit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 4.2), new THREE.MeshStandardMaterial({ color: '#2a2f4d' }));
    unit.position.set(-2.02, 1.2 + i * 1.35, 0);
    g.add(unit);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color: '#35d07f' }));
    led.position.set(-2.1, 1.2 + i * 1.35, 1.6);
    g.add(led);
    leds.push(led);
  }
  animated.push((t) => leds.forEach((l, i) => { l.visible = Math.sin(t * 6 + i * 1.7) > -0.2; }));
  const label = makeLabel('catpics.example\n203.0.113.80', { size: 1, color: '#e8ddff' });
  label.position.set(0, 14.5, 0);
  g.add(label);
  return g;
}

// Painted hull plating: panel seams, rivets, a few lit portholes.
function hullTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a4266';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    const v = 50 + Math.floor(Math.random() * 20);
    ctx.fillStyle = `rgb(${v},${v + 6},${v + 30})`;
    ctx.fillRect(Math.floor(Math.random() * 8) * 32, Math.floor(Math.random() * 8) * 32, 32 * (1 + Math.floor(Math.random() * 2)), 32);
  }
  ctx.strokeStyle = 'rgba(10,12,30,0.8)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(200,210,255,0.25)';
  for (let x = 4; x < 256; x += 32) for (let y = 4; y < 256; y += 32) ctx.fillRect(x, y, 2, 2);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = Math.random() < 0.7 ? '#ffe2a8' : '#8fd8ff';
    ctx.beginPath();
    ctx.arc(16 + Math.floor(Math.random() * 8) * 32, 16 + Math.floor(Math.random() * 8) * 32, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// Deck plating in the layer's colour, with hazard stripes along the edges.
function deckTexture(color, repeatX, repeatY) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#161b36';
  ctx.fillRect(0, 0, 256, 256);
  // tread plate
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = 0; x < 256; x += 16) for (let y = (x / 16) % 2 ? 8 : 0; y < 256; y += 16) ctx.fillRect(x + 4, y + 2, 8, 3);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 252, 252);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, 244, 244);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color;
  for (const [x, y] of [[6, 6], [242, 6], [6, 242], [242, 242]]) ctx.fillRect(x, y, 8, 8);
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.moveTo(128, 6); ctx.lineTo(128, 250);
  ctx.moveTo(6, 128); ctx.lineTo(250, 128);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  return tex;
}

// Truss keel under a station: two long girders with cross-bracing, hanging
// antennas and blinking navigation lights (red port side, green starboard).
function makeKeel(x0, x1, animated) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#6c7598', metalness: 0.8, roughness: 0.35 });
  const len = x1 - x0 - 6;
  const cx = (x0 + x1) / 2;
  for (const z of [-7, 7]) {
    for (const y of [-9, -14]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 0.4), mat);
      beam.position.set(cx, y, z);
      g.add(beam);
    }
  }
  const n = Math.floor(len / 4);
  const brace = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 7.1, 0.25), mat, n * 4);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + 3 + i * 4 + 2;
    for (const z of [-7, 7]) {
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), i % 2 ? 0.55 : -0.55);
      m.compose(new THREE.Vector3(x, -11.5, z), q, one);
      brace.setMatrixAt(k++, m);
    }
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    m.compose(new THREE.Vector3(x, -9, 0), q, new THREE.Vector3(1, 2, 1));
    brace.setMatrixAt(k++, m);
    m.compose(new THREE.Vector3(x, -14, 0), q, new THREE.Vector3(1, 2, 1));
    brace.setMatrixAt(k++, m);
  }
  g.add(brace);
  const lights = [];
  for (let i = 0; i < 6; i++) {
    const x = x0 + 4 + (i / 5) * (len - 2);
    for (const [z, color] of [[-18.6, '#ff3b4f'], [18.6, '#3bff8a']]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color }));
      l.position.set(x, -6.4, z);
      g.add(l);
      lights.push(l);
    }
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 5), mat);
    ant.position.set(x + 1, -16.5, (i % 2 ? 4 : -4));
    g.add(ant);
  }
  animated.push((t) => { const on = (t % 1.6) < 0.18; for (const l of lights) l.visible = on; });
  return g;
}

// A rotating habitat ring with spokes, lit windows and a hub.
function makeHabitatRing(center, radius, color, animated) {
  const g = new THREE.Group();
  g.position.copy(center);
  const spin = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#9aa3c8', metalness: 0.6, roughness: 0.4 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 2.4, 12, 96), mat);
  spin.add(ring);
  const litMat = new THREE.MeshBasicMaterial({ color: '#ffe2a8' });
  const lit = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.6, 0.2), litMat, 120);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
    m.compose(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 2.45), q, new THREE.Vector3(1, 1, 1));
    lit.setMatrixAt(i, m);
    lit.setColorAt(i, new THREE.Color(Math.random() < 0.2 ? '#223' : Math.random() < 0.8 ? '#ffe2a8' : '#9fe3ff'));
  }
  spin.add(lit);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, radius * 2, 8), mat);
    spoke.rotation.z = (i / 4) * Math.PI;
    spin.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 6, 24), mat);
  hub.rotation.x = Math.PI / 2;
  const hubGlow = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.3, 8, 32), new THREE.MeshBasicMaterial({ color }));
  hubGlow.position.z = 3;
  spin.add(hub, hubGlow);
  g.add(spin);
  // a docking arm tying the ring to the station
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, Math.abs(center.z) - 20, 10), mat);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, 0, (Math.abs(center.z) - 20) / 2 + 1);
  g.add(arm);
  animated.push((t) => { spin.rotation.z = t * 0.05; });
  return g;
}

// A long boom with solar panel wings that slowly track the sun.
function makeSolarArray(anchor, dir, animated) {
  const g = new THREE.Group();
  g.position.copy(anchor);
  const boomMat = new THREE.MeshStandardMaterial({ color: '#8c95b8', metalness: 0.8, roughness: 0.3 });
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 44, 10), boomMat);
  boom.rotation.z = Math.PI / 2;
  boom.position.x = dir * 22;
  g.add(boom);
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0c1d5a';
  ctx.fillRect(0, 0, 64, 128);
  ctx.strokeStyle = '#4e6fc9';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 64; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
  for (let y = 0; y <= 128; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(64, y); ctx.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  const panelMat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.9, roughness: 0.25, emissive: '#0a1a55', emissiveIntensity: 0.4, side: THREE.DoubleSide });
  const wings = [];
  for (let i = 0; i < 3; i++) {
    const wing = new THREE.Group();
    wing.position.x = dir * (10 + i * 13);
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 22), panelMat);
      panel.position.z = side * 12;
      wing.add(panel);
    }
    g.add(wing);
    wings.push(wing);
  }
  animated.push((t) => { for (const w of wings) w.rotation.x = 0.5 + Math.sin(t * 0.05) * 0.2; });
  return g;
}

// The server station's big dish, sweeping the sky.
function makeBigDish(pos, animated) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mat = new THREE.MeshStandardMaterial({ color: '#dfe4f5', metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 30, 10), new THREE.MeshStandardMaterial({ color: '#6c7598', metalness: 0.8 }));
  mast.position.y = -14;
  const head = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.SphereGeometry(12, 32, 12, 0, Math.PI * 2, 0, Math.PI / 3.5), mat);
  dish.rotation.x = Math.PI;
  dish.position.y = 11;
  const feedArm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8, 6), mat);
  feedArm.position.y = 4;
  const feed = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffb070' }));
  feed.position.y = 8;
  head.add(dish, feedArm, feed);
  head.rotation.x = -0.9;
  g.add(mast, head);
  animated.push((t) => { head.rotation.y = Math.sin(t * 0.08) * 0.8; });
  return g;
}

// Thruster pods at a station's outer end, flickering blue.
function makeThrusters(x, y, dir, animated) {
  const g = new THREE.Group();
  const flames = [];
  for (const z of [-10, 0, 10]) {
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 3, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#4a5070', metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }));
    bell.rotation.z = -dir * Math.PI / 2;
    bell.position.set(x + dir * 1.5, y, z);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 7, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#6fd0ff', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    flame.rotation.z = dir * Math.PI / 2;
    flame.position.set(x + dir * 6, y, z);
    g.add(bell, flame);
    flames.push(flame);
  }
  animated.push((t) => flames.forEach((f, i) => {
    f.scale.set(1, 0.85 + Math.sin(t * 20 + i * 2) * 0.1 + Math.random() * 0.05, 1);
    f.material.opacity = 0.4 + Math.random() * 0.15;
  }));
  return g;
}

// A relay satellite (router) or a hub (switch).
function makeSatellite(isSwitch) {
  const sat = new THREE.Group();
  const foil = new THREE.MeshStandardMaterial({ color: '#d9a441', metalness: 0.95, roughness: 0.28, emissive: '#3a2400', emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(isSwitch ? new THREE.BoxGeometry(3, 1.1, 2) : new THREE.BoxGeometry(1.8, 1.4, 1.8), foil);
  body.castShadow = true;
  sat.add(body);
  const panelMat = new THREE.MeshStandardMaterial({ color: '#1d3a8a', metalness: 0.9, roughness: 0.2, emissive: '#0b1c55', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.z = side * 1;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), new THREE.MeshStandardMaterial({ color: '#aab' }));
    strut.rotation.x = Math.PI / 2;
    strut.position.z = side * 0.6;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, isSwitch ? 2.2 : 3.4), panelMat);
    panel.position.z = side * (isSwitch ? 2.3 : 2.9);
    wing.add(strut, panel);
    sat.add(wing);
    wings.push(wing);
  }
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3),
    new THREE.MeshStandardMaterial({ color: '#eef1ff', metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide }),
  );
  dish.rotation.x = Math.PI;
  dish.position.y = 1.5;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14), new THREE.MeshBasicMaterial({ color: '#4be1ff' }));
  tip.position.y = 1.05;
  sat.add(dish, tip);
  return { sat, body, wings };
}
