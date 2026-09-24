import * as THREE from 'three';
import { LAYERS } from './content.js';
import { makeLabel } from './labels.js';
import {
  rand, pick, seeded, canvasTexture, withCaustics, makeReef, makeKelp, makeSeaFan, makeStarfish,
  makeFishSchool, makeBubbles, makeTurtle, swimAlong, loopCurve, rockGeometry, CORAL_COLORS,
} from './ocean.js';

// Themed underwater scenery for every layer plateau, plus wandering NPC
// packets. The sender's stack is a sunlit coral reef that steps down towards
// the deep; the receiver's stack mirrors it on the far side of the trench.
//
// Each builder gets the plateau (x range, height, side) and adds meshes to
// `ctx.group`, animations to `ctx.animated` and circular colliders
// ({ x, z, r }) to `ctx.colliders` for props inside the walk area.
//
// Layout convention: z < 0 is the far side (behind the stations, tall props
// are fine), z > 0 is the camera side (keep props low so they never hide the
// player). The walkable path is |z| <= 12.5; the deck runs to |z| = 18.

export const DECK_HALF = 18;

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...extra });
}

function reefStd(color, extra = {}) {
  return withCaustics(std(color, extra));
}

function glow(color, intensity = 1.2) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

// A floating app window inside a soap-bubble.
function appWindowTexture(icon, title, color) {
  return canvasTexture(256, 192, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(6,28,48,0.9)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, 30);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(title, 12, 21);
    ctx.font = '72px sans-serif';
    ctx.fillText(icon, 20, 118);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 4; i++) ctx.fillRect(116, 60 + i * 24, 120 - (i % 2) * 30, 10);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  });
}

function plaque(ctx, text, x, y, z, color = '#bff6ff', size = 0.42) {
  const l = makeLabel(text, { size, color, bg: 'rgba(3,24,40,0.78)', border: color });
  l.position.set(x, y, z);
  ctx.group.add(l);
  return l;
}

// --------------------------------------------------------- reef dressing
// Coral, rocks and sponges along both edges of every plateau, and a few
// starfish on the sand. Tall pieces go on the far side only.
function reefDressing(ctx, p, rnd, { density = 1, palette = CORAL_COLORS } = {}) {
  const items = [];
  const colour = () => palette[Math.floor(rnd() * palette.length)];
  const len = p.x1 - p.x0;
  const n = Math.round(len * 0.9 * density);
  for (let i = 0; i < n; i++) {
    const x = p.x0 + 1 + rnd() * (len - 2);
    const far = rnd() < 0.62;
    const z = far ? -DECK_HALF + 0.5 + rnd() * 4.5 : DECK_HALF - 0.5 - rnd() * 4.2;
    const r = rnd();
    if (far) {
      if (r < 0.28) items.push({ kind: pick(['branch0', 'branch1', 'branch2']), x, y: p.h, z, s: 1.4 + rnd() * 1.6, color: colour() });
      else if (r < 0.48) items.push({ kind: 'sponge', x, y: p.h, z, s: 1 + rnd() * 1.4, color: pick(['#ff8c42', '#b36bff', '#ffc75f', '#5fd1c7']) });
      else if (r < 0.65) items.push({ kind: 'brain', x, y: p.h, z, s: 0.8 + rnd() * 1.1, color: pick(['#c9d77a', '#e8a87c', '#b5a4d8', '#e7d38a']) });
      else if (r < 0.8) items.push({ kind: 'anemone', x, y: p.h, z, s: 0.9 + rnd() * 0.7, color: colour() });
      else items.push({ kind: pick(['rock', 'rock2']), x, y: p.h + 0.3, z, s: [1.2 + rnd() * 2, 0.8 + rnd() * 1.6, 1.2 + rnd() * 1.6] });
    } else if (r < 0.35) {
      items.push({ kind: 'brain', x, y: p.h, z, s: 0.45 + rnd() * 0.5, color: pick(['#c9d77a', '#e8a87c', '#b5a4d8']) });
    } else if (r < 0.62) {
      items.push({ kind: 'anemone', x, y: p.h, z, s: 0.6 + rnd() * 0.5, color: colour() });
    } else if (r < 0.8) {
      items.push({ kind: pick(['branch0', 'branch1']), x, y: p.h, z, s: 0.55 + rnd() * 0.5, color: colour() });
    } else {
      items.push({ kind: pick(['rock', 'rock2']), x, y: p.h + 0.1, z, s: [0.6 + rnd(), 0.35 + rnd() * 0.5, 0.6 + rnd()] });
    }
  }
  ctx.group.add(makeReef(items));

  // sea fans on the far edge
  for (let x = p.x0 + 3 + rnd() * 3; x < p.x1 - 2; x += 7 + rnd() * 5) {
    const fan = makeSeaFan(pick(['#ff5e78', '#b36bff', '#ffc75f']));
    fan.position.set(x, p.h, -DECK_HALF + 1 + rnd() * 2);
    fan.rotation.y = rand(-0.4, 0.4);
    fan.scale.setScalar(1 + rnd() * 0.8);
    ctx.group.add(fan);
    const ph = rnd() * 6;
    ctx.animated.push((t) => { fan.rotation.x = Math.sin(t * 0.6 + ph) * 0.08; });
  }

  // starfish scattered on the sand
  for (let i = 0; i < Math.max(2, Math.round(len / 8)); i++) {
    const s = makeStarfish(pick(['#ff7b54', '#ffb26b', '#d64161', '#8e7dbe']));
    s.position.set(p.x0 + 1 + rnd() * (len - 2), p.h + 0.14, rand(-11, 11));
    s.rotation.y = rnd() * 6;
    ctx.group.add(s);
  }

  // a shoal of fish above every terrace
  const school = makeFishSchool({
    center: new THREE.Vector3((p.x0 + p.x1) / 2, p.h + 7 + rnd() * 3, -6),
    radius: Math.min(len * 0.45, 12),
    count: 26,
    colors: pick([['#ffd166', '#ffe29a'], ['#4be1ff', '#b5f3ff'], ['#ff8a5b', '#ffc3a0'], ['#c9f0ff', '#8fd3ff']]),
    size: 0.55,
    speed: rand(0.25, 0.4) * (rnd() < 0.5 ? 1 : -1),
  });
  ctx.group.add(school.mesh);
  ctx.animated.push((t) => school.update(t));

  // a couple of bubble vents in the rocks
  ctx.bubbleSources.push(
    { x: p.x0 + len * 0.3, y: p.h, z: -DECK_HALF + 2, spread: 0.3 },
    { x: p.x0 + len * 0.75, y: p.h, z: DECK_HALF - 2, spread: 0.3 },
  );
}

// ------------------------------------------------------------ application
// Sunlit shallows: bright coral, app bubbles and a giant DNS clam.
function buildApplication(ctx, p) {
  const { group, animated } = ctx;
  const color = LAYERS.app.color;
  const cx = (p.x0 + p.x1) / 2;
  const rnd = seeded(p.x0 * 7 + 3);
  reefDressing(ctx, p, rnd, { density: 1.2 });

  // tall coral pinnacles on the far side, like a skyline
  const pinnacles = [];
  for (let x = p.x0 + 3; x < p.x1 - 2; x += rand(4, 6.5)) {
    pinnacles.push({ kind: pick(['branch0', 'branch2']), x, y: p.h, z: -DECK_HALF + rand(1, 3), s: rand(3, 4.6), color: pick(['#ff6f91', '#b36bff', '#ffc75f', '#ff9671']) });
    pinnacles.push({ kind: 'sponge', x: x + 1.6, y: p.h, z: -DECK_HALF + rand(2, 4), s: rand(2, 3.4), color: pick(['#ff8c42', '#b36bff', '#5fd1c7']) });
  }
  group.add(makeReef(pinnacles));

  // every app lives in its own bubble
  const apps = [
    ['🌐', 'Browser'], ['✉️', 'Mail · SMTP'], ['🎬', 'Video · QUIC'], ['💬', 'Chat'], ['🎮', 'Game · UDP'], ['📁', 'Files · SFTP'],
  ];
  const bubbleMat = new THREE.MeshStandardMaterial({ color: '#c9f6ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.4, emissive: color, emissiveIntensity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  apps.forEach(([icon, title], i) => {
    const holder = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: appWindowTexture(icon, title, color), transparent: true, side: THREE.DoubleSide, opacity: 0.95 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.25), mat);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16), bubbleMat);
    holder.add(win, shell);
    const x = p.x0 + 5 + (i / (apps.length - 1)) * (p.x1 - p.x0 - 10);
    const baseY = p.h + rand(6, 9);
    holder.position.set(x, baseY, -12 + (i % 2) * 2);
    group.add(holder);
    animated.push((t) => {
      holder.position.y = baseY + Math.sin(t * 0.7 + i) * 0.6;
      win.rotation.y = Math.sin(t * 0.3 + i) * 0.35;
      shell.scale.set(1 + Math.sin(t * 2 + i) * 0.03, 1 - Math.sin(t * 2 + i) * 0.03, 1);
    });
  });

  // DNS clam: a giant clam that opens to show the glowing address book
  const clam = new THREE.Group();
  clam.position.set(cx + 6, p.h, 8);
  const shellTex = canvasTexture(128, 64, (c, w, h) => {
    const grd = c.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#8fd3c7');
    grd.addColorStop(1, '#3e6f86');
    c.fillStyle = grd;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 4;
    for (let x = 4; x < w; x += 16) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
  });
  const shellMat = new THREE.MeshStandardMaterial({ map: shellTex, roughness: 0.5, side: THREE.DoubleSide });
  const half = new THREE.SphereGeometry(1.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  half.scale(1.1, 0.55, 0.85);
  const lower = new THREE.Mesh(half, shellMat);
  lower.rotation.x = Math.PI;
  lower.position.y = 0.8;
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.8, -1.2);
  const upper = new THREE.Mesh(half, shellMat);
  upper.position.z = 1.2;
  hinge.add(upper);
  const mantle = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.12, 24), glow('#4be1ff', 0.8));
  mantle.scale.set(1.1, 1, 0.85);
  mantle.position.y = 0.82;
  const book = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.8), glow('#ffd166', 0.8));
  book.position.y = 1.4;
  const sign = makeLabel(p.side === 'sender' ? 'DNS resolver\nname → IP' : 'HTTP cache', { size: 0.45, color: '#ffd166' });
  sign.position.y = 3.2;
  clam.add(lower, hinge, mantle, book, sign);
  group.add(clam);
  ctx.colliders.push({ x: clam.position.x, z: clam.position.z, r: 1.9 });
  animated.push((t) => {
    const open = 0.55 + Math.sin(t * 0.8) * 0.3;
    hinge.rotation.x = -open;
    book.rotation.y = t;
    book.position.y = 1.2 + open * 0.6 + Math.sin(t * 2) * 0.08;
  });

  // glowing anemone lanterns along the camera side
  for (let x = p.x0 + 4; x < p.x1 - 2; x += 9) lantern(ctx, x, p.h, 12, color);

  // clownfish around a big anemone
  const home = new THREE.Vector3(cx - 8, p.h, 14);
  group.add(makeReef([{ kind: 'anemone', x: home.x, y: p.h, z: home.z, s: 1.8, color: '#ff5e78' }]));
  const clowns = makeFishSchool({ center: home.clone().setY(p.h + 1.6), radius: 1.6, height: 0.4, count: 5, colors: ['#ff7b1c', '#ffffff'], size: 0.4, speed: 0.9, flatten: 1 });
  group.add(clowns.mesh);
  animated.push((t) => clowns.update(t));
  ctx.colliders.push({ x: home.x, z: home.z, r: 1.2 });

  // a sea turtle cruising over the reef
  const turtle = makeTurtle();
  turtle.group.scale.setScalar(1.3);
  group.add(turtle.group);
  const path = loopCurve([
    [p.x0 + 4, p.h + 6, -8], [cx, p.h + 8, -14], [p.x1 - 4, p.h + 6, -6], [cx + 4, p.h + 9, 6], [cx - 8, p.h + 7, 4],
  ]);
  animated.push(swimAlong(turtle, path, 70, p.side === 'sender' ? 0 : 0.5));
}

// -------------------------------------------------------------- transport
// A kelp forest around a sunken container ship: ports are the numbered
// containers spilling from its hold.
function buildTransport(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  const rnd = seeded(p.x0 * 13 + 1);
  reefDressing(ctx, p, rnd, { density: 0.7 });

  // kelp forest behind and along the camera edge
  const kelp = [];
  for (let x = p.x0; x < p.x1; x += 1.3) {
    kelp.push([x + rand(-0.5, 0.5), p.h, -DECK_HALF + rand(0.3, 2.2), rand(0.8, 1.3)]);
    if (rnd() < 0.35) kelp.push([x + rand(-0.5, 0.5), p.h, DECK_HALF - rand(0.3, 2), rand(0.15, 0.28)]);
  }
  group.add(makeKelp(kelp, { height: 16 }));

  // the wreck: a tilted hull on the far side
  const hullMat = reefStd('#5b3a2a', { roughness: 0.9, metalness: 0.4 });
  const hull = new THREE.Group();
  hull.position.set(cx - 2, p.h + 1.2, -DECK_HALF + 5.2);
  hull.rotation.z = 0.06;
  hull.rotation.x = -0.08;
  const keel = new THREE.Mesh(new THREE.BoxGeometry(p.x1 - p.x0 - 4, 2.6, 3.4), hullMat);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3.5, 4, 1), hullMat);
  bow.rotation.set(0, Math.PI / 4, -Math.PI / 2);
  bow.scale.set(1, 1, 0.9);
  bow.position.x = (p.x1 - p.x0 - 4) / 2 + 1.6;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(p.x1 - p.x0 - 4, 0.3, 3.45), std('#8f2d2d', { roughness: 0.9 }));
  stripe.position.y = -0.9;
  hull.add(keel, bow, stripe);
  group.add(hull);

  // containers stacked on deck and spilled onto the sand (instanced)
  const palette = ['#e4572e', '#ffc914', '#2e86ab', '#76b041', '#a23b72', '#f18f01'];
  const spots = [];
  for (let x = p.x0 + 3.5; x < p.x1 - 3; x += 3.4) {
    const stack = 1 + Math.floor(rnd() * 2);
    for (let s = 0; s < stack; s++) spots.push([x, p.h + 3.2 + s * 1.4, -DECK_HALF + 5.2, rand(-0.05, 0.05)]);
  }
  for (let i = 0; i < 4; i++) spots.push([p.x0 + 3 + rnd() * (p.x1 - p.x0 - 6), p.h + 0.7, -DECK_HALF + 1.6, rand(-0.6, 0.6)]);
  const cont = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 1.35, 1.4), reefStd('#ffffff', { roughness: 0.8 }), spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach(([x, y, z, rot], i) => {
    q.setFromEuler(new THREE.Euler(0, rot, rot * 0.2));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    cont.setMatrixAt(i, m);
    cont.setColorAt(i, new THREE.Color(pick(palette)));
  });
  cont.castShadow = true;
  group.add(cont);
  ['80', '443', '53', '22', '25'].forEach((port, i) => {
    const l = makeLabel(`port ${port}`, { size: 0.45, color: '#fff', bg: 'rgba(0,0,0,0.5)' });
    l.position.set(p.x0 + 4 + i * ((p.x1 - p.x0 - 8) / 4), p.h + 6.4, -DECK_HALF + 5.2);
    group.add(l);
  });

  // the ship's crane still swings a container in the current
  const crane = new THREE.Group();
  crane.position.set(cx + 4, p.h, -DECK_HALF + 6.5);
  const legMat = reefStd('#b5651d', { metalness: 0.6, roughness: 0.8 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 12, 8), legMat);
  mast.position.y = 6;
  mast.rotation.z = 0.12;
  const boom = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 0.4), legMat);
  boom.position.set(-3.2, 11.4, 0);
  boom.rotation.z = -0.1;
  const trolley = new THREE.Group();
  trolley.position.set(-6, 11, 0);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5), std('#222'));
  cable.position.y = -2.5;
  const load = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1.1), reefStd('#2e86ab'));
  load.position.y = -5.4;
  trolley.add(cable, load);
  crane.add(mast, boom, trolley);
  group.add(crane);
  animated.push((t) => {
    trolley.rotation.z = Math.sin(t * 0.5) * 0.12;
    trolley.rotation.x = Math.sin(t * 0.37) * 0.08;
    load.rotation.y = Math.sin(t * 0.4) * 0.3;
  });

  // a current along the camera side carries numbered TCP segments
  conveyor(ctx, p, 13.5, '#ff8a3d', (i) => `seq ${1001 + i * 1460}`);

  // SYN, ACK, FIN and RST flags on anchored buoys
  ['SYN', 'ACK', 'FIN', 'RST'].forEach((flag, i) => {
    const x = p.x0 + 3 + i * ((p.x1 - p.x0 - 6) / 3);
    const anchor = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 10), reefStd('#39424e', { metalness: 0.7 }));
    anchor.position.set(x, p.h + 0.2, -12);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5.5), std('#9aa4a8', { metalness: 0.9 }));
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), glow(i % 2 ? '#ff8a3d' : '#ffe0c2', 0.5));
    const cloth = makeLabel(flag, { size: 0.6, color: '#fff', bg: '#ff8a3d' });
    group.add(anchor, chain, buoy, cloth);
    ctx.colliders.push({ x, z: -12, r: 0.6 });
    animated.push((t) => {
      const sway = Math.sin(t * 0.8 + i) * 0.5;
      buoy.position.set(x + sway, p.h + 5.8 + Math.sin(t * 1.3 + i) * 0.15, -12);
      chain.position.set(x + sway / 2, p.h + 3, -12);
      chain.rotation.z = -Math.atan2(sway, 5.5);
      cloth.position.set(x + sway, p.h + 7, -12);
    });
  });
}

// --------------------------------------------------------------- internet
// A seamount with a bioluminescent globe and bottles carrying addresses.
function buildInternet(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  const color = LAYERS.internet.color;
  const rnd = seeded(p.x0 * 17 + 5);
  reefDressing(ctx, p, rnd, { density: 0.9, palette: ['#35d07f', '#5fd1c7', '#c9f871', '#ffc75f', '#ff6f91'] });

  // a glowing globe of the internet, held up by a rock arch
  const globe = new THREE.Group();
  globe.position.set(cx, p.h + 8, -DECK_HALF + 4);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(3.4, 24, 16), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.45 }));
  const core = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 16), new THREE.MeshStandardMaterial({ color: '#06281f', emissive: color, emissiveIntensity: 0.25, transparent: true, opacity: 0.6 }));
  globe.add(core, sphere);
  const orbiters = [];
  for (let i = 0; i < 6; i++) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), glow(pick(['#35d07f', '#4be1ff', '#ffd166']), 2));
    o.userData = { r: rand(4, 5.2), speed: rand(0.4, 1), tilt: rand(-0.8, 0.8), phase: rand(0, 6) };
    globe.add(o);
    orbiters.push(o);
  }
  const archMat = reefStd('#4d5566', { roughness: 0.95 });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(5.2, 1.1, 10, 24, Math.PI), archMat);
  arch.position.set(cx, p.h, globe.position.z);
  const pedestal = new THREE.Mesh(rockGeometry(21), archMat);
  pedestal.scale.set(1.8, 2.6, 1.6);
  pedestal.position.set(cx, p.h + 1.8, globe.position.z);
  group.add(globe, arch, pedestal);
  animated.push((t) => {
    sphere.rotation.y = t * 0.15;
    for (const o of orbiters) {
      const { r, speed, tilt, phase } = o.userData;
      const a = t * speed + phase;
      o.position.set(Math.cos(a) * r, Math.sin(a) * r * tilt, Math.sin(a) * r);
    }
  });

  // driftwood signposts with routing-table arrows
  const signs = [['10.0.0.0/8', '←'], ['0.0.0.0/0', '→'], ['192.168.1.0/24', '↓'], ['203.0.113.0/24', '→']];
  signs.forEach(([prefix, arrow], i) => {
    const x = p.x0 + 3 + i * ((p.x1 - p.x0 - 6) / (signs.length - 1));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 6), reefStd('#7a6248', { roughness: 1 }));
    post.position.set(x, p.h + 1.6, 12);
    post.rotation.z = rand(-0.08, 0.08);
    const board = makeLabel(`${arrow} ${prefix}`, { size: 0.32, color: '#04201a', bg: color });
    board.position.set(x, p.h + 3.3, 12);
    group.add(post, board);
    ctx.colliders.push({ x, z: 12, r: 0.45 });
  });

  // messages in bottles: an IP address is the address on the envelope
  const addrs = ['192.168.1.23', '203.0.113.80', '8.8.8.8'];
  addrs.forEach((addr, i) => {
    const b = new THREE.Group();
    b.position.set(p.x0 + 5 + i * 5, p.h, -12);
    const glass = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 6, 12), new THREE.MeshStandardMaterial({ color: '#7fe0b0', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.3 }));
    glass.position.y = 0.8;
    glass.rotation.z = 0.5 - i * 0.3;
    const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 10), std('#f2e2b8'));
    scroll.position.copy(glass.position);
    scroll.rotation.copy(glass.rotation);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.25, 8), std('#9c6b3c'));
    cork.position.set(-Math.sin(glass.rotation.z) * 0.85, 0.8 + Math.cos(glass.rotation.z) * 0.85, 0);
    cork.rotation.z = glass.rotation.z;
    const tag = makeLabel(`to: ${addr}`, { size: 0.28, color: '#eafff4' });
    tag.position.y = 2.2;
    b.add(glass, scroll, cork, tag);
    group.add(b);
    ctx.colliders.push({ x: b.position.x, z: -12, r: 0.7 });
    animated.push((t) => { b.rotation.y = Math.sin(t * 0.5 + i) * 0.2; });
  });

  conveyor(ctx, p, 14.5, '#35d07f', (i) => `TTL ${64 - (i % 5)}`);
}

// ------------------------------------------------------------------- link
// A cable landing station: the spot where an undersea cable comes ashore
// and meets the local network.
function buildLink(ctx, p) {
  const { group, animated } = ctx;
  const len = p.x1 - p.x0;
  const cx = (p.x0 + p.x1) / 2;
  const rnd = seeded(p.x0 * 19 + 7);
  reefDressing(ctx, p, rnd, { density: 0.6, palette: ['#3d9bff', '#5fd1c7', '#b36bff', '#ff9671'] });

  // a concrete bunker with racks behind a glass front
  const concrete = reefStd('#59606b', { roughness: 0.95, metalness: 0.05 });
  const backZ = -DECK_HALF + 0.6;
  const back = new THREE.Mesh(new THREE.BoxGeometry(len, 7, 0.6), concrete);
  back.position.set(cx, p.h + 3.5, backZ);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 0.6, 0.6, 3.4), concrete);
  roof.position.set(cx, p.h + 6.6, backZ + 1.5);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, 6.2), new THREE.MeshStandardMaterial({ color: '#8fdcff', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.6, depthWrite: false }));
  glass.position.set(cx, p.h + 3.1, backZ + 3.2);
  group.add(back, roof, glass);
  const sign = makeLabel('CABLE LANDING STATION', { size: 0.5, color: '#bfe9ff', bg: 'rgba(3,24,40,0.85)' });
  sign.position.set(cx, p.h + 7.6, backZ + 3);
  group.add(sign);

  // server racks with blinking LEDs (instanced)
  const racks = [];
  for (let x = p.x0 + 2; x < p.x1 - 1; x += 2.2) racks.push(x);
  const rackMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 5, 1.6), std('#161a33', { metalness: 0.7, roughness: 0.35 }), racks.length);
  const m = new THREE.Matrix4();
  racks.forEach((x, i) => { m.makeTranslation(x, p.h + 2.5, -DECK_HALF + 2); rackMesh.setMatrixAt(i, m); });
  rackMesh.castShadow = true;
  group.add(rackMesh);
  const ledCount = racks.length * 8;
  const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: '#ffffff' }), ledCount);
  const ledColors = [new THREE.Color('#35d07f'), new THREE.Color('#3d9bff'), new THREE.Color('#ffb000'), new THREE.Color('#0a0f24')];
  racks.forEach((x, i) => {
    for (let k = 0; k < 8; k++) {
      m.makeTranslation(x + rand(-0.6, 0.6), p.h + 0.6 + k * 0.55, -DECK_HALF + 2.82);
      leds.setMatrixAt(i * 8 + k, m);
      leds.setColorAt(i * 8 + k, pick(ledColors));
    }
  });
  group.add(leds);
  let ledClock = 0;
  animated.push((t, dt = 1 / 60) => {
    ledClock += dt;
    if (ledClock < 0.12) return;
    ledClock = 0;
    for (let k = 0; k < 12; k++) leds.setColorAt(Math.floor(Math.random() * ledCount), pick(ledColors));
    leds.instanceColor.needsUpdate = true;
  });

  // the armoured undersea cable leaves the station and runs to the deep,
  // with light pulses racing along its fibre
  const cableZ = -DECK_HALF + 5;
  const toSea = p.side === 'sender' ? p.x1 : p.x0;
  const fromSt = p.side === 'sender' ? p.x0 + 1 : p.x1 - 1;
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, Math.abs(toSea - fromSt), 12), reefStd('#1f252e', { metalness: 0.5, roughness: 0.6 }));
  cable.rotation.z = Math.PI / 2;
  cable.position.set((toSea + fromSt) / 2, p.h + 0.32, cableZ);
  group.add(cable);
  const pulses = [];
  for (let i = 0; i < 6; i++) {
    const pulse = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), glow('#4be1ff', 3));
    pulse.userData.offset = i / 6;
    pulse.position.set(0, p.h + 0.66, cableZ);
    group.add(pulse);
    pulses.push(pulse);
  }
  const dir = p.side === 'sender' ? 1 : -1;
  animated.push((t) => {
    for (const pl of pulses) pl.position.x = fromSt + dir * ((t * 0.35 + pl.userData.offset) % 1) * Math.abs(toSea - fromSt);
  });
  plaque(ctx, p.side === 'sender'
    ? 'Real fact: undersea cables carry\nabout 99% of the data between continents'
    : 'Cable landing station:\nwhere an undersea cable comes ashore', cx + 3, p.h + 2.6, cableZ + 1.3, '#bfe9ff', 0.34);

  // Radio barely travels through water, so the mast here is an acoustic modem.
  const ax = p.side === 'sender' ? p.x0 + 3 : p.x1 - 3;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 6, 8), std('#cfd6ff', { metalness: 0.8 }));
  mast.position.set(ax, p.h + 3, -12);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 16, 1, true), std('#ffd166', { metalness: 0.6, side: THREE.DoubleSide }));
  horn.position.set(ax, p.h + 6.2, -12);
  horn.rotation.x = Math.PI;
  group.add(mast, horn);
  ctx.colliders.push({ x: ax, z: -12, r: 0.6 });
  const rings = [0, 1, 2].map((i) => {
    const r = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), new THREE.MeshBasicMaterial({ color: '#3d9bff', transparent: true, wireframe: true, depthWrite: false }));
    r.position.set(ax, p.h + 6, -12);
    r.userData.phase = i / 3;
    group.add(r);
    return r;
  });
  animated.push((t) => {
    for (const r of rings) {
      const k = (t * 0.45 + r.userData.phase) % 1;
      r.scale.setScalar(0.3 + k * 3.2);
      r.material.opacity = (1 - k) * 0.35;
    }
  });
  const modem = makeLabel('Acoustic modem\nunderwater, links use sound\n(on land: Wi-Fi radio)', { size: 0.32, color: '#bfe9ff' });
  modem.position.set(ax, p.h + 10.2, -12);
  group.add(modem);

  // a switch on a rock on the camera side
  const sw = new THREE.Group();
  sw.position.set(cx - 5, p.h, 10.5);
  const rock = new THREE.Mesh(rockGeometry(4), reefStd('#5b616e', { roughness: 1 }));
  rock.scale.set(2.3, 0.6, 1.1);
  rock.position.y = 0.3;
  const body = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 1.6), std('#1d2350', { metalness: 0.6 }));
  body.position.y = 1.1;
  sw.add(rock, body);
  const ports = [];
  for (let i = 0; i < 8; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: '#35d07f' }));
    led.position.set(-1.6 + i * 0.45, 1.25, 0.82);
    sw.add(led);
    ports.push(led);
  }
  const swLabel = makeLabel('Switch: learns MAC → port', { size: 0.35, color: '#bfe9ff' });
  swLabel.position.y = 2.2;
  sw.add(swLabel);
  group.add(sw);
  ctx.colliders.push({ x: sw.position.x - 1, z: 10.5, r: 1.2 }, { x: sw.position.x + 1, z: 10.5, r: 1.2 });
  animated.push((t) => ports.forEach((l, i) => { l.visible = Math.sin(t * 9 + i * 2.3) > -0.3; }));
}

// A glowing anemone lantern on a rock stalk.
function lantern(ctx, x, h, z, color) {
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 2.6, 7), reefStd('#6a5d7a', { roughness: 1 }));
  stalk.position.set(x, h + 1.3, z);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 10), glow(color, 2.2));
  head.scale.y = 0.7;
  head.position.set(x, h + 2.8, z);
  ctx.group.add(stalk, head);
  ctx.colliders.push({ x, z, r: 0.45 });
  const ph = x * 0.3;
  ctx.animated.push((t) => { head.material.emissiveIntensity = 1.8 + Math.sin(t * 2 + ph) * 0.6; });
}

// A current along the camera-side edge carrying small labelled crates.
function conveyor(ctx, p, z, color, labelFor) {
  const { group, animated } = ctx;
  const len = p.x1 - p.x0 - 2;
  const arrowTex = canvasTexture(128, 32, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#fff';
    for (let x = 8; x < w; x += 32) {
      c.beginPath();
      c.moveTo(x, 6);
      c.lineTo(x + 14, h / 2);
      c.lineTo(x, h - 6);
      c.lineTo(x + 5, h / 2);
      c.fill();
    }
  });
  arrowTex.wrapS = THREE.RepeatWrapping;
  arrowTex.repeat.set(len / 4, 1);
  const stream = new THREE.Mesh(
    new THREE.PlaneGeometry(len, 1.2),
    new THREE.MeshBasicMaterial({ color, alphaMap: arrowTex, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  stream.rotation.x = -Math.PI / 2;
  stream.position.set((p.x0 + p.x1) / 2, p.h + 0.08, z);
  group.add(stream);
  const flowDir = p.side === 'sender' ? -1 : 1;
  const crates = [];
  for (let i = 0; i < 5; i++) {
    const crate = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), glow(color, 0.5));
    box.castShadow = true;
    const tag = makeLabel(labelFor(i), { size: 0.28, color: '#fff' });
    tag.position.y = 0.75;
    crate.add(box, tag);
    crate.userData.offset = i / 5;
    crate.position.set(0, p.h + 0.9, z);
    group.add(crate);
    crates.push(crate);
  }
  animated.push((t) => {
    arrowTex.offset.x = -flowDir * t * 0.4;
    for (const c of crates) {
      c.position.x = p.x0 + 1 + ((t * 0.06 + c.userData.offset) % 1) * len;
      c.position.y = p.h + 0.9 + Math.sin(t * 1.5 + c.userData.offset * 9) * 0.15;
      c.rotation.z = Math.sin(t + c.userData.offset * 7) * 0.1;
    }
  });
}

// ------------------------------------------------------------ NPC packets
// Other people's packets wandering around each plateau.
function spawnWanderers(ctx, p, count) {
  const colors = Object.values(LAYERS).map((l) => l.color);
  for (let i = 0; i < count; i++) {
    const npc = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), glow(pick(colors), 0.9));
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: pick(colors), transparent: true, opacity: 0.2, depthWrite: false }));
    npc.add(core, shell);
    const state = { target: new THREE.Vector3(), speed: rand(1.5, 3), wait: 0 };
    const newTarget = () => state.target.set(rand(p.x0 + 2, p.x1 - 2), 0, rand(-12, 12));
    newTarget();
    npc.position.set(rand(p.x0 + 2, p.x1 - 2), p.h + 0.9, rand(-12, 12));
    ctx.group.add(npc);
    ctx.animated.push((t, dt = 1 / 60) => {
      if (state.wait > 0) {
        state.wait -= dt;
      } else {
        const dx = state.target.x - npc.position.x;
        const dz = state.target.z - npc.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) {
          state.wait = rand(0.5, 3);
          newTarget();
        } else {
          npc.position.x += (dx / d) * state.speed * dt;
          npc.position.z += (dz / d) * state.speed * dt;
          npc.rotation.y = Math.atan2(dx, dz);
        }
      }
      npc.position.y = p.h + 1.1 + Math.sin(t * 1.4 + i) * 0.35;
      core.rotation.x = t * 2;
    });
  }
}

const BUILDERS = { app: buildApplication, transport: buildTransport, internet: buildInternet, link: buildLink };

export function buildEnvironment(scene, plateaus, animatedList) {
  const ctx = { group: new THREE.Group(), animated: animatedList, colliders: [], bubbleSources: [] };
  for (const p of plateaus) {
    BUILDERS[p.layer](ctx, p);
    spawnWanderers(ctx, p, 3);
  }
  const bubbles = makeBubbles(ctx.bubbleSources, { perSource: 10 });
  ctx.group.add(bubbles.mesh);
  animatedList.push((t, dt) => bubbles.update(t, dt));
  scene.add(ctx.group);
  return { colliders: ctx.colliders };
}
