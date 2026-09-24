import * as THREE from 'three';
import { LAYERS, STATIONS } from './content.js';
import { makeLabel } from './labels.js';
import { GLOSSARY } from './glossary.js';
import { buildEnvironment, DECK_HALF } from './environment.js';
import { makeSky, makeValley, valleyHeight } from './effects.js';
import { buildLandscape } from './landscape.js';
import { mat, glowMat, canvasTexture, makeTrack, makeLoco, makeWagon } from './trains.js';

// The world is the TCP/IP stack turned into a railway. The sender's layers
// are station platforms you ride *down*, the network is a valley of stone
// viaducts and junctions, and the receiver's layers are platforms you climb
// back *up*. You are the train; each header is a wagon.

export const PATH_HALF_WIDTH = 12.5;
export { DECK_HALF };

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

// A level crossing at the downhill/uphill exit of each platform.
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
// The avatar rides 1.5 above a node and 1.4 above its rails.
const TRACK_Y = NODE_Y + 0.1;
const LIVE = '#ffd27a';

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

function railPoint(id) {
  return nodePosition(id).setY(TRACK_Y - 0.1);
}

function stoneTexture(base = '#a8927a', repX = 1, repY = 1) {
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5e5044';
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    const bh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -(r % 2) * 20;
      while (x < w) {
        const bw = 30 + Math.random() * 30;
        const c = new THREE.Color(base).offsetHSL(0, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.12);
        ctx.fillStyle = `#${c.getHexString()}`;
        ctx.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
        x += bw;
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  return t;
}

function pavingTexture(repX, repY) {
  const t = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#6f6a66';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const c = new THREE.Color('#b8aea2').offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
        ctx.fillStyle = `#${c.getHexString()}`;
        ctx.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.anisotropy = 8;
  return t;
}

export function buildWorld(scene) {
  const walkables = [];
  const animated = [];
  const stations = new Map();
  const gates = new Map();
  const routers = new Map();

  // --- sky, haze, light ----------------------------------------------------
  scene.background = new THREE.Color('#c99a8e');
  scene.fog = new THREE.Fog('#c9968c', 110, 380);
  scene.add(new THREE.HemisphereLight('#ffe0c0', '#4a3a55', 1.15));
  const sun = new THREE.DirectionalLight('#ffd0a0', 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 180 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const sky = makeSky();
  scene.add(sky.mesh);
  animated.push((t) => {
    sky.update(t);
    sky.mesh.position.copy(sun.target.position);
  });

  // --- terrain: stone embankments topped with paved platforms ---------------
  const wallMat = new THREE.MeshStandardMaterial({ map: stoneTexture('#a8927a', 0.08, 0.08), roughness: 0.95 });
  for (const side of ['sender', 'receiver']) {
    const pts = PROFILE[side];
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], -40);
    pts.forEach(([x, y]) => shape.lineTo(x, y));
    shape.lineTo(pts[pts.length - 1][0], -40);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: DECK_HALF * 2, bevelEnabled: false });
    geo.translate(0, 0, -DECK_HALF);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    walkables.push(mesh);

    // the main line runs down (and up) the middle of every platform and ramp
    for (let i = 1; i < pts.length; i++) {
      const a = new THREE.Vector3(pts[i - 1][0], pts[i - 1][1] + 0.12, 0);
      const b = new THREE.Vector3(pts[i][0], pts[i][1] + 0.12, 0);
      scene.add(makeTrack(a, b, { liveOpacity: 0 }).group);
    }
  }

  for (const p of PLATEAUS) {
    const layer = LAYERS[p.layer];
    const w = p.x1 - p.x0;
    const d = DECK_HALF * 2;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.2, d),
      new THREE.MeshStandardMaterial({ map: pavingTexture(w / 3, d / 3), roughness: 0.85 }),
    );
    top.position.set((p.x0 + p.x1) / 2, p.h + 0.02, 0);
    top.receiveShadow = true;
    scene.add(top);
    walkables.push(top);

    // platform coping in the layer's colour, and a yellow safety line
    for (const z of [-d / 2, d / 2]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 0.6), glowMat(layer.color, 0.35));
      rim.position.set((p.x0 + p.x1) / 2, p.h + 0.12, z - Math.sign(z) * 0.3);
      scene.add(rim);
      const safety = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, 0.2), mat('#f2c230'));
      safety.position.set((p.x0 + p.x1) / 2, p.h + 0.13, z - Math.sign(z) * 1.4);
      scene.add(safety);
    }

    // big enamel station sign above the far side
    const sign = makeLabel(`LAYER ${layer.num}\n${layer.name.toUpperCase()}`, { color: '#fdf6e3', bg: 'rgba(20,35,63,0.9)', size: 2.4, font: 800, border: layer.color });
    sign.position.set((p.x0 + p.x1) / 2, p.h + 19, -DECK_HALF - 3);
    scene.add(sign);
    const pdu = makeLabel(`cargo unit: ${layer.pdu}`, { color: '#fdf6e3', size: 1.1, bg: 'rgba(20,35,63,0.6)' });
    pdu.position.set((p.x0 + p.x1) / 2, p.h + 15.4, -DECK_HALF - 3);
    scene.add(pdu);
  }

  const sideTitle = (text, x) => {
    const l = makeLabel(text, { color: '#fff8ea', size: 3, font: 800, bg: null });
    l.position.set(x, 34, -20);
    scene.add(l);
  };
  sideTitle('SENDER · riding DOWN the stack', -64);
  sideTitle('RECEIVER · climbing UP the stack', 96);
  sideTitle('THE NETWORK', 21);

  scene.add(makeLaptop());
  scene.add(makeServerRack(animated));

  // --- stations: a plinth with the layer emblem and a semaphore signal -------
  for (const st of STATIONS) {
    if (st.side === 'network') continue;
    const x = STATION_X[st.id];
    const h = heightAt(x);
    const color = LAYERS[st.layer].color;
    const group = new THREE.Group();
    group.position.set(x, h, -5.5);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2.2, 1.2, 8),
      new THREE.MeshStandardMaterial({ map: stoneTexture('#c7b299', 1, 0.4), roughness: 0.9 }),
    );
    base.position.y = 0.6;
    base.castShadow = true;
    group.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.09, 8, 48), glowMat(color, 1.2));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.2;
    group.add(ring);

    const iconGeo = {
      app: new THREE.IcosahedronGeometry(0.9),
      transport: new THREE.TorusGeometry(0.7, 0.25, 12, 32),
      internet: new THREE.OctahedronGeometry(0.95),
      link: new THREE.BoxGeometry(1.2, 1.2, 1.2),
    }[st.layer];
    const icon = new THREE.Mesh(iconGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3 }));
    icon.position.y = 3;
    icon.castShadow = true;
    group.add(icon);

    // the semaphore: arm level (stop) until the station is solved
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 5.4, 8), mat('#e8e2d0'));
    post.position.set(1.6, 2.7, -0.9);
    const armGeo = new THREE.BoxGeometry(1.7, 0.32, 0.06);
    armGeo.translate(-0.75, 0, 0);
    const arm = new THREE.Mesh(armGeo, mat('#c0392b'));
    arm.position.set(1.6, 5.1, -0.8);
    const lampMat = glowMat('#ff4040', 2.5);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), lampMat);
    lamp.position.set(1.6, 4.5, -0.75);
    group.add(post, arm, lamp);

    const beacon = makeBeacon(color);
    group.add(beacon);

    const label = makeLabel(st.title, { color, size: 0.9, border: color });
    label.position.y = 6.3;
    group.add(label);

    scene.add(group);
    const entry = {
      id: st.id,
      group,
      icon,
      beacon,
      position: new THREE.Vector3(x, h, -5.5),
      clickTargets: [base, icon],
      cleared: false,
      clear() {
        this.cleared = true;
        lampMat.color.set('#50ff8a');
        lampMat.emissive.set('#50ff8a');
      },
    };
    stations.set(st.id, entry);
    animated.push((t) => {
      icon.rotation.y = t * 0.8;
      icon.position.y = 3 + Math.sin(t * 2 + x) * 0.2;
      arm.rotation.z = THREE.MathUtils.lerp(arm.rotation.z, entry.cleared ? -0.8 : 0, 0.06);
      beacon.material.opacity = beacon.visible ? 0.18 + Math.sin(t * 3) * 0.06 : 0;
    });
  }

  // --- gates: level crossings with booms and flashing lights ----------------
  for (const [id, x] of Object.entries(GATE_X)) {
    const h = heightAt(x - 0.5);
    const gate = new THREE.Group();
    gate.position.set(x, h, 0);
    const booms = [];
    const lights = [];
    for (const side of [-1, 1]) {
      const z = side * (PATH_HALF_WIDTH + 0.9);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.2, 10), mat('#f0ece2'));
      post.position.set(0, 1.6, z);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.6), mat('#2a2a30'));
      box.position.set(0, 0.4, z);
      gate.add(post, box);
      // the crossbuck sign
      for (const tilt of [0.6, -0.6]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 1.9), mat('#f4f1ea'));
        bar.position.set(-0.2, 3.7, z);
        bar.rotation.x = tilt;
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 1.96), mat('#c0392b'));
        edge.position.set(-0.17, 3.7, z);
        edge.rotation.x = tilt;
        gate.add(edge, bar);
      }
      for (const dz of [-0.35, 0.35]) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), glowMat('#ff2a2a', 3));
        l.position.set(-0.25, 2.9, z + dz);
        gate.add(l);
        lights.push(l);
      }
      // the boom pivots at the post and reaches to the middle of the track
      const pivot = new THREE.Group();
      pivot.position.set(0.3, 1.2, z);
      const len = PATH_HALF_WIDTH + 0.9;
      const stripe = canvasTexture(256, 16, (c, w2, h2) => {
        for (let i = 0; i < 8; i++) {
          c.fillStyle = i % 2 ? '#ffffff' : '#d62828';
          c.fillRect(i * 32, 0, 32, h2);
        }
      });
      const boom = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, len), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.5 }));
      boom.position.z = -side * len / 2;
      boom.castShadow = true;
      pivot.add(boom);
      pivot.userData.side = side;
      gate.add(pivot);
      booms.push(pivot);
    }
    const lock = makeLabel('🔒 solve the station to pass', { color: '#fff', size: 0.7 });
    lock.position.y = 3.2;
    gate.add(lock);
    scene.add(gate);
    const entry = {
      x,
      group: gate,
      open: false,
      raise(k) {
        for (const b of booms) b.rotation.x = -b.userData.side * k * (Math.PI / 2 - 0.05);
        lock.visible = k < 0.5;
      },
    };
    gates.set(id, entry);
    animated.push((t) => {
      const on = !entry.open && Math.sin(t * 7) > 0;
      lights.forEach((l, i) => { l.visible = entry.open ? false : (i % 2 === 0) === on; });
    });
  }

  // --- network: a valley of viaducts and junctions ---------------------------
  const valley = makeValley();
  scene.add(valley.mesh);
  animated.push((t) => valley.update(t));

  const cables = new Map();
  const pierSpots = [];
  const beamMat = new THREE.MeshStandardMaterial({ map: stoneTexture('#9b8a78', 1, 1), roughness: 1 });
  const addLine = (a, b, key) => {
    const track = makeTrack(a, b, { liveColor: LIVE, liveOpacity: 0.35 });
    scene.add(track.group);
    if (key) cables.set(key, track.live);
    // stone deck under the rails, and piers down to the valley floor
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.7, track.len), beamMat);
    beam.position.set(0, -0.5, 0);
    beam.castShadow = true;
    beam.receiveShadow = true;
    track.group.add(beam);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const n = Math.floor(track.len / 7);
    for (let i = 1; i <= n; i++) {
      const k = i / (n + 1);
      const p = a.clone().lerp(b, k);
      if (p.distanceTo(a) < 3.5 || p.distanceTo(b) < 3.5) continue;
      pierSpots.push({ x: p.x, z: p.z, top: p.y - 0.85, yaw });
    }
  };
  addLine(new THREE.Vector3(-2, 0.12, 0), railPoint('GW'), 'LAN-GW');
  addLine(railPoint('SW'), new THREE.Vector3(44, 0.12, 0), 'SW-LAN');
  for (const [a, b] of LINKS) addLine(railPoint(a), railPoint(b), `${a}-${b}`);

  // junctions: a stone tower with a turntable, a signal mast and a signal box
  for (const id of Object.keys(NODES)) {
    const pos = nodePosition(id);
    const g = new THREE.Group();
    g.position.copy(pos);
    const ground = valleyHeight(pos.x, pos.z) - 1;
    const pierH = pos.y - ground;
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, pierH, 10), beamMat);
    pier.position.y = -pierH / 2 - 0.3;
    pier.castShadow = true;
    g.add(pier);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3, 0.5, 24), mat('#8c7b6a', { roughness: 0.95 }));
    body.position.y = -0.15;
    body.receiveShadow = true;
    g.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.08, 6, 48), glowMat(LIVE, 1.2));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    g.add(ring);
    const table = new THREE.Group();
    table.position.y = 0.11;
    for (const dx of [-0.6, 0.6]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 5.6), mat('#b9b3ad', { metalness: 0.9, roughness: 0.3 }));
      r.position.x = dx;
      table.add(r);
    }
    g.add(table);
    animated.push((t) => { table.rotation.y = t * 0.3 + pos.x; });

    // put the mast and the signal box where no track leaves the junction
    const dirs = LINKS.filter((l) => l.includes(id)).map((l) => {
      const other = nodePosition(l[0] === id ? l[1] : l[0]);
      return Math.atan2(other.x - pos.x, other.z - pos.z);
    });
    if (id === 'GW') dirs.push(Math.atan2(-1, 0));
    if (id === 'SW') dirs.push(Math.atan2(1, -1));
    let free = 0;
    let best = -1;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const gap = Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d)))));
      if (gap > best) { best = gap; free = a; }
    }
    const fx = Math.sin(free);
    const fz = Math.cos(free);
    const hut = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), mat('#8a4b3a', { roughness: 0.9 }));
    walls.position.y = 0.9;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.6, 2.05), glowMat('#ffc36b', 0.9));
    glass.position.y = 1.35;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.9, 4), mat('#34383f'));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 2.15;
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 2.6), mat('#8c7b6a'));
    ledge.position.y = -0.05;
    hut.add(ledge, walls, glass, roof);
    hut.position.set(fx * 4.2, 0, fz * 4.2);
    hut.rotation.y = free;
    g.add(hut);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 8), mat('#2a2a30'));
    mast.position.set(fx * 2.7, 2, fz * 2.7);
    const signalMat = glowMat('#ff4040', 2.5);
    const signal = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), signalMat);
    signal.position.set(fx * 2.7, 4.1, fz * 2.7);
    g.add(mast, signal);

    const label = makeLabel(NODE_LABELS[id], { color: '#fff4dc', size: 0.75, bg: 'rgba(40,24,20,0.75)' });
    label.position.y = 5.3;
    g.add(label);
    const beacon = makeBeacon(LIVE);
    beacon.visible = false;
    g.add(beacon);
    scene.add(g);
    routers.set(id, { id, group: g, beacon, body });
    animated.push(() => {
      beacon.material.opacity = beacon.visible ? 0.2 : 0;
      const c = beacon.visible ? '#50ff8a' : '#ff4040';
      signalMat.color.set(c);
      signalMat.emissive.set(c);
    });
  }

  // all viaduct piers in one instanced mesh
  const piers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1, 2.4), beamMat, pierSpots.length);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 0.4, 2.9), mat('#8c7b6a'), pierSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  pierSpots.forEach((s, i) => {
    const ground = valleyHeight(s.x, s.z) - 1;
    const h = s.top - ground;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
    m4.compose(new THREE.Vector3(s.x, ground + h / 2, s.z), q, new THREE.Vector3(1, h, 1));
    piers.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(s.x, s.top - 0.2, s.z), q, new THREE.Vector3(1, 1, 1));
    caps.setMatrixAt(i, m4);
  });
  piers.castShadow = true;
  scene.add(piers, caps);

  scene.add(makeTraffic(animated));
  buildLandscape(scene, animated);

  const env = buildEnvironment(scene, PLATEAUS, animated, STATION_X);
  const colliders = [
    ...env.colliders,
    { x: -120, z: -9, r: 5 }, // laptop
    { x: 142, z: -9, r: 3.2 }, // server rack
  ];

  // Express platforms (explore mode): step on one to ride across the network.
  const ferries = new Map();
  for (const [side, x] of [['sender', -5], ['receiver', 57]]) {
    const pad = new THREE.Group();
    pad.position.set(x, heightAt(x) + 0.12, 8);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 40), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.75 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true }));
    ring.rotation.x = Math.PI / 2;
    const label = makeLabel(side === 'sender' ? '🚆 Express → server side' : '🚆 Express → Alice\'s side', { size: 0.5, color: '#fff4dc', border: '#ffd27a' });
    label.position.y = 2.2;
    pad.add(disc, ring, label);
    pad.visible = false;
    scene.add(pad);
    ferries.set(side, { side, group: pad, position: pad.position });
    animated.push((t) => {
      ring.position.y = 0.3 + ((t * 0.8) % 1) * 1.5;
      ring.material.opacity = 1 - ((t * 0.8) % 1);
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
    const qm = makeLabel('?', { size: 0.9, color, bg: null, font: 900 });
    qm.position.y = 1.3;
    g.add(gem, halo, qm);
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
    liveColor: LIVE,
    update(t, dt) {
      for (const fn of animated) fn(t, dt);
    },
  };
}

// Other people's packets: short trains running between the junctions.
function makeTraffic(animated) {
  const adjacency = {};
  for (const [a, b] of LINKS) {
    (adjacency[a] ??= []).push(b);
    (adjacency[b] ??= []).push(a);
  }
  const ids = Object.keys(adjacency);
  const group = new THREE.Group();
  const colors = Object.values(LAYERS).map((l) => l.color);
  const locoColors = ['#2b4a6b', '#6b2b3a', '#2b5a3a', '#4a3a6b', '#6b5a2b', '#3a3a44'];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    const train = new THREE.Group();
    const loco = makeLoco({ color: locoColors[i] });
    loco.group.position.z = 1.4;
    train.add(loco.group);
    for (let j = 0; j < 2; j++) {
      const w = makeWagon({ color: colors[(i + j) % colors.length], kind: ['box', 'tank', 'open'][(i + j) % 3], len: 2.4 });
      w.group.position.z = -1.4 - j * 2.7;
      train.add(w.group);
    }
    train.scale.setScalar(0.7);
    group.add(train);
    const from = ids[(i * 3) % ids.length];
    const mv = { from, to: adjacency[from][i % adjacency[from].length], t: Math.random(), speed: 5 + Math.random() * 3 };
    animated.push((t, dt = 1 / 60) => {
      a.copy(nodePosition(mv.from));
      b.copy(nodePosition(mv.to));
      const len = a.distanceTo(b);
      mv.t += (mv.speed / len) * dt;
      if (mv.t >= 1) {
        mv.t = 0;
        const prev = mv.from;
        mv.from = mv.to;
        const next = adjacency[mv.from].filter((n) => n !== prev);
        const opts = next.length ? next : adjacency[mv.from];
        mv.to = opts[Math.floor(Math.random() * opts.length)];
        return;
      }
      train.position.lerpVectors(a, b, mv.t);
      train.position.y = TRACK_Y;
      train.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    });
  }
  return group;
}

function makeBeacon(color) {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 60, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  beacon.position.y = 30;
  return beacon;
}

function makeLaptop() {
  const g = new THREE.Group();
  // At the start of the line, screen turned towards the player.
  g.position.set(-120, 15, -9);
  g.rotation.y = 0.7;
  const m = new THREE.MeshStandardMaterial({ color: '#c9cfe6', metalness: 0.7, roughness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 8), m);
  base.position.y = 0.25;
  g.add(base);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 0.4), m);
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
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(11, 7), new THREE.MeshBasicMaterial({ map: tex }));
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
