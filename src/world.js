import * as THREE from 'three';
import { LAYERS, STATIONS } from './content.js';
import { makeLabel } from './labels.js';
import { GLOSSARY } from './glossary.js';
import { buildEnvironment, deckMaterial, DECK_HALF } from './environment.js';
import { makeSky } from './effects.js';
import { buildGeography, makeBeacon, NODES } from './geography.js';
import { RX, NET_MID } from './layout.js';

// The world is the TCP/IP stack turned into terrain: the sender's layers are
// terraces inside Alice's laptop that you walk *down*, the network is the
// physical internet (her street, the ISP, an undersea cable) that you fly
// across, and the receiver's layers are the floors of a data centre that
// you climb back *up*.

export const PATH_HALF_WIDTH = 12.5;
export { DECK_HALF };

const PROFILE = {
  sender: [[-124, 15], [-88, 15], [-78, 10], [-58, 10], [-48, 5], [-28, 5], [-18, 0], [-2, 0]],
  receiver: [[44, 0], [60, 0], [70, 5], [86, 5], [96, 10], [112, 10], [122, 15], [146, 15]].map(([x, y]) => [x + RX, y]),
};

const PLATEAUS = [
  { side: 'sender', layer: 'app', x0: -124, x1: -88, h: 15 },
  { side: 'sender', layer: 'transport', x0: -78, x1: -58, h: 10 },
  { side: 'sender', layer: 'internet', x0: -48, x1: -28, h: 5 },
  { side: 'sender', layer: 'link', x0: -18, x1: -2, h: 0 },
  { side: 'receiver', layer: 'link', x0: 44 + RX, x1: 60 + RX, h: 0 },
  { side: 'receiver', layer: 'internet', x0: 70 + RX, x1: 86 + RX, h: 5 },
  { side: 'receiver', layer: 'transport', x0: 96 + RX, x1: 112 + RX, h: 10 },
  { side: 'receiver', layer: 'app', x0: 122 + RX, x1: 146 + RX, h: 15 },
];

export const STATION_X = {
  'send-app': -100,
  'send-transport': -68,
  'send-internet': -38,
  'send-link': -10,
  'recv-link': 52 + RX,
  'recv-internet': 78 + RX,
  'recv-transport': 104 + RX,
  'recv-app': 132 + RX,
};

// A locked gate at the downhill/uphill exit of each plateau.
export const GATE_X = {
  'send-app': -88,
  'send-transport': -58,
  'send-internet': -28,
  'send-link': -2,
  'recv-link': 60 + RX,
  'recv-internet': 86 + RX,
  'recv-transport': 112 + RX,
};

export const SIDE_BOUNDS = { sender: [-121, -2.5], receiver: [45.5 + RX, 143 + RX] };
export const SPAWN = { sender: new THREE.Vector3(-116, 0, 0), receiver: new THREE.Vector3(47 + RX, 0, 0) };
export const NETWORK_EDGE = { sender: new THREE.Vector3(-2, 0, 0), receiver: new THREE.Vector3(46 + RX, 0, 0) };
export { NODES, RX };

const NODE_Y = 1.2;

// Where each layer physically lives, shown under the layer sign.
const WHERE = {
  'sender:app': 'Where: the browser on Alice\'s screen',
  'sender:transport': 'Where: the OS kernel, on the laptop\'s CPU and RAM',
  'sender:internet': 'Where: the OS network stack and its routing table',
  'sender:link': 'Where: the Wi-Fi card and its antennas',
  'receiver:link': 'Where: the meet-me room, where fibre enters the building',
  'receiver:internet': 'Where: the data centre\'s routers and firewall',
  'receiver:transport': 'Where: the server\'s kernel, row after row of racks',
  'receiver:app': 'Where: the catpics web server and its disks',
};

export function heightAt(x) {
  const pts = x < NET_MID ? PROFILE.sender : PROFILE.receiver;
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

  // --- sky, fog, light -----------------------------------------------------
  // A clear night lit by a big moon; the "sun" is moonlight that follows the
  // player so the shadow map stays sharp around them.
  scene.background = new THREE.Color('#060a1c');
  scene.fog = new THREE.Fog('#0a1026', 90, 300);
  scene.add(new THREE.HemisphereLight('#8fa8e8', '#141a24', 1.05));
  const sun = new THREE.DirectionalLight('#dfe8ff', 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const sky = makeSky();
  scene.add(sky.mesh);
  animated.push((t) => {
    sky.update(t);
    sky.mesh.position.copy(sun.target.position);
  });

  scene.add(makeStars());
  let focus = null;

  // --- terrain -------------------------------------------------------------
  for (const side of ['sender', 'receiver']) {
    const pts = PROFILE[side];
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], -40);
    pts.forEach(([x, y]) => shape.lineTo(x, y));
    shape.lineTo(pts[pts.length - 1][0], -40);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: DECK_HALF * 2, bevelEnabled: false });
    geo.translate(0, 0, -DECK_HALF);
    // Alice's side is the brushed-aluminium body of her laptop, the
    // receiver's side is the concrete shell of the data centre.
    const mat = side === 'sender'
      ? new THREE.MeshStandardMaterial({ color: '#8a90a6', roughness: 0.45, metalness: 0.75 })
      : new THREE.MeshStandardMaterial({ color: '#4a4f5c', roughness: 0.9, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    walkables.push(mesh);
  }

  for (const p of PLATEAUS) {
    const layer = LAYERS[p.layer];
    const w = p.x1 - p.x0;
    const d = DECK_HALF * 2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), deckMaterial(p, w, d));
    top.position.set((p.x0 + p.x1) / 2, p.h + 0.02, 0);
    top.receiveShadow = true;
    scene.add(top);
    walkables.push(top);

    // glowing rim along both long edges
    for (const z of [-d / 2, d / 2]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: layer.color }));
      rim.position.set((p.x0 + p.x1) / 2, p.h + 0.1, z);
      scene.add(rim);
    }

    // big layer sign on the far wall
    const sign = makeLabel(`LAYER ${layer.num}\n${layer.name.toUpperCase()}`, { color: layer.color, size: 2.4, font: 800, border: layer.color });
    sign.position.set((p.x0 + p.x1) / 2, p.h + 17, -DECK_HALF - 3);
    scene.add(sign);
    const pdu = makeLabel(`unit: ${layer.pdu}`, { color: '#cfd6ff', size: 1.1, bg: null });
    pdu.position.set((p.x0 + p.x1) / 2, p.h + 13.6, -DECK_HALF - 3);
    scene.add(pdu);
    const where = makeLabel(WHERE[`${p.side}:${p.layer}`], { color: '#ffe7a8', size: 0.8, bg: 'rgba(8,12,32,0.55)' });
    where.position.set((p.x0 + p.x1) / 2, p.h + 11.4, -DECK_HALF - 3);
    scene.add(where);
  }

  const sideTitle = (text, x) => {
    const l = makeLabel(text, { color: '#ffffff', size: 3, font: 800, bg: null });
    l.position.set(x, 32, -20);
    scene.add(l);
  };
  sideTitle("ALICE'S LAPTOP · going DOWN the stack", -64);
  sideTitle('CATPICS DATA CENTRE · going UP the stack', 96 + RX);
  sideTitle('THE PHYSICAL INTERNET', NET_MID);

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

  // --- network: the physical internet --------------------------------------
  const geo = buildGeography(scene, animated, nodePosition);
  const { cables, routers, landmarks } = geo;

  const env = buildEnvironment(scene, PLATEAUS, animated, () => focus);
  const colliders = env.colliders;

  // Ferry pads (explore mode): step on one to fly across the network.
  const ferries = new Map();
  for (const [side, x] of [['sender', -5], ['receiver', 57 + RX]]) {
    const pad = new THREE.Group();
    pad.position.set(x, heightAt(x) + 0.12, 8);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 40), new THREE.MeshBasicMaterial({ color: '#4be1ff', transparent: true, opacity: 0.7 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    ring.rotation.x = Math.PI / 2;
    const label = makeLabel(side === 'sender' ? 'Tour the internet → data centre' : 'Tour the internet → Alice\'s laptop', { size: 0.5, color: '#bfe9ff' });
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
    sun,
    walkables,
    stations,
    gates,
    routers,
    cables,
    landmarks,
    linkPath: geo.linkPath,
    setFocus(v) { focus = v; },
    update(t, dt) {
      for (const fn of animated) fn(t, dt);
    },
  };
}

function makeStars() {
  const n = 1500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 260 + Math.random() * 60;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.random() * Math.PI * 0.5;
    pos[i * 3] = r * Math.cos(th) * Math.cos(ph) + NET_MID;
    pos[i * 3 + 1] = r * Math.sin(ph) - 20;
    pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(ph);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: '#c8d4ff', size: 1.2, sizeAttenuation: true, fog: false }));
}
