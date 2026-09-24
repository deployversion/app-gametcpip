import * as THREE from 'three';
import { LAYERS } from './content.js';
import { makeLabel } from './labels.js';

// Themed rooms for every layer deck of the two space stations, plus the
// drones and packets that wander around them.
// Each builder gets the deck (x range, height, side) and adds meshes to
// `ctx.group`, animations to `ctx.animated` and circular colliders
// ({ x, z, r }) to `ctx.colliders` for props inside the walk area.
//
// Layout convention: z < 0 is the far side (behind the stations, tall props
// are fine), z > 0 is the camera side (keep props low so they never hide the
// player).
//
//   Application · the Bridge       holo app windows, consoles, comms dish (DNS)
//   Transport   · the Cargo Bay    cargo pods per port, robot arm, a docked shuttle
//   Internet    · the Nav Deck     a holographic star chart of subnets
//   Link        · Engineering      reactor core, racks, the airlock to space

export const DECK_HALF = 18;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.45, ...extra });
}

function glow(color, intensity = 1.2) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

function holo(color, opacity = 0.35) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
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

// A holographic app window: title bar, big emoji icon, scanlines.
function appWindowTexture(icon, title, color) {
  return canvasTexture(256, 192, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(10,30,60,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, 0, w, 30);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(title, 12, 21);
    ctx.font = '72px sans-serif';
    ctx.fillText(icon, 20, 118);
    ctx.fillStyle = 'rgba(190,240,255,0.35)';
    for (let i = 0; i < 4; i++) ctx.fillRect(116, 60 + i * 24, 120 - (i % 2) * 30, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  });
}

// A console screen full of scrolling telemetry.
function consoleTexture(color) {
  return canvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#04101f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x += 4) ctx.lineTo(x, 34 + Math.sin(x * 0.15) * 10 + rand(-3, 3));
    ctx.stroke();
    ctx.fillStyle = color;
    for (let i = 0; i < 6; i++) ctx.fillRect(6 + i * 20, 52, 12, -rand(2, 10));
    ctx.fillRect(6, 6, rand(30, 80), 4);
  });
}

// ------------------------------------------------------------ application
function buildBridge(ctx, p) {
  const { group, animated } = ctx;
  const color = LAYERS.app.color;
  const cx = (p.x0 + p.x1) / 2;

  // A curved panoramic window frame along the far edge: ribs and a top rail,
  // open to the stars.
  const ribMat = std('#2a3158', { metalness: 0.8, roughness: 0.3 });
  const span = p.x1 - p.x0;
  for (let i = 0; i <= 8; i++) {
    const x = p.x0 + 1 + (i / 8) * (span - 2);
    const rib = new THREE.Mesh(new THREE.TorusGeometry(9, 0.28, 6, 24, Math.PI / 2), ribMat);
    rib.position.set(x, p.h, -DECK_HALF + 9);
    rib.rotation.y = Math.PI / 2;
    rib.rotation.z = 0;
    group.add(rib);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(span - 1, 0.35, 0.35), ribMat);
  rail.position.set(cx, p.h + 9, -DECK_HALF + 9);
  group.add(rail);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9, span - 2, 32, 1, true, Math.PI, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.07, metalness: 1, roughness: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  glass.rotation.z = Math.PI / 2;
  glass.position.set(cx, p.h, -DECK_HALF + 9);
  group.add(glass);

  // An arc of crew consoles in front of the window.
  const screens = [];
  for (let i = 0; i < 7; i++) {
    const x = p.x0 + 4 + (i / 6) * (span - 8);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1, 1.2), std('#1b2146'));
    desk.position.set(x, p.h + 0.5, -14.5);
    const tex = consoleTexture(pick([color, '#4be1ff', '#35d07f']));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.1), new THREE.MeshBasicMaterial({ map: tex }));
    screen.position.set(x, p.h + 1.55, -14.95);
    screen.rotation.x = -0.35;
    group.add(desk, screen);
    screens.push(tex);
  }
  let redraw = 0;
  animated.push((t, dt = 1 / 60) => {
    redraw += dt;
    if (redraw < 0.5) return;
    redraw = 0;
    const tex = pick(screens);
    const fresh = consoleTexture(pick([color, '#4be1ff', '#35d07f']));
    tex.image = fresh.image;
    tex.needsUpdate = true;
  });

  // Floating holographic app windows, each on a projector beam.
  const apps = p.side === 'sender'
    ? [['🌐', 'Browser'], ['✉️', 'Mail · SMTP'], ['🎬', 'Video · QUIC'], ['💬', 'Chat'], ['🎮', 'Game · UDP'], ['📁', 'Files · SFTP']]
    : [['🐱', 'catpics.example'], ['🗄️', 'Database'], ['📊', 'Logs'], ['🔐', 'TLS certs'], ['⚙️', 'nginx']];
  apps.forEach(([icon, title], i) => {
    const mat = new THREE.MeshBasicMaterial({ map: appWindowTexture(icon, title, color), transparent: true, side: THREE.DoubleSide, opacity: 0.85, depthWrite: false });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), mat);
    const x = p.x0 + 5 + (i / (apps.length - 1)) * (span - 10);
    const baseY = p.h + rand(4.5, 6.5);
    const z = -11 + (i % 2) * 1.5;
    win.position.set(x, baseY, z);
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 12), glow(color, 1.5));
    emitter.position.set(x, p.h + 0.15, z);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.8, baseY - p.h - 1.3, 16, 1, true), holo(color, 0.08));
    beam.position.set(x, p.h + (baseY - p.h - 1.3) / 2 + 0.2, z);
    beam.rotation.x = Math.PI;
    group.add(win, emitter, beam);
    ctx.colliders.push({ x, z, r: 0.5 });
    animated.push((t) => {
      win.position.y = baseY + Math.sin(t * 0.9 + i) * 0.3;
      win.rotation.y = Math.sin(t * 0.3 + i) * 0.25;
      mat.opacity = 0.75 + Math.sin(t * 13 + i) * 0.04 + (Math.random() < 0.01 ? -0.4 : 0);
    });
  });

  // Comms dish: the DNS resolver talks to the rest of the galaxy through it.
  const comms = new THREE.Group();
  comms.position.set(cx + 7, p.h, 8.5);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.4, 10), std('#cfd6ff', { metalness: 0.8 }));
  mast.position.y = 1.2;
  const head = new THREE.Group();
  head.position.y = 2.6;
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2),
    std('#e8ecff', { side: THREE.DoubleSide, metalness: 0.5, roughness: 0.35 }),
  );
  dish.rotation.x = -Math.PI / 2 - 0.5;
  const feed = new THREE.Mesh(new THREE.SphereGeometry(0.16), glow('#ffd166', 3));
  feed.position.set(0, 0.55, -0.85);
  head.add(dish, feed);
  const sign = makeLabel(p.side === 'sender' ? 'DNS resolver\nname → IP' : 'HTTP cache', { size: 0.45, color: '#ffd166' });
  sign.position.y = 4.6;
  const pulses = [0, 1].map((i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 32), holo('#ffd166', 0.8));
    ring.userData.phase = i / 2;
    comms.add(ring);
    return ring;
  });
  comms.add(mast, head, sign);
  group.add(comms);
  ctx.colliders.push({ x: comms.position.x, z: comms.position.z, r: 1.6 });
  animated.push((t) => {
    head.rotation.y = Math.sin(t * 0.4) * 1.2;
    for (const r of pulses) {
      const k = (t * 0.6 + r.userData.phase) % 1;
      r.position.set(Math.sin(head.rotation.y) * -k * 6, 2.9 + k * 3.5, Math.cos(head.rotation.y) * -k * 6);
      r.lookAt(comms.position.x, 20, comms.position.z);
      r.scale.setScalar(0.5 + k * 2);
      r.material.opacity = 0.8 * (1 - k);
    }
  });

  // Low glowing bollards on the camera side.
  for (let x = p.x0 + 4; x < p.x1 - 2; x += 8) bollard(ctx, x, p.h, 13, color);
}

// -------------------------------------------------------------- transport
function buildCargoBay(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  const span = p.x1 - p.x0;

  // Stacked cargo pods on the far side (instanced), sorted into port bays.
  const palette = ['#e4572e', '#ffc914', '#2e86ab', '#76b041', '#a23b72', '#f18f01'];
  const spots = [];
  for (let x = p.x0 + 2.2; x < p.x1 - 1.5; x += 2.8) {
    const stack = 1 + Math.floor(rand(0, 3));
    for (let s = 0; s < stack; s++) spots.push([x, p.h + 0.75 + s * 1.5, -DECK_HALF + 2.3]);
  }
  const pods = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.65, 1.2, 4, 10), std('#ffffff', { roughness: 0.45 }), spots.length);
  const m = new THREE.Matrix4();
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  spots.forEach(([x, y, z], i) => {
    m.compose(new THREE.Vector3(x, y, z), rot, new THREE.Vector3(1, 1, 1));
    pods.setMatrixAt(i, m);
    pods.setColorAt(i, new THREE.Color(pick(palette)));
  });
  pods.castShadow = true;
  group.add(pods);
  const bandMat = glow('#ff8a3d', 1.2);
  const bands = new THREE.InstancedMesh(new THREE.TorusGeometry(0.68, 0.06, 6, 16), bandMat, spots.length);
  const bandRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  spots.forEach(([x, y, z], i) => {
    m.compose(new THREE.Vector3(x, y, z), bandRot, new THREE.Vector3(1, 1, 1));
    bands.setMatrixAt(i, m);
  });
  group.add(bands);
  ['80', '443', '53', '22', '25'].forEach((port, i) => {
    const l = makeLabel(`port ${port}`, { size: 0.45, color: '#fff', bg: 'rgba(0,0,0,0.5)' });
    l.position.set(p.x0 + 3 + i * ((span - 6) / 4), p.h + 5.2, -DECK_HALF + 3.2);
    group.add(l);
  });

  // A robot arm that picks a segment pod off the belt and stacks it.
  const arm = new THREE.Group();
  arm.position.set(cx + 3, p.h, -10.5);
  const armMat = std('#ffb000', { metalness: 0.6, roughness: 0.35 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.8, 16), std('#2a2f55'));
  base.position.y = 0.4;
  const turret = new THREE.Group();
  turret.position.y = 0.8;
  const shoulder = new THREE.Group();
  shoulder.position.y = 0.6;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), armMat);
  upper.position.y = 2;
  const elbow = new THREE.Group();
  elbow.position.y = 4;
  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 0.4), armMat);
  lower.position.y = 1.6;
  const wrist = new THREE.Group();
  wrist.position.y = 3.2;
  const claw = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.8, 4, 10), std('#2e86ab'));
  claw.rotation.z = Math.PI / 2;
  claw.position.y = 0.5;
  const jointMat = std('#39406e');
  for (const g of [shoulder, elbow, wrist]) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), jointMat));
  wrist.add(claw);
  elbow.add(lower, wrist);
  shoulder.add(upper, elbow);
  turret.add(shoulder);
  arm.add(base, turret);
  group.add(arm);
  ctx.colliders.push({ x: arm.position.x, z: arm.position.z, r: 1.4 });
  animated.push((t) => {
    const k = Math.sin(t * 0.5);
    turret.rotation.y = k * 1.3;
    shoulder.rotation.z = 0.35 + Math.sin(t * 0.5 + 1) * 0.25;
    elbow.rotation.z = 1.4 + Math.sin(t * 0.5 + 2) * 0.35;
    wrist.rotation.z = -0.3;
  });

  // A shuttle docked beyond the far edge, engines idling.
  const shuttle = makeShuttle('#ff8a3d');
  shuttle.position.set(cx - 5, p.h + 3, -DECK_HALF - 7);
  shuttle.rotation.y = p.side === 'sender' ? 0.2 : Math.PI - 0.2;
  group.add(shuttle);
  const dockTube = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 16, 1, true), std('#2a3158', { side: THREE.DoubleSide }));
  dockTube.rotation.x = Math.PI / 2;
  dockTube.position.set(cx - 5, p.h + 1.6, -DECK_HALF - 1.5);
  group.add(dockTube);
  const shuttleLabel = makeLabel('Segment shuttle', { size: 0.5, color: '#ffd2b0' });
  shuttleLabel.position.set(cx - 5, p.h + 7.2, -DECK_HALF - 7);
  group.add(shuttleLabel);
  animated.push((t) => { shuttle.position.y = p.h + 3 + Math.sin(t * 0.8) * 0.25; });

  // Maglev belt of TCP segments on the camera side.
  conveyor(ctx, p, 13.5, '#ff8a3d', (i) => `seq ${1001 + i * 1460}`);

  // Holo pennants: SYN, ACK, FIN, RST.
  ['SYN', 'ACK', 'FIN', 'RST'].forEach((flag, i) => {
    const x = p.x0 + 3 + i * ((span - 6) / 3);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5), std('#cfd6ff', { metalness: 0.8 }));
    pole.position.set(x, p.h + 2.5, -12.5);
    const cloth = makeLabel(flag, { size: 0.6, color: '#fff', bg: 'rgba(255,138,61,0.75)' });
    cloth.position.set(x + 0.9, p.h + 4.4, -12.5);
    group.add(pole, cloth);
    ctx.colliders.push({ x, z: -12.5, r: 0.5 });
    animated.push((t) => { cloth.material.rotation = Math.sin(t * 3 + i) * 0.08; });
  });
}

// --------------------------------------------------------------- internet
function buildNavDeck(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  const color = LAYERS.internet.color;

  // A holographic star chart: every planet is a network, labelled with its
  // prefix, and packets hop between them.
  const chart = new THREE.Group();
  chart.position.set(cx, p.h + 6.5, -DECK_HALF + 5.5);
  const star = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), glow('#ffd166', 2.5));
  chart.add(star);
  const nets = p.side === 'sender'
    ? ['192.168.1.0/24', '198.51.100.0/24', '10.0.0.0/8', '203.0.113.0/24']
    : ['203.0.113.0/24', '203.0.113.128/25', '172.16.0.0/12', '0.0.0.0/0'];
  const planets = nets.map((net, i) => {
    const r = 2.2 + i * 1.3;
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 4, 96), holo(color, 0.5));
    orbit.rotation.x = Math.PI / 2;
    chart.add(orbit);
    const planet = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35 + (i % 2) * 0.15, 16, 12), glow(pick(['#35d07f', '#4be1ff', '#b56cff', '#ff8a3d']), 1.2));
    const tag = makeLabel(net, { size: 0.32, color: '#dfffe9', bg: 'rgba(0,30,15,0.6)' });
    tag.position.y = 0.9;
    planet.add(ball, tag);
    chart.add(planet);
    return { planet, r, speed: 0.5 / (1 + i * 0.6), phase: i * 1.7 };
  });
  const grid = new THREE.Mesh(new THREE.CircleGeometry(8, 48), holo(color, 0.06));
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -0.5;
  chart.add(grid);
  const hopper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), glow('#ffffff', 2));
  chart.add(hopper);
  const projector = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2, 1, 24), std('#1c2458'));
  projector.position.set(cx, p.h + 0.5, chart.position.z);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(4, 5.5, 32, 1, true), holo(color, 0.05));
  cone.rotation.x = Math.PI;
  cone.position.set(cx, p.h + 3.7, chart.position.z);
  group.add(chart, projector, cone);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  animated.push((t) => {
    for (const pl of planets) {
      const a = t * pl.speed + pl.phase;
      pl.planet.position.set(Math.cos(a) * pl.r, 0, Math.sin(a) * pl.r);
    }
    // a packet hops from the innermost network outward, one hop per second
    const hop = Math.floor(t) % (planets.length - 1);
    const k = t % 1;
    tmpA.copy(planets[hop].planet.position);
    tmpB.copy(planets[hop + 1].planet.position);
    hopper.position.lerpVectors(tmpA, tmpB, k);
    hopper.position.y = Math.sin(k * Math.PI) * 1.2;
    hopper.rotation.y = t * 3;
  });

  // Nav beacons with routing-table arrows on the camera side.
  const signs = [['10.0.0.0/8', '←'], ['0.0.0.0/0', '→'], ['192.168.1.0/24', '↓'], ['203.0.113.0/24', '→']];
  signs.forEach(([prefix, arrow], i) => {
    const x = p.x0 + 3 + i * ((p.x1 - p.x0 - 6) / (signs.length - 1));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 3.2, 8), std('#8fa0d8', { metalness: 0.8 }));
    post.position.set(x, p.h + 1.6, 12);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18), glow(color, 3));
    lamp.position.set(x, p.h + 3.35, 12);
    const board = makeLabel(`${arrow} ${prefix}`, { size: 0.32, color: '#0b0f2a', bg: color });
    board.position.set(x, p.h + 3.9, 12);
    group.add(post, lamp, board);
    ctx.colliders.push({ x, z: 12, r: 0.45 });
    animated.push((t) => { lamp.visible = Math.sin(t * 2 + i) > -0.5; });
  });

  // Pneumatic mail tubes: an IP address is a label on an envelope.
  for (let i = 0; i < 3; i++) {
    const x = p.x0 + 4 + i * 4.5;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 6, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#9ef7c4', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    tube.position.set(x, p.h + 3, -13);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 16), std('#2a3158'));
    cap.position.set(x, p.h + 0.2, -13);
    const capTop = cap.clone();
    capTop.position.y = p.h + 6;
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 10), glow(color, 0.9));
    capsule.position.set(x, p.h + 1, -13);
    group.add(tube, cap, capTop, capsule);
    ctx.colliders.push({ x, z: -13, r: 0.7 });
    animated.push((t) => { capsule.position.y = p.h + 0.8 + ((t * 0.7 + i * 0.33) % 1) * 4.6; });
  }

  conveyor(ctx, p, 14.5, '#35d07f', (i) => `TTL ${64 - (i % 5)}`);
}

// ------------------------------------------------------------------- link
function buildEngineering(ctx, p) {
  const { group, animated } = ctx;
  const len = p.x1 - p.x0;
  const cx = (p.x0 + p.x1) / 2;

  // Reactor core: a glass column of plasma with magnetic rings riding it.
  const reactor = new THREE.Group();
  reactor.position.set(cx + 2, p.h, -DECK_HALF + 4.5);
  const plasmaMat = new THREE.MeshBasicMaterial({ color: '#3f9bd8', transparent: true, opacity: 0.8 });
  const plasma = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 10, 20), plasmaMat);
  plasma.position.y = 5.5;
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 10, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.16, metalness: 1, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  shell.position.y = 5.5;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 1, 24), std('#252c58'));
  foot.position.y = 0.5;
  const crown = foot.clone();
  crown.position.y = 10.8;
  reactor.add(plasma, shell, foot, crown);
  const coils = [0, 1, 2].map((i) => {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(2, 0.18, 8, 32), glow('#3d9bff', 1.2));
    coil.rotation.x = Math.PI / 2;
    coil.userData.phase = i / 3;
    reactor.add(coil);
    return coil;
  });
  const reactorLight = new THREE.PointLight('#5ab8ff', 30, 22, 1.8);
  reactorLight.position.y = 5;
  reactor.add(reactorLight);
  const rl = makeLabel('Reactor · powers the NIC', { size: 0.4, color: '#bfe9ff' });
  rl.position.y = 12.3;
  reactor.add(rl);
  group.add(reactor);
  animated.push((t) => {
    plasmaMat.opacity = 0.7 + Math.sin(t * 9) * 0.1 + Math.sin(t * 23) * 0.05;
    reactorLight.intensity = 26 + Math.sin(t * 9) * 6;
    for (const c of coils) c.position.y = 1.5 + ((t * 0.25 + c.userData.phase) % 1) * 8.5;
  });

  // Server racks with blinking LEDs (instanced), either side of the reactor.
  const racks = [];
  for (let x = p.x0 + 1.5; x < p.x1 - 1; x += 2.1) if (Math.abs(x - reactor.position.x) > 3.6) racks.push(x);
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

  // Overhead power conduit with light pulses running along it.
  const trayY = p.h + 7;
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, len, 12), std('#2b3370', { metalness: 0.7 }));
  tray.rotation.z = Math.PI / 2;
  tray.position.set(cx, trayY, -DECK_HALF + 6.5);
  group.add(tray);
  const pulses = [];
  for (let i = 0; i < 6; i++) {
    const pulse = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 12), glow('#4be1ff', 3));
    pulse.rotation.z = Math.PI / 2;
    pulse.userData.offset = i / 6;
    pulse.position.set(0, trayY, -DECK_HALF + 6.5);
    group.add(pulse);
    pulses.push(pulse);
  }
  animated.push((t) => {
    for (const pl of pulses) pl.position.x = p.x0 + ((t * 0.35 + pl.userData.offset) % 1) * len;
  });

  // Wi-Fi antenna with expanding rings.
  const ax = p.side === 'sender' ? p.x0 + 3 : p.x1 - 3;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 6, 8), std('#cfd6ff', { metalness: 0.8 }));
  mast.position.set(ax, p.h + 3, -12);
  group.add(mast);
  ctx.colliders.push({ x: ax, z: -12, r: 0.6 });
  const rings = [0, 1, 2].map((i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 48), new THREE.MeshBasicMaterial({ color: '#3d9bff', transparent: true }));
    r.position.set(ax, p.h + 6, -12);
    r.userData.phase = i / 3;
    group.add(r);
    return r;
  });
  animated.push((t) => {
    for (const r of rings) {
      const k = (t * 0.5 + r.userData.phase) % 1;
      r.scale.setScalar(0.3 + k * 5);
      r.material.opacity = 1 - k;
    }
  });
  const wifi = makeLabel('Wi-Fi · 802.11', { size: 0.4, color: '#bfe9ff' });
  wifi.position.set(ax, p.h + 7.6, -12);
  group.add(wifi);

  // A switch with port LEDs on the camera side.
  const sw = new THREE.Group();
  sw.position.set(cx - 5, p.h, 10.5);
  const body = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 1.6), std('#1d2350', { metalness: 0.6 }));
  body.position.y = 0.9;
  sw.add(body);
  const ports = [];
  for (let i = 0; i < 8; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: '#35d07f' }));
    led.position.set(-1.6 + i * 0.45, 1.05, 0.82);
    sw.add(led);
    ports.push(led);
  }
  const swLabel = makeLabel('Switch: learns MAC → port', { size: 0.35, color: '#bfe9ff' });
  swLabel.position.y = 2;
  sw.add(swLabel);
  group.add(sw);
  ctx.colliders.push({ x: sw.position.x - 1, z: 10.5, r: 1.2 }, { x: sw.position.x + 1, z: 10.5, r: 1.2 });
  animated.push((t) => ports.forEach((l, i) => { l.visible = Math.sin(t * 9 + i * 2.3) > -0.3; }));

  // The airlock to open space where the deck meets the network.
  const ax2 = p.side === 'sender' ? p.x1 + 0.5 : p.x0 - 0.5;
  const airlock = new THREE.Group();
  airlock.position.set(ax2, p.h, 0);
  const frameMat = std('#3a4270', { metalness: 0.8, roughness: 0.3 });
  const hazard = [];
  for (const z of [-DECK_HALF + 1, DECK_HALF - 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 10, 0.7), frameMat);
    pillar.position.set(0, 5, z);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.75), glow('#ffb000', 1));
    stripe.position.set(0, 1.2, z);
    airlock.add(pillar, stripe);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, DECK_HALF * 2 - 1), frameMat);
  lintel.position.y = 10;
  airlock.add(lintel);
  for (let i = 0; i < 5; i++) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffb000' }));
    lamp.position.set(0, 9.2, -12 + i * 6);
    airlock.add(lamp);
    hazard.push(lamp);
  }
  const sign = makeLabel('AIRLOCK · to the network', { size: 0.55, color: '#ffd166', bg: 'rgba(40,25,0,0.7)' });
  sign.position.y = 11.6;
  airlock.add(sign);
  group.add(airlock);
  animated.push((t) => hazard.forEach((l, i) => { l.visible = Math.sin(t * 5 + i * Math.PI / 2) > 0; }));
}

function bollard(ctx, x, h, z, color) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 10), std('#2a3158', { metalness: 0.8 }));
  post.position.set(x, h + 0.55, z);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 12), glow(color, 2.5));
  cap.position.set(x, h + 1.15, z);
  ctx.group.add(post, cap);
  ctx.colliders.push({ x, z, r: 0.4 });
}

// A small shuttle: fuselage, cockpit glass, delta wings and glowing engines.
export function makeShuttle(accent = '#4be1ff') {
  const g = new THREE.Group();
  const hullMat = std('#dfe4f5', { metalness: 0.5, roughness: 0.35 });
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 5, 6, 16), hullMat);
  fus.rotation.z = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#0a1830', metalness: 1, roughness: 0.05 }));
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(2.4, 0.45, 0);
  nose.scale.set(1, 1.1, 0.8);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(1.5, 0);
  wingShape.lineTo(-2.5, 4.2);
  wingShape.lineTo(-3.2, 4.2);
  wingShape.lineTo(-2.8, 0);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.18, bevelEnabled: false });
  const wingR = new THREE.Mesh(wingGeo, hullMat);
  wingR.rotation.x = Math.PI / 2;
  wingR.position.y = -0.3;
  const wingL = wingR.clone();
  wingL.scale.z = -1;
  wingL.rotation.x = -Math.PI / 2;
  wingL.position.y = -0.12;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.14), hullMat);
  fin.position.set(-2.4, 1.4, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.25, 2.42), glow(accent, 0.8));
  stripe.position.set(-0.2, 0.1, 0);
  g.add(fus, nose, wingR, wingL, fin, stripe);
  for (const z of [-0.55, 0.55]) {
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 0.8, 12, 1, true), std('#444a66', { side: THREE.DoubleSide }));
    bell.rotation.z = Math.PI / 2;
    bell.position.set(-3.7, 0, z);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 12, 1, true), holo(accent, 0.6));
    flame.rotation.z = Math.PI / 2;
    flame.position.set(-4.9, 0, z);
    g.add(bell, flame);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// A maglev belt along the camera-side edge with labelled pods riding on it.
function conveyor(ctx, p, z, color, labelFor) {
  const { group, animated } = ctx;
  const len = p.x1 - p.x0 - 2;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 1.2), std('#1b2046', { roughness: 0.6 }));
  belt.position.set((p.x0 + p.x1) / 2, p.h + 0.35, z);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.1), glow(color, 1.8));
  stripe.position.set((p.x0 + p.x1) / 2, p.h + 0.52, z);
  group.add(belt, stripe);
  const crates = [];
  for (let i = 0; i < 5; i++) {
    const crate = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), glow(color, 0.5));
    box.castShadow = true;
    const tag = makeLabel(labelFor(i), { size: 0.28, color: '#fff' });
    tag.position.y = 0.75;
    crate.add(box, tag);
    crate.userData.offset = i / 5;
    group.add(crate);
    crates.push(crate);
  }
  animated.push((t) => {
    for (const c of crates) {
      c.position.set(p.x0 + 1 + ((t * 0.06 + c.userData.offset) % 1) * len, p.h + 1.05 + Math.sin(t * 3 + c.userData.offset * 9) * 0.06, z);
    }
  });
}

// ------------------------------------------------------ drones and packets
// Maintenance drones and other people's packets drifting around each deck.
function spawnWanderers(ctx, p, count) {
  const colors = Object.values(LAYERS).map((l) => l.color);
  for (let i = 0; i < count; i++) {
    const npc = new THREE.Group();
    const isDrone = i % 2 === 0;
    let spinner;
    if (isDrone) {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), std('#d9deef', { metalness: 0.7, roughness: 0.25 }));
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), glow(pick(colors), 3));
      eye.position.z = 0.36;
      spinner = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24), glow('#4be1ff', 1.5));
      spinner.rotation.x = Math.PI / 2;
      npc.add(body, eye, spinner);
    } else {
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), glow(pick(colors), 0.9));
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: pick(colors), transparent: true, opacity: 0.2, depthWrite: false }));
      npc.add(core, shell);
      spinner = core;
    }
    const lift = isDrone ? 2.2 : 0.9;
    const state = { target: new THREE.Vector3(), speed: rand(1.5, 3), wait: 0 };
    const newTarget = () => state.target.set(rand(p.x0 + 2, p.x1 - 2), 0, rand(-12, 12));
    newTarget();
    npc.position.set(rand(p.x0 + 2, p.x1 - 2), p.h + lift, rand(-12, 12));
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
      npc.position.y = p.h + lift + (isDrone ? Math.sin(t * 2 + i) * 0.3 : Math.abs(Math.sin(t * 5 + i)) * 0.25);
      if (isDrone) spinner.rotation.z = t * 6;
      else spinner.rotation.x = t * 2;
    });
  }
}

const BUILDERS = { app: buildBridge, transport: buildCargoBay, internet: buildNavDeck, link: buildEngineering };

export function buildEnvironment(scene, plateaus, animatedList) {
  const ctx = { group: new THREE.Group(), animated: animatedList, colliders: [] };
  for (const p of plateaus) {
    BUILDERS[p.layer](ctx, p);
    spawnWanderers(ctx, p, 4);
  }
  scene.add(ctx.group);
  return { colliders: ctx.colliders };
}
