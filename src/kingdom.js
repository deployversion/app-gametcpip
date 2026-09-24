import * as THREE from 'three';
import { LAYERS } from './content.js';
import { makeLabel } from './labels.js';

// The Postal Kingdom: themed scenery for every layer terrace, plus the
// couriers who live there. The TCP/IP stack is a castle town built down a
// cliff: letters are written in the keep (application), sealed and numbered
// at the Courier Guild (transport), addressed at the Crossroads Post Office
// (internet) and loaded onto carts at the harbour stables (link). Across the
// Sea of Routes stands the receiving kingdom, Catpics Keep.
//
// Each builder gets the terrace (x range, height, side), adds meshes to
// `ctx.group`, animations to `ctx.animated` and circular colliders
// ({ x, z, r }) to `ctx.colliders` for props inside the walk area.
//
// Layout convention: z < 0 is the far side (behind the stations, tall props
// are fine), z > 0 is the camera side (keep props low so they never hide the
// player).

export const DECK_HALF = 18;
export const SERIF = 'Georgia, "Palatino Linotype", "Book Antiqua", serif';

export const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const STONE = '#b9ab95';
export const STONE_DARK = '#8a7d6b';
const WOOD = '#6b4a2f';
const WOOD_DARK = '#4a3220';
const ROOF = ['#8e3b2e', '#3f5d8a', '#5a6e3a', '#7a4a86'];

export function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...extra });
}

export function glow(color, intensity = 1.2) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- textures
// Cobblestones with a hint of the layer's colour in the mortar.
export function cobbleTexture(tint, repeatX, repeatY) {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = mix('#5b5146', tint, 0.18);
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const y = (r / rows) * h;
      const off = (r % 2) * 16;
      for (let x = -32 + off; x < w; x += 32) {
        const shade = 150 + Math.floor(Math.random() * 45);
        ctx.fillStyle = `rgb(${shade + 10}, ${shade}, ${shade - 18})`;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, 28 + rand(-2, 2), h / rows - 4, 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + 6, y + 5, 14, 3);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  return tex;
}

// Rough ashlar blocks for walls and cliffs.
export function stoneTexture(repeatX = 1, repeatY = 1, base = '#a8997f') {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6d6252';
    ctx.fillRect(0, 0, w, h);
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y = (r / rows) * h;
      const off = (r % 2) * 32;
      for (let x = -64 + off; x < w; x += 64) {
        const c = new THREE.Color(base).offsetHSL(0, rand(-0.03, 0.03), rand(-0.08, 0.06));
        ctx.fillStyle = `#${c.getHexString()}`;
        ctx.fillRect(x + 2, y + 2, 60, h / rows - 4);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x + 2, y + h / rows - 8, 60, 4);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

function windowsTexture() {
  return canvasTexture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (let y = 14; y < h - 10; y += 30) {
      for (let x = 10; x < w - 10; x += 26) {
        if (Math.random() < 0.35) continue;
        ctx.fillStyle = Math.random() < 0.8 ? '#ffc56b' : '#ff9a3c';
        ctx.beginPath();
        ctx.moveTo(x, y + 16);
        ctx.lineTo(x, y + 5);
        ctx.arc(x + 5, y + 5, 5, Math.PI, 0);
        ctx.lineTo(x + 10, y + 16);
        ctx.fill();
      }
    }
  });
}

// A heraldic banner: layer colour with a gold border and an emblem.
function bannerTexture(color, emblem) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h - 40);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h - 40);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f2c46d';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.font = '64px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emblem, w / 2, h * 0.42);
  });
}

function scrollTexture(icon, title, color) {
  return canvasTexture(256, 192, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f6e7c1');
    g.addColorStop(1, '#e2c98f');
    ctx.fillStyle = g;
    ctx.fillRect(8, 14, w - 16, h - 28);
    ctx.fillStyle = '#b08a52';
    ctx.fillRect(0, 0, w, 16);
    ctx.fillRect(0, h - 16, w, 16);
    ctx.fillStyle = color;
    ctx.font = 'bold 22px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, 44);
    ctx.font = '62px serif';
    ctx.fillText(icon, w / 2, 118);
    ctx.fillStyle = 'rgba(80,50,20,0.35)';
    for (let i = 0; i < 3; i++) ctx.fillRect(40, 140 + i * 11, w - 80 - (i % 2) * 40, 4);
  });
}

function mix(a, b, k) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
}

// ------------------------------------------------------------ build kit
// A round stone tower with a pointy slate roof and a gold finial.
export function tower(group, { x, y, z, r = 1.6, h = 10, roof = pick(ROOF), windows = true }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.08, h, 16),
    std(STONE, { map: stoneTexture(2, h / 4) }),
  );
  wall.position.y = h / 2;
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);
  if (windows) {
    const wt = windowsTexture();
    wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
    wt.repeat.set(3, h / 7);
    const lit = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.01, r * 1.09, h * 0.8, 16, 1, true),
      new THREE.MeshBasicMaterial({ map: wt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    lit.position.y = h * 0.5;
    g.add(lit);
  }
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.2, 0.8, 16), std(STONE_DARK));
  ring.position.y = h + 0.4;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 1.4, r * 2.8, 16), std(roof, { roughness: 0.7 }));
  cone.position.y = h + 0.8 + r * 1.4;
  cone.castShadow = true;
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), glow('#f2c46d', 0.6));
  fin.position.y = h + 0.8 + r * 2.8 + 0.1;
  g.add(ring, cone, fin);
  group.add(g);
  return g;
}

// A pennant on top of a pole, animated to flutter.
export function flag(ctx, x, y, z, color, len = 2.2) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), std('#3a3026'));
  pole.position.set(x, y + 1.3, z);
  const geo = new THREE.PlaneGeometry(len, 0.7, 8, 1);
  geo.translate(len / 2, 0, 0);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.9 }));
  cloth.position.set(x, y + 2.2, z);
  ctx.group.add(pole, cloth);
  const pos = geo.attributes.position;
  const base = Float32Array.from(pos.array);
  const phase = x * 0.7;
  ctx.animated.push((t) => {
    for (let i = 0; i < pos.count; i++) {
      const px = base[i * 3];
      pos.array[i * 3 + 2] = Math.sin(px * 2.2 - t * 5 + phase) * 0.18 * (px / len);
    }
    pos.needsUpdate = true;
  });
}

// A long hanging banner on a wall, waving gently.
function hangingBanner(ctx, x, y, z, color, emblem, w = 1.6, h = 3.4) {
  const geo = new THREE.PlaneGeometry(w, h, 1, 8);
  const mat = new THREE.MeshStandardMaterial({ map: bannerTexture(color, emblem), transparent: true, side: THREE.DoubleSide, roughness: 0.9 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  ctx.group.add(m);
  const pos = geo.attributes.position;
  const base = Float32Array.from(pos.array);
  ctx.animated.push((t) => {
    for (let i = 0; i < pos.count; i++) {
      const py = base[i * 3 + 1];
      const k = (h / 2 - py) / h;
      pos.array[i * 3 + 2] = Math.sin(t * 1.6 + py * 1.3 + x) * 0.15 * k;
    }
    pos.needsUpdate = true;
  });
}

// An iron lantern on a post; the flame flickers.
export function lantern(ctx, x, y, z, color = '#ffb64d', collide = true) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3, 6), std('#2e2a26', { metalness: 0.5 }));
  pole.position.set(x, y + 1.5, z);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.6, 6, 1, true), std('#2e2a26', { metalness: 0.5, wireframe: true }));
  cage.position.set(x, y + 3.2, z);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 6), std('#2e2a26'));
  cap.position.set(x, y + 3.65, z);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glow(color, 3));
  flame.position.set(x, y + 3.2, z);
  ctx.group.add(pole, cage, cap, flame);
  if (collide) ctx.colliders.push({ x, z, r: 0.4 });
  const ph = x * 1.7 + z;
  ctx.animated.push((t) => {
    flame.material.emissiveIntensity = 2.6 + Math.sin(t * 13 + ph) * 0.4 + Math.sin(t * 7.3 + ph) * 0.3;
  });
}

// Low-poly trees, gathered and instanced once per world.
export function makeForest(spots) {
  const group = new THREE.Group();
  if (!spots.length) return group;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6), std(WOOD_DARK), spots.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 0), std('#ffffff', { flatShading: true }), spots.length);
  const pines = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 3.4, 7), std('#ffffff', { flatShading: true }), spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const greens = ['#4f7a3a', '#5d8a3f', '#3f6b35', '#6f9444', '#8a9a3c'].map((c) => new THREE.Color(c));
  spots.forEach(([x, y, z, s = 1], i) => {
    const sc = s * rand(0.8, 1.25);
    m.compose(new THREE.Vector3(x, y + 0.8 * sc, z), q, new THREE.Vector3(sc, sc, sc));
    trunks.setMatrixAt(i, m);
    const pine = Math.random() < 0.45;
    q.setFromEuler(new THREE.Euler(0, rand(0, 6), 0));
    m.compose(new THREE.Vector3(x, y + (pine ? 2.9 : 2.5) * sc, z), q, new THREE.Vector3(sc, sc * rand(0.9, 1.2), sc));
    (pine ? pines : crowns).setMatrixAt(i, m);
    (pine ? crowns : pines).setMatrixAt(i, hide);
    const c = pick(greens);
    crowns.setColorAt(i, c);
    pines.setColorAt(i, c);
    q.identity();
  });
  for (const mesh of [trunks, crowns, pines]) mesh.castShadow = true;
  group.add(trunks, crowns, pines);
  return group;
}

// A crenellated curtain wall along the far edge of a terrace.
function curtainWall(ctx, p) {
  const len = p.x1 - p.x0;
  const z = -DECK_HALF + 0.9;
  const h = 4.2;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(len, h, 1.6), std(STONE, { map: stoneTexture(len / 4, 1.2) }));
  wall.position.set((p.x0 + p.x1) / 2, p.h + h / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  ctx.group.add(wall);
  const count = Math.floor(len / 1.6);
  const merlons = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 1.7), std(STONE), count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.makeTranslation(p.x0 + 0.8 + i * 1.6, p.h + h + 0.45, z);
    merlons.setMatrixAt(i, m);
  }
  merlons.castShadow = true;
  ctx.group.add(merlons);

  // a low parapet on the camera side, so the view stays open
  const par = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.7), std(STONE_DARK, { map: stoneTexture(len / 3, 0.4) }));
  par.position.set((p.x0 + p.x1) / 2, p.h + 0.45, DECK_HALF - 0.35);
  par.receiveShadow = true;
  ctx.group.add(par);

  const layer = LAYERS[p.layer];
  const emblem = { app: '✒️', transport: '🕊️', internet: '🧭', link: '🐎' }[p.layer];
  for (let x = p.x0 + 4; x < p.x1 - 2; x += 8) hangingBanner(ctx, x, p.h + 2.3, z + 0.85, layer.color, emblem);
}

// ------------------------------------------------------------ application
function buildApplication(ctx, p) {
  const { group, animated } = ctx;
  const color = LAYERS.app.color;
  const cx = (p.x0 + p.x1) / 2;
  const sender = p.side === 'sender';

  // the keep: a great hall flanked by towers, rising behind the wall
  const keep = new THREE.Group();
  const hall = new THREE.Mesh(new THREE.BoxGeometry(16, 12, 8), std(STONE, { map: stoneTexture(4, 3) }));
  hall.position.set(0, 6, 0);
  hall.castShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(9.5, 6, 4), std(sender ? '#7a4a86' : '#8e3b2e'));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.55);
  roof.position.set(0, 15, 0);
  const rose = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), glow(sender ? '#e8c6ff' : '#ffd08a', 1.4));
  rose.position.set(0, 8.5, 4.02);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.6), glow('#ffb64d', 0.9));
  door.position.set(0, 1.8, 4.02);
  keep.add(hall, roof, rose, door);
  const keepZ = -DECK_HALF - 5;
  keep.position.set(cx, p.h, keepZ);
  group.add(keep);
  tower(group, { x: cx - 10, y: p.h, z: keepZ + 1, r: 2.2, h: 17, roof: sender ? '#7a4a86' : '#8e3b2e' });
  tower(group, { x: cx + 10, y: p.h, z: keepZ + 1, r: 2.2, h: 14, roof: sender ? '#7a4a86' : '#8e3b2e' });
  tower(group, { x: cx + 15, y: p.h, z: keepZ + 5, r: 1.3, h: 9 });
  flag(ctx, cx - 10, p.h + 17 + 6.2, keepZ + 1, color);
  flag(ctx, cx + 10, p.h + 14 + 6.2, keepZ + 1, sender ? '#f2c46d' : '#ff6fb5');

  // floating scrolls: every kind of letter the kingdom sends
  const scrolls = [
    ['✉️', 'Letter · HTTP'], ['📯', 'Herald · SMTP'], ['🎭', 'Play · video'], ['💬', 'Whisper · chat'], ['♟️', 'Chess · UDP'], ['📦', 'Crate · SFTP'],
  ];
  scrolls.forEach(([icon, title], i) => {
    const mat = new THREE.MeshBasicMaterial({ map: scrollTexture(icon, title, '#5b2e7a'), transparent: true, side: THREE.DoubleSide });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.55), mat);
    const x = p.x0 + 5 + (i / (scrolls.length - 1)) * (p.x1 - p.x0 - 10);
    const baseY = p.h + rand(6, 8.5);
    s.position.set(x, baseY, -12 + (i % 2) * 2);
    group.add(s);
    animated.push((t) => {
      s.position.y = baseY + Math.sin(t * 0.9 + i) * 0.35;
      s.rotation.y = Math.sin(t * 0.3 + i) * 0.3;
      s.rotation.z = Math.sin(t * 0.7 + i) * 0.04;
    });
  });

  // the Herald's Registry (DNS) or the Royal Archive (HTTP cache)
  const booth = new THREE.Group();
  booth.position.set(cx + 6, p.h, 8);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 1.4), std(WOOD));
  counter.position.y = 0.55;
  counter.castShadow = true;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 4), std(sender ? '#7a4a86' : '#8e3b2e'));
  canopy.rotation.y = Math.PI / 4;
  canopy.position.y = 3.6;
  for (const dx of [-1.5, 1.5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), std(WOOD_DARK));
    post.position.set(dx, 1.5, -0.5);
    booth.add(post);
  }
  const book = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.95), glow('#ffd166', 0.6));
  book.position.y = 1.8;
  const sign = makeLabel(sender ? "Herald's Registry\nname → address (DNS)" : 'Royal Archive\ncopies kept (HTTP cache)', { size: 0.42, color: '#3b2410', bg: 'rgba(246,231,193,0.92)', family: SERIF, border: '#b08a52' });
  sign.position.y = 4.8;
  booth.add(counter, canopy, book, sign);
  group.add(booth);
  ctx.colliders.push({ x: booth.position.x, z: booth.position.z, r: 1.9 });
  animated.push((t) => { book.rotation.y = t; book.position.y = 1.8 + Math.sin(t * 2) * 0.1; });

  // a scribe's desk with an inkwell and a nodding quill
  const desk = new THREE.Group();
  desk.position.set(cx - 7, p.h, 9);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.2), std(WOOD));
  top.position.y = 1.05;
  top.rotation.x = -0.15;
  for (const [dx, dz] of [[-1, -0.45], [1, -0.45], [-1, 0.45], [1, 0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), std(WOOD_DARK));
    leg.position.set(dx, 0.5, dz);
    desk.add(leg);
  }
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.7), std('#f6e7c1'));
  paper.rotation.x = -Math.PI / 2 - 0.15;
  paper.position.set(-0.2, 1.14, 0);
  const quill = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.2, 5), std('#ffffff'));
  quill.position.set(0.6, 1.6, 0);
  desk.add(top, paper, quill);
  group.add(desk);
  ctx.colliders.push({ x: desk.position.x, z: desk.position.z, r: 1.5 });
  animated.push((t) => { quill.rotation.z = Math.sin(t * 4) * 0.35; });

  for (let x = p.x0 + 4; x < p.x1 - 2; x += 9) lantern(ctx, x, p.h, 14.5);
}

// -------------------------------------------------------------- transport
function buildTransport(ctx, p) {
  const { group, animated } = ctx;
  const color = LAYERS.transport.color;
  const cx = (p.x0 + p.x1) / 2;

  // the Courier Guild's wall of pigeonholes: one cubby per port
  const ports = ['22', '25', '53', '80', '443', '8080', '993', '123', '51514'];
  const holes = canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = '#4a3220';
    c.fillRect(0, 0, w, h);
    const cols = ports.length;
    for (let i = 0; i < cols; i++) {
      for (let r = 0; r < 3; r++) {
        const x = 6 + i * ((w - 12) / cols);
        const y = 30 + r * 74;
        c.fillStyle = '#1e140c';
        c.fillRect(x + 3, y, (w - 12) / cols - 6, 62);
        if (Math.random() < 0.55) {
          c.fillStyle = pick(['#f6e7c1', '#e9d3a0', '#fff4d6']);
          c.fillRect(x + 8, y + 26, (w - 12) / cols - 16, 30);
          c.fillStyle = pick(['#c0392b', color, '#8e3b2e']);
          c.beginPath();
          c.arc(x + (w - 12) / cols / 2, y + 41, 5, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.fillStyle = '#f2c46d';
      c.font = 'bold 18px Georgia, serif';
      c.textAlign = 'center';
      c.fillText(ports[i], 6 + (i + 0.5) * ((w - 12) / cols), 22);
    }
  });
  const len = p.x1 - p.x0 - 4;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 6, 1), [
    std(WOOD_DARK), std(WOOD_DARK), std(WOOD_DARK), std(WOOD_DARK), std('#ffffff', { map: holes }), std(WOOD_DARK),
  ]);
  wall.position.set(cx, p.h + 3.2, -DECK_HALF + 3.2);
  wall.castShadow = true;
  group.add(wall);
  const sign = makeLabel('COURIER GUILD · one cubby per port', { size: 0.6, color: '#3b2410', bg: 'rgba(246,231,193,0.92)', family: SERIF, font: 700, border: '#b08a52' });
  sign.position.set(cx, p.h + 7, -DECK_HALF + 3.9);
  group.add(sign);

  // a dovecote tower with carrier pigeons circling it
  const dx = p.x0 + 3;
  tower(group, { x: dx, y: p.h, z: -DECK_HALF - 2, r: 1.5, h: 11, roof: '#8e3b2e' });
  ctx.pigeons.push({ cx: dx, cy: p.h + 13, cz: -DECK_HALF - 2, r: 5, n: 6 });

  // a wooden hoist lifting mail sacks onto the guild's loft
  const hoist = new THREE.Group();
  hoist.position.set(p.x1 - 3, p.h, -10);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8, 0.4), std(WOOD));
  mast.position.y = 4;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 0.3), std(WOOD));
  arm.position.set(-1.8, 7.8, 0);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), std('#c9b27a'));
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), std('#b8955e'));
  sack.scale.set(1, 1.2, 1);
  hoist.add(mast, arm, rope, sack);
  group.add(hoist);
  ctx.colliders.push({ x: hoist.position.x, z: -10, r: 0.6 });
  animated.push((t) => {
    const k = (Math.sin(t * 0.6) + 1) / 2;
    const sy = 1.2 + k * 5;
    sack.position.set(-3.8, sy, 0);
    rope.scale.y = 7.8 - sy;
    rope.position.set(-3.8, (7.8 + sy) / 2, 0);
    sack.rotation.y = t * 0.4;
  });

  // a wax-seal press stamping sequence numbers
  const press = new THREE.Group();
  press.position.set(cx + 7, p.h, 9);
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 1.4), std(WOOD));
  table.position.y = 0.5;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), std('#3a3026', { metalness: 0.6 }));
  frame.position.set(0, 2, -0.5);
  const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 16), std('#8a7d6b', { metalness: 0.6 }));
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16), glow(color, 0.8));
  wax.position.set(0, 1.05, 0);
  const tag = makeLabel('Seal press · seq numbers', { size: 0.35, color: '#3b2410', bg: 'rgba(246,231,193,0.9)', family: SERIF });
  tag.position.y = 3.6;
  press.add(table, frame, ram, wax, tag);
  group.add(press);
  ctx.colliders.push({ x: press.position.x, z: 9, r: 1.5 });
  animated.push((t) => {
    const k = Math.max(0, Math.sin(t * 2.5));
    ram.position.set(0, 2.2 - k * 0.9, 0);
    wax.scale.setScalar(1 + (k > 0.95 ? 0.25 : 0));
  });

  // envelopes sliding down a chute with their sequence numbers
  chute(ctx, p, 14.4, color, (i) => `seq ${1001 + i * 1460}`, 'envelope');

  // heraldic pennants for the TCP flags
  ['SYN', 'ACK', 'FIN', 'RST'].forEach((f, i) => {
    const x = p.x0 + 3 + i * ((p.x1 - p.x0 - 6) / 3);
    flag(ctx, x, p.h, -12.5, i === 3 ? '#8e3b2e' : color, 1.6);
    const l = makeLabel(f, { size: 0.45, color: '#fff', bg: 'rgba(40,24,12,0.8)', family: SERIF, font: 700 });
    l.position.set(x + 0.8, p.h + 3.2, -12.5);
    group.add(l);
    ctx.colliders.push({ x, z: -12.5, r: 0.5 });
  });
}

// --------------------------------------------------------------- internet
function buildInternet(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  const color = LAYERS.internet.color;

  // an armillary sphere: the realm's addresses, orbiting a golden core
  const arm = new THREE.Group();
  arm.position.set(cx, p.h + 8.5, -DECK_HALF + 4);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), glow('#ffd166', 1.4));
  arm.add(core);
  const rings = [0, 1, 2].map((i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(2.6 + i * 0.5, 0.09, 8, 64), std('#c9a24a', { metalness: 0.8, roughness: 0.3 }));
    r.rotation.set(i * 0.9, i * 0.6, 0);
    arm.add(r);
    return r;
  });
  const letters = [];
  for (let i = 0; i < 6; i++) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.05), glow('#fff4d6', 0.9));
    o.userData = { r: rand(3.6, 4.4), speed: rand(0.4, 0.9), tilt: rand(-0.8, 0.8), phase: rand(0, 6) };
    arm.add(o);
    letters.push(o);
  }
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.6, 5, 12), std(STONE, { map: stoneTexture(1, 1.5) }));
  pedestal.position.set(cx, p.h + 2.5, arm.position.z);
  pedestal.castShadow = true;
  group.add(arm, pedestal);
  animated.push((t) => {
    rings.forEach((r, i) => { r.rotation.y += 0.004 * (i + 1); r.rotation.x += 0.002 * (2 - i); });
    for (const o of letters) {
      const { r, speed, tilt, phase } = o.userData;
      const a = t * speed + phase;
      o.position.set(Math.cos(a) * r, Math.sin(a) * r * tilt, Math.sin(a) * r);
      o.lookAt(0, 0, 0);
    }
  });

  // the great signpost: routing table rows as pointing boards
  const signs = [['10.0.0.0/8', -1], ['0.0.0.0/0', 1], ['192.168.1.0/24', -1], ['203.0.113.0/24', 1]];
  signs.forEach(([prefix, dir], i) => {
    const x = p.x0 + 3 + i * ((p.x1 - p.x0 - 6) / (signs.length - 1));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 3.4, 6), std(WOOD_DARK));
    post.position.set(x, p.h + 1.7, 12);
    const board = makeLabel(`${dir < 0 ? '◀' : ''} ${prefix} ${dir > 0 ? '▶' : ''}`, { size: 0.34, color: '#3b2410', bg: '#e9d3a0', family: SERIF, font: 700, border: '#6b4a2f' });
    board.position.set(x, p.h + 3.3, 12);
    group.add(post, board);
    ctx.colliders.push({ x, z: 12, r: 0.45 });
  });

  // royal pillar postboxes (an IP address is the address on the envelope)
  for (let i = 0; i < 3; i++) {
    const mb = new THREE.Group();
    mb.position.set(p.x0 + 4 + i * 4.5, p.h, -12);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.6, 16), std('#b3261e', { roughness: 0.5 }));
    body.position.y = 0.8;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#b3261e', { roughness: 0.5 }));
    cap.position.y = 1.6;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.1), std('#1a0c08'));
    slot.position.set(0, 1.25, 0.47);
    const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), glow('#f2c46d', 0.8));
    crown.position.y = 2.2;
    mb.add(body, cap, slot, crown);
    group.add(mb);
    ctx.colliders.push({ x: mb.position.x, z: -12, r: 0.7 });
  }

  // a windmill turning over the post office
  const mill = new THREE.Group();
  mill.position.set(p.x1 - 4, p.h, -DECK_HALF - 3);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 9, 8), std('#e7dcc6'));
  body.position.y = 4.5;
  body.castShadow = true;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.4, 8), std('#8e3b2e'));
  cap.position.y = 10.2;
  const hub = new THREE.Group();
  hub.position.set(0, 8.4, 1.9);
  for (let i = 0; i < 4; i++) {
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 5, 0.08), std('#f6e7c1', { side: THREE.DoubleSide }));
    sail.position.y = 2.7;
    const holder = new THREE.Group();
    holder.rotation.z = (i * Math.PI) / 2;
    holder.add(sail);
    hub.add(holder);
  }
  mill.add(body, cap, hub);
  group.add(mill);
  animated.push((t) => { hub.rotation.z = t * 0.7; });

  const sign = makeLabel('CROSSROADS POST OFFICE', { size: 0.6, color: '#3b2410', bg: 'rgba(246,231,193,0.92)', family: SERIF, font: 700, border: color });
  sign.position.set(cx - 6, p.h + 5, -DECK_HALF + 2.5);
  group.add(sign);

  chute(ctx, p, 14.6, color, (i) => `TTL ${64 - (i % 5)}`, 'parcel');
}

// ------------------------------------------------------------------- link
function buildLink(ctx, p) {
  const { group, animated } = ctx;
  const color = LAYERS.link.color;
  const len = p.x1 - p.x0;
  const cx = (p.x0 + p.x1) / 2;

  // the stables: a row of stalls with a long tiled roof
  const stable = new THREE.Group();
  stable.position.set(cx, p.h, -DECK_HALF + 3);
  const back = new THREE.Mesh(new THREE.BoxGeometry(len - 2, 3.6, 0.3), std(WOOD));
  back.position.set(0, 1.8, -1.3);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len - 1, 0.25, 3.6), std('#8e3b2e'));
  roof.position.set(0, 3.9, 0);
  roof.rotation.x = 0.28;
  stable.add(back, roof);
  const stalls = Math.floor((len - 2) / 2.6);
  for (let i = 0; i <= stalls; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 0.25), std(WOOD_DARK));
    post.position.set(-(len - 2) / 2 + i * ((len - 2) / stalls), 1.7, 1.3);
    stable.add(post);
    if (i < stalls) {
      const l = makeLabel(`stall ${i + 1}`, { size: 0.22, color: '#f6e7c1', bg: null, family: SERIF });
      l.position.set(post.position.x + (len - 2) / stalls / 2, 3.2, 1.35);
      stable.add(l);
    }
  }
  group.add(stable);

  // mail carts shuttling along the lane: frames between neighbours
  for (let i = 0; i < 2; i++) {
    const cart = makeCart(i === 0 ? color : '#8e3b2e');
    group.add(cart);
    const z = -10 + i * 1.8;
    const ph = i * Math.PI;
    animated.push((t) => {
      const s = Math.sin(t * 0.25 + ph);
      cart.position.set(cx + s * (len / 2 - 3), p.h, z);
      cart.rotation.y = Math.cos(t * 0.25 + ph) > 0 ? 0 : Math.PI;
      cart.userData.wheels.forEach((w) => { w.rotation.z = -t * 3 * Math.sign(Math.cos(t * 0.25 + ph)); });
      cart.userData.horse.position.y = 0.05 + Math.abs(Math.sin(t * 6)) * 0.08;
    });
  }

  // the signal bell tower: frames ring out over the air (Wi-Fi)
  const ax = p.side === 'sender' ? p.x0 + 3 : p.x1 - 3;
  tower(group, { x: ax, y: p.h, z: -12.5, r: 1, h: 6, roof: '#3f5d8a', windows: false });
  ctx.colliders.push({ x: ax, z: -12.5, r: 1.3 });
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 0.6, 12, 1, true), std('#c9a24a', { metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }));
  bell.position.set(ax, p.h + 5.3, -11.4);
  group.add(bell);
  const rings = [0, 1, 2].map((i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 48), new THREE.MeshBasicMaterial({ color: '#9fd0ff', transparent: true }));
    r.position.set(ax, p.h + 7.5, -12.5);
    r.userData.phase = i / 3;
    group.add(r);
    return r;
  });
  animated.push((t) => {
    bell.rotation.z = Math.sin(t * 3) * 0.3;
    for (const r of rings) {
      const k = (t * 0.5 + r.userData.phase) % 1;
      r.scale.setScalar(0.3 + k * 5);
      r.material.opacity = 1 - k;
    }
  });
  const bellSign = makeLabel('Bell tower · over the air (Wi-Fi)', { size: 0.35, color: '#3b2410', bg: 'rgba(246,231,193,0.9)', family: SERIF });
  bellSign.position.set(ax, p.h + 11.8, -12.5);
  group.add(bellSign);

  // the stablemaster's board: which cart tag lives in which stall (a switch)
  const board = new THREE.Group();
  board.position.set(cx - 4, p.h, 10.5);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 0.2), std(WOOD));
  panel.position.y = 1.8;
  const legs = [-1.4, 1.4].map((x) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), std(WOOD_DARK));
    l.position.set(x, 0.8, 0);
    return l;
  });
  board.add(panel, ...legs);
  const pegs = [];
  for (let i = 0; i < 8; i++) {
    const peg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.08), glow('#ffd166', 0.8));
    peg.position.set(-1.3 + i * 0.37, 1.8 + (i % 2 ? 0.4 : -0.3), 0.13);
    board.add(peg);
    pegs.push(peg);
  }
  const bl = makeLabel('Stablemaster: learns tag → stall (switch)', { size: 0.33, color: '#3b2410', bg: 'rgba(246,231,193,0.9)', family: SERIF });
  bl.position.y = 3.3;
  board.add(bl);
  group.add(board);
  ctx.colliders.push({ x: board.position.x - 1, z: 10.5, r: 1.2 }, { x: board.position.x + 1, z: 10.5, r: 1.2 });
  animated.push((t) => pegs.forEach((l, i) => { l.visible = Math.sin(t * 5 + i * 2.3) > -0.4; }));

  // barrels and crates by the harbour edge
  for (let i = 0; i < 5; i++) {
    const x = cx + 3 + i * 1.1;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 12), std(WOOD));
    barrel.position.set(x, p.h + 0.5 + (i === 4 ? 1 : 0), 14.8 - (i % 2) * 0.9);
    barrel.castShadow = true;
    group.add(barrel);
  }
  lantern(ctx, p.x0 + 1.5, p.h, 14.5, '#ffd08a');
  lantern(ctx, p.x1 - 1.5, p.h, 14.5, '#ffd08a');
}

function makeCart(color) {
  const cart = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.3), std(WOOD));
  bed.position.set(-0.8, 1, 0);
  bed.castShadow = true;
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.2, 12, 1, false, 0, Math.PI), std('#efe2c4', { side: THREE.DoubleSide }));
  cover.rotation.z = Math.PI / 2;
  cover.rotation.y = Math.PI / 2;
  cover.rotation.set(0, 0, Math.PI / 2);
  cover.position.set(-0.8, 1.35, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.18, 1.35), std(color));
  stripe.position.set(-0.8, 1.2, 0);
  cart.add(bed, cover, stripe);
  const wheels = [];
  for (const [x, z] of [[-1.5, 0.72], [-0.1, 0.72], [-1.5, -0.72], [-0.1, -0.72]]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.07, 6, 12), std(WOOD_DARK));
    w.position.set(x, 0.42, z);
    cart.add(w);
    wheels.push(w);
  }
  const horse = new THREE.Group();
  const hb = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), std('#7a5230'));
  hb.rotation.z = Math.PI / 2;
  hb.position.set(0, 1.25, 0);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.6, 4, 8), std('#7a5230'));
  neck.position.set(0.7, 1.7, 0);
  neck.rotation.z = -0.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.26, 0.26), std('#6a4526'));
  head.position.set(1.05, 1.95, 0);
  horse.add(hb, neck, head);
  for (const [x, z] of [[-0.45, 0.2], [-0.45, -0.2], [0.45, 0.2], [0.45, -0.2]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), std('#5a3a20'));
    leg.position.set(x, 0.5, z);
    horse.add(leg);
  }
  horse.position.x = 1.3;
  cart.add(horse);
  cart.userData = { wheels, horse };
  return cart;
}

// A wooden chute along the camera-side edge with small letters riding on it.
function chute(ctx, p, z, color, labelFor, kind) {
  const { group, animated } = ctx;
  const len = p.x1 - p.x0 - 2;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 1.2), std(WOOD, { map: stoneTexture(len / 2, 0.3, '#7a5536') }));
  belt.position.set((p.x0 + p.x1) / 2, p.h + 0.4, z);
  belt.receiveShadow = true;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.1), glow(color, 0.8));
  rail.position.set((p.x0 + p.x1) / 2, p.h + 0.62, z + 0.62);
  group.add(belt, rail);
  const items = [];
  for (let i = 0; i < 5; i++) {
    const item = new THREE.Group();
    const box = kind === 'envelope'
      ? new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.6), std('#f6e7c1'))
      : new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), std('#b8955e'));
    box.castShadow = true;
    const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12), glow(color, 0.8));
    seal.position.y = kind === 'envelope' ? 0.06 : 0.27;
    const tag = makeLabel(labelFor(i), { size: 0.28, color: '#3b2410', bg: 'rgba(246,231,193,0.9)', family: SERIF });
    tag.position.y = 0.75;
    item.add(box, seal, tag);
    item.userData.offset = i / 5;
    item.position.set(0, p.h + (kind === 'envelope' ? 0.64 : 0.85), z);
    group.add(item);
    items.push(item);
  }
  animated.push((t) => {
    for (const c of items) c.position.x = p.x0 + 1 + ((t * 0.06 + c.userData.offset) % 1) * len;
  });
}

// --------------------------------------------------------------- couriers
// Townsfolk couriers wandering each terrace with satchels full of letters.
function spawnCouriers(ctx, p, count) {
  const tunics = ['#3f5d8a', '#8e3b2e', '#5a6e3a', '#7a4a86', '#b8862e'];
  for (let i = 0; i < count; i++) {
    const npc = new THREE.Group();
    const tunic = pick(tunics);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.1, 8), std(tunic));
    body.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), std('#e8b98f'));
    head.position.y = 1.52;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.45, 8), std(pick(['#2e2a26', '#6b4a2f', tunic])));
    hat.position.y = 1.85;
    hat.rotation.z = 0.25;
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.14), std('#8a6a3c'));
    bag.position.set(0.32, 0.75, 0);
    const letter = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.15), std('#f6e7c1'));
    letter.position.set(0.32, 0.93, 0);
    npc.add(body, head, hat, bag, letter);
    body.castShadow = true;
    const state = { target: new THREE.Vector3(), speed: rand(1.3, 2.4), wait: 0 };
    const newTarget = () => state.target.set(rand(p.x0 + 2, p.x1 - 2), 0, rand(-11, 11));
    newTarget();
    npc.position.set(rand(p.x0 + 2, p.x1 - 2), p.h, rand(-11, 11));
    ctx.group.add(npc);
    ctx.animated.push((t, dt = 1 / 60) => {
      let moving = false;
      if (state.wait > 0) {
        state.wait -= dt;
      } else {
        const dx = state.target.x - npc.position.x;
        const dz = state.target.z - npc.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) {
          state.wait = rand(0.8, 3.5);
          newTarget();
        } else {
          moving = true;
          npc.position.x += (dx / d) * state.speed * dt;
          npc.position.z += (dz / d) * state.speed * dt;
          npc.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
        }
      }
      npc.position.y = p.h + (moving ? Math.abs(Math.sin(t * 8 + i)) * 0.12 : 0);
      body.rotation.z = moving ? Math.sin(t * 8 + i) * 0.06 : 0;
    });
  }
}

// ---------------------------------------------------------------- pigeons
// Instanced carrier pigeons. Each flock circles a point; `paths` fly along
// straight sky-roads between two points.
export function makePigeons({ flocks = [], paths = [], perPath = 1 }, animated) {
  const total = flocks.reduce((n, f) => n + f.n, 0) + paths.length * perPath;
  const geo = new THREE.BufferGeometry();
  // body + two wings as a tiny triangle fan (wings flap via instance scale)
  const v = [
    0, 0, 0.35, -0.08, 0, -0.3, 0.08, 0, -0.3, // body
    0, 0, 0.1, -0.6, 0, -0.05, 0, 0, -0.15, // left wing
    0, 0, 0.1, 0, 0, -0.15, 0.6, 0, -0.05, // right wing
  ];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#f4efe6', side: THREE.DoubleSide }), Math.max(1, total));
  const birds = [];
  for (const f of flocks) {
    for (let i = 0; i < f.n; i++) birds.push({ kind: 'flock', f, ph: (i / f.n) * Math.PI * 2 + rand(-0.3, 0.3), h: rand(-1, 1), speed: rand(0.5, 0.8) });
  }
  for (const pth of paths) {
    for (let i = 0; i < perPath; i++) birds.push({ kind: 'path', a: pth[0], b: pth[1], t: Math.random(), speed: rand(0.12, 0.25) });
  }
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const next = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const look = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  animated.push((t, dt = 1 / 60) => {
    birds.forEach((b, i) => {
      if (b.kind === 'flock') {
        const a = t * b.speed + b.ph;
        const { cx, cy, cz, r } = b.f;
        pos.set(cx + Math.cos(a) * r, cy + b.h + Math.sin(a * 2) * 0.6, cz + Math.sin(a) * r);
        next.set(cx + Math.cos(a + 0.1) * r, pos.y, cz + Math.sin(a + 0.1) * r);
      } else {
        b.t += b.speed * dt;
        if (b.t > 1) b.t -= 1;
        pos.lerpVectors(b.a, b.b, b.t);
        pos.y += 2.4 + Math.sin(b.t * Math.PI) * 1.5;
        next.lerpVectors(b.a, b.b, Math.min(1, b.t + 0.01));
        next.y += 2.4 + Math.sin(Math.min(1, b.t + 0.01) * Math.PI) * 1.5;
      }
      look.lookAt(next, pos, up);
      q.setFromRotationMatrix(look);
      const flap = 0.35 + Math.abs(Math.sin(t * 14 + i)) * 0.65;
      sc.set(1, flap, 1);
      m.compose(pos, q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}

// ---------------------------------------------------------- the far lands
// Snow-capped mountains and distant castles on the horizon.
export function makeHorizon(center) {
  const group = new THREE.Group();
  const n = 46;
  const mountains = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), std('#ffffff', { flatShading: true, fog: true }), n);
  const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), std('#f4f1ea', { flatShading: true }), n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const blues = ['#6b7fa8', '#5c6f98', '#7d8bb0', '#8391a8'].map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rand(-0.04, 0.04);
    const r = rand(250, 310);
    const h = rand(45, 110);
    const w = rand(35, 60);
    const x = center.x + Math.cos(ang) * r;
    const z = center.z + Math.sin(ang) * r;
    q.setFromEuler(new THREE.Euler(0, rand(0, 3), 0));
    m.compose(new THREE.Vector3(x, h / 2 - 12, z), q, new THREE.Vector3(w, h, w));
    mountains.setMatrixAt(i, m);
    mountains.setColorAt(i, pick(blues));
    const ch = h * 0.28;
    m.compose(new THREE.Vector3(x, h - 12 - ch / 2 + 0.2, z), q, new THREE.Vector3(w * 0.29, ch, w * 0.29));
    caps.setMatrixAt(i, m);
  }
  group.add(mountains, caps);

  // silhouettes of other kingdoms on islands out at sea
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + 0.3;
    const r = rand(120, 170);
    const x = center.x + Math.cos(ang) * r;
    const z = center.z + Math.sin(ang) * r;
    const isle = new THREE.Mesh(new THREE.CylinderGeometry(rand(8, 14), rand(14, 20), 6, 9), std('#6d7a55', { flatShading: true }));
    isle.position.set(x, -9, z);
    group.add(isle);
    for (let k = 0; k < 3; k++) {
      tower(group, { x: x + rand(-5, 5), y: -6, z: z + rand(-5, 5), r: rand(1.2, 2.2), h: rand(8, 16), windows: k === 0 });
    }
  }
  return group;
}

// Soft drifting clouds (sprites).
export function makeClouds(center, animated) {
  const tex = canvasTexture(128, 64, (ctx, w, h) => {
    for (let i = 0; i < 9; i++) {
      const x = rand(24, w - 24);
      const y = rand(26, h - 18);
      const r = rand(14, 24);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,245,235,0.95)');
      g.addColorStop(1, 'rgba(255,235,225,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const group = new THREE.Group();
  const clouds = [];
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: rand(0.55, 0.9), depthWrite: false, fog: false }));
    const w = rand(40, 80);
    s.scale.set(w, w / 2, 1);
    s.position.set(center.x + rand(-260, 260), rand(55, 95), center.z + rand(-240, 120));
    s.userData.speed = rand(0.6, 1.6);
    group.add(s);
    clouds.push(s);
  }
  animated.push((t, dt = 1 / 60) => {
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > center.x + 280) c.position.x = center.x - 280;
    }
  });
  return group;
}

// Fireflies and lantern sparks drifting above the sea.
export function makeFireflies(bounds, animated) {
  const n = 45;
  const pos = new Float32Array(n * 3);
  const seeds = [];
  for (let i = 0; i < n; i++) {
    seeds.push({ x: rand(bounds.x0, bounds.x1), y: rand(-6, 6), z: rand(-24, 24), ph: rand(0, 6) });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tex = canvasTexture(32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,240,180,1)');
    g.addColorStop(0.4, 'rgba(255,200,90,0.6)');
    g.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size: 0.7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffb44d' }));
  animated.push((t) => {
    seeds.forEach((s, i) => {
      pos[i * 3] = s.x + Math.sin(t * 0.3 + s.ph) * 2;
      pos[i * 3 + 1] = s.y + Math.sin(t * 0.7 + s.ph * 2) * 1.2;
      pos[i * 3 + 2] = s.z + Math.cos(t * 0.25 + s.ph) * 2;
    });
    geo.attributes.position.needsUpdate = true;
  });
  return pts;
}

// ------------------------------------------------------------------ entry
const BUILDERS = { app: buildApplication, transport: buildTransport, internet: buildInternet, link: buildLink };

export function buildEnvironment(scene, plateaus, animatedList) {
  const ctx = { group: new THREE.Group(), animated: animatedList, colliders: [], pigeons: [] };
  const trees = [];
  for (const p of plateaus) {
    curtainWall(ctx, p);
    BUILDERS[p.layer](ctx, p);
    spawnCouriers(ctx, p, 3);
    // trees just behind the wall, and a few on the camera-side lawn
    for (let x = p.x0 + 2; x < p.x1 - 1; x += rand(4, 7)) trees.push([x, p.h, -DECK_HALF - rand(2.5, 4), 1.2]);
    for (let x = p.x0 + 3; x < p.x1 - 2; x += rand(9, 14)) trees.push([x, p.h, DECK_HALF - 2, 0.7]);
  }
  ctx.group.add(makeForest(trees));
  ctx.group.add(makePigeons({ flocks: ctx.pigeons }, animatedList));
  scene.add(ctx.group);
  return { colliders: ctx.colliders };
}
