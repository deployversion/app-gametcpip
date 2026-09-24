import * as THREE from 'three';
import { LAYERS, STATIONS } from './content.js';
import { makeLabel } from './labels.js';
import { GLOSSARY } from './glossary.js';
import {
  buildEnvironment, DECK_HALF, SERIF, STONE, STONE_DARK, cobbleTexture, stoneTexture, std, glow, tower, flag, lantern,
  makePigeons, makeHorizon, makeClouds, makeFireflies, canvasTexture, rand,
} from './kingdom.js';
import { makeSky, makeSea, SUN_DIR } from './effects.js';

// The world is the TCP/IP stack turned into a postal kingdom. The sender's
// layers are terraces of a castle town you walk *down* (Alicehold), the
// network is the Sea of Routes with a watchtower on every island (routers),
// and the receiver's layers are the terraces of Catpics Keep you climb back
// *up*.

export const PATH_HALF_WIDTH = 12.5;
export { DECK_HALF };

// How far the ground reaches behind the far wall (for keeps and trees).
const BACK = 16;

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

// Kingdom names for each terrace, shown on the big wall signs.
const DISTRICT = {
  app: { sender: 'The Royal Scriptorium', receiver: 'The Treasury of Cats' },
  transport: { sender: 'The Courier Guild', receiver: 'The Courier Guild' },
  internet: { sender: 'Crossroads Post Office', receiver: 'Crossroads Post Office' },
  link: { sender: 'Harbour Stables', receiver: 'Harbour Stables' },
};

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

// A portcullis at the downhill/uphill exit of each terrace.
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
  GW: 'Home harbour', R1: 'R1 · ISP watchtower', R2: 'R2', R3: 'R3', R4: 'R4 · great lighthouse', R5: 'R5', R6: 'R6', SW: 'Keep harbour',
};
const LINKS = [['GW', 'R1'], ['R1', 'R2'], ['R1', 'R3'], ['R1', 'R4'], ['R1', 'R5'], ['R2', 'R4'], ['R3', 'R4'], ['R4', 'R6'], ['R4', 'SW'], ['R5', 'R2'], ['R6', 'SW']];
const NODE_Y = 1.2;
const SEA_Y = -9;
export const ROAD_COLOR = '#ffd98a';

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

  // --- sky, haze, light ----------------------------------------------------
  const HAZE = '#e3b9a4';
  scene.background = new THREE.Color(HAZE);
  scene.fog = new THREE.Fog(HAZE, 110, 330);
  scene.add(new THREE.HemisphereLight('#bcd3ff', '#7a5a3c', 1.25));
  const sun = new THREE.DirectionalLight('#ffd7a8', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 180 });
  sun.shadow.bias = -0.0005;
  sun.userData.offset = SUN_DIR.clone().multiplyScalar(70);
  scene.add(sun, sun.target);
  const sky = makeSky();
  scene.add(sky.mesh);
  animated.push((t) => {
    sky.update(t);
    sky.mesh.position.copy(sun.target.position);
  });

  // --- terrain: the two cliff towns ----------------------------------------
  const cliff = std('#f0e6d2', { map: stoneTexture(0.14, 0.2, '#b8a88a') });
  for (const side of ['sender', 'receiver']) {
    const pts = PROFILE[side];
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], -40);
    pts.forEach(([x, y]) => shape.lineTo(x, y));
    shape.lineTo(pts[pts.length - 1][0], -40);
    shape.closePath();
    const depth = DECK_HALF * 2 + BACK;
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -DECK_HALF - BACK);
    const mesh = new THREE.Mesh(geo, cliff);
    mesh.receiveShadow = true;
    scene.add(mesh);
    walkables.push(mesh);
  }

  for (const p of PLATEAUS) {
    const layer = LAYERS[p.layer];
    const w = p.x1 - p.x0;
    const d = DECK_HALF * 2;
    const cx = (p.x0 + p.x1) / 2;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.2, d),
      std('#ffffff', { map: cobbleTexture(layer.color, w / 6, d / 6), roughness: 0.95 }),
    );
    top.position.set(cx, p.h + 0.02, 0);
    top.receiveShadow = true;
    scene.add(top);
    walkables.push(top);

    // a coloured carpet runner down the middle of each terrace
    const runner = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 3.2), std(layer.color, { roughness: 1 }));
    runner.position.set(cx, p.h + 0.14, 0);
    runner.receiveShadow = true;
    scene.add(runner);

    // grass behind the far wall, where the keeps and orchards stand
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, BACK), std('#6f8f45', { roughness: 1 }));
    lawn.position.set(cx, p.h + 0.05, -DECK_HALF - BACK / 2);
    lawn.receiveShadow = true;
    scene.add(lawn);

    // big layer sign above the wall, framed like a guild plaque
    const district = DISTRICT[p.layer][p.side];
    const sign = makeLabel(`LAYER ${layer.num} · ${layer.name.toUpperCase()}\n${district}`, {
      color: '#3b2410', size: 2.1, font: 700, bg: 'rgba(246,231,193,0.95)', border: layer.color, family: SERIF,
    });
    sign.position.set(cx, p.h + 17, -DECK_HALF - 3);
    scene.add(sign);
    const pdu = makeLabel(`unit: ${layer.pdu}`, { color: '#fff7e6', size: 1.1, bg: 'rgba(59,36,16,0.75)', family: SERIF });
    pdu.position.set(cx, p.h + 13.2, -DECK_HALF - 3);
    scene.add(pdu);
  }
  scene.add(makeStairs());

  const sideTitle = (text, x) => {
    const l = makeLabel(text, { color: '#fff7e6', size: 3, font: 700, bg: 'rgba(59,36,16,0.55)', family: SERIF });
    l.position.set(x, 38, -24);
    scene.add(l);
  };
  sideTitle('ALICEHOLD · the letter goes DOWN the stack', -64);
  sideTitle('CATPICS KEEP · the letter climbs UP the stack', 96);
  sideTitle('THE SEA OF ROUTES', 21);

  scene.add(makeAliceTower(animated));
  scene.add(makeTreasury(animated));

  // --- stations: a lectern with a floating guild emblem --------------------
  for (const st of STATIONS) {
    if (st.side === 'network') continue;
    const x = STATION_X[st.id];
    const h = heightAt(x);
    const color = LAYERS[st.layer].color;
    const group = new THREE.Group();
    group.position.set(x, h, -5.5);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 2.2, 1.2, 8),
      std(STONE, { map: stoneTexture(2, 0.4) }),
    );
    base.position.y = 0.6;
    base.castShadow = true;
    group.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.1, 8, 8), std('#c9a24a', { metalness: 0.8, roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.22;
    group.add(ring);
    const lectern = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.8), std('#6b4a2f'));
    lectern.position.y = 1.75;
    lectern.rotation.x = -0.2;
    group.add(lectern);

    // app: a rolled scroll · transport: a wax seal · internet: a compass · link: a horseshoe
    const iconGeo = {
      app: new THREE.CylinderGeometry(0.35, 0.35, 1.6, 16),
      transport: new THREE.CylinderGeometry(0.8, 0.8, 0.25, 24),
      internet: new THREE.OctahedronGeometry(0.95),
      link: new THREE.TorusGeometry(0.7, 0.2, 10, 24, Math.PI * 1.45),
    }[st.layer];
    const icon = new THREE.Mesh(iconGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.35 }));
    icon.position.y = 3.4;
    if (st.layer === 'app') icon.rotation.z = Math.PI / 2;
    if (st.layer === 'transport') icon.rotation.x = Math.PI / 2;
    if (st.layer === 'link') icon.rotation.z = Math.PI * 0.77;
    icon.castShadow = true;
    const spin = new THREE.Group();
    spin.add(icon);
    group.add(spin);

    const beacon = makeBeacon('#ffd98a');
    group.add(beacon);

    const label = makeLabel(st.title, { color: '#3b2410', size: 0.9, bg: 'rgba(246,231,193,0.95)', border: color, family: SERIF, font: 700 });
    label.position.y = 5.4;
    group.add(label);

    scene.add(group);
    const entry = { id: st.id, group, icon, beacon, position: new THREE.Vector3(x, h, -5.5), clickTargets: [base, icon, lectern] };
    stations.set(st.id, entry);
    animated.push((t) => {
      spin.rotation.y = t * 0.8;
      icon.position.y = 3.4 + Math.sin(t * 2 + x) * 0.2;
      beacon.material.opacity = beacon.visible ? 0.16 + Math.sin(t * 3) * 0.05 : 0;
    });
  }

  // --- gates: a gatehouse with a portcullis --------------------------------
  const iron = std('#3a3530', { metalness: 0.7, roughness: 0.45 });
  for (const [id, x] of Object.entries(GATE_X)) {
    const st = STATIONS.find((s) => s.id === id);
    const color = LAYERS[st.layer].color;
    const h = heightAt(x - 0.5);
    const gate = new THREE.Group();
    gate.position.set(x, h, 0);

    // the gatehouse towers and lintel stay; only the portcullis lifts
    const span = PATH_HALF_WIDTH + 1.4;
    for (const z of [-span - 1.2, span + 1.2]) {
      tower(scene, { x, y: h, z, r: 1.5, h: 9, roof: '#5a4a6a', windows: false });
    }
    const crest = makeLabel(LAYERS[st.layer].name, { color: '#fff7e6', size: 0.8, bg: color, family: SERIF, font: 700 });
    crest.position.set(x, h + 10.4, span + 1.2);
    scene.add(crest);

    const portcullis = new THREE.Group();
    const bars = Math.floor((span * 2) / 1.1);
    for (let i = 0; i <= bars; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 7, 0.22), iron);
      bar.position.set(0, 3.5, -span + i * ((span * 2) / bars));
      portcullis.add(bar);
    }
    for (let j = 0; j < 4; j++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, span * 2), iron);
      rail.position.set(0, 1 + j * 1.8, 0);
      portcullis.add(rail);
    }
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 2, 7),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    field.rotation.y = Math.PI / 2;
    field.position.y = 3.5;
    portcullis.add(field);
    gate.add(portcullis);

    const lock = makeLabel('🔒 solve the station to raise the gate', { color: '#3b2410', size: 0.7, bg: 'rgba(246,231,193,0.95)', family: SERIF });
    lock.position.y = 9.4;
    gate.add(lock);
    scene.add(gate);
    gates.set(id, { x, group: gate, lift: portcullis, lock, field, open: false });
    animated.push((t) => {
      field.material.opacity = 0.12 + Math.sin(t * 3 + x) * 0.05;
    });
  }

  // --- the Sea of Routes ---------------------------------------------------
  const sea = makeSea(HAZE);
  sea.mesh.position.set(21, SEA_Y, 0);
  scene.add(sea.mesh);
  animated.push((t) => sea.update(t));

  // Sky-roads between watchtowers: glowing golden ribbons the letter rides.
  const cables = new Map();
  const addRoad = (a, b, key) => {
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 0.8;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 16, 0.13, 6),
      new THREE.MeshBasicMaterial({ color: ROAD_COLOR, transparent: true, opacity: 0.75 }),
    );
    mesh.userData.baseColor = ROAD_COLOR;
    scene.add(mesh);
    if (key) cables.set(key, mesh);
  };
  addRoad(new THREE.Vector3(-2, 0.3, 0), nodePosition('GW'), 'LAN-GW');
  addRoad(nodePosition('SW'), new THREE.Vector3(44, 0.3, 0), 'SW-LAN');
  for (const [a, b] of LINKS) addRoad(nodePosition(a), nodePosition(b), `${a}-${b}`);

  for (const id of Object.keys(NODES)) {
    const pos = nodePosition(id);
    const g = new THREE.Group();
    g.position.copy(pos);
    const harbour = id === 'GW' || id === 'SW';

    // rocky island at sea level
    const isle = new THREE.Mesh(new THREE.CylinderGeometry(harbour ? 3.2 : 2.6, harbour ? 4.2 : 3.6, 2.2, 9), std('#7a6f5a', { flatShading: true }));
    isle.position.y = SEA_Y - pos.y + 0.4;
    const moss = new THREE.Mesh(new THREE.CylinderGeometry(harbour ? 3.1 : 2.5, harbour ? 3.2 : 2.6, 0.3, 9), std('#6f8f45', { flatShading: true }));
    moss.position.y = SEA_Y - pos.y + 1.55;
    // the tower shaft rising out of the sea to the lantern deck
    const shaftH = pos.y - SEA_Y - 1.2;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, shaftH, 12), std(id === 'R4' ? '#e9e2d4' : STONE, { map: stoneTexture(2, shaftH / 3) }));
    shaft.position.y = -shaftH / 2 - 0.45;
    shaft.castShadow = true;
    g.add(isle, moss, shaft);
    if (id === 'R4') {
      for (let k = 0; k < 3; k++) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(1.2 + k * 0.1, 1.25 + k * 0.1, 0.8, 12), std('#b3261e'));
        band.position.y = -1.8 - k * 2.6;
        g.add(band);
      }
    }
    const body = new THREE.Mesh(
      harbour ? new THREE.BoxGeometry(3.4, 0.9, 2.4) : new THREE.CylinderGeometry(1.8, 1.6, 0.9, 12),
      std(harbour ? '#6b4a2f' : STONE_DARK, { map: stoneTexture(3, 0.3) }),
    );
    body.castShadow = true;
    g.add(body);
    // a lantern cupola with a turning light
    const cupola = new THREE.Group();
    const posts = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 6, 1, true), std('#2e2a26', { wireframe: true }));
    posts.position.y = 1.2;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 6), std(id === 'R4' ? '#b3261e' : '#3f5d8a'));
    cap.position.y = 2.4;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), glow('#ffcf7a', 2.8));
    flame.position.y = 1.2;
    cupola.add(posts, cap, flame);
    if (!harbour) g.add(cupola);
    else {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), std('#4a3220'));
      mast.position.set(1, 2.4, 0);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2), std('#efe2c4', { side: THREE.DoubleSide }));
      sail.position.set(1, 2.6, 0.02);
      sail.rotation.y = Math.PI / 2;
      g.add(mast, sail);
    }
    // a soft halo around the lantern, visible from across the sea
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffcf7a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(4.5);
    halo.position.y = 1.2;
    if (!harbour) g.add(halo);

    const label = makeLabel(NODE_LABELS[id], { color: '#3b2410', size: 0.75, bg: 'rgba(246,231,193,0.92)', family: SERIF, font: 700 });
    label.position.y = 3.6;
    g.add(label);
    const beacon = makeBeacon('#ffd98a');
    beacon.visible = false;
    g.add(beacon);
    scene.add(g);
    routers.set(id, { id, group: g, beacon, body });
    const ph = pos.x * 0.3 + pos.z;
    animated.push((t) => {
      beacon.material.opacity = beacon.visible ? 0.2 : 0;
      halo.material.opacity = 0.55 + Math.sin(t * 2 + ph) * 0.15;
      flame.material.emissiveIntensity = 2.5 + Math.sin(t * 9 + ph) * 0.4;
    });
  }

  // little sailing boats bobbing between the islands
  scene.add(makeBoats(animated));

  // carrier pigeons flying every sky-road, plus flocks around the keeps
  const roads = LINKS.map(([a, b]) => [nodePosition(a), nodePosition(b)]);
  scene.add(makePigeons({
    flocks: [{ cx: -100, cy: 40, cz: -30, r: 12, n: 8 }, { cx: 134, cy: 40, cz: -30, r: 10, n: 7 }],
    paths: roads,
    perPath: 2,
  }, animated));
  scene.add(makeFireflies({ x0: -2, x1: 44 }, animated));
  scene.add(makeHorizon(new THREE.Vector3(21, 0, 0)));
  scene.add(makeClouds(new THREE.Vector3(21, 0, -40), animated));

  const env = buildEnvironment(scene, PLATEAUS, animated);
  const colliders = [
    ...env.colliders,
    { x: -120, z: -9, r: 4.2 }, // Alice's tower
    { x: 142, z: -9, r: 3.6 }, // the cat treasury
  ];

  // Ferry piers (explore mode): step on one to sail across the sea.
  const ferries = new Map();
  for (const [side, x] of [['sender', -5], ['receiver', 57]]) {
    const pad = new THREE.Group();
    pad.position.set(x, heightAt(x) + 0.12, 8);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 8), std('#6b4a2f'));
    const rose = new THREE.Mesh(new THREE.CircleGeometry(1.3, 8), new THREE.MeshBasicMaterial({ map: compassTexture(), transparent: true }));
    rose.rotation.x = -Math.PI / 2;
    rose.position.y = 0.08;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: ROAD_COLOR, transparent: true }));
    ring.rotation.x = Math.PI / 2;
    const label = makeLabel(side === 'sender' ? '⛵ Ferry to Catpics Keep' : '⛵ Ferry to Alicehold', { size: 0.5, color: '#3b2410', bg: 'rgba(246,231,193,0.92)', family: SERIF });
    label.position.y = 2.2;
    pad.add(disc, rose, ring, label);
    pad.visible = false;
    scene.add(pad);
    ferries.set(side, { side, group: pad, position: pad.position });
    animated.push((t) => {
      ring.position.y = 0.3 + ((t * 0.8) % 1) * 1.5;
      ring.material.opacity = 1 - ((t * 0.8) % 1);
      rose.rotation.z = t * 0.3;
    });
  }

  // --- knowledge orbs: floating wax-sealed letters -------------------------
  const orbs = new Map();
  for (const entry of GLOSSARY) {
    const color = LAYERS[entry.layer].color;
    const g = new THREE.Group();
    g.position.set(entry.x, heightAt(entry.x) + 1.6, entry.z);
    const gem = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({ color: '#fff7e6', emissive: color, emissiveIntensity: 1.1, roughness: 0.2, transparent: true }),
    );
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color: '#f2c46d', transparent: true }));
    const q = makeLabel('?', { size: 0.9, color, bg: 'rgba(246,231,193,0.85)', font: 900, family: SERIF });
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
    update(t, dt) {
      for (const fn of animated) fn(t, dt);
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

let haloTex;
function haloTexture() {
  haloTex ??= canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,230,170,0.9)');
    g.addColorStop(0.3, 'rgba(255,200,110,0.35)');
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  return haloTex;
}

function compassTexture() {
  return canvasTexture(128, 128, (ctx) => {
    ctx.translate(64, 64);
    ctx.fillStyle = '#e9d3a0';
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.fillStyle = i % 2 ? '#b08a52' : '#8e3b2e';
      ctx.beginPath();
      ctx.moveTo(0, -(i % 2 ? 38 : 58));
      ctx.lineTo(9, 0);
      ctx.lineTo(-9, 0);
      ctx.fill();
      ctx.restore();
    }
  });
}

// Stone steps on every ramp between terraces.
function makeStairs() {
  const spots = [];
  for (const side of ['sender', 'receiver']) {
    const pts = PROFILE[side];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      if (y0 === y1) continue;
      const n = 10;
      for (let k = 0; k < n; k++) {
        const x = x0 + ((k + 0.5) / n) * (x1 - x0);
        spots.push([x, heightAt(x), (x1 - x0) / n]);
      }
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.6, DECK_HALF * 2), std(STONE, { map: stoneTexture(0.5, 6) }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, y, w], i) => {
    m.compose(new THREE.Vector3(x, y - 0.05, 0), new THREE.Quaternion(), new THREE.Vector3(Math.abs(w) * 1.02, 1, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.receiveShadow = true;
  return mesh;
}

function makeBoats(animated) {
  const group = new THREE.Group();
  const spots = [[10, 10], [22, -8], [34, 12], [8, -22], [30, -24], [20, 24]];
  spots.forEach(([x, z], i) => {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.5, 3, 8, 1, false, 0, Math.PI), std('#6b4a2f', { side: THREE.DoubleSide }));
    hull.rotation.set(0, 0, Math.PI / 2);
    hull.rotation.x = Math.PI / 2;
    hull.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), std('#4a3220'));
    mast.position.y = 1.3;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), std(i % 2 ? '#efe2c4' : '#c96b4f', { side: THREE.DoubleSide }));
    sail.position.set(0.1, 1.5, 0);
    boat.add(hull, mast, sail);
    boat.position.set(x, SEA_Y + 0.4, z);
    boat.rotation.y = rand(0, 6);
    group.add(boat);
    animated.push((t) => {
      boat.position.y = SEA_Y + 0.5 + Math.sin(t * 1.2 + i) * 0.25;
      boat.rotation.z = Math.sin(t * 0.9 + i) * 0.08;
      boat.rotation.y += 0.0015;
      boat.position.x = x + Math.sin(t * 0.1 + i) * 3;
    });
  });
  return group;
}

// Alice's tower at the top of the town, with a scrying mirror that shows
// the page she is waiting for.
function makeAliceTower(animated) {
  const g = new THREE.Group();
  g.position.set(-120, 15, -9);
  g.rotation.y = 0.7;
  tower(g, { x: 0, y: 0, z: -1.5, r: 2.6, h: 16, roof: '#7a4a86' });
  flag({ group: g, animated }, 0, 16 + 7.4, -1.5, '#b56cff');

  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6e7c1'; ctx.fillRect(0, 0, 512, 320);
  ctx.fillStyle = '#e2c98f'; ctx.fillRect(0, 0, 512, 44);
  ctx.fillStyle = '#fff4d6'; ctx.fillRect(16, 9, 480, 26);
  ctx.fillStyle = '#3b2410'; ctx.font = '18px Georgia, serif'; ctx.fillText('🔒 https://catpics.example/cat.png', 26, 28);
  ctx.font = 'bold 34px Georgia, serif'; ctx.fillText('Awaiting a letter…', 110, 150);
  ctx.font = '80px serif'; ctx.fillText('🐱', 210, 260);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(8.6, 6, 0.4), std('#c9a24a', { metalness: 0.7, roughness: 0.35 }));
  frame.position.set(0, 6.5, 1.8);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 5.2), new THREE.MeshBasicMaterial({ map: tex }));
  mirror.position.set(0, 6.5, 2.02);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.6, 0.5), std('#6b4a2f'));
  stand.position.set(0, 1.8, 1.8);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(5, 0.08, 8, 64), new THREE.MeshBasicMaterial({ color: '#e8c6ff', transparent: true, opacity: 0.6 }));
  halo.position.set(0, 6.5, 2.1);
  halo.scale.set(1, 0.72, 1);
  g.add(frame, mirror, stand, halo);
  const label = makeLabel("Alice's tower", { size: 0.9, color: '#3b2410', bg: 'rgba(246,231,193,0.95)', family: SERIF, font: 700 });
  label.position.set(0, 10.4, 2);
  g.add(label);
  animated.push((t) => { halo.material.opacity = 0.35 + Math.sin(t * 2) * 0.25; });
  return g;
}

// The receiving end: the Treasury of Cats, where the picture is kept.
function makeTreasury(animated) {
  const g = new THREE.Group();
  g.position.set(142, 15, -9);
  const vault = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 5), std(STONE, { map: stoneTexture(2, 2) }));
  vault.position.y = 3.5;
  vault.castShadow = true;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#c9a24a', { metalness: 0.7, roughness: 0.35 }));
  dome.position.y = 7;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), glow('#ffcf7a', 0.9));
  door.position.set(-2.52, 1.5, 0);
  door.rotation.y = -Math.PI / 2;
  g.add(vault, dome, door);
  const coins = [];
  for (let i = 0; i < 8; i++) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), glow('#ffd166', 0.9));
    coin.rotation.x = Math.PI / 2;
    g.add(coin);
    coins.push(coin);
  }
  const catBanner = makeLabel('🐱', { size: 3, bg: null });
  catBanner.position.set(0, 12.5, 0);
  g.add(catBanner);
  const label = makeLabel('catpics.example\n203.0.113.80', { size: 1, color: '#3b2410', bg: 'rgba(246,231,193,0.95)', family: SERIF, font: 700 });
  label.position.set(0, 15.5, 0);
  g.add(label);
  animated.push((t) => {
    coins.forEach((c, i) => {
      const a = t * 0.8 + (i / coins.length) * Math.PI * 2;
      c.position.set(Math.cos(a) * 4, 8 + Math.sin(t * 2 + i) * 0.4, Math.sin(a) * 4);
      c.rotation.z = t * 3 + i;
    });
    catBanner.position.y = 12.5 + Math.sin(t * 1.5) * 0.3;
  });
  // a few lanterns at the treasury door
  lantern({ group: g, animated, colliders: [] }, -3.5, 0, 3, '#ffcf7a', false);
  lantern({ group: g, animated, colliders: [] }, -3.5, 0, -3, '#ffcf7a', false);
  return g;
}
