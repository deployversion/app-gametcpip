import * as THREE from 'three';
import { LAYERS, STATIONS } from './content.js';
import { makeLabel } from './labels.js';
import { GLOSSARY } from './glossary.js';
import { buildEnvironment, DECK_HALF } from './environment.js';
import {
  OCEAN_TIME, seeded, pick, rand, withCaustics, makeOceanSky, makeWaterSurface, makeGodRays, makeMarineSnow,
  makeBubbles, makeReef, makeKelp, makeFishSchool, makeJellyfish, makeWhale, makeManta, swimAlong, loopCurve,
  rockGeometry, rockTexture, sandTexture,
} from './ocean.js';

// The world is the TCP/IP stack turned into an ocean: the sender's layers
// are coral reef terraces you walk *down*, the network is a deep trench of
// undersea cables and router stations you fly across, and the receiver's
// layers are terraces you climb back *up*.

export const PATH_HALF_WIDTH = 12.5;
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
  GW: 'Home router', R1: 'R1 · ISP', R2: 'R2', R3: 'R3', R4: 'R4 · backbone', R5: 'R5', R6: 'R6', SW: 'Server LAN',
};
export const LINKS = [['GW', 'R1'], ['R1', 'R2'], ['R1', 'R3'], ['R1', 'R4'], ['R1', 'R5'], ['R2', 'R4'], ['R3', 'R4'], ['R4', 'R6'], ['R4', 'SW'], ['R5', 'R2'], ['R6', 'SW']];
const NODE_Y = 1.2;
const SEABED_Y = -10;
const SHALLOW_FOG = '#0e5876';
const DEEP_FOG = '#03192b';

// What each terrace looks like, shown under the layer sign.
const ZONE_NAMES = {
  sender: { app: 'sunlit shallows', transport: 'kelp forest wreck', internet: 'seamount', link: 'cable station' },
  receiver: { app: 'server reef', transport: 'kelp forest wreck', internet: 'seamount', link: 'cable station' },
};

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

  // --- water, fog, light ---------------------------------------------------
  // The fog colour shifts from sunlit reef blue to trench black as the
  // camera moves over the network (see `update`).
  const fogColor = new THREE.Color(SHALLOW_FOG);
  scene.fog = new THREE.FogExp2(fogColor, 0.0095);
  scene.background = fogColor;
  const hemi = new THREE.HemisphereLight('#bdf3ff', '#0b2233', 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#e6fbff', 1.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const sky = makeOceanSky(fogColor);
  scene.add(sky);
  scene.add(makeWaterSurface(62));
  const rays = makeGodRays();
  scene.add(rays.group);
  scene.add(makeMarineSnow());

  // --- terrain -------------------------------------------------------------
  const cliffMat = withCaustics(new THREE.MeshStandardMaterial({ map: rockTexture(0.08, 0.08), roughness: 0.95, metalness: 0.05 }));
  for (const side of ['sender', 'receiver']) {
    const pts = PROFILE[side];
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], -40);
    pts.forEach(([x, y]) => shape.lineTo(x, y));
    shape.lineTo(pts[pts.length - 1][0], -40);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: DECK_HALF * 2, bevelEnabled: false });
    geo.translate(0, 0, -DECK_HALF);
    const mesh = new THREE.Mesh(geo, cliffMat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    walkables.push(mesh);
  }

  for (const p of PLATEAUS) {
    const layer = LAYERS[p.layer];
    const w = p.x1 - p.x0;
    const d = DECK_HALF * 2;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.2, d),
      withCaustics(new THREE.MeshStandardMaterial({
        map: sandTexture(layer.color, w / 9, d / 9),
        color: '#c4b69c',
        emissive: new THREE.Color(layer.color),
        emissiveIntensity: 0.05,
        roughness: 0.95,
      }), 1.2),
    );
    top.position.set((p.x0 + p.x1) / 2, p.h + 0.02, 0);
    top.receiveShadow = true;
    scene.add(top);
    walkables.push(top);

    // a glowing line of the layer's colour along both long edges
    for (const z of [-d / 2, d / 2]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: layer.color }));
      rim.position.set((p.x0 + p.x1) / 2, p.h + 0.1, z);
      scene.add(rim);
    }

    // big layer sign above the far edge
    const sign = makeLabel(`LAYER ${layer.num}\n${layer.name.toUpperCase()}`, { color: layer.color, size: 2.4, font: 800, border: layer.color, bg: 'rgba(2,20,34,0.72)' });
    sign.position.set((p.x0 + p.x1) / 2, p.h + 17, -DECK_HALF - 3);
    scene.add(sign);
    const pdu = makeLabel(`unit: ${layer.pdu} · ${ZONE_NAMES[p.side][p.layer]}`, { color: '#cff6ff', size: 1.1, bg: null });
    pdu.position.set((p.x0 + p.x1) / 2, p.h + 13.6, -DECK_HALF - 3);
    scene.add(pdu);
  }

  const sideTitle = (text, x, y = 32) => {
    const l = makeLabel(text, { color: '#ffffff', size: 3, font: 800, bg: null });
    l.position.set(x, y, -20);
    scene.add(l);
  };
  sideTitle('SENDER · diving DOWN the stack', -64);
  sideTitle('RECEIVER · rising UP the stack', 96);
  sideTitle('THE DEEP · the network', 21, 24);

  scene.add(makeLaptop());
  scene.add(makeDataPod(animated));

  // --- stations ------------------------------------------------------------
  const stationRock = withCaustics(new THREE.MeshStandardMaterial({ color: '#56606e', roughness: 0.9 }));
  for (const st of STATIONS) {
    if (st.side === 'network') continue;
    const x = STATION_X[st.id];
    const h = heightAt(x);
    const color = LAYERS[st.layer].color;
    const group = new THREE.Group();
    group.position.set(x, h, -5.5);

    const base = new THREE.Mesh(rockGeometry(x * 3 + 11, 2), stationRock);
    base.scale.set(2.1, 0.75, 2.1);
    base.position.y = 0.45;
    base.castShadow = true;
    group.add(base);
    group.add(makeReef([
      { kind: 'anemone', x: 1.4, y: 0.7, z: 0.8, s: 0.6, color },
      { kind: 'branch1', x: -1.3, y: 0.7, z: -0.9, s: 0.7, color: '#ff9671' },
      { kind: 'brain', x: -1.2, y: 0.6, z: 1.1, s: 0.35, color: '#c9d77a' },
    ]));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.25;
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

    const label = makeLabel(st.title, { color, size: 0.9, border: color, bg: 'rgba(2,20,34,0.78)' });
    label.position.y = 5;
    group.add(label);

    scene.add(group);
    const entry = { id: st.id, group, icon, beacon, position: new THREE.Vector3(x, h, -5.5), clickTargets: [base, icon] };
    stations.set(st.id, entry);
    animated.push((t) => {
      icon.rotation.y = t * 0.8;
      icon.position.y = 3 + Math.sin(t * 2 + x) * 0.2;
      beacon.material.opacity = beacon.visible ? 0.16 + Math.sin(t * 3) * 0.05 : 0;
    });
  }

  // --- gates: shimmering bubble curtains -----------------------------------
  for (const [id, x] of Object.entries(GATE_X)) {
    const st = STATIONS.find((s) => s.id === id);
    const color = LAYERS[st.layer].color;
    const h = heightAt(x - 0.5);
    const gate = new THREE.Group();
    gate.position.set(x, h, 0);
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(DECK_HALF * 2, 5.5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    );
    field.rotation.y = Math.PI / 2;
    field.position.y = 2.75;
    gate.add(field);
    const sources = [];
    for (let z = -DECK_HALF + 0.8; z < DECK_HALF; z += 1.2) sources.push({ x: 0, y: 0.1, z, spread: 0.15, top: 6 });
    const curtain = makeBubbles(sources, { perSource: 6, size: 0.1 });
    gate.add(curtain.mesh);
    for (const z of [-DECK_HALF, DECK_HALF]) {
      const post = new THREE.Mesh(rockGeometry(Math.abs(x) + (z > 0 ? 1 : 2)), stationRock);
      post.scale.set(0.9, 3.3, 0.9);
      post.position.set(0, 2.8, z);
      gate.add(post);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color }));
      bar.position.set(0, 0.2, z);
      gate.add(bar);
    }
    const lock = makeLabel('🔒 solve the station to pass', { color: '#fff', size: 0.7, bg: 'rgba(2,20,34,0.78)' });
    lock.position.y = 6.3;
    gate.add(lock);
    scene.add(gate);
    gates.set(id, { x, group: gate, field, open: false });
    animated.push((t, dt) => {
      if (!gate.visible) return;
      field.material.opacity = 0.14 + Math.sin(t * 4 + x) * 0.06;
      curtain.update(t, dt);
    });
  }

  // --- the deep: seabed, trench life and the network -----------------------
  scene.add(makeSeabed(animated));

  const cableMat = new THREE.MeshBasicMaterial({ color: '#4be1ff', transparent: true, opacity: 0.55 });
  const sheathMat = new THREE.MeshStandardMaterial({ color: '#1a222c', roughness: 0.6, metalness: 0.5, transparent: true, opacity: 0.55 });
  const cables = new Map();
  const addCable = (a, b, key) => {
    const curve = new THREE.LineCurve3(a, b);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 1, 0.12, 8), cableMat.clone());
    scene.add(mesh);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 1, 0.24, 10), sheathMat));
    if (key) cables.set(key, mesh);
  };
  addCable(new THREE.Vector3(-2, 0.3, 0), nodePosition('GW'), 'LAN-GW');
  addCable(nodePosition('SW'), new THREE.Vector3(44, 0.3, 0), 'SW-LAN');
  for (const [a, b] of LINKS) addCable(nodePosition(a), nodePosition(b), `${a}-${b}`);

  const podMat = new THREE.MeshStandardMaterial({ color: '#d7dde6', metalness: 0.7, roughness: 0.3 });
  const domeMat = new THREE.MeshStandardMaterial({ color: '#6fe6ff', emissive: '#0f6c8a', emissiveIntensity: 0.9, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.3 });
  const pillarMat = withCaustics(new THREE.MeshStandardMaterial({ map: rockTexture(0.6, 2, '#3a404c'), roughness: 1 }), 0.6);
  const ventSources = [];
  for (const id of Object.keys(NODES)) {
    const pos = nodePosition(id);
    const g = new THREE.Group();
    g.position.copy(pos);
    // a rock pinnacle rising from the seabed holds each station
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.9, 11.6, 9, 4), pillarMat);
    pillar.position.y = -6.4;
    g.add(pillar);
    const isSwitch = id === 'SW';
    const body = new THREE.Mesh(
      isSwitch ? new THREE.BoxGeometry(3, 0.9, 2) : new THREE.CylinderGeometry(1.6, 1.7, 0.9, 32),
      new THREE.MeshStandardMaterial({ color: '#2f5bd8', metalness: 0.6, roughness: 0.3, emissive: '#10258a', emissiveIntensity: 0.5 }),
    );
    body.castShadow = true;
    g.add(body);
    if (!isSwitch) {
      // a bathysphere dome with portholes, like a deep-sea research station
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
      dome.position.y = 0.45;
      g.add(dome);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const port = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), new THREE.MeshBasicMaterial({ color: '#ffe9a8' }));
        port.position.set(Math.cos(a) * 1.71, 0, Math.sin(a) * 1.71);
        port.lookAt(port.position.clone().multiplyScalar(2));
        g.add(port);
      }
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.08, 6, 32), podMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = -0.45;
      g.add(rim);
      const arrows = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#bfe9ff' }));
      arrows.rotation.x = Math.PI / 2;
      arrows.position.y = 0.48;
      g.add(arrows);
      animated.push((t) => { arrows.rotation.z = t; });
    }
    const label = makeLabel(NODE_LABELS[id], { color: '#bfe9ff', size: 0.75, bg: 'rgba(2,20,34,0.78)' });
    label.position.y = 2.3;
    g.add(label);
    const beacon = makeBeacon('#4be1ff');
    beacon.visible = false;
    g.add(beacon);
    scene.add(g);
    routers.set(id, { id, group: g, beacon, body });
    animated.push(() => { beacon.material.opacity = beacon.visible ? 0.2 : 0; });
    ventSources.push({ x: pos.x + 1.4, y: -9.5, z: pos.z + 1.2, spread: 0.25, top: pos.y + 30 });
  }
  const vents = makeBubbles(ventSources, { perSource: 16, size: 0.13 });
  scene.add(vents.mesh);
  animated.push((t, dt) => vents.update(t, dt));

  scene.add(makeBitPlankton(animated));
  scene.add(makeTraffic(animated));
  scene.add(makeSeaLife(animated));

  const env = buildEnvironment(scene, PLATEAUS, animated);
  const colliders = [
    ...env.colliders,
    { x: -119, z: -13, r: 4 }, // laptop
    { x: 141, z: -11.6, r: 2.2 }, // data centre pod
    { x: 141, z: -7.4, r: 2.2 },
  ];

  // Current pads (explore mode): step on one to ride across the network.
  const ferries = new Map();
  for (const [side, x] of [['sender', -5], ['receiver', 57]]) {
    const pad = new THREE.Group();
    pad.position.set(x, heightAt(x) + 0.12, 8);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 40), new THREE.MeshBasicMaterial({ color: '#4be1ff', transparent: true, opacity: 0.7 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true }));
    ring.rotation.x = Math.PI / 2;
    const label = makeLabel(side === 'sender' ? 'Ride the current → server side' : 'Ride the current → Alice\'s side', { size: 0.5, color: '#bfe9ff' });
    label.position.y = 2.2;
    const jet = makeBubbles([{ x: 0, y: 0, z: 0, spread: 0.9, top: 7 }], { perSource: 30, size: 0.12 });
    pad.add(disc, ring, label, jet.mesh);
    pad.visible = false;
    scene.add(pad);
    ferries.set(side, { side, group: pad, position: pad.position });
    animated.push((t, dt) => {
      if (!pad.visible) return;
      ring.position.y = 0.3 + ((t * 0.8) % 1) * 1.5;
      ring.material.opacity = 1 - ((t * 0.8) % 1);
      jet.update(t, dt);
    });
  }

  // --- knowledge pearls ----------------------------------------------------
  // Each glossary card is a glowing pearl in a clam that breathes open.
  const orbs = new Map();
  const clamMat = new THREE.MeshStandardMaterial({ color: '#a7d3d9', roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide });
  const halfShell = new THREE.SphereGeometry(0.75, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  halfShell.scale(1, 0.45, 0.85);
  for (const entry of GLOSSARY) {
    const color = LAYERS[entry.layer].color;
    const g = new THREE.Group();
    g.position.set(entry.x, heightAt(entry.x), entry.z);
    const lower = new THREE.Mesh(halfShell, clamMat);
    lower.rotation.x = Math.PI;
    lower.position.y = 0.35;
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.35, -0.62);
    const upper = new THREE.Mesh(halfShell, clamMat);
    upper.position.z = 0.62;
    hinge.add(upper);
    const gem = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 1.3, roughness: 0.15, metalness: 0.3, transparent: true }),
    );
    gem.position.y = 0.6;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.04, 8, 40), new THREE.MeshBasicMaterial({ color, transparent: true }));
    halo.position.y = 1.1;
    const q = makeLabel('?', { size: 0.9, color, bg: null, font: 900 });
    q.position.y = 2.4;
    const beacon = makeBeacon(color);
    beacon.visible = false;
    g.add(lower, hinge, gem, halo, q, beacon);
    scene.add(g);
    orbs.set(entry.id, { entry, group: g, gem, halo, beacon, collected: false });
    const phase = entry.x * 0.37;
    animated.push((t) => {
      if (!g.visible) return;
      const open = 0.5 + Math.sin(t * 0.9 + phase) * 0.35;
      hinge.rotation.x = -open;
      gem.position.y = 0.45 + open * 0.5;
      halo.rotation.x = Math.PI / 2 + Math.sin(t + phase) * 0.4;
      halo.position.y = 1.1 + Math.sin(t * 2 + phase) * 0.2;
      q.position.y = 2.4 + Math.sin(t * 2 + phase) * 0.15;
      beacon.material.opacity = beacon.visible ? 0.22 + Math.sin(t * 6) * 0.08 : 0;
    });
  }

  const deepFog = new THREE.Color(DEEP_FOG);
  const shallowFog = new THREE.Color(SHALLOW_FOG);
  let depth = 0;

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
    // How "deep" the view is: 0 over the reefs, 1 over the middle of the trench.
    get depth() { return depth; },
    update(t, dt, camera) {
      OCEAN_TIME.value = t;
      for (const fn of animated) fn(t, dt);
      if (camera) {
        rays.update(t, camera);
        sky.position.copy(camera.position);
        const over = THREE.MathUtils.smoothstep(26 - Math.abs(camera.position.x - 21), 0, 14);
        const low = THREE.MathUtils.smoothstep(-camera.position.y, -6, 6);
        const goal = Math.max(over, low);
        depth += (goal - depth) * Math.min(1, (dt ?? 0.016) * 1.5);
        fogColor.copy(shallowFog).lerp(deepFog, depth);
        scene.fog.density = 0.0095 + depth * 0.004;
        sun.intensity = 1.4 - depth * 0.9;
        hemi.intensity = 1.0 - depth * 0.45;
      }
    },
  };
}

// Other people's packets zipping along every cable: little glowing pulses.
function makeTraffic(animated) {
  const adjacency = {};
  for (const [a, b] of LINKS) {
    (adjacency[a] ??= []).push(b);
    (adjacency[b] ??= []).push(a);
  }
  const ids = Object.keys(adjacency);
  const count = 48;
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.2, 10, 8),
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
      m.makeTranslation(a.x, a.y, a.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}

// The sea floor all around: sand, boulders, rock spires, kelp forests and,
// down in the trench, glowing specks and hydrothermal vents.
function makeSeabed(animated) {
  const group = new THREE.Group();
  const floorTex = sandTexture('#2a5a78', 70, 70);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    withCaustics(new THREE.MeshStandardMaterial({ map: floorTex, color: '#8aa0a8', roughness: 1 }), 0.8),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(10, SEABED_Y, 0);
  floor.receiveShadow = true;
  group.add(floor);

  const rnd = seeded(42);
  const items = [];
  const kelp = [];
  for (let i = 0; i < 260; i++) {
    const x = -170 + rnd() * 360;
    const side = rnd() < 0.5 ? -1 : 1;
    let z = side * (DECK_HALF + 4 + rnd() * 90);
    const r = rnd();
    // keep tall things out of the usual camera spot on the near side
    if (side > 0 && r >= 0.28) z = Math.max(z, 55 + rnd() * 40);
    if (r < 0.28) {
      items.push({ kind: pick(['rock', 'rock2']), x, y: SEABED_Y + 1, z, s: [3 + rnd() * 7, 2 + rnd() * 5, 3 + rnd() * 6] });
    } else if (r < 0.4) {
      // tall rock spires, like distant seamounts in the haze
      items.push({ kind: pick(['rock', 'rock2']), x, y: SEABED_Y + 6, z: z * 1.4, s: [3 + rnd() * 4, 10 + rnd() * 22, 3 + rnd() * 4] });
    } else if (r < 0.62) {
      items.push({ kind: pick(['branch0', 'branch1', 'branch2']), x, y: SEABED_Y, z, s: 2 + rnd() * 3 });
    } else if (r < 0.72) {
      items.push({ kind: 'sponge', x, y: SEABED_Y, z, s: 2 + rnd() * 2.5, color: pick(['#ff8c42', '#b36bff', '#5fd1c7']) });
    } else {
      for (let k = 0; k < 5; k++) kelp.push([x + rnd() * 6, SEABED_Y, z + rnd() * 6, 1.2 + rnd() * 0.9]);
    }
  }
  group.add(makeReef(items));
  group.add(makeKelp(kelp, { height: 18, color: '#5d7a2a' }));

  // glowing plankton specks on the trench floor under the network
  const n = 900;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const palette = ['#4be1ff', '#7dffb2', '#b56cff'].map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    pos.set([-4 + rnd() * 52, SEABED_Y + 0.2 + rnd() * 3, -40 + rnd() * 80], i * 3);
    const c = palette[i % 3];
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const specks = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(specks);
  animated.push((t) => { specks.material.opacity = 0.55 + Math.sin(t * 0.8) * 0.25; });

  // hydrothermal vent chimneys glowing orange
  const chimneyMat = withCaustics(new THREE.MeshStandardMaterial({ map: rockTexture(0.5, 1, '#2e2a29'), roughness: 1, emissive: '#ff5a1f', emissiveIntensity: 0.04 }), 0.3);
  const ventSpots = [[10, -26], [30, 24], [20, -8], [36, 8], [6, 14]];
  const ventBubbles = [];
  for (const [x, z] of ventSpots) {
    const h = 3 + rnd() * 4;
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.5, h, 8, 3), chimneyMat);
    chimney.position.set(x, SEABED_Y + h / 2, z);
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff7b2e' }));
    mouth.position.set(x, SEABED_Y + h, z);
    group.add(chimney, mouth);
    const light = new THREE.PointLight('#ff6a2b', 25, 18, 1.6);
    light.position.set(x, SEABED_Y + h + 1, z);
    group.add(light);
    ventBubbles.push({ x, y: SEABED_Y + h, z, spread: 0.3, top: 45 });
    const ph = x;
    animated.push((t) => { light.intensity = 22 + Math.sin(t * 5 + ph) * 5 + Math.sin(t * 13 + ph) * 3; });
  }
  const vb = makeBubbles(ventBubbles, { perSource: 26, size: 0.16 });
  group.add(vb.mesh);
  animated.push((t, dt) => vb.update(t, dt));
  return group;
}

// Whale, rays, jellyfish and fish shoals that make the water feel alive.
function makeSeaLife(animated) {
  const group = new THREE.Group();

  // a humpback cruising high above the whole world
  const whale = makeWhale();
  whale.group.scale.setScalar(1.6);
  group.add(whale.group);
  const whalePath = loopCurve([
    [-120, 40, -40], [-20, 46, -60], [80, 42, -55], [170, 38, -20], [120, 44, 30], [20, 48, 45], [-90, 42, 25],
  ]);
  animated.push(swimAlong(whale, whalePath, 150));

  // manta rays gliding over the trench
  [[0, 0.4], [0.5, 0.9]].forEach(([offset, scale], i) => {
    const ray = makeManta(i ? '#243446' : '#1a2536');
    ray.group.scale.setScalar(1.5 + scale);
    group.add(ray.group);
    const path = loopCurve([[0, 14 + i * 4, -22], [22, 18 + i * 3, -30], [44, 13 + i * 5, -18], [36, 16, 16], [14, 20 - i * 3, 24], [-4, 15, 6]]);
    animated.push(swimAlong(ray, path, 55 + i * 20, offset));
  });

  // bioluminescent jellyfish drifting in the deep
  const jellyColors = ['#ff6fd8', '#6fe6ff', '#b56cff', '#7dffb2', '#ffd166'];
  for (let i = 0; i < 18; i++) {
    const jelly = makeJellyfish(jellyColors[i % jellyColors.length], rand(0.45, 0.9));
    const home = new THREE.Vector3(rand(-2, 46), rand(-7, 9), rand(-28, 28));
    if (Math.abs(home.z) < 4) home.z += 8 * Math.sign(home.z || 1);
    jelly.group.position.copy(home);
    group.add(jelly.group);
    let rise = 0;
    const drift = rand(0, 6);
    animated.push((t, dt = 1 / 60) => {
      rise += (jelly.pulse(t) * 1.1 - 0.35) * dt;
      rise = THREE.MathUtils.clamp(rise, -2, 2.5);
      jelly.group.position.set(home.x + Math.sin(t * 0.13 + drift) * 2, home.y + rise, home.z + Math.cos(t * 0.11 + drift) * 2);
      jelly.update(t);
    });
  }
  // and a few more over the reefs, high up
  for (const x of [-105, -60, 90, 130]) {
    const jelly = makeJellyfish('#c9b5ff', 0.6);
    const home = new THREE.Vector3(x, 26, rand(-20, -10));
    group.add(jelly.group);
    animated.push((t) => {
      jelly.group.position.set(home.x + Math.sin(t * 0.1 + x) * 3, home.y + Math.sin(t * 0.3 + x) * 1.5, home.z);
      jelly.update(t);
    });
  }

  // big shoals out in open water
  const shoals = [
    { center: new THREE.Vector3(21, 12, -30), radius: 16, count: 70, colors: ['#c9f0ff', '#8fd3ff', '#e7fbff'], size: 0.7, speed: 0.22 },
    { center: new THREE.Vector3(-70, 30, 30), radius: 18, count: 55, colors: ['#ffd166', '#ffe29a'], size: 0.65, speed: -0.18 },
    { center: new THREE.Vector3(110, 30, 32), radius: 18, count: 55, colors: ['#ff8a5b', '#ffc3a0'], size: 0.65, speed: 0.2 },
  ];
  for (const s of shoals) {
    const school = makeFishSchool({ ...s, height: 3, flatten: 0.5 });
    group.add(school.mesh);
    animated.push((t) => school.update(t));
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

// Glowing 0/1 plankton rising out of the trench.
function makeBitPlankton(animated) {
  const group = new THREE.Group();
  const mk = (ch) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#7ff3ff';
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 32, 34);
    const t = new THREE.CanvasTexture(c);
    return new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  };
  const mats = [mk('0'), mk('1')];
  const bits = [];
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Sprite(mats[i % 2]);
    s.scale.setScalar(0.7);
    s.position.set(-2 + Math.random() * 46, SEABED_Y + Math.random() * 16, -25 + Math.random() * 50);
    s.userData.speed = 0.3 + Math.random() * 0.8;
    s.userData.x = s.position.x;
    group.add(s);
    bits.push(s);
  }
  animated.push((t, dt = 1 / 60) => {
    for (const b of bits) {
      b.position.y += b.userData.speed * dt;
      b.position.x = b.userData.x + Math.sin(t + b.userData.speed * 9) * 0.4;
      if (b.position.y > 6) b.position.y = SEABED_Y;
    }
  });
  return group;
}

function makeLaptop() {
  const g = new THREE.Group();
  // At the start of the path, screen turned towards the player, among coral.
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
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(11, 7), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.set(0, 4.2, -3.78);
  screen.rotation.x = -0.15;
  g.add(screen);
  g.add(makeReef([
    { kind: 'branch0', x: 6.5, y: 0, z: 1, s: 1.4, color: '#ff6f91' },
    { kind: 'sponge', x: -6.8, y: 0, z: -2, s: 1.6, color: '#b36bff' },
    { kind: 'brain', x: 5.5, y: 0, z: -3.5, s: 0.9, color: '#e8a87c' },
    { kind: 'anemone', x: -5.5, y: 0, z: 3, s: 1, color: '#ffc75f' },
  ]));
  return g;
}

// The server lives in an underwater data centre pod. (Microsoft really
// tested this: Project Natick ran servers on the sea floor off Scotland.)
function makeDataPod(animated) {
  const g = new THREE.Group();
  g.position.set(141, 15, -9.5);
  const hullMat = withCaustics(new THREE.MeshStandardMaterial({ color: '#e4e9ef', metalness: 0.5, roughness: 0.35 }), 0.8);
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 7, 32), hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.position.y = 2.6;
  g.add(hull);
  for (const z of [-3.5, 3.5]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hullMat);
    cap.rotation.x = z > 0 ? Math.PI / 2 : -Math.PI / 2;
    cap.scale.y = 0.45;
    cap.position.set(0, 2.6, z);
    g.add(cap);
  }
  for (const z of [-2.4, 2.4]) {
    const cradle = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1, 0.6), new THREE.MeshStandardMaterial({ color: '#39424e', metalness: 0.7 }));
    cradle.position.set(0, 0.5, z);
    g.add(cradle);
  }
  const leds = [];
  for (let i = 0; i < 10; i++) {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color: i % 3 ? '#35d07f' : '#4be1ff' }));
    led.position.set(-2.02, 2.1 + (i % 2) * 0.8, -3 + Math.floor(i / 2) * 1.5);
    g.add(led);
    leds.push(led);
  }
  animated.push((t) => leds.forEach((l, i) => { l.visible = Math.sin(t * 6 + i * 1.7) > -0.2; }));
  const label = makeLabel('catpics.example\n203.0.113.80', { size: 1, color: '#e8ddff' });
  label.position.set(0, 7.4, 0);
  g.add(label);
  const fact = makeLabel('Underwater data centre pod\n(a real experiment: Project Natick)', { size: 0.34, color: '#bfe9ff', bg: 'rgba(3,24,40,0.8)' });
  fact.position.set(0, 5.6, 0);
  g.add(fact);
  return g;
}
