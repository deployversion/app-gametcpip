import * as THREE from 'three';
import { mat, glowMat, makeLoco, makeWagon, puffTexture, Steam, GAUGE } from './trains.js';
import { valleyHeight, riverZ, VALLEY_Y } from './effects.js';

// Everything around the game area: mountains on the horizon, a forest and a
// village in the valley, a ring railway with trains circling the whole world,
// clouds and a flock of birds.

const CENTER = new THREE.Vector3(21, 0, 0);
const RING_R = 168;
const RING_Y = -1;

// Is (x, z) inside the rock under a layer plateau?
function underPlateau(x, z) {
  return Math.abs(z) < 20 && ((x > -126 && x < 0) || (x > 42 && x < 148));
}

export function buildLandscape(scene, animated) {
  const group = new THREE.Group();
  scene.add(group);
  group.add(makeMountains());
  group.add(makeForest());
  group.add(makeVillage());
  group.add(makeRingViaduct());
  const steam = new Steam(scene, 80);
  makeRingTrain(group, animated, steam, { cars: 7, kind: 'coach', color: '#1d4d3a', speed: 7, phase: 0, locoColor: '#123a2c' });
  makeRingTrain(group, animated, steam, { cars: 9, kind: 'freight', color: '#8a4b2a', speed: -5, phase: Math.PI, locoColor: '#2b2b33' });
  animated.push((t, dt = 1 / 60) => steam.update(dt));
  group.add(makeClouds(animated));
  group.add(makeBirds(animated));
  return group;
}

function makeMountains() {
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: '#7a6070', roughness: 1, flatShading: true });
  const snow = new THREE.MeshStandardMaterial({ color: '#f3e3dc', roughness: 1, flatShading: true });
  const n = 46;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.08;
    const r = 250 + Math.random() * 60;
    const h = 35 + Math.random() * 75;
    const w = 30 + Math.random() * 40;
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5 + Math.floor(Math.random() * 3), 1), rock);
    m.position.set(CENTER.x + Math.cos(a) * r, VALLEY_Y + h / 2 - 4, Math.sin(a) * r);
    m.rotation.y = Math.random() * Math.PI;
    g.add(m);
    if (h > 70) {
      const capH = h * 0.28;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.28 * 1.02, capH, m.geometry.parameters.radialSegments, 1), snow);
      cap.position.set(m.position.x, VALLEY_Y + h - 4 - capH / 2 + 0.3, m.position.z);
      cap.rotation.y = m.rotation.y;
      g.add(cap);
    }
  }
  return g;
}

function makeForest() {
  const spots = [];
  let guard = 0;
  while (spots.length < 700 && guard++ < 6000) {
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.sqrt(Math.random()) * 200;
    const x = CENTER.x + Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (underPlateau(x, z)) continue;
    if (Math.abs(z - riverZ(x)) < 10) continue;
    if (Math.abs(Math.hypot(x - CENTER.x, z) - RING_R) < 5) continue;
    spots.push([x, z, 0.7 + Math.random() * 0.9]);
  }
  const n = spots.length;
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 4.5, 7), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), n);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.28, 1.4, 5), mat('#5a3d2a'), n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const palette = ['#35573a', '#446b3e', '#2e4d3a', '#6a7a3a', '#8a6a34'].map((c) => new THREE.Color(c));
  spots.forEach(([x, z, k], i) => {
    const y = valleyHeight(x, z);
    s.set(k, k * (0.9 + Math.random() * 0.4), k);
    m.compose(new THREE.Vector3(x, y + 1.4 * k + 2.2 * s.y, z), q, s);
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, palette[Math.floor(Math.random() * palette.length)]);
    m.compose(new THREE.Vector3(x, y + 0.7 * k, z), q, new THREE.Vector3(k, k, k));
    trunks.setMatrixAt(i, m);
  });
  crowns.castShadow = true;
  const g = new THREE.Group();
  g.add(crowns, trunks);
  return g;
}

function makeVillage() {
  const g = new THREE.Group();
  const walls = ['#e8d9bf', '#d9c3a0', '#c9b59a', '#efe3cf'];
  const roofs = ['#8a3b2e', '#6b3a2e', '#4a4a55'];
  const win = glowMat('#ffc36b', 1.6);
  const clusters = [[-60, 70], [110, -70], [30, 120], [-40, -80], [150, 60]];
  for (const [cx, cz] of clusters) {
    for (let i = 0; i < 7; i++) {
      const x = cx + (Math.random() - 0.5) * 30;
      const z = cz + (Math.random() - 0.5) * 30;
      if (underPlateau(x, z) || Math.abs(z - riverZ(x)) < 9) continue;
      const y = valleyHeight(x, z);
      const house = new THREE.Group();
      const w = 3 + Math.random() * 2;
      const d = 3 + Math.random() * 1.5;
      const h = 2.4 + Math.random() * 1.2;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(walls[i % walls.length], { roughness: 0.9 }));
      body.position.y = h / 2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.8, 4), mat(roofs[i % roofs.length], { roughness: 0.9 }));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = h + 0.9;
      roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
      house.add(body, roof);
      for (const sx of [-1, 1]) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), win);
        pane.position.set(sx * w * 0.25, h * 0.55, d / 2 + 0.01);
        house.add(pane);
      }
      house.position.set(x, y - 0.2, z);
      house.rotation.y = Math.random() * Math.PI * 2;
      g.add(house);
    }
    // a church spire in each village
    const y = valleyHeight(cx, cz);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 9, 2.4), mat('#d8cbb5'));
    tower.position.set(cx, y + 4.5, cz);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.9, 5, 4), mat('#4a4a55'));
    spire.position.set(cx, y + 11.5, cz);
    spire.rotation.y = Math.PI / 4;
    g.add(tower, spire);
  }
  return g;
}

// A stone viaduct running in a circle round the whole valley.
function makeRingViaduct() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.RingGeometry(RING_R - 1.6, RING_R + 1.6, 256, 1), mat('#8c7b6a', { roughness: 1, side: THREE.DoubleSide }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(CENTER.x, RING_Y - 0.25, 0);
  g.add(deck);
  for (const r of [RING_R - GAUGE / 2, RING_R + GAUGE / 2]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 4, 720), mat('#b9b3ad', { metalness: 0.9, roughness: 0.3 }));
    rail.rotation.x = Math.PI / 2;
    rail.position.set(CENTER.x, RING_Y + 0.07, 0);
    g.add(rail);
  }
  const nSleep = Math.floor((Math.PI * 2 * RING_R) / 0.9);
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.12, GAUGE + 0.9), mat('#4a3a30'), nSleep);
  const nPier = Math.floor((Math.PI * 2 * RING_R) / 9);
  const piers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1, 2.8), mat('#9b8a78', { roughness: 1 }), nPier);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < nSleep; i++) {
    const a = (i / nSleep) * Math.PI * 2;
    q.setFromAxisAngle(up, Math.PI / 2 - a);
    m.compose(new THREE.Vector3(CENTER.x + Math.cos(a) * RING_R, RING_Y - 0.08, Math.sin(a) * RING_R), q, new THREE.Vector3(1, 1, 1));
    sleepers.setMatrixAt(i, m);
  }
  for (let i = 0; i < nPier; i++) {
    const a = (i / nPier) * Math.PI * 2;
    const x = CENTER.x + Math.cos(a) * RING_R;
    const z = Math.sin(a) * RING_R;
    const ground = valleyHeight(x, z) - 1;
    const hgt = Math.max(0.5, RING_Y - 0.4 - ground);
    q.setFromAxisAngle(up, Math.PI / 2 - a);
    m.compose(new THREE.Vector3(x, ground + hgt / 2, z), q, new THREE.Vector3(1, hgt, 1));
    piers.setMatrixAt(i, m);
  }
  g.add(sleepers, piers);
  return g;
}

function makeRingTrain(group, animated, steam, { cars, kind, color, speed, phase, locoColor }) {
  const units = [];
  const loco = makeLoco({ color: locoColor, trim: '#d8b25a' });
  group.add(loco.group);
  units.push({ obj: loco.group, len: 3.6, wheels: loco.wheels });
  const freight = ['tank', 'box', 'open'];
  const freightColors = ['#8a4b2a', '#3d5a7a', '#6b6b35', '#7a2f3a'];
  for (let i = 0; i < cars; i++) {
    const w = kind === 'coach'
      ? makeWagon({ color, kind: 'coach', len: 3.2 })
      : makeWagon({ color: freightColors[i % freightColors.length], kind: freight[i % freight.length], len: 2.8 });
    group.add(w.group);
    units.push({ obj: w.group, len: w.len + 0.3, wheels: w.wheels });
  }
  const dir = Math.sign(speed);
  let ang = phase;
  let puff = 0;
  const tip = new THREE.Vector3();
  animated.push((t, dt = 1 / 60) => {
    ang += (speed / RING_R) * dt;
    let arc = 0;
    for (const u of units) {
      const a = ang - dir * (arc / RING_R);
      const x = CENTER.x + Math.cos(a) * RING_R;
      const z = Math.sin(a) * RING_R;
      u.obj.position.set(x, RING_Y, z);
      // tangent in the direction of travel
      u.obj.rotation.y = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
      for (const w of u.wheels) if (w.geometry.type !== 'BoxGeometry') w.rotation.x += Math.abs(speed) * dt * 2.5;
      arc += u.len;
    }
    puff -= dt;
    if (puff <= 0) {
      puff = 0.12;
      tip.copy(loco.chimneyTip);
      loco.group.localToWorld(tip);
      steam.emit(tip, { size: 1, rise: 2.2 });
    }
  });
}

function makeClouds(animated) {
  const g = new THREE.Group();
  const tex = puffTexture();
  const clouds = [];
  for (let i = 0; i < 22; i++) {
    const c = new THREE.Group();
    const a = Math.random() * Math.PI * 2;
    const r = 90 + Math.random() * 170;
    c.position.set(CENTER.x + Math.cos(a) * r, 55 + Math.random() * 40, Math.sin(a) * r);
    const tint = new THREE.Color('#ffd9c2').lerp(new THREE.Color('#e0a0b0'), Math.random());
    for (let j = 0; j < 7; j++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: tint, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
      const size = 14 + Math.random() * 16;
      s.scale.set(size * 1.6, size, 1);
      s.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 12);
      c.add(s);
    }
    g.add(c);
    clouds.push(c);
  }
  animated.push((t, dt = 1 / 60) => {
    for (const c of clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > CENTER.x + 280) c.position.x = CENTER.x - 280;
    }
  });
  return g;
}

function makeBirds(animated) {
  const g = new THREE.Group();
  const wingGeo = new THREE.PlaneGeometry(0.9, 0.3);
  wingGeo.translate(0.45, 0, 0);
  const birdMat = new THREE.MeshBasicMaterial({ color: '#2a2230', side: THREE.DoubleSide });
  const birds = [];
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Group();
    const l = new THREE.Mesh(wingGeo, birdMat);
    const r = new THREE.Mesh(wingGeo, birdMat);
    r.rotation.y = Math.PI;
    b.add(l, r);
    b.userData = { l, r, off: Math.random() * 10, rad: 30 + Math.random() * 14, h: 24 + Math.random() * 8, sp: 0.12 + Math.random() * 0.03 };
    g.add(b);
    birds.push(b);
  }
  animated.push((t) => {
    for (const b of birds) {
      const u = b.userData;
      const a = t * u.sp + u.off;
      b.position.set(CENTER.x + Math.cos(a) * u.rad, u.h + Math.sin(t + u.off) * 1.5, Math.sin(a) * u.rad);
      b.rotation.y = -a;
      const flap = Math.sin(t * 8 + u.off * 3) * 0.6;
      u.l.rotation.z = flap;
      u.r.rotation.z = -flap;
    }
  });
  return g;
}
