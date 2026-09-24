import * as THREE from 'three';
import { LAYERS } from './content.js';
import { makeLabel } from './labels.js';

// Scenery for every layer terrace, showing the hardware where that layer
// physically lives. Alice's side is the inside of her laptop: the keyboard
// and screen (Application), the motherboard with CPU and RAM (Transport),
// the OS network stack (Internet) and the Wi-Fi card (Link). The receiver's
// side is a data centre: the meet-me room (Link), routers and the firewall
// (Internet), server rows (Transport) and the web server (Application).
//
// Each builder gets the plateau (x range, height, side). It adds meshes to
// `ctx.group`, animations to `ctx.animated` and circular colliders
// ({ x, z, r }) to `ctx.colliders` for props inside the walk area.
//
// Layout convention: z < 0 is the far side (behind the stations, tall props
// are fine), z > 0 is the camera side (keep props low so they never hide the
// player). The walkable strip is |z| <= 12.5.

export const DECK_HALF = 18;

let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const rand = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

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
  t.anisotropy = 8;
  return t;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ------------------------------------------------------------ deck floors
const KEYS = ['QWERTYUIOP', 'ASDFGHJKL;', 'ZXCVBNM,./', '1234567890', '⇧⌥⌘␣␣␣⌘⌥←→'];

function keyboardTextures(w, d) {
  const draw = (lettersOnly) => (ctx, cw, ch) => {
    ctx.fillStyle = lettersOnly ? '#000' : '#101218';
    ctx.fillRect(0, 0, cw, ch);
    const kw = cw / 10;
    const kh = ch / 5;
    KEYS.forEach((row, r) => {
      [...row].forEach((k, c) => {
        if (!lettersOnly) {
          ctx.fillStyle = '#262a34';
          roundRect(ctx, c * kw + 5, r * kh + 5, kw - 10, kh - 10, 8);
          ctx.fill();
          ctx.fillStyle = '#2e3340';
          roundRect(ctx, c * kw + 9, r * kh + 8, kw - 18, kh - 20, 6);
          ctx.fill();
        }
        ctx.fillStyle = lettersOnly ? '#fff' : '#9aa0b8';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(k, c * kw + kw / 2, r * kh + kh / 2 - 2);
      });
    });
  };
  const map = canvasTexture(512, 256, draw(false));
  const glowMap = canvasTexture(512, 256, draw(true));
  for (const t of [map, glowMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(w / 24, d / 12);
  }
  return { map, glowMap };
}

function pcbTexture(base, trace, w, d) {
  const t = canvasTexture(256, 256, (ctx, cw, ch) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = trace;
    ctx.lineWidth = 3;
    for (let i = 0; i < 16; i++) {
      let x = Math.floor(rnd() * 16) * 16;
      let y = Math.floor(rnd() * 16) * 16;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        if (s % 2) x += (rnd() < 0.5 ? -1 : 1) * 48;
        else y += (rnd() < 0.5 ? -1 : 1) * 48;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#c9a13a';
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      ctx.arc(Math.floor(rnd() * 16) * 16, Math.floor(rnd() * 16) * 16, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px monospace';
    ctx.fillText(`C${Math.floor(rnd() * 90 + 10)}`, 20, 240);
    ctx.fillText(`R${Math.floor(rnd() * 90 + 10)}`, 200, 30);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 14, d / 14);
  return t;
}

function raisedFloorTexture(w, d) {
  const t = canvasTexture(128, 128, (ctx, cw, ch) => {
    ctx.fillStyle = '#4b505c';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#2b2f38';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, cw - 4, ch - 4);
    ctx.fillStyle = '#3a3e48';
    for (let y = 18; y < ch - 10; y += 12) {
      for (let x = 18; x < cw - 10; x += 12) {
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 2.4, d / 2.4);
  return t;
}

export function deckMaterial(p, w, d) {
  const color = new THREE.Color(LAYERS[p.layer].color);
  if (p.side === 'sender' && p.layer === 'app') {
    const { map, glowMap } = keyboardTextures(w, d);
    return new THREE.MeshStandardMaterial({ map, emissiveMap: glowMap, emissive: color, emissiveIntensity: 0.9, roughness: 0.6 });
  }
  if (p.side === 'sender') {
    const [base, trace] = p.layer === 'link' ? ['#0e2640', '#1f4f7a'] : ['#0c3322', '#1c6a3e'];
    return new THREE.MeshStandardMaterial({ map: pcbTexture(base, trace, w, d), emissive: color, emissiveIntensity: 0.05, roughness: 0.5, metalness: 0.2 });
  }
  return new THREE.MeshStandardMaterial({ map: raisedFloorTexture(w, d), emissive: color, emissiveIntensity: 0.04, roughness: 0.75, metalness: 0.15 });
}

// ------------------------------------------------------ shared components
function label(ctx, text, x, y, z, opts = {}) {
  const l = makeLabel(text, { size: 0.45, color: '#e9f1ff', ...opts });
  l.position.set(x, y, z);
  ctx.group.add(l);
  return l;
}

// Glowing copper traces on the board with light pulses riding them.
function traces(ctx, p, zs, color) {
  const len = p.x1 - p.x0;
  const cx = (p.x0 + p.x1) / 2;
  const pulses = [];
  for (const z of zs) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.22), glow(color, 0.5));
    line.position.set(cx, p.h + 0.14, z);
    ctx.group.add(line);
    for (let i = 0; i < 3; i++) {
      const pulse = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.24), glow(color, 1.6));
      pulse.position.set(0, p.h + 0.18, z);
      pulse.userData.offset = i / 3 + z * 0.01;
      ctx.group.add(pulse);
      pulses.push(pulse);
    }
  }
  ctx.animated.push((t) => {
    for (const pl of pulses) pl.position.x = p.x0 + ((t * 0.4 + pl.userData.offset) % 1) * len;
  });
}

// Electrolytic capacitors and small chips scattered on a strip of the board.
function components(ctx, p, zMin, zMax, count) {
  const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 14), std('#2a2f3a', { metalness: 0.7, roughness: 0.3 }), count);
  const tops = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 14), std('#aab3c8', { metalness: 0.9 }), count);
  const chips = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.3, 0.9), std('#15171d'), count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const x = rand(p.x0 + 1, p.x1 - 1);
    const z = rand(zMin, zMax);
    m.makeTranslation(x, p.h + 0.7, z);
    caps.setMatrixAt(i, m);
    m.makeTranslation(x, p.h + 1.32, z);
    tops.setMatrixAt(i, m);
    m.makeTranslation(rand(p.x0 + 1, p.x1 - 1), p.h + 0.25, rand(zMin, zMax));
    chips.setMatrixAt(i, m);
  }
  caps.castShadow = true;
  ctx.group.add(caps, tops, chips);
}

// Racks with blinking LEDs along one line (instanced).
function rackRow(ctx, p, z, { spacing = 2.2, height = 5, ledColors = ['#35d07f', '#3d9bff', '#ffb000', '#0a0f24'], face = 1 } = {}) {
  const racks = [];
  for (let x = p.x0 + 1.5; x < p.x1 - 1; x += spacing) racks.push(x);
  const rackMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, height, 1.6), std('#161a26', { metalness: 0.7, roughness: 0.35 }), racks.length);
  const m = new THREE.Matrix4();
  racks.forEach((x, i) => { m.makeTranslation(x, p.h + height / 2, z); rackMesh.setMatrixAt(i, m); });
  rackMesh.castShadow = true;
  ctx.group.add(rackMesh);
  const perRack = Math.floor(height / 0.55);
  const ledCount = racks.length * perRack;
  const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: '#ffffff' }), ledCount);
  const colors = ledColors.map((c) => new THREE.Color(c));
  racks.forEach((x, i) => {
    for (let k = 0; k < perRack; k++) {
      m.makeTranslation(x + rand(-0.6, 0.6), p.h + 0.5 + k * 0.55, z + face * 0.82);
      leds.setMatrixAt(i * perRack + k, m);
      leds.setColorAt(i * perRack + k, pick(colors));
    }
  });
  ctx.group.add(leds);
  let clock = 0;
  ctx.animated.push((t, dt = 1 / 60) => {
    clock += dt;
    if (clock < 0.12) return;
    clock = 0;
    for (let k = 0; k < 12; k++) leds.setColorAt(Math.floor(Math.random() * ledCount), pick(colors));
    leds.instanceColor.needsUpdate = true;
  });
}

// An overhead cable tray with light pulses running along it.
function cableTray(ctx, p, z, y, color, bundleColor) {
  const len = p.x1 - p.x0;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(len, 0.25, 1.4), std('#7d8599', { metalness: 0.7 }));
  tray.position.set((p.x0 + p.x1) / 2, p.h + y, z);
  const bundle = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 1), std(bundleColor, { roughness: 0.6 }));
  bundle.position.set((p.x0 + p.x1) / 2, p.h + y + 0.25, z);
  ctx.group.add(tray, bundle);
  for (const dx of [0.2, 0.5, 0.8]) {
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 6), std('#7d8599'));
    hanger.position.set(p.x0 + len * dx, p.h + y + 3, z);
    ctx.group.add(hanger);
  }
  const pulses = [];
  for (let i = 0; i < 6; i++) {
    const pulse = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), glow(color, 3));
    pulse.userData.offset = i / 6;
    pulse.position.set(0, p.h + y + 0.45, z + ((i % 3) - 1) * 0.3);
    ctx.group.add(pulse);
    pulses.push(pulse);
  }
  ctx.animated.push((t) => {
    for (const pl of pulses) pl.position.x = p.x0 + ((t * 0.3 + pl.userData.offset) % 1) * len;
  });
}

// ------------------------------------------- sender · application (keyboard)
function screenTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 340;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const draw = (k) => {
    ctx.fillStyle = '#f2f4fb';
    ctx.fillRect(0, 0, 1024, 340);
    ctx.fillStyle = '#d9deee';
    ctx.fillRect(0, 0, 1024, 70);
    ctx.fillStyle = '#f2f4fb';
    roundRect(ctx, 20, 8, 240, 28, 8);
    ctx.fill();
    ctx.fillStyle = '#1b2150';
    ctx.font = '16px sans-serif';
    ctx.fillText('🐱  Cute cats · catpics', 34, 28);
    ctx.fillStyle = '#fff';
    roundRect(ctx, 20, 40, 984, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#1b2150';
    ctx.font = '17px sans-serif';
    ctx.fillText('🔒 https://catpics.example/cat.png', 34, 58);
    ctx.fillStyle = '#b56cff';
    ctx.fillRect(0, 66, 1024 * k, 4);
    ctx.fillStyle = '#1b2150';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('Loading your cat…', 330, 170);
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#5b6285';
    ctx.fillText('Waiting for catpics.example (that is you, little packet!)', 250, 215);
    ctx.font = '70px sans-serif';
    ctx.fillText('🐱', 470, 305);
    tex.needsUpdate = true;
  };
  draw(0);
  return { tex, draw };
}

function buildSenderApp(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  const color = LAYERS.app.color;

  // the laptop lid and screen, standing behind the keyboard
  const lid = new THREE.Group();
  lid.position.set(cx, p.h, -21.8);
  lid.rotation.x = -0.08;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(33, 12.4, 0.6), std('#1a1c22', { metalness: 0.6, roughness: 0.4 }));
  bezel.position.y = 6.1;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(33.4, 12.8, 0.3), std('#8a90a6', { metalness: 0.8, roughness: 0.35 }));
  shell.position.set(0, 6.1, -0.4);
  const { tex, draw } = screenTexture();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(31, 10.3), new THREE.MeshBasicMaterial({ map: tex, color: '#c9cfe6' }));
  screen.position.set(0, 6.3, 0.31);
  const cam = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), glow('#35d07f', 3));
  cam.position.set(0, 11.85, 0.32);
  lid.add(bezel, shell, screen, cam);
  group.add(lid);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 30, 16), std('#8a90a6', { metalness: 0.8 }));
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(cx, p.h + 0.3, -20.6);
  group.add(hinge);
  let clock = 0;
  animated.push((t, dt = 1 / 60) => {
    clock += dt;
    if (clock < 0.2) return;
    clock = 0;
    draw((t * 0.05) % 1);
  });

  // a sticky note on the bezel
  const note = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshStandardMaterial({
      map: canvasTexture(128, 128, (c, w, h) => {
        c.fillStyle = '#ffe066';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#5a4a00';
        c.font = 'bold 20px cursive';
        c.fillText('catpics', 18, 50);
        c.fillText('.example', 14, 76);
        c.fillText('♥ ♥ ♥', 30, 106);
      }),
    }),
  );
  note.position.set(cx - 18.2, p.h + 9.5, -21.2);
  note.rotation.z = 0.12;
  group.add(note);

  // the trackpad on the camera side (flat, walkable)
  const pad = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 5.5), std('#2d313b', { metalness: 0.5, roughness: 0.3 }));
  pad.position.set(cx, p.h + 0.13, 14.5);
  group.add(pad);
  const capsLed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.2), glow(color, 3));
  capsLed.position.set(p.x0 + 3, p.h + 0.16, -10);
  group.add(capsLed);

  // a coffee mug, steaming
  const mx = p.x1 - 4;
  const mz = -14;
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.25, 3, 24), std('#e8ecf5', { roughness: 0.3 }));
  mug.position.set(mx, p.h + 1.5, mz);
  mug.castShadow = true;
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), std('#3a2414'));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.set(mx, p.h + 2.85, mz);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.18, 8, 20, Math.PI), std('#e8ecf5'));
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(mx + 1.35, p.h + 1.6, mz);
  group.add(mug, coffee, handle);
  ctx.colliders.push({ x: mx, z: mz, r: 1.7 });
  const steam = [0, 1, 2].map((i) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false }));
    s.userData.phase = i / 3;
    group.add(s);
    return s;
  });
  animated.push((t) => {
    for (const s of steam) {
      const k = (t * 0.35 + s.userData.phase) % 1;
      s.position.set(mx + Math.sin(t + k * 6) * 0.4, p.h + 3.2 + k * 4, mz);
      s.scale.setScalar(0.6 + k * 1.4);
      s.material.opacity = 0.22 * (1 - k);
    }
  });

  buildCat(ctx, p.x1 + 5, -31);
}

// Alice's cat, peeking over the laptop and following the packet with its eyes.
function buildCat(ctx, x, z) {
  const fur = std('#c9803a', { roughness: 0.9 });
  const cream = std('#f0d9b5', { roughness: 0.9 });
  const cat = new THREE.Group();
  cat.position.set(x, 0, z);
  cat.scale.setScalar(1.25);
  cat.rotation.y = -0.35;
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), fur);
  body.scale.set(8, 12, 7);
  body.position.y = 11;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), cream);
  chest.scale.set(5, 7, 3);
  chest.position.set(0, 12, 4.8);
  const head = new THREE.Group();
  head.position.y = 26;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(5.5, 28, 20), fur);
  skull.scale.set(1, 0.9, 0.95);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(2.1, 16, 12), cream);
  muzzle.scale.set(1.2, 0.8, 0.8);
  muzzle.position.set(0, -1.6, 4.4);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), std('#e08a9a'));
  nose.position.set(0, -0.9, 5.9);
  head.add(skull, muzzle, nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.6, 4), fur);
    ear.position.set(s * 3.1, 5, 0);
    ear.rotation.z = -s * 0.35;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), glow('#9dff6a', 1.4));
    eye.position.set(s * 2, 0.9, 4.5);
    eye.scale.set(1, 1.1, 0.5);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), std('#050505'));
    pupil.scale.set(0.45, 1.3, 0.4);
    pupil.position.set(s * 2, 0.9, 5.0);
    head.add(ear, eye, pupil);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(6, 1.1, 10, 30, Math.PI * 1.1), fur);
  tail.position.set(-6, 3, 2);
  tail.rotation.set(Math.PI / 2, 0, 0.6);
  for (const s of [-1, 1]) {
    const paw = new THREE.Mesh(new THREE.SphereGeometry(1.8, 14, 10), cream);
    paw.scale.set(1, 0.7, 1.4);
    paw.position.set(s * 3, 1.2, 5.5);
    cat.add(paw);
  }
  cat.add(body, chest, head, tail);
  ctx.group.add(cat);
  const target = new THREE.Vector3();
  ctx.animated.push((t) => {
    const f = ctx.focus();
    if (f) {
      target.copy(f).sub(new THREE.Vector3(x, 32, z));
      const yaw = THREE.MathUtils.clamp(Math.atan2(target.x, target.z) - cat.rotation.y, -1, 1);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(target.y, Math.hypot(target.x, target.z)), -0.3, 0.5);
      head.rotation.y += (yaw - head.rotation.y) * 0.05;
      head.rotation.x += (pitch - head.rotation.x) * 0.05;
    }
    tail.rotation.z = 0.6 + Math.sin(t * 1.3) * 0.25;
    body.scale.y = 12 + Math.sin(t * 1.6) * 0.15;
  });
}

// ------------------------------------ sender · transport (CPU and RAM)
function buildSenderTransport(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;

  // CPU with heatsink and fan
  const x = cx + 5;
  const z = -14.5;
  const pkg = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 7), std('#20242e'));
  pkg.position.set(x, p.h + 0.3, z);
  const ihs = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 5), std('#c9ced9', { metalness: 0.9, roughness: 0.25 }));
  ihs.position.set(x, p.h + 0.75, z);
  group.add(pkg, ihs);
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 3, 5.4), std('#c77b3a', { metalness: 0.9, roughness: 0.3 }), 14);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 14; i++) {
    m.makeTranslation(x - 2.8 + i * 0.43, p.h + 2.45, z);
    fins.setMatrixAt(i, m);
  }
  fins.castShadow = true;
  group.add(fins);
  const shroud = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.2, 8, 40), std('#2a2f3a'));
  shroud.rotation.x = Math.PI / 2;
  shroud.position.set(x, p.h + 4.1, z);
  const blades = new THREE.Group();
  blades.position.set(x, p.h + 4.1, z);
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.7), std('#3a3f4c'));
    b.position.x = 1.2;
    const arm = new THREE.Group();
    arm.rotation.y = (i / 7) * Math.PI * 2;
    b.rotation.x = 0.4;
    arm.add(b);
    blades.add(arm);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 20), glow(LAYERS.transport.color, 1.5));
  hub.position.set(x, p.h + 4.15, z);
  group.add(shroud, blades, hub);
  animated.push((t) => { blades.rotation.y = t * 9; });
  ctx.colliders.push({ x, z: z + 1.5, r: 3.3 });
  label(ctx, 'CPU\nthe OS kernel runs TCP here', x, p.h + 6.3, z, { color: '#ffd1b0' });

  // RAM sticks
  for (let i = 0; i < 3; i++) {
    const rx = p.x0 + 3 + i * 1.3;
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 8), std('#1d5a3a'));
    stick.position.set(rx, p.h + 1.45, -14);
    const chips = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 7), std('#15171d'));
    chips.position.set(rx, p.h + 1.6, -14);
    const clipA = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.4), std('#e8ecf5'));
    clipA.position.set(rx, p.h + 0.35, -18);
    group.add(stick, chips, clipA);
  }
  ctx.colliders.push({ x: p.x0 + 4.3, z: -12.2, r: 2.2 });
  label(ctx, 'RAM\nsocket buffers hold your segments', p.x0 + 4.3, p.h + 4.2, -14, { color: '#ffd1b0' });

  traces(ctx, p, [-9, 9.5], LAYERS.transport.color);
  components(ctx, p, 14, 17.5, 14);
}

// --------------------------------- sender · internet (OS network stack)
function routingTableTexture() {
  return canvasTexture(512, 220, (c, w, h) => {
    c.fillStyle = 'rgba(8,30,20,0.85)';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#35d07f';
    c.lineWidth = 4;
    c.strokeRect(2, 2, w - 4, h - 4);
    c.fillStyle = '#9fffc8';
    c.font = 'bold 26px monospace';
    c.fillText("Alice's routing table", 20, 40);
    c.font = '22px monospace';
    c.fillStyle = '#d9ffe9';
    c.fillText('192.168.1.0/24 → wlan0 (on-link)', 20, 100);
    c.fillStyle = '#35d07f';
    c.fillRect(12, 128, w - 24, 40);
    c.fillStyle = '#062014';
    c.fillText('0.0.0.0/0      → 192.168.1.1', 20, 156);
    c.fillStyle = '#9fffc8';
    c.font = '18px monospace';
    c.fillText('everything else goes to the home router', 20, 200);
  });
}

function buildSenderInternet(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;

  // the chip that runs the network stack, with a hologram of its table
  const x = cx + 5;
  const z = -14.5;
  const chip = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 5), std('#15171d'));
  chip.position.set(x, p.h + 0.35, z);
  const logo = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 2.4), glow(LAYERS.internet.color, 1));
  logo.position.set(x, p.h + 0.68, z);
  group.add(chip, logo);
  ctx.colliders.push({ x, z: z + 1, r: 2.4 });
  const holo = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.9), new THREE.MeshBasicMaterial({ map: routingTableTexture(), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  holo.position.set(x, p.h + 5.2, z);
  group.add(holo);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 2.2, 3.4, 16, 1, true), new THREE.MeshBasicMaterial({ color: LAYERS.internet.color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.set(x, p.h + 2.3, z);
  group.add(beam);
  animated.push((t) => { holo.position.y = p.h + 5.2 + Math.sin(t * 1.2) * 0.15; });

  // the laptop battery
  for (let i = 0; i < 3; i++) {
    const cell = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1, 5), std('#1b1e26', { metalness: 0.3 }));
    cell.position.set(p.x0 + 2.5 + i * 2.8, p.h + 0.5, -15);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.2, 0.6), std('#3d9bff'));
    band.position.set(cell.position.x, p.h + 0.7, -13);
    group.add(cell, band);
  }
  ctx.colliders.push({ x: p.x0 + 5.3, z: -13.4, r: 2 });
  label(ctx, 'Battery', p.x0 + 5.3, p.h + 2.2, -15);

  // the SSD on the camera side
  const ssd = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 2.2), std('#10283f'));
  ssd.position.set(cx - 2, p.h + 0.2, 15.5);
  const ssdChips = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 1.6), std('#15171d'));
  ssdChips.position.set(cx - 2, p.h + 0.35, 15.5);
  group.add(ssd, ssdChips);

  traces(ctx, p, [-9, 9.5], LAYERS.internet.color);
  components(ctx, p, 14.5, 17.5, 10);
}

// ------------------------------------------- sender · link (Wi-Fi card)
function buildSenderLink(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;

  // the M.2 Wi-Fi card with its shield can
  const card = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 3.4), std('#0e3a25'));
  card.position.set(cx - 2, p.h + 0.2, -14.5);
  const can = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 2.4), std('#c9ced9', { metalness: 0.9, roughness: 0.25 }));
  can.position.set(cx - 2.6, p.h + 0.55, -14.5);
  group.add(card, can);
  ctx.colliders.push({ x: cx - 2, z: -13.6, r: 2.4 });
  label(ctx, 'Wi-Fi card', cx - 2, p.h + 2, -14.5);

  // antenna leads climbing to the antennas in the lid
  const ax = cx + 2;
  const antY = 13;
  for (const dz of [-0.5, 0.5]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cx, p.h + 0.6, -14.5 + dz),
      new THREE.Vector3(cx + 1.2, p.h + 1.5, -17 + dz),
      new THREE.Vector3(ax, p.h + 7, -19.5 + dz * 0.2),
      new THREE.Vector3(ax, antY, -20 + dz * 0.2),
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.12, 6), std('#101114')));
  }
  const antenna = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 0.4), glow(LAYERS.link.color, 0.8));
  antenna.position.set(ax, antY + 0.6, -20);
  group.add(antenna);
  label(ctx, 'Antenna', ax, antY + 2, -20);

  // radio waves heading off to the home router
  const rings = [0, 1, 2, 3].map((i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 48), new THREE.MeshBasicMaterial({ color: '#7fc4ff', transparent: true, depthWrite: false }));
    r.rotation.y = Math.PI / 2;
    r.userData.phase = i / 4;
    group.add(r);
    return r;
  });
  animated.push((t) => {
    for (const r of rings) {
      const k = (t * 0.35 + r.userData.phase) % 1;
      r.position.set(ax + k * 22, antY + 0.6 - k * 11, -20 + k * 19);
      r.scale.setScalar(0.8 + k * 5);
      r.material.opacity = 0.8 * (1 - k);
    }
  });

  // the unused Ethernet port on the camera side
  const port = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 1.8), std('#c9ced9', { metalness: 0.85, roughness: 0.3 }));
  port.position.set(cx - 4, p.h + 0.8, 15.5);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 0.1), std('#050608'));
  hole.position.set(cx - 4, p.h + 0.8, 16.42);
  group.add(port, hole);
  label(ctx, 'Ethernet port (unused: Alice is on Wi-Fi)', cx - 4, p.h + 2.3, 15.5);

  traces(ctx, p, [-9, 9.5], LAYERS.link.color);
  components(ctx, p, 14, 17.5, 8);
}

// ------------------------------------------------- receiver · data centre
function buildRecvLink(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  rackRow(ctx, p, -16.5, { ledColors: ['#ffd166', '#35d07f', '#0a0f24'] });
  cableTray(ctx, p, -12.5, 7, '#ffd166', '#e0b000');
  label(ctx, 'Meet-me room\npatch panels join outside fibre to the building', cx, p.h + 9.5, -12.5, { size: 0.5 });

  // where the fibre from the outside comes up through the floor
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 2.4), std('#2b2f38', { metalness: 0.6 }));
  hatch.position.set(p.x0 + 1.4, p.h + 0.13, 10.5);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 8, 30), glow('#4be1ff', 2));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(p.x0 + 1.4, p.h + 0.2, 10.5);
  group.add(hatch, ring);
  animated.push((t) => { ring.material.emissiveIntensity = 1.5 + Math.sin(t * 4) * 1; });
  label(ctx, 'Fibre in from the undersea cable', p.x0 + 1.4, p.h + 1.6, 10.5, { size: 0.4 });

  // top-of-rack switch on the camera side
  const sw = new THREE.Group();
  sw.position.set(cx + 3, p.h, 14.5);
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
  animated.push((t) => ports.forEach((l, i) => { l.visible = Math.sin(t * 9 + i * 2.3) > -0.3; }));
}

function buildRecvInternet(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  rackRow(ctx, { ...p, x1: cx - 1 }, -16.5, { spacing: 2.3, height: 6, ledColors: ['#35d07f', '#4be1ff', '#0a0f24'] });
  label(ctx, 'Core routers', p.x0 + 4, p.h + 7.2, -16.5);

  // the firewall: a red-trimmed appliance with its rule display
  const fx = cx + 4;
  const fz = -15.5;
  const fw = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 2), std('#241a1e', { metalness: 0.6 }));
  fw.position.set(fx, p.h + 3, fz);
  fw.castShadow = true;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.3, 2.1), glow('#ff4d6d', 1.8));
  trim.position.set(fx, p.h + 6, fz);
  const rules = canvasTexture(256, 160, (c, w, h) => {
    c.fillStyle = '#0a0508';
    c.fillRect(0, 0, w, h);
    c.font = 'bold 20px monospace';
    c.fillStyle = '#ffb3c1';
    c.fillText('FIREWALL', 70, 28);
    c.font = '17px monospace';
    c.fillStyle = '#9fffc8';
    c.fillText('1 ALLOW tcp/22  10/8', 10, 64);
    c.fillText('2 ALLOW tcp/443 any', 10, 96);
    c.fillStyle = '#ff8fa3';
    c.fillText('3 DENY  any     any', 10, 128);
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.9), new THREE.MeshBasicMaterial({ map: rules }));
  panel.position.set(fx, p.h + 3.6, fz + 1.02);
  group.add(fw, trim, panel);
  ctx.colliders.push({ x: fx - 1.6, z: fz + 1, r: 1.6 }, { x: fx + 1.6, z: fz + 1, r: 1.6 });
  animated.push((t) => { trim.material.emissiveIntensity = 1.2 + Math.max(0, Math.sin(t * 2)) * 1.5; });

  cableTray(ctx, p, -12, 8, '#4be1ff', '#3d9bff');

  // cold air rising through the floor grilles
  for (const gx of [p.x0 + 3, p.x1 - 3]) {
    const grille = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 2.4), glow('#7fc4ff', 0.4));
    grille.position.set(gx, p.h + 0.14, 10.5);
    group.add(grille);
  }
}

function buildRecvTransport(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  rackRow(ctx, p, -16.5, { spacing: 2, height: 6.5 });
  // hot-aisle containment roof over the rack row
  const roof = new THREE.Mesh(new THREE.BoxGeometry(p.x1 - p.x0, 0.2, 3.4), std('#7d8599', { metalness: 0.6, transparent: true, opacity: 0.6 }));
  roof.position.set(cx, p.h + 6.8, -17.2);
  group.add(roof);
  label(ctx, 'Server row\neach server\'s kernel reassembles TCP', cx, p.h + 8.4, -16.5, { size: 0.5 });

  // load balancer
  const lb = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 1.6), std('#1d2350', { metalness: 0.6 }));
  lb.position.set(p.x0 + 3, p.h + 0.7, -12);
  const lbGlow = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.05), glow(LAYERS.transport.color, 2));
  lbGlow.position.set(p.x0 + 3, p.h + 0.9, -11.17);
  group.add(lb, lbGlow);
  ctx.colliders.push({ x: p.x0 + 3, z: -12, r: 1.8 });
  label(ctx, 'Load balancer', p.x0 + 3, p.h + 2.3, -12);

  // cooling units on the camera side, breathing cold mist
  for (let i = 0; i < 3; i++) {
    const ux = p.x0 + 3 + i * 5;
    const unit = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2, 1.8), std('#c9ced9'));
    unit.position.set(ux, p.h + 1, 15.6);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), std('#2a2f3a'));
    fan.position.set(ux, p.h + 1.1, 14.69);
    fan.rotation.y = Math.PI;
    group.add(unit, fan);
  }
  label(ctx, 'Cooling units', p.x0 + 8, p.h + 3, 15.6);
  const mist = Array.from({ length: 10 }, (_, i) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.15, depthWrite: false }));
    s.userData = { phase: i / 10, x: p.x0 + 3 + (i % 3) * 5 };
    group.add(s);
    return s;
  });
  animated.push((t) => {
    for (const s of mist) {
      const k = (t * 0.2 + s.userData.phase) % 1;
      s.position.set(s.userData.x + Math.sin(k * 5) * 0.5, p.h + 1 + k * 1.5, 14.4 - k * 5);
      s.scale.setScalar(0.6 + k * 2);
      s.material.opacity = 0.14 * (1 - k);
    }
  });
}

function monitorTexture() {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 320;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const lines = [];
  const paths = ['/cat.png', '/kitten.jpg', '/index.html', '/cat.png', '/api/likes', '/tabby.webp'];
  const draw = (n) => {
    g.fillStyle = '#070b18';
    g.fillRect(0, 0, 768, 320);
    g.fillStyle = '#1a2240';
    g.fillRect(0, 0, 300, 320);
    g.font = '140px sans-serif';
    g.fillText('🐱', 60, 190);
    g.fillStyle = '#e8ddff';
    g.font = 'bold 22px sans-serif';
    g.fillText('cat.png · 312 KB', 60, 260);
    g.fillStyle = '#9fffc8';
    g.font = 'bold 20px monospace';
    g.fillText('access.log', 320, 34);
    lines.push(`GET ${paths[n % paths.length]}  200 OK  ${(n * 7) % 40 + 3} ms`);
    while (lines.length > 9) lines.shift();
    g.font = '18px monospace';
    lines.forEach((l, i) => {
      g.fillStyle = i === lines.length - 1 ? '#ffffff' : '#7fa0c8';
      g.fillText(l, 320, 70 + i * 28);
    });
    tex.needsUpdate = true;
  };
  draw(0);
  return { tex, draw };
}

function buildRecvApp(ctx, p) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  rackRow(ctx, { ...p, x1: cx - 3 }, -16.5, { spacing: 2.1, height: 5.5, ledColors: ['#b56cff', '#35d07f', '#0a0f24'] });
  label(ctx, 'Storage: a few million cat pictures', p.x0 + 6, p.h + 6.7, -16.5);

  // the monitoring wall
  const { tex, draw } = monitorTexture();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(15, 6.6, 0.4), std('#15171d'));
  frame.position.set(cx + 4, p.h + 4.4, -19.2);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 6), new THREE.MeshBasicMaterial({ map: tex, color: '#d8def0' }));
  screen.position.set(cx + 4, p.h + 4.4, -18.98);
  group.add(frame, screen);
  let n = 0;
  let clock = 0;
  animated.push((t, dt = 1 / 60) => {
    clock += dt;
    if (clock < 0.6) return;
    clock = 0;
    draw(++n);
  });

  // the catpics web server itself
  const g = new THREE.Group();
  g.position.set(p.x1 - 4, p.h, -9);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(4, 12, 5), std('#1c1f33', { metalness: 0.6, roughness: 0.4 }));
  rack.position.y = 6;
  rack.castShadow = true;
  g.add(rack);
  const leds = [];
  for (let i = 0; i < 8; i++) {
    const unit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 4.2), std('#2a2f4d'));
    unit.position.set(-2.02, 1.2 + i * 1.35, 0);
    g.add(unit);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color: '#35d07f' }));
    led.position.set(-2.1, 1.2 + i * 1.35, 1.6);
    g.add(led);
    leds.push(led);
  }
  animated.push((t) => leds.forEach((l, i) => { l.visible = Math.sin(t * 6 + i * 1.7) > -0.2; }));
  const tag = makeLabel('catpics.example\n203.0.113.80', { size: 1, color: '#e8ddff' });
  tag.position.set(0, 14.5, 0);
  g.add(tag);
  group.add(g);
  ctx.colliders.push({ x: p.x1 - 4, z: -9, r: 3.2 });
}

// The data centre's back wall, behind all four receiver terraces.
function dataCentreShell(ctx, x0, x1) {
  const tex = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#2c313c';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#232730';
    c.lineWidth = 3;
    for (let y = 0; y < h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let x = 0; x < w; x += 128) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    c.fillStyle = '#1b1e25';
    for (let i = 0; i < 6; i++) c.fillRect(20 + i * 40, 150, 24, 60);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((x1 - x0) / 16, 3);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 44, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  wall.position.set((x0 + x1) / 2, 18, -24.5);
  wall.receiveShadow = true;
  ctx.group.add(wall);
  const sign = makeLabel('CATPICS DATA CENTRE · DC-1', { size: 2.2, color: '#e8ddff', bg: null, font: 800 });
  sign.position.set((x0 + x1) / 2, 41, -23.8);
  ctx.group.add(sign);
  // a strip of blue work lights along the top of the wall
  const strip = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.3, 0.3), glow('#6fb8ff', 1.5));
  strip.position.set((x0 + x1) / 2, 39.2, -23.8);
  ctx.group.add(strip);
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
    const newTarget = () => state.target.set(rand(p.x0 + 2, p.x1 - 2), 0, rand(-10, 11));
    newTarget();
    npc.position.set(rand(p.x0 + 2, p.x1 - 2), p.h + 0.9, rand(-10, 11));
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

const BUILDERS = {
  'sender:app': buildSenderApp,
  'sender:transport': buildSenderTransport,
  'sender:internet': buildSenderInternet,
  'sender:link': buildSenderLink,
  'receiver:link': buildRecvLink,
  'receiver:internet': buildRecvInternet,
  'receiver:transport': buildRecvTransport,
  'receiver:app': buildRecvApp,
};

export function buildEnvironment(scene, plateaus, animatedList, focus = () => null) {
  const ctx = { group: new THREE.Group(), animated: animatedList, colliders: [], focus };
  for (const p of plateaus) {
    BUILDERS[`${p.side}:${p.layer}`](ctx, p);
    spawnWanderers(ctx, p, 3);
  }
  const recv = plateaus.filter((p) => p.side === 'receiver');
  dataCentreShell(ctx, Math.min(...recv.map((p) => p.x0)) - 2, Math.max(...recv.map((p) => p.x1)) + 2);
  scene.add(ctx.group);
  return { colliders: ctx.colliders };
}
