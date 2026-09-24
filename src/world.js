import * as THREE from 'three';
import { LAYERS, STATIONS } from './content.js';
import { makeLabel, gridTexture } from './labels.js';
import { GLOSSARY } from './glossary.js';
import { buildCity, buildingMaterial, FLOOR } from './city.js';

// The world is the TCP/IP stack turned into a neon megacity: the sender's
// layers are rooftop decks you walk *down*, the network is the street canyon
// of router towers you fly across, and the receiver's layers are decks you
// climb back *up*. The skyline around it all lives in city.js.

export const PATH_HALF_WIDTH = 9;

const PROFILE = {
  sender: [[-124, 15], [-88, 15], [-78, 10], [-58, 10], [-48, 5], [-28, 5], [-18, 0], [-2, 0]],
  receiver: [[44, 0], [60, 0], [70, 5], [86, 5], [96, 10], [112, 10], [122, 15], [146, 15]],
};

const PLATEAUS = [
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
  GW: 'Home router', R1: 'R1 · ISP', R2: 'R2', R3: 'R3', R4: 'R4 · backbone', R5: 'R5', R6: 'R6', SW: 'Server LAN',
};
const LINKS = [['GW', 'R1'], ['R1', 'R2'], ['R1', 'R3'], ['R1', 'R4'], ['R1', 'R5'], ['R2', 'R4'], ['R3', 'R4'], ['R4', 'R6'], ['R4', 'SW'], ['R5', 'R2'], ['R6', 'SW']];
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

export function buildWorld(scene, renderer) {
  const walkables = [];
  const animated = [];
  const stations = new Map();
  const gates = new Map();
  const routers = new Map();

  // --- light (sky, fog and the skyline come from the city) ----------------
  scene.add(new THREE.HemisphereLight('#8a7dff', '#ff2a6d', 0.55));
  // cold moonlight, which also casts the packet's shadow
  const sun = new THREE.DirectionalLight('#b8c6ff', 1.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // --- terrain -------------------------------------------------------------
  for (const side of ['sender', 'receiver']) {
    const pts = PROFILE[side];
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], FLOOR);
    pts.forEach(([x, y]) => shape.lineTo(x, y));
    shape.lineTo(pts[pts.length - 1][0], FLOOR);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: PATH_HALF_WIDTH * 2 + 2, bevelEnabled: false });
    geo.translate(0, 0, -(PATH_HALF_WIDTH + 1));
    // the arcology block the decks sit on, lit window by window
    const mesh = new THREE.Mesh(geo, buildingMaterial({ seed: side === 'sender' ? 11 : 47 }));
    animated.push((t) => { mesh.material.uniforms.uTime.value = t; });
    scene.add(mesh);
    walkables.push(mesh);
  }

  for (const p of PLATEAUS) {
    const layer = LAYERS[p.layer];
    const w = p.x1 - p.x0;
    const d = PATH_HALF_WIDTH * 2 + 2;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.2, d),
      new THREE.MeshStandardMaterial({
        map: gridTexture(layer.color, w / 4, d / 4),
        emissive: new THREE.Color(layer.color),
        emissiveIntensity: 0.1,
        roughness: 0.35,
        metalness: 0.4,
      }),
    );
    top.position.set((p.x0 + p.x1) / 2, p.h + 0.02, 0);
    top.receiveShadow = true;
    scene.add(top);
    walkables.push(top);

    // glowing rim along both long edges
    for (const z of [-d / 2, d / 2]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: new THREE.Color(layer.color).multiplyScalar(1.6), toneMapped: false }));
      rim.position.set((p.x0 + p.x1) / 2, p.h + 0.1, z);
      scene.add(rim);
    }

    // big layer sign on the far wall
    const sign = makeLabel(`LAYER ${layer.num}\n${layer.name.toUpperCase()}`, { color: layer.color, size: 2.4, font: 800, border: layer.color });
    sign.position.set((p.x0 + p.x1) / 2, p.h + 9, -PATH_HALF_WIDTH - 6);
    scene.add(sign);
    const pdu = makeLabel(`unit: ${layer.pdu}`, { color: '#cfd6ff', size: 1.1, bg: null });
    pdu.position.set((p.x0 + p.x1) / 2, p.h + 5.6, -PATH_HALF_WIDTH - 6);
    scene.add(pdu);
  }

  const sideTitle = (text, x) => {
    const l = makeLabel(text, { color: '#ffffff', size: 3, font: 800, bg: null });
    l.position.set(x, 32, -20);
    scene.add(l);
  };
  sideTitle('CLIENT DISTRICT · going DOWN the stack', -64);
  sideTitle('SERVER DISTRICT · going UP the stack', 96);
  sideTitle('THE NETWORK · street canyon', 21);

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
      new THREE.PlaneGeometry(PATH_HALF_WIDTH * 2 + 2, 5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    field.rotation.y = Math.PI / 2;
    field.position.y = 2.5;
    gate.add(field);
    for (const z of [-(PATH_HALF_WIDTH + 1), PATH_HALF_WIDTH + 1]) {
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

  // --- network -------------------------------------------------------------
  const cableMat = new THREE.MeshBasicMaterial({ color: '#4be1ff', transparent: true, opacity: 0.7 });
  const cables = new Map();
  const addCable = (a, b, key) => {
    const curve = new THREE.LineCurve3(a, b);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 1, 0.12, 8), cableMat.clone());
    scene.add(mesh);
    if (key) cables.set(key, mesh);
  };
  addCable(new THREE.Vector3(-2, 0.3, 0), nodePosition('GW'), 'LAN-GW');
  addCable(nodePosition('SW'), new THREE.Vector3(44, 0.3, 0), 'SW-LAN');
  for (const [a, b] of LINKS) addCable(nodePosition(a), nodePosition(b), `${a}-${b}`);

  for (const id of Object.keys(NODES)) {
    const pos = nodePosition(id);
    const g = new THREE.Group();
    g.position.copy(pos);
    // each router sits on the roof of its own tower
    const towerH = NODE_Y - 0.45 - FLOOR;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(3.6, towerH, 3.6), buildingMaterial({ seed: pos.x * 3.1 + pos.z }));
    pillar.position.y = -0.45 - towerH / 2;
    g.add(pillar);
    animated.push((t) => { pillar.material.uniforms.uTime.value = t; });
    const isSwitch = id === 'SW';
    const body = new THREE.Mesh(
      isSwitch ? new THREE.BoxGeometry(3, 0.9, 2) : new THREE.CylinderGeometry(1.6, 1.6, 0.9, 32),
      new THREE.MeshStandardMaterial({ color: '#2f5bd8', metalness: 0.6, roughness: 0.3, emissive: '#10258a', emissiveIntensity: 0.5 }),
    );
    body.castShadow = true;
    g.add(body);
    if (!isSwitch) {
      const arrows = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#bfe9ff' }));
      arrows.rotation.x = Math.PI / 2;
      arrows.position.y = 0.48;
      g.add(arrows);
      animated.push((t) => { arrows.rotation.z = t; });
    }
    const label = makeLabel(NODE_LABELS[id], { color: '#bfe9ff', size: 0.75 });
    label.position.y = 2.1;
    g.add(label);
    const beacon = makeBeacon('#4be1ff');
    beacon.visible = false;
    g.add(beacon);
    scene.add(g);
    routers.set(id, { id, group: g, beacon, body });
    animated.push(() => { beacon.material.opacity = beacon.visible ? 0.2 : 0; });
  }

  scene.add(makeBitDust(animated));

  const city = buildCity(scene, { plateaus: PLATEAUS, heightAt, nodes: NODES, renderer });

  // Maglev pads at the network edges; only active in explore mode.
  const ferries = new Map();
  for (const [side, x] of [['sender', -6], ['receiver', 48]]) {
    const pad = new THREE.Group();
    pad.position.set(x, 0, 6);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.15, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#05d9e8').multiplyScalar(1.4), toneMapped: false }));
    disc.position.y = 0.08;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a6d').multiplyScalar(2), toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    const tag = makeLabel('MAGLEV ⇄ other district', { size: 0.6, color: '#05d9e8', border: '#05d9e8' });
    tag.position.y = 3.2;
    pad.add(disc, ring, tag);
    pad.visible = false;
    scene.add(pad);
    ferries.set(side, { group: pad, position: pad.position });
    animated.push((t) => {
      ring.position.y = 0.3 + ((t * 0.8) % 1) * 2.5;
      ring.scale.setScalar(1 - ((t * 0.8) % 1) * 0.3);
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
    ferries,
    landmarks: city.landmarks,
    sun,
    walkables,
    stations,
    gates,
    routers,
    cables,
    update(t, dt, camera) {
      for (const fn of animated) fn(t, dt);
      city.update(t, dt, camera);
    },
  };
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
  // Beside the path on the far side, screen facing the player.
  g.position.set(-114, 15, -13);
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
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(11, 7), new THREE.MeshBasicMaterial({ map: tex, color: '#9a9ab0' }));
  screen.position.set(0, 4.2, -3.78);
  screen.rotation.x = -0.15;
  g.add(screen);
  return g;
}

function makeServerRack(animated) {
  const g = new THREE.Group();
  g.position.set(142, 15, -3);
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
