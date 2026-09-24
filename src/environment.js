import * as THREE from 'three';
import { LAYERS } from './content.js';
import { makeLabel } from './labels.js';

// Themed scenery for every layer plateau, plus wandering NPC packets.
// Each builder gets the plateau (x range, height, side) and returns nothing;
// it adds meshes to `ctx.group`, animations to `ctx.animated` and circular
// colliders ({ x, z, r }) to `ctx.colliders` for props inside the walk area.
//
// Layout convention: z < 0 is the far side (behind the stations, tall props
// are fine), z > 0 is the camera side (keep props low so they never hide the
// player).

export const DECK_HALF = 18;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...extra });
}

function glow(color, intensity = 1.2) {
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

// A floating app window: title bar, big emoji icon, a few text lines.
function appWindowTexture(icon, title, color) {
  return canvasTexture(256, 192, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(12,16,48,0.92)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, 30);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(title, 12, 21);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(w - 60 + i * 18, 15, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.font = '72px sans-serif';
    ctx.fillText(icon, 20, 118);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 4; i++) ctx.fillRect(116, 60 + i * 24, 120 - (i % 2) * 30, 10);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  });
}

function windowGridTexture(color) {
  return canvasTexture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0b1030';
    ctx.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 12) {
      for (let x = 6; x < w; x += 14) {
        ctx.fillStyle = Math.random() < 0.55 ? color : 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, y, 8, 6);
      }
    }
  });
}

// ------------------------------------------------------------ application
function buildApplication(ctx, p) {
  const { group, animated } = ctx;
  const color = LAYERS.app.color;
  const cx = (p.x0 + p.x1) / 2;

  // skyline of lit towers on the far side
  const towerTex = windowGridTexture('#e3c8ff');
  towerTex.wrapS = towerTex.wrapT = THREE.RepeatWrapping;
  for (let x = p.x0 + 3; x < p.x1 - 2; x += rand(3.5, 5.5)) {
    const hgt = rand(6, 16);
    const w = rand(2.2, 3.6);
    const tex = towerTex.clone();
    tex.repeat.set(1, hgt / 6);
    tex.needsUpdate = true;
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(w, hgt, w),
      new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.7, roughness: 0.6 }),
    );
    tower.position.set(x, p.h + hgt / 2, -DECK_HALF + rand(1.5, 3.5));
    tower.castShadow = true;
    group.add(tower);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18), glow('#ff4d6d', 3));
    tip.position.set(x, p.h + hgt + 0.3, tower.position.z);
    group.add(tip);
    animated.push((t) => { tip.visible = Math.sin(t * 3 + x) > 0; });
  }

  // floating app windows
  const apps = [
    ['🌐', 'Browser'], ['✉️', 'Mail · SMTP'], ['🎬', 'Video · QUIC'], ['💬', 'Chat'], ['🎮', 'Game · UDP'], ['📁', 'Files · SFTP'],
  ];
  apps.forEach(([icon, title], i) => {
    const mat = new THREE.MeshBasicMaterial({ map: appWindowTexture(icon, title, color), transparent: true, side: THREE.DoubleSide, opacity: 0.92 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), mat);
    const x = p.x0 + 5 + (i / (apps.length - 1)) * (p.x1 - p.x0 - 10);
    const baseY = p.h + rand(5, 8);
    win.position.set(x, baseY, -11 + (i % 2) * 2);
    win.rotation.y = rand(-0.25, 0.25);
    group.add(win);
    animated.push((t) => {
      win.position.y = baseY + Math.sin(t * 0.9 + i) * 0.4;
      win.rotation.y = Math.sin(t * 0.3 + i) * 0.25;
    });
  });

  // DNS kiosk: a booth with a giant spinning address book
  const booth = new THREE.Group();
  booth.position.set(cx + 6, p.h, 8);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.4), std('#2a2f66'));
  counter.position.y = 0.55;
  const book = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.9), glow('#ffd166', 0.6));
  book.position.y = 1.7;
  const sign = makeLabel(p.side === 'sender' ? 'DNS resolver\nname → IP' : 'HTTP cache', { size: 0.45, color: '#ffd166' });
  sign.position.y = 2.6;
  booth.add(counter, book, sign);
  group.add(booth);
  ctx.colliders.push({ x: booth.position.x, z: booth.position.z, r: 1.9 });
  animated.push((t) => { book.rotation.y = t; book.position.y = 1.7 + Math.sin(t * 2) * 0.1; });

  // lamp posts with glowing heads along the camera side
  for (let x = p.x0 + 4; x < p.x1 - 2; x += 9) lampPost(ctx, x, p.h, 12, color);
}

// -------------------------------------------------------------- transport
function buildTransport(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;

  // container stacks on the far side (instanced)
  const palette = ['#e4572e', '#ffc914', '#2e86ab', '#76b041', '#a23b72', '#f18f01'];
  const spots = [];
  for (let x = p.x0 + 2.5; x < p.x1 - 2; x += 3.4) {
    const stack = 1 + Math.floor(rand(0, 3));
    for (let s = 0; s < stack; s++) spots.push([x, p.h + 0.7 + s * 1.4, -DECK_HALF + 2.5 + (s % 2) * 0.2]);
  }
  const cont = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 1.35, 1.4), std('#ffffff', { roughness: 0.7 }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, y, z], i) => {
    m.makeTranslation(x, y, z);
    cont.setMatrixAt(i, m);
    cont.setColorAt(i, new THREE.Color(pick(palette)));
  });
  cont.castShadow = true;
  group.add(cont);
  ['80', '443', '53', '22', '25'].forEach((port, i) => {
    const l = makeLabel(`port ${port}`, { size: 0.45, color: '#fff', bg: 'rgba(0,0,0,0.5)' });
    l.position.set(p.x0 + 4 + i * ((p.x1 - p.x0 - 8) / 4), p.h + 4.6, -DECK_HALF + 3.5);
    group.add(l);
  });

  // a gantry crane that swings a container back and forth
  const crane = new THREE.Group();
  crane.position.set(cx, p.h, -DECK_HALF + 6);
  const legMat = std('#ffb000', { metalness: 0.6 });
  for (const dx of [-6, 6]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 11, 0.5), legMat);
    leg.position.set(dx, 5.5, 0);
    crane.add(leg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(13, 0.6, 0.8), legMat);
  beam.position.y = 11;
  const trolley = new THREE.Group();
  trolley.position.y = 10.5;
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4), std('#222'));
  cable.position.y = -2;
  const load = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1.1), std('#2e86ab'));
  load.position.y = -4.5;
  trolley.add(cable, load);
  crane.add(beam, trolley);
  group.add(crane);
  animated.push((t) => {
    trolley.position.x = Math.sin(t * 0.35) * 4.5;
    load.rotation.y = Math.sin(t * 0.5) * 0.2;
  });

  // conveyor of TCP segments on the camera side
  conveyor(ctx, p, 13.5, '#ff8a3d', (i) => `seq ${1001 + i * 1460}`);

  // flags on poles: SYN, ACK, FIN
  ['SYN', 'ACK', 'FIN', 'RST'].forEach((flag, i) => {
    const x = p.x0 + 3 + i * ((p.x1 - p.x0 - 6) / 3);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5), std('#cfd6ff', { metalness: 0.8 }));
    pole.position.set(x, p.h + 2.5, -12);
    const cloth = makeLabel(flag, { size: 0.6, color: '#fff', bg: '#ff8a3d' });
    cloth.position.set(x + 0.9, p.h + 4.4, -12);
    group.add(pole, cloth);
    ctx.colliders.push({ x, z: -12, r: 0.5 });
    animated.push((t) => { cloth.material.rotation = Math.sin(t * 3 + i) * 0.08; });
  });
}

// --------------------------------------------------------------- internet
function buildInternet(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  const color = LAYERS.internet.color;

  // a big holographic globe with orbiting packets
  const globe = new THREE.Group();
  globe.position.set(cx, p.h + 8, -DECK_HALF + 4);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(3.4, 24, 16), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.45 }));
  const core = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 16), new THREE.MeshStandardMaterial({ color: '#0b2a1c', emissive: color, emissiveIntensity: 0.15, transparent: true, opacity: 0.6 }));
  globe.add(core, sphere);
  const orbiters = [];
  for (let i = 0; i < 6; i++) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), glow(pick(['#35d07f', '#4be1ff', '#ffd166']), 2));
    o.userData = { r: rand(4, 5.2), speed: rand(0.4, 1), tilt: rand(-0.8, 0.8), phase: rand(0, 6) };
    globe.add(o);
    orbiters.push(o);
  }
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 4.5, 16), std('#1c2458'));
  pedestal.position.set(cx, p.h + 2.25, globe.position.z);
  group.add(globe, pedestal);
  animated.push((t) => {
    sphere.rotation.y = t * 0.15;
    for (const o of orbiters) {
      const { r, speed, tilt, phase } = o.userData;
      const a = t * speed + phase;
      o.position.set(Math.cos(a) * r, Math.sin(a) * r * tilt, Math.sin(a) * r);
    }
  });

  // signposts with routing-table arrows
  const signs = [['10.0.0.0/8', '←'], ['0.0.0.0/0', '→'], ['192.168.1.0/24', '↓'], ['203.0.113.0/24', '→']];
  signs.forEach(([prefix, arrow], i) => {
    const x = p.x0 + 3 + i * ((p.x1 - p.x0 - 6) / (signs.length - 1));
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 0.2), std('#8fa0d8', { metalness: 0.7 }));
    post.position.set(x, p.h + 1.6, 12);
    const board = makeLabel(`${arrow} ${prefix}`, { size: 0.32, color: '#0b0f2a', bg: color });
    board.position.set(x, p.h + 3.3, 12);
    group.add(post, board);
    ctx.colliders.push({ x, z: 12, r: 0.45 });
  });

  // mailboxes (IP = address on an envelope)
  for (let i = 0; i < 3; i++) {
    const mb = new THREE.Group();
    mb.position.set(p.x0 + 5 + i * 5, p.h, -12);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.1, 0.15), std('#666'));
    leg.position.y = 0.55;
    const box = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 4, 12), std('#35d07f', { metalness: 0.5 }));
    box.rotation.z = Math.PI / 2;
    box.position.y = 1.4;
    mb.add(leg, box);
    group.add(mb);
    ctx.colliders.push({ x: mb.position.x, z: -12, r: 0.7 });
  }

  conveyor(ctx, p, 14.5, '#35d07f', (i) => `TTL ${64 - (i % 5)}`);
}

// ------------------------------------------------------------------- link
function buildLink(ctx, p) {
  const { group, animated } = ctx;
  const len = p.x1 - p.x0;

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

  // overhead cable tray with light pulses running along it
  const trayY = p.h + 7;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 1.2), std('#2b3370', { metalness: 0.6 }));
  tray.position.set((p.x0 + p.x1) / 2, trayY, -DECK_HALF + 5);
  group.add(tray);
  const pulses = [];
  for (let i = 0; i < 6; i++) {
    const pulse = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.15), glow('#4be1ff', 3));
    pulse.userData.offset = i / 6;
    pulse.position.set(0, trayY + 0.2, -DECK_HALF + 5 + (i % 3 - 1) * 0.35);
    group.add(pulse);
    pulses.push(pulse);
  }
  animated.push((t) => {
    for (const pl of pulses) pl.position.x = p.x0 + ((t * 0.35 + pl.userData.offset) % 1) * len;
  });

  // Wi-Fi antenna with expanding rings
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

  // a switch with port LEDs on the camera side
  const sw = new THREE.Group();
  sw.position.set((p.x0 + p.x1) / 2 - 5, p.h, 10.5);
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
}

function lampPost(ctx, x, h, z, color) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 8), std('#9aa4d6', { metalness: 0.8 }));
  pole.position.set(x, h + 1.7, z);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 8), glow(color, 2.5));
  head.position.set(x, h + 3.5, z);
  ctx.group.add(pole, head);
  ctx.colliders.push({ x, z, r: 0.4 });
}

// A belt along the camera-side edge with small labelled crates riding on it.
function conveyor(ctx, p, z, color, labelFor) {
  const { group, animated } = ctx;
  const len = p.x1 - p.x0 - 2;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 1.2), std('#1b2046', { roughness: 0.9 }));
  belt.position.set((p.x0 + p.x1) / 2, p.h + 0.4, z);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.1), glow(color, 1.5));
  stripe.position.set((p.x0 + p.x1) / 2, p.h + 0.6, z + 0.62);
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
    crate.position.set(0, p.h + 0.9, z);
    group.add(crate);
    crates.push(crate);
  }
  animated.push((t) => {
    for (const c of crates) c.position.x = p.x0 + 1 + ((t * 0.06 + c.userData.offset) % 1) * len;
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
      npc.position.y = p.h + 0.9 + Math.abs(Math.sin(t * 5 + i)) * 0.25;
      core.rotation.x = t * 2;
    });
  }
}

const BUILDERS = { app: buildApplication, transport: buildTransport, internet: buildInternet, link: buildLink };

export function buildEnvironment(scene, plateaus, animatedList) {
  const ctx = { group: new THREE.Group(), animated: animatedList, colliders: [] };
  for (const p of plateaus) {
    BUILDERS[p.layer](ctx, p);
    spawnWanderers(ctx, p, 3);
  }
  scene.add(ctx.group);
  return { colliders: ctx.colliders };
}
