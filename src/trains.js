import * as THREE from 'three';

// Shared railway parts: rolling stock, track, steam and a few textures.
// Everything faces +z: a train's front is at +z, its wheels sit on y = 0.

export const GAUGE = 1.2;

const matCache = new Map();
export function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...extra }));
  return matCache.get(key);
}

export function glowMat(color, intensity = 1.5) {
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

// Soft round puff used for steam and clouds.
let puffTex;
export function puffTexture() {
  puffTex ??= canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  return puffTex;
}

// ------------------------------------------------------------------ wheels
const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.16, 16);
wheelGeo.rotateZ(Math.PI / 2);
const bigWheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.16, 20);
bigWheelGeo.rotateZ(Math.PI / 2);

function addWheels(g, zs, big = false) {
  const wheels = [];
  for (const z of zs) {
    for (const x of [-GAUGE / 2, GAUGE / 2]) {
      const w = new THREE.Mesh(big ? bigWheelGeo : wheelGeo, mat('#2a2326', { metalness: 0.7 }));
      w.position.set(x, big ? 0.5 : 0.34, z);
      g.add(w);
      wheels.push(w);
    }
  }
  return wheels;
}

// A steam locomotive about 3.4 long. Returns the group plus the parts that
// animate (wheels, chimney tip, headlamp).
export function makeLoco({ color = '#8a1c2b', trim = '#d8b25a', lamp = '#fff2c4' } = {}) {
  const g = new THREE.Group();
  const body = mat(color, { roughness: 0.45, metalness: 0.35 });
  const brass = mat(trim, { metalness: 0.8, roughness: 0.3 });
  const dark = mat('#1b1a22', { roughness: 0.8 });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 3.4), dark);
  frame.position.y = 0.75;
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.2, 20), body);
  boiler.rotation.x = Math.PI / 2;
  boiler.position.set(0, 1.5, 0.45);
  const smokebox = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.25, 20), dark);
  smokebox.rotation.x = Math.PI / 2;
  smokebox.position.set(0, 1.5, 1.6);
  const band1 = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.04, 6, 24), brass);
  band1.position.set(0, 1.5, 0.1);
  const band2 = band1.clone();
  band2.position.z = 0.9;
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.15, 0.7, 12), dark);
  chimney.position.set(0, 2.35, 1.2);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass);
  dome.position.set(0, 2.1, 0.4);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 1.1), body);
  cab.position.set(0, 1.75, -1.05);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.35), dark);
  roof.position.set(0, 2.5, -1.05);
  const cabWin = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), glowMat('#ffcf7a', 0.9));
  cabWin.position.set(0.76, 2, -1.05);
  cabWin.rotation.y = Math.PI / 2;
  const cabWin2 = cabWin.clone();
  cabWin2.position.x = -0.76;
  cabWin2.rotation.y = -Math.PI / 2;
  const catcher = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6, 4, 1), brass);
  catcher.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  catcher.scale.set(1, 1, 0.5);
  catcher.position.set(0, 0.6, 1.85);
  const headlamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), glowMat(lamp, 3));
  headlamp.position.set(0, 1.95, 1.75);
  const buffers = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.1), brass);
  buffers.position.set(0, 0.85, 1.72);

  for (const m of [frame, boiler, cab, chimney]) m.castShadow = true;
  g.add(frame, boiler, smokebox, band1, band2, chimney, dome, cab, roof, cabWin, cabWin2, catcher, headlamp, buffers);
  const wheels = [...addWheels(g, [0.9, -0.1], true), ...addWheels(g, [-1.1])];
  // coupling rods on the driving wheels
  for (const x of [-0.84, 0.84]) {
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 1.2), brass);
    rod.position.set(x, 0.5, 0.4);
    g.add(rod);
    wheels.push(rod);
  }
  return { group: g, wheels, chimneyTip: new THREE.Vector3(0, 2.75, 1.2), headlamp };
}

// Painted side board for a wagon: header name big, a detail line small.
function wagonSideTexture(title, detail, color) {
  return canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < w; x += 22) ctx.fillRect(x, 0, 2, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px "Segoe UI", sans-serif';
    ctx.fillText(title, w / 2, 50);
    ctx.font = '600 20px "Segoe UI", sans-serif';
    ctx.fillText(detail, w / 2, 80);
  });
}

// A wagon about 2.6 long. kind: 'box' | 'open' | 'tank' | 'coach' | 'caboose'
export function makeWagon({ color = '#3d9bff', title = '', detail = '', kind = 'box', len = 2.6 } = {}) {
  const g = new THREE.Group();
  const dark = mat('#1b1a22', { roughness: 0.8 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, len), dark);
  chassis.position.y = 0.72;
  g.add(chassis);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 });
  const side = title ? new THREE.MeshStandardMaterial({ map: wagonSideTexture(title, detail, color), roughness: 0.6 }) : paint;
  let bodyH = 1.3;
  if (kind === 'tank') {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, len - 0.3, 18), paint);
    tank.rotation.x = Math.PI / 2;
    tank.position.y = 1.45;
    tank.castShadow = true;
    g.add(tank);
    bodyH = 1.4;
  } else {
    const h = kind === 'open' ? 0.8 : kind === 'caboose' ? 1.2 : 1.3;
    bodyH = h;
    // side boards carry the texture, ends and roof are plain paint
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.45, h, len - 0.2), [side, side, paint, paint, paint, paint]);
    box.position.y = 0.82 + h / 2;
    box.castShadow = true;
    g.add(box);
    if (kind === 'box' || kind === 'coach' || kind === 'caboose') {
      const r = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, len - 0.05), dark);
      r.position.y = 0.82 + h + 0.06;
      g.add(r);
    }
    if (kind === 'caboose') {
      const cupola = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), paint);
      cupola.position.set(0, 0.82 + h + 0.35, -0.3);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glowMat('#ff3b3b', 3));
      lamp.position.set(0.55, 1.6, -len / 2);
      g.add(cupola, lamp);
    }
    if (kind === 'open') {
      // a load of crates peeking out
      for (let i = 0; i < 3; i++) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), mat('#b88a4a'));
        crate.position.set((i - 1) * 0.35, 1.75, (i - 1) * 0.6);
        crate.rotation.y = i * 0.4;
        g.add(crate);
      }
    }
    if (kind === 'coach') {
      const winMat = glowMat('#ffd48a', 1.1);
      for (const x of [-0.73, 0.73]) {
        for (let i = 0; i < 3; i++) {
          const w = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.4), winMat);
          w.position.set(x * 1.01, 1.75, (i - 1) * 0.75);
          w.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
          g.add(w);
        }
      }
    }
  }
  const wheels = addWheels(g, [len / 2 - 0.55, -len / 2 + 0.55]);
  g.userData.height = 0.82 + bodyH;
  return { group: g, wheels, len };
}

// ------------------------------------------------------------------ track
const sleeperGeo = new THREE.BoxGeometry(GAUGE + 0.9, 0.12, 0.32);
const railGeo = new THREE.BoxGeometry(0.1, 0.14, 1);

// Straight track from a to b (rails on top of the points). Returns the group
// and the glowing "live wire" strip between the rails, whose material the game
// lights up when a train uses the line.
export function makeTrack(a, b, { sleepers = true, liveColor = '#ffd27a', liveOpacity = 0.35 } = {}) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.Group();
  g.position.copy(a).lerp(b, 0.5);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  for (const x of [-GAUGE / 2, GAUGE / 2]) {
    const rail = new THREE.Mesh(railGeo, mat('#b9b3ad', { metalness: 0.9, roughness: 0.25 }));
    rail.scale.z = len;
    rail.position.set(x, 0.02, 0);
    g.add(rail);
  }
  if (sleepers) {
    const n = Math.max(1, Math.floor(len / 0.8));
    const inst = new THREE.InstancedMesh(sleeperGeo, mat('#4a3a30', { roughness: 0.95 }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeTranslation(0, -0.1, -len / 2 + (i + 0.5) * (len / n));
      inst.setMatrixAt(i, m);
    }
    inst.receiveShadow = true;
    g.add(inst);
  }
  const live = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.04, len),
    new THREE.MeshBasicMaterial({ color: liveColor, transparent: true, opacity: liveOpacity }),
  );
  live.position.y = -0.02;
  g.add(live);
  return { group: g, live, len };
}

// ------------------------------------------------------------------ steam
// A pool of puffs. emit() at a world position; they rise, grow and fade.
export class Steam {
  constructor(scene, count = 60, color = '#f4ece4') {
    this.puffs = [];
    this.next = 0;
    const tex = puffTexture();
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      s.userData = { life: 0, v: new THREE.Vector3() };
      scene.add(s);
      this.puffs.push(s);
    }
  }

  emit(pos, { size = 0.7, rise = 1.6, drift = null } = {}) {
    const s = this.puffs[this.next];
    this.next = (this.next + 1) % this.puffs.length;
    s.visible = true;
    s.position.copy(pos);
    s.userData.life = 1;
    s.userData.size = size;
    s.userData.v.set((Math.random() - 0.5) * 0.4, rise, (Math.random() - 0.5) * 0.4);
    if (drift) s.userData.v.add(drift);
    s.scale.setScalar(size);
  }

  update(dt) {
    for (const s of this.puffs) {
      if (!s.visible) continue;
      const u = s.userData;
      u.life -= dt * 0.55;
      if (u.life <= 0) {
        s.visible = false;
        continue;
      }
      s.position.addScaledVector(u.v, dt);
      u.v.multiplyScalar(1 - dt * 0.6);
      s.scale.setScalar(u.size * (1 + (1 - u.life) * 2.2));
      s.material.opacity = Math.min(1, u.life * 1.4) * 0.55;
    }
  }
}
