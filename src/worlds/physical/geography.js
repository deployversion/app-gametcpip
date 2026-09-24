import * as THREE from 'three';
import { makeLabel } from '../../shared/labels.js';
import { makeWater } from './effects.js';
import { RX, NET_MID } from './layout.js';

// The network as it physically exists: Alice's street with its overhead
// line and street cabinet, the ISP exchange, a coast with cable landing
// stations, an ocean crossed by undersea fibre, a satellite, a mobile mast
// with a microwave link, and a data-centre campus on the far shore.
//
// Routers keep their ids (GW, R1…), so the lesson content is unchanged; they
// just stand at real-world kinds of places now.

// Positions below are written for a layout where the far shore starts at
// x = 96; X() stretches the ocean and moves everything east of it along
// with the receiver's side (see RX in layout.js).
const E = RX - 80;
const X = (x) => (x <= 46 ? x : x < 96 ? 46 + ((x - 46) * (50 + E)) / 50 : x + E);

export const NODES = {
  GW: [6, 0],
  R1: [24, 2],
  R2: [36, -24],
  R3: [38, 24],
  R4: [X(106), 0],
  R5: [14, -20],
  R6: [X(112), -22],
  SW: [X(118), 6],
};
const NODE_Y = 1.2;
export const WATER_Y = -1.6;

const NODE_LABELS = {
  GW: 'Home router',
  R1: 'R1 · ISP exchange',
  R2: 'R2 · Internet exchange',
  R3: 'R3 · Satellite station',
  R4: 'R4 · Backbone, far shore',
  R5: 'R5 · Mobile network',
  R6: 'R6 · Another network',
  SW: 'Data centre switch',
};

// Every link as a list of waypoints [x, y, z] from its first node to its
// second. `kind` decides how it looks: fibre is buried along the ground,
// pole is an overhead line, subsea runs along the sea floor, and radio,
// microwave and sat are straight beams through the air.
const n = (id) => [NODES[id][0], NODE_Y, NODES[id][1]];
const LINK_DEFS = {
  'LAN-GW': { kind: 'radio', pts: [[-2, 1.4, 0], n('GW')] },
  'SW-LAN': { kind: 'fibre', pts: [n('SW'), [121, 0.35, 3], [44 + RX, 0.3, 0]] },
  'GW-R1': { kind: 'pole', pts: [n('GW'), [9, 4.6, 0.4], [16, 4.6, 1.2], [21, 4.6, 1.8], n('R1')] },
  'R1-R2': { kind: 'fibre', pts: [n('R1'), [28, 0.35, -8], [33, 0.35, -18], n('R2')] },
  'R1-R3': { kind: 'fibre', pts: [n('R1'), [30, 0.35, 12], [35, 0.35, 19], n('R3')] },
  'R1-R4': {
    kind: 'subsea',
    pts: [n('R1'), [33, 0.35, 1.6], [41, 0.3, 0.8], [46.5, -0.6, 0.3], [51, -6, 0], [57, -11.4, -0.6], [70, -12.4, 1.5], [84, -12, -1], [91, -7, 0], [96, -0.6, 0], [101, 0.35, 0], n('R4')],
  },
  'R1-R5': { kind: 'fibre', pts: [n('R1'), [20, 0.35, -8], [16, 0.35, -15], n('R5')] },
  'R2-R4': {
    kind: 'subsea',
    pts: [n('R2'), [42, 0.3, -24], [47, -2.5, -23], [53, -11, -21], [72, -12.6, -15], [88, -11.6, -7], [94.5, -2.5, -4], [99, 0.3, -2.5], n('R4')],
  },
  'R3-R4': { kind: 'sat', pts: [n('R3'), [41, 6.2, 29], [72, 54, 34], [100, 6.2, 9], n('R4')] },
  'R4-R6': { kind: 'fibre', pts: [n('R4'), [109, 0.35, -9], [111, 0.35, -16], n('R6')] },
  'R4-SW': { kind: 'fibre', pts: [n('R4'), [110, 0.35, 2], [114, 0.35, 5], n('SW')] },
  'R5-R2': { kind: 'microwave', pts: [n('R5'), [14, 12.2, -23.5], [36, 12.2, -28.5], n('R2')] },
  'R6-SW': { kind: 'fibre', pts: [n('R6'), [115, 0.35, -12], [117, 0.35, -3], n('SW')] },
};
for (const def of Object.values(LINK_DEFS)) {
  def.pts = def.pts.map(([x, y, z], i) => [i === 0 || i === def.pts.length - 1 ? x : X(x), y, z]);
}
export const LINKS = Object.keys(LINK_DEFS).filter((k) => !k.includes('LAN')).map((k) => k.split('-'));

const KIND_STYLE = {
  fibre: { color: '#4be1ff', radius: 0.14, opacity: 0.6 },
  pole: { color: '#4be1ff', radius: 0.09, opacity: 0.75 },
  subsea: { color: '#4be1ff', radius: 0.2, opacity: 0.8 },
  radio: { color: '#ffd166', radius: 0.07, opacity: 0.4 },
  microwave: { color: '#ffd166', radius: 0.07, opacity: 0.45 },
  sat: { color: '#ffd166', radius: 0.1, opacity: 0.4 },
};

// Narration for the explore-mode tour, one line per hop.
export const TOUR = {
  'LAN-GW': 'Wi-Fi: radio waves from Alice\'s laptop to her home router.',
  'GW-R1': 'An overhead line and a street cabinet link the house to the ISP.',
  'R1-R4': 'Down the beach and along the sea floor: an undersea fibre cable, thousands of km long.',
  'R4-SW': 'Buried fibre from the far-shore backbone into the data centre.',
  'SW-LAN': 'Into the meet-me room of the catpics data centre.',
};

// ---------------------------------------------------------------- terrain
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const coastW = (z) => 46 + Math.sin(z * 0.07) * 3 + Math.sin(z * 0.19 + 1.3) * 1.4;
const coastE = (z) => X(96) + Math.sin(z * 0.06 + 2) * 3 + Math.sin(z * 0.17) * 1.2;

export function groundAt(x, z) {
  const far = smooth(26, 70, Math.abs(z));
  const land = -0.05 + far * (5 + Math.sin(x * 0.05) * 3 + Math.sin(z * 0.07 + x * 0.03) * 3.5);
  const sea = -12.8 + Math.sin(x * 0.13 + z * 0.05) * 0.9 + Math.sin(z * 0.09) * 1.1;
  const s = smooth(coastW(z) - 2, coastW(z) + 9, x) * (1 - smooth(coastE(z) - 9, coastE(z) + 2, x));
  return land + (sea - land) * s;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2, ...extra });
}

function glow(color, intensity = 2) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Building facade: dark wall with a grid of warm or cool lit windows.
function facadeTexture(lit, rows = 8, cols = 6, seed = 1) {
  const rnd = mulberry32(seed);
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1c2130';
    ctx.fillRect(0, 0, w, h);
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = rnd() < 0.55 ? lit : '#0e1220';
        ctx.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.25, cw * 0.56, ch * 0.5);
      }
    }
  });
}

export function makeBeacon(color) {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 60, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  beacon.position.y = 30;
  return beacon;
}

function building(group, { x, z, w, h, d, lit = '#ffcf7a', roof = '#2a3040', seed = 1, rotY = 0 }) {
  const tex = facadeTexture(lit, Math.max(2, Math.round(h / 1.6)), Math.max(2, Math.round(w / 1.8)), seed);
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, std(roof), std(roof), mat, mat]);
  const y = groundAt(x, z);
  body.position.set(x, y + h / 2, z);
  body.rotation.y = rotY;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  return body;
}

function label(group, text, x, y, z, opts = {}) {
  const l = makeLabel(text, { size: 0.7, color: '#e9f1ff', ...opts });
  l.position.set(x, y, z);
  group.add(l);
  return l;
}

// ------------------------------------------------------------------- build
export function buildGeography(scene, animated, nodePosition) {
  const group = new THREE.Group();
  scene.add(group);
  const rnd = mulberry32(42);

  // --- ground and sea ----------------------------------------------------
  const W = 560;
  const D = 380;
  const groundGeo = new THREE.PlaneGeometry(W, D, 280, 190);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cSea = new THREE.Color('#123241');
  const cSeaDeep = new THREE.Color('#0a1d2c');
  const cSand = new THREE.Color('#7d7152');
  const cGrass = new THREE.Color('#1f3a26');
  const cHill = new THREE.Color('#1a2c24');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + NET_MID;
    const z = pos.getZ(i);
    const y = groundAt(x, z);
    pos.setY(i, y);
    if (y < -8) c.copy(cSeaDeep).lerp(cSea, (y + 13.5) / 5.5);
    else if (y < 0.4 && x > 34 && x < X(108)) c.copy(cSea).lerp(cSand, smooth(-6, -0.4, y));
    else c.copy(cGrass).lerp(cHill, Math.min(1, y / 9)).offsetHSL(0, 0, (rnd() - 0.5) * 0.02);
    c.toArray(colors, i * 3);
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  ground.position.x = NET_MID;
  ground.receiveShadow = true;
  group.add(ground);

  const water = makeWater(W, D);
  water.mesh.position.set(NET_MID, WATER_Y, 0);
  group.add(water.mesh);
  animated.push((t) => water.update(t));

  // --- links -------------------------------------------------------------
  const curves = new Map();
  const cables = new Map();
  for (const [key, def] of Object.entries(LINK_DEFS)) {
    const pts = def.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    let curve;
    if (['radio', 'microwave', 'sat'].includes(def.kind)) {
      curve = new THREE.CurvePath();
      for (let i = 1; i < pts.length; i++) curve.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
    } else {
      curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    }
    curves.set(key, curve);
    const style = KIND_STYLE[def.kind];
    const segs = def.kind === 'subsea' ? 160 : 64;
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, segs, style.radius, 8),
      new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: def.kind === 'subsea' }),
    );
    mesh.userData.color = style.color;
    group.add(mesh);
    cables.set(key, mesh);
    if (def.kind === 'subsea') {
      // an armoured dark jacket around the glowing fibre, and repeaters
      const jacket = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, style.radius * 1.9, 8), std('#0c0f16', { transparent: true, opacity: 0.55, depthWrite: false }));
      group.add(jacket);
      addRepeaters(group, animated, curve);
    }
    if (def.kind === 'pole') {
      for (const p of pts.slice(1, -1)) utilityPole(group, p);
    }
  }

  // --- routers -----------------------------------------------------------
  const routers = new Map();
  for (const id of Object.keys(NODES)) {
    const p = nodePosition(id);
    const g = new THREE.Group();
    g.position.copy(p);
    const gy = groundAt(p.x, p.z);
    const plinthH = Math.max(0.2, p.y - gy - 0.55);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, plinthH, 24), std('#565d6b', { roughness: 0.9 }));
    plinth.position.y = -0.55 - plinthH / 2;
    plinth.receiveShadow = true;
    g.add(plinth);
    const isSwitch = id === 'SW';
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(isSwitch ? 3.2 : 2.6, isSwitch ? 0.7 : 1.1, 1.8),
      std('#1d2233', { metalness: 0.7, roughness: 0.35, emissive: '#0c1a40', emissiveIntensity: 0.6 }),
    );
    body.castShadow = true;
    g.add(body);
    // a row of port LEDs on the front
    const leds = [];
    for (let i = 0; i < 6; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: i % 3 ? '#35d07f' : '#4be1ff' }));
      led.position.set(-1 + i * 0.4, 0.1, 0.92);
      g.add(led);
      leds.push(led);
    }
    animated.push((t) => leds.forEach((l, i) => { l.visible = Math.sin(t * 8 + i * 2.1 + p.x) > -0.4; }));
    if (!isSwitch) {
      const arrows = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#bfe9ff' }));
      arrows.rotation.x = Math.PI / 2;
      arrows.position.y = 0.6;
      g.add(arrows);
      animated.push((t) => { arrows.rotation.z = t; });
    }
    const l = makeLabel(NODE_LABELS[id], { color: '#bfe9ff', size: 0.75 });
    l.position.y = 2.2;
    g.add(l);
    const beacon = makeBeacon('#4be1ff');
    beacon.visible = false;
    g.add(beacon);
    scene.add(g);
    routers.set(id, { id, group: g, beacon, body });
    animated.push(() => { beacon.material.opacity = beacon.visible ? 0.2 : 0; });
  }

  // --- places ------------------------------------------------------------
  buildAliceStreet(group, animated, rnd);
  buildCoast(group, animated);
  buildSky(group, animated);
  buildOcean(group, animated, rnd);
  buildFarShore(group, animated, rnd);
  scene.add(makeTraffic(animated, curves));

  const linkPath = (a, b, count = 48) => {
    const fwd = curves.get(`${a}-${b}`);
    const curve = fwd ?? curves.get(`${b}-${a}`);
    const pts = curve.getSpacedPoints(count);
    return fwd ? pts : pts.reverse();
  };

  return { cables, routers, linkPath, landmarks: TOUR };
}

// ------------------------------------------------------------ Alice's side
function buildAliceStreet(group, animated, rnd) {
  // Alice's house, right behind her home router
  building(group, { x: 3, z: -9, w: 8, h: 4.6, d: 6, lit: '#ffcf7a', seed: 3 });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6, 3, 4), std('#5a2f2a'));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.75);
  roof.position.set(3, 4.6 + 1.5, -9);
  group.add(roof);
  label(group, "Alice's house", 3, 9, -9, { color: '#ffe7a8' });

  // the street, with a dashed centre line
  const roadTex = canvasTexture(256, 32, (ctx, w, h) => {
    ctx.fillStyle = '#22252c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8d9a0';
    for (let x = 8; x < w; x += 48) ctx.fillRect(x, h / 2 - 1.5, 24, 3);
  });
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.repeat.set(6, 1);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(46, 4.5), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(20, 0.03, 9);
  road.receiveShadow = true;
  group.add(road);

  // street lamps along the road
  const lampXs = [];
  for (let x = 0; x < 42; x += 7) lampXs.push(x);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.11, 3.6, 6), std('#7d8599', { metalness: 0.7 }), lampXs.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 12, 8), glow('#ffcf7a', 3), lampXs.length);
  const m = new THREE.Matrix4();
  lampXs.forEach((x, i) => {
    m.makeTranslation(x, 1.8, 11.6);
    poles.setMatrixAt(i, m);
    m.makeTranslation(x, 3.65, 11.6);
    heads.setMatrixAt(i, m);
  });
  group.add(poles, heads);

  // the street cabinet where the neighbourhood's fibre meets
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2, 0.9), std('#2f5a3a', { metalness: 0.3 }));
  cab.position.set(14, 1, -2.4);
  cab.castShadow = true;
  const cabLed = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.05), new THREE.MeshBasicMaterial({ color: '#35d07f' }));
  cabLed.position.set(14.4, 1.7, -1.93);
  group.add(cab, cabLed);
  animated.push((t) => { cabLed.visible = Math.sin(t * 5) > 0; });
  label(group, 'Street cabinet', 14, 3, -2.4, { size: 0.5 });

  // the ISP exchange behind R1
  building(group, { x: 24, z: -8, w: 11, h: 6.5, d: 6, lit: '#bfe9ff', seed: 5 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 6, 6), std('#9aa4c0', { metalness: 0.8 }));
  mast.position.set(27, 9.5, -8);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glow('#ff4d6d', 4));
  tip.position.set(27, 12.6, -8);
  group.add(mast, tip);
  animated.push((t) => { tip.visible = Math.sin(t * 2.5) > 0; });
  label(group, 'ISP exchange\nyour provider\'s routers live here', 24, 14.4, -8, { size: 0.55 });

  // the mobile mast at R5 and the microwave tower at R2
  lattice(group, 14, -23.5, 12, animated);
  lattice(group, 36, -28.5, 12, animated);
  label(group, 'Microwave link\nradio between towers', 25, 15, -26, { size: 0.5, color: '#ffe7a8' });
  building(group, { x: 32, z: -33, w: 12, h: 5, d: 6, lit: '#bfe9ff', seed: 11 });
  label(group, 'Internet exchange point\nnetworks swap traffic here', 32, 8.8, -33, { size: 0.55 });

  // the satellite ground station at R3
  dish(group, 41, 29, -0.9, animated);
  label(group, 'Satellite ground station', 41, 9.5, 29, { size: 0.55 });

  // neighbourhood: houses and trees, instanced
  const avoid = [[3, -9, 7], [24, -8, 9], [14, -23, 5], [36, -28, 5], [32, -33, 9], [41, 29, 7], [14, -2, 3]];
  for (const [x, z] of Object.values(NODES)) avoid.push([x, z, 5]);
  const houses = [];
  for (let tries = 0; houses.length < 34 && tries < 600; tries++) {
    const x = -10 + rnd() * 52;
    const z = (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 55);
    if (x > coastW(z) - 6) continue;
    if (Math.abs(z - 9) < 4.5) continue;
    if (x > -26 && x < -1 && Math.abs(z) < 22) continue; // the laptop
    if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r + 3)) continue;
    if (houses.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 6)) continue;
    houses.push([x, z, rnd()]);
  }
  addHouses(group, houses);
  const trees = [];
  for (let tries = 0; trees.length < 90 && tries < 1500; tries++) {
    const x = -40 + rnd() * 82;
    const z = (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 70);
    if (x > coastW(z) - 4) continue;
    if (Math.abs(z - 9) < 3.5) continue;
    if (x > -126 && x < -1 && Math.abs(z) < 21) continue;
    if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r + 1.5)) continue;
    if (houses.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 3.5)) continue;
    trees.push([x, z, 0.7 + rnd() * 0.8]);
  }
  addTrees(group, trees);
}

function addHouses(group, houses) {
  const tex = facadeTexture('#ffcf7a', 3, 4, 9);
  const wallMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.85 });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, houses.length);
  const roofGeo = new THREE.ConeGeometry(0.78, 1, 4);
  roofGeo.rotateY(Math.PI / 4);
  const roofs = new THREE.InstancedMesh(roofGeo, std('#4a2c2a'), houses.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const roofColors = ['#4a2c2a', '#3b3f4a', '#5a3a28'].map((c) => new THREE.Color(c));
  houses.forEach(([x, z, r], i) => {
    const w = 4 + r * 2.5;
    const h = 2.6 + r * 1.6;
    const y = groundAt(x, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (r - 0.5) * 0.5);
    m.compose(new THREE.Vector3(x, y + h / 2, z), q, new THREE.Vector3(w, h, w * 0.8));
    bodies.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, y + h + 1, z), q, new THREE.Vector3(w * 1.05, 2, w * 0.85));
    roofs.setMatrixAt(i, m);
    roofs.setColorAt(i, roofColors[i % roofColors.length]);
  });
  bodies.castShadow = true;
  group.add(bodies, roofs);
}

function addTrees(group, trees) {
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 3.4, 7), std('#173524', { roughness: 1 }), trees.length);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 5), std('#3a2a1e'), trees.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const shades = ['#173524', '#1d402a', '#14301f'].map((c) => new THREE.Color(c));
  trees.forEach(([x, z, s], i) => {
    const y = groundAt(x, z);
    m.compose(new THREE.Vector3(x, y + 0.6 * s, z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, y + (1.2 + 1.7) * s, z), q, new THREE.Vector3(s, s, s));
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, shades[i % shades.length]);
  });
  crowns.castShadow = true;
  group.add(crowns, trunks);
}

function utilityPole(group, top) {
  const y0 = groundAt(top.x, top.z);
  const h = top.y - y0 + 0.4;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, h, 6), std('#5b4632'));
  pole.position.set(top.x, y0 + h / 2, top.z);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.6), std('#5b4632'));
  arm.position.set(top.x, top.y + 0.1, top.z);
  pole.castShadow = true;
  group.add(pole, arm);
}

// A lattice mast with antenna panels and a blinking aviation light.
function lattice(group, x, z, h, animated) {
  const y0 = groundAt(x, z);
  const mat = std('#aab3c8', { metalness: 0.7 });
  for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 4), mat);
    leg.position.set(x + dx * 0.8, y0 + h / 2, z + dz * 0.8);
    group.add(leg);
  }
  for (let y = 1.5; y < h; y += 1.5) {
    const ring = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), mat);
    ring.position.set(x, y0 + y, z);
    group.add(ring);
  }
  for (let i = 0; i < 3; i++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 0.12), std('#e8ecf5'));
    const a = (i / 3) * Math.PI * 2;
    panel.position.set(x + Math.cos(a) * 0.7, y0 + h - 1.3, z + Math.sin(a) * 0.7);
    panel.rotation.y = -a;
    group.add(panel);
  }
  const dishM = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.25, 20), std('#e8ecf5'));
  dishM.rotation.z = Math.PI / 2;
  dishM.position.set(x, y0 + h + 0.2, z);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), glow('#ff4d6d', 4));
  light.position.set(x, y0 + h + 0.9, z);
  group.add(dishM, light);
  animated.push((t) => { light.visible = Math.sin(t * 2 + x) > 0.2; });
}

// A big parabolic dish on a pedestal, pointing up at the satellite.
function dish(group, x, z, tiltX, animated) {
  const y0 = groundAt(x, z);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 3, 10), std('#c9ced9'));
  ped.position.set(x, y0 + 1.5, z);
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.32),
    std('#e8ecf5', { side: THREE.DoubleSide, roughness: 0.4 }),
  );
  bowl.rotation.x = Math.PI + tiltX * 0.25;
  bowl.position.set(x, y0 + 6.3, z);
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 4), std('#c9ced9'));
  feed.position.set(x, y0 + 4.5, z);
  const horn = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), glow('#ffd166', 2));
  horn.position.set(x, y0 + 6.2, z);
  group.add(ped, bowl, feed, horn);
  animated.push((t) => { horn.material.emissiveIntensity = 1.5 + Math.sin(t * 4) * 1; });
}

// ----------------------------------------------------------------- coasts
function buildCoast(group, animated) {
  // west: landing station, beach manhole and a lighthouse
  building(group, { x: 40, z: -4.5, w: 5, h: 3.2, d: 4, lit: '#bfe9ff', roof: '#d6dbe6', seed: 13 });
  label(group, 'Cable landing station\nthe cable comes ashore here', 40, 6.6, -4.5, { size: 0.5 });
  const manhole = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 20), std('#40444f', { metalness: 0.6 }));
  manhole.position.set(45.5, groundAt(45.5, 0.3) + 0.1, 0.3);
  group.add(manhole);

  const lx = 45;
  const lz = -15;
  const y0 = groundAt(lx, lz);
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.1 - i * 0.12, 1.2 - i * 0.12, 1.8, 16), std(i % 2 ? '#e8ecf5' : '#c8323c'));
    seg.position.set(lx, y0 + 0.9 + i * 1.8, lz);
    seg.castShadow = true;
    group.add(seg);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 10), glow('#fff2c0', 4));
  lamp.position.set(lx, y0 + 9.8, lz);
  group.add(lamp);
  const beamGeo = new THREE.ConeGeometry(2.6, 26, 20, 1, true);
  beamGeo.translate(0, -13, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#fff2c0', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.position.copy(lamp.position);
  group.add(beam);
  animated.push((t) => { beam.rotation.y = t * 0.6; });

  // east: landing station, carrier hotel and the R4 satellite dish
  building(group, { x: X(99), z: 6.5, w: 5, h: 3.2, d: 4, lit: '#bfe9ff', roof: '#d6dbe6', seed: 17 });
  label(group, 'Cable landing station', X(99), 6.2, 6.5, { size: 0.5 });
  building(group, { x: X(106), z: -9.5, w: 9, h: 13, d: 6, lit: '#9fd4ff', seed: 19 });
  label(group, 'Carrier hotel\nbackbone networks meet', X(106), 16.2, -9.5, { size: 0.55 });
  dish(group, X(100), 9, -0.9, animated);
}

// A satellite parked 36,000 km up (well, a bit lower here).
function buildSky(group, animated) {
  const sat = new THREE.Group();
  sat.position.set(X(72), 54, 34);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), std('#d4a53a', { metalness: 0.9, roughness: 0.3 }));
  const panelTex = canvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#12306e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#6fa0ff';
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  });
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, emissive: '#1a3a90', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const panels = new THREE.Group();
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), panelMat);
    p.position.x = s * 4.2;
    panels.add(p);
  }
  const antenna = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), std('#f0f0f0', { side: THREE.DoubleSide }));
  antenna.position.y = -1.2;
  antenna.rotation.x = Math.PI;
  sat.add(body, panels, antenna);
  group.add(sat);
  label(group, 'Geostationary satellite\n36,000 km up · a round trip takes ~0.5 s', X(72), 59, 34, { size: 0.9, color: '#ffe7a8' });
  animated.push((t) => {
    panels.rotation.x = Math.sin(t * 0.3) * 0.4;
    sat.position.y = 54 + Math.sin(t * 0.5) * 0.4;
  });
}

// Along each undersea cable: a repeater every few metres that re-amplifies
// the light, pulsing softly.
function addRepeaters(group, animated, curve) {
  const count = 7;
  const reps = [];
  for (let i = 1; i <= count; i++) {
    const k = 0.2 + (i / (count + 1)) * 0.6;
    const p = curve.getPointAt(k);
    if (p.y > -4) continue;
    const tan = curve.getTangentAt(k);
    const rep = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 4, 10), glow('#ffb347', 1.2));
    rep.position.copy(p);
    rep.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    group.add(rep);
    reps.push(rep);
  }
  animated.push((t) => reps.forEach((r, i) => { r.material.emissiveIntensity = 0.8 + Math.max(0, Math.sin(t * 3 - i * 0.8)) * 2.2; }));
}

function buildOcean(group, animated, rnd) {
  label(group, 'Undersea fibre cable\n~6,600 km · light takes ~33 ms to cross', X(70), 6, 3, { size: 0.9, color: '#bfe9ff' });
  label(group, 'Repeaters boost the light every ~70 km', X(60), 1.6, -9, { size: 0.55, color: '#ffcf8a' });
  label(group, 'About 99% of traffic between continents\ntravels through cables like these', X(74), 3.2, -26, { size: 0.6, color: '#bfe9ff', bg: 'rgba(8,12,32,0.5)' });

  // the cable ship that laid (and repairs) the cable, bobbing above it
  const ship = makeShip('#e8ecf5', '#c8323c', true);
  ship.position.set(X(64), WATER_Y, 10);
  ship.rotation.y = 0.3;
  group.add(ship);
  label(group, 'Cable repair ship', X(64), 7.2, 10, { size: 0.5 });
  animated.push((t) => {
    ship.position.y = WATER_Y + Math.sin(t * 0.9) * 0.15;
    ship.rotation.z = Math.sin(t * 0.7) * 0.03;
  });

  // a container ship slowly crossing
  const cargo = makeShip('#26303f', '#8a2f2f', false);
  group.add(cargo);
  animated.push((t) => {
    const k = ((t * 0.012) % 1) * 2 - 1;
    cargo.position.set(X(81), WATER_Y + Math.sin(t) * 0.1, k * 120);
  });

  // buoys marking the cable corridor
  for (const [x, z] of [[50, 4], [50, -4], [X(92), 4], [X(92), -4]]) {
    const buoy = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 8), std('#e0a020'));
    buoy.position.set(x, WATER_Y + 0.4, z);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), glow('#ff4d6d', 4));
    light.position.set(x, WATER_Y + 1.2, z);
    group.add(buoy, light);
    animated.push((t) => {
      buoy.position.y = WATER_Y + 0.4 + Math.sin(t * 1.3 + x) * 0.1;
      light.visible = Math.sin(t * 3 + z) > 0.3;
    });
  }

  // schools of fish circling over the cables
  const fishGeo = new THREE.ConeGeometry(0.15, 0.6, 5);
  fishGeo.rotateZ(-Math.PI / 2);
  for (const [cx, cz, cy] of [[X(58), -6, -7], [X(76), 6, -8.5], [X(86), -14, -7.5]]) {
    const count = 22;
    const school = new THREE.InstancedMesh(fishGeo, std('#9fc3d6', { metalness: 0.6, roughness: 0.3 }), count);
    const fish = Array.from({ length: count }, () => ({ r: 2 + rnd() * 2.5, a: rnd() * 6.3, y: (rnd() - 0.5) * 1.6, s: 0.5 + rnd() * 0.3 }));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    group.add(school);
    animated.push((t) => {
      fish.forEach((f, i) => {
        const a = f.a + t * f.s;
        q.setFromAxisAngle(up, -a - Math.PI / 2);
        m.compose(new THREE.Vector3(cx + Math.cos(a) * f.r, cy + f.y + Math.sin(t * 2 + i) * 0.1, cz + Math.sin(a) * f.r), q, one);
        school.setMatrixAt(i, m);
      });
      school.instanceMatrix.needsUpdate = true;
    });
  }
}

function makeShip(hullColor, stripe, crane) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 3), std(hullColor));
  hull.position.y = 0.3;
  const band = new THREE.Mesh(new THREE.BoxGeometry(10.05, 0.3, 3.05), std(stripe));
  band.position.y = -0.3;
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.6, 3, 1, false, 0, Math.PI), std(hullColor));
  bow.rotation.y = Math.PI / 2;
  bow.position.set(5, 0.3, 0);
  bow.scale.set(1, 1, 0.9);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2.4), std('#e8ecf5'));
  bridge.position.set(-3.4, 2, 0);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 2), glow('#ffcf7a', 2));
  win.position.set(-2.38, 2.5, 0);
  g.add(hull, band, bow, bridge, win);
  if (crane) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), std('#e0a020'));
    a.position.set(3.5, 3, 0);
    a.rotation.z = 0.5;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 16), std('#2a2f3a'));
    drum.rotation.x = Math.PI / 2;
    drum.position.set(1, 1.8, 0);
    g.add(a, drum);
  } else {
    const palette = ['#c8323c', '#2e86ab', '#e0a020', '#3f8a4a'];
    for (let i = 0; i < 10; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.2), std(palette[i % 4]));
      box.position.set(-1.6 + (i % 5) * 1.3, 1.5 + Math.floor(i / 5) * 0.8, 0);
      g.add(box);
    }
  }
  const mast = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow('#35d07f', 4));
  mast.position.set(-3.4, 3.3, 0);
  g.add(mast);
  g.rotation.y = Math.PI / 2;
  return g;
}

// --------------------------------------------------------------- far shore
function buildFarShore(group, animated, rnd) {
  building(group, { x: X(112), z: -30, w: 8, h: 5, d: 6, lit: '#9fd4ff', seed: 23 });
  label(group, 'Another provider', X(112), 8.4, -30, { size: 0.5 });

  // the data centre campus around the receiver's terraces
  const halls = [[140, -38, 22, 7, 12], [175, -40, 26, 8, 12], [212, -38, 20, 7, 12], [150, 34, 24, 6, 10], [190, 36, 22, 6, 10]]
    .map(([x, ...rest]) => [X(x), ...rest]);
  halls.forEach(([x, z, w, h, d], i) => {
    const hall = building(group, { x, z, w, h, d, lit: '#6fb8ff', roof: '#8a90a0', seed: 29 + i });
    const y = hall.position.y + h / 2;
    for (let k = 0; k < Math.floor(w / 4); k++) {
      const unit = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 2.4), std('#9aa3b5'));
      unit.position.set(x - w / 2 + 2.5 + k * 4, y + 0.5, z);
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 4), std('#2a2f3a'));
      fan.position.set(unit.position.x, y + 1.05, z);
      group.add(unit, fan);
      animated.push((t) => { fan.rotation.y = t * 6 + k; });
    }
  });

  // backup generators and a fence line by the switch
  for (let i = 0; i < 4; i++) {
    const gen = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 1.6), std('#d0d4dc'));
    gen.position.set(X(112) + i * 4, groundAt(X(112) + i * 4, 18) + 0.8, 18);
    group.add(gen);
  }
  label(group, 'Backup generators', X(118), 3.6, 18, { size: 0.45 });

  // wind turbines on the hills: the data centre runs on renewables
  for (const [x, z] of [[X(108), -52], [X(128), -58], [X(150), -54], [X(172), -60], [20, -62], [-8, 58]]) {
    const y0 = groundAt(x, z);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 18, 10), std('#e8ecf5'));
    tower.position.set(x, y0 + 9, z);
    const hub = new THREE.Group();
    hub.position.set(x, y0 + 18.2, z + 0.6);
    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 2), std('#e8ecf5'));
    nacelle.position.z = -0.6;
    hub.add(nacelle);
    const rotor = new THREE.Group();
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 8, 0.1), std('#f4f6fa'));
      blade.position.y = 4;
      const arm = new THREE.Group();
      arm.rotation.z = (b / 3) * Math.PI * 2;
      arm.add(blade);
      rotor.add(arm);
    }
    rotor.position.z = 0.5;
    hub.add(rotor);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow('#ff4d6d', 4));
    tip.position.set(x, y0 + 19, z);
    group.add(tower, hub, tip);
    const speed = 0.8 + rnd() * 0.5;
    animated.push((t) => {
      rotor.rotation.z = t * speed;
      tip.visible = Math.sin(t * 1.5 + x) > 0.4;
    });
  }

  const trees = [];
  for (let tries = 0; trees.length < 40 && tries < 800; tries++) {
    const x = X(100) + rnd() * 140;
    const z = (rnd() < 0.5 ? -1 : 1) * (22 + rnd() * 50);
    if (x < coastE(z) + 4) continue;
    if (halls.some(([hx, hz, w, , d]) => Math.abs(x - hx) < w / 2 + 2 && Math.abs(z - hz) < d / 2 + 2)) continue;
    trees.push([x, z, 0.7 + rnd() * 0.8]);
  }
  addTrees(group, trees);
}

// ---------------------------------------------------------------- traffic
// Other people's packets riding every link.
function makeTraffic(animated, curves) {
  const keys = [...curves.keys()];
  const paths = new Map(keys.map((k) => [k, curves.get(k).getSpacedPoints(96)]));
  const lengths = new Map(keys.map((k) => [k, curves.get(k).getLength()]));
  const count = 72;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshBasicMaterial({ color: '#ffffff' }), count);
  const palette = ['#4be1ff', '#b56cff', '#ff8a3d', '#35d07f', '#ffd166'].map((c) => new THREE.Color(c));
  const movers = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, palette[i % palette.length]);
    return { key: keys[i % keys.length], dir: i % 2 ? 1 : -1, t: Math.random(), speed: 10 + Math.random() * 8 };
  });
  const m = new THREE.Matrix4();
  const a = new THREE.Vector3();
  animated.push((t, dt = 1 / 60) => {
    movers.forEach((mv, i) => {
      mv.t += (mv.speed * dt) / lengths.get(mv.key);
      if (mv.t >= 1) {
        mv.t = 0;
        mv.key = keys[Math.floor(Math.random() * keys.length)];
        mv.dir = Math.random() < 0.5 ? 1 : -1;
      }
      const pts = paths.get(mv.key);
      const f = (mv.dir > 0 ? mv.t : 1 - mv.t) * (pts.length - 1);
      const j = Math.min(pts.length - 2, Math.floor(f));
      a.lerpVectors(pts[j], pts[j + 1], f - j);
      m.makeTranslation(a.x, a.y + 0.3, a.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}
