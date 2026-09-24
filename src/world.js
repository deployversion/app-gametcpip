import * as THREE from 'three';
import { LAYERS, STATIONS } from './content.js';
import { makeLabel } from './labels.js';
import { GLOSSARY } from './glossary.js';
import { SECRETS } from './secrets.js';
import {
  PATH_HALF_WIDTH, EXPLORE_HALF_WIDTH, PLATEAUS, STATION_X, STATION_Z, GATE_X, SIDE_BOUNDS, NODES, NODE_Y,
  SEA_LEVEL, LAPTOP, RACK, MONUMENT_Z, heightAt,
} from './layout.js';
import { generateWorld, makeGround, LIGHTHOUSE } from './voxel/terrain.js';
import { meshGrid } from './voxel/grid.js';
import { getAtlas, tileTexture, boxMaterials } from './voxel/textures.js';
import { buildSky } from './voxel/sky.js';
import { buildCreatures } from './voxel/creatures.js';

// The world is the TCP/IP stack turned into a block landscape: the sender's
// layers are grassy terraces you walk *down*, the network is a sea of router
// islands you fly across, and the receiver's layers are mesa terraces you
// climb back *up*. Everything off the paved path is there to explore.

export {
  PATH_HALF_WIDTH, EXPLORE_HALF_WIDTH, STATION_X, GATE_X, SIDE_BOUNDS, NODES, heightAt,
};

export const SPAWN = { sender: new THREE.Vector3(-116, 0, 0), receiver: new THREE.Vector3(47, 0, 0) };
export const NETWORK_EDGE = { sender: new THREE.Vector3(-2, 0, 0), receiver: new THREE.Vector3(46, 0, 0) };

const NODE_LABELS = {
  GW: 'Home router', R1: 'R1 · ISP', R2: 'R2', R3: 'R3', R4: 'R4 · backbone', R5: 'R5', R6: 'R6', SW: 'Server LAN',
};
const LINKS = [['GW', 'R1'], ['R1', 'R2'], ['R1', 'R3'], ['R1', 'R4'], ['R1', 'R5'], ['R2', 'R4'], ['R3', 'R4'], ['R4', 'R6'], ['R4', 'SW'], ['R5', 'R2'], ['R6', 'SW']];
const CABLE_COLOR = '#4be1ff';

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

  const sky = buildSky(scene);

  // --- terrain -------------------------------------------------------------
  const { grid, plants, heights } = generateWorld();
  const ground = makeGround(grid, heights);
  const atlas = getAtlas();
  const litMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true });
  for (const { lit, glow } of meshGrid(grid, atlas)) {
    if (!lit.empty) {
      const mesh = new THREE.Mesh(lit.toGeometry(), litMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      walkables.push(mesh);
    }
    if (!glow.empty) {
      const mesh = new THREE.Mesh(glow.toGeometry(), glowMat);
      scene.add(mesh);
      walkables.push(mesh);
    }
  }
  scene.add(makePlants(plants, atlas));
  const water = makeWater();
  scene.add(water);

  // --- signs ---------------------------------------------------------------
  for (const p of PLATEAUS) {
    const layer = LAYERS[p.layer];
    const cx = Math.floor((p.x0 + p.x1) / 2);
    const sign = makeLabel(`LAYER ${layer.num} · ${layer.name.toUpperCase()}`, { color: layer.color, size: 1.9, font: 800, border: layer.color });
    sign.position.set(cx, p.h + 17, MONUMENT_Z);
    scene.add(sign);
    const pdu = makeLabel(`unit: ${layer.pdu}`, { color: '#ffffff', size: 1 });
    pdu.position.set(cx, p.h + 15.3, MONUMENT_Z);
    scene.add(pdu);
  }
  const sideTitle = (text, x, y) => {
    const l = makeLabel(text, { color: '#ffffff', size: 2.6, font: 800, bg: 'rgba(8,12,32,0.45)' });
    l.position.set(x, y, -34);
    scene.add(l);
  };
  sideTitle('SENDER · going DOWN the stack', -64, 44);
  sideTitle('RECEIVER · going UP the stack', 96, 44);
  sideTitle('THE NETWORK', 21, 30);

  scene.add(makeLaptop());
  scene.add(makeServerRack(animated));

  // --- stations ------------------------------------------------------------
  for (const st of STATIONS) {
    if (st.side === 'network') continue;
    const x = STATION_X[st.id];
    const h = heightAt(x);
    const color = LAYERS[st.layer].color;
    const group = new THREE.Group();
    group.position.set(x, h, STATION_Z);

    const base = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), boxMaterials({ top: 'obsidian', side: 'bricks' }));
    base.position.y = 0.5;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    const lampMat = new THREE.MeshBasicMaterial({ map: tileTexture(`lamp_${st.layer}`) });
    for (const [dx, dz] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), lampMat);
      lamp.position.set(dx, 1.25, dz);
      group.add(lamp);
    }

    const icon = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.3, 1.3),
      new THREE.MeshLambertMaterial({ map: tileTexture(`glyph_${st.layer}`), emissive: color, emissiveIntensity: 0.35 }),
    );
    icon.position.y = 3;
    icon.castShadow = true;
    group.add(icon);

    const beacon = makeBeacon(color);
    group.add(beacon);

    const label = makeLabel(st.title, { color, size: 0.9, border: color });
    label.position.y = 5;
    group.add(label);

    scene.add(group);
    const entry = { id: st.id, group, icon, beacon, position: new THREE.Vector3(x, h, STATION_Z), clickTargets: [base, icon] };
    stations.set(st.id, entry);
    animated.push((t) => {
      icon.rotation.y = t * 0.8;
      icon.rotation.x = Math.sin(t * 0.6 + x) * 0.2;
      icon.position.y = 3 + Math.sin(t * 2 + x) * 0.2;
      beacon.material.opacity = beacon.visible ? 0.2 + Math.sin(t * 3) * 0.06 : 0;
    });
  }

  // --- gates ---------------------------------------------------------------
  const portalTex = tileTexture('portal', 12, 3).clone();
  portalTex.needsUpdate = true;
  const curtainAlpha = makeCurtainAlpha();
  for (const [id, x] of Object.entries(GATE_X)) {
    const st = STATIONS.find((s) => s.id === id);
    const color = LAYERS[st.layer].color;
    const h = heightAt(x - 0.5);
    const gate = new THREE.Group();
    gate.position.set(x, h, 0);
    // A glowing curtain across the whole valley: bright on the path,
    // fainter over the hills, so you cannot sneak around it.
    const width = EXPLORE_HALF_WIDTH * 2 + 4;
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 9),
      new THREE.MeshBasicMaterial({ color, map: portalTex, alphaMap: curtainAlpha, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    );
    field.rotation.y = Math.PI / 2;
    field.position.y = 3.5;
    gate.add(field);
    const postMat = boxMaterials({ top: `lamp_${st.layer}`, side: 'obsidian', bottom: 'obsidian' });
    for (const z of [-(PATH_HALF_WIDTH + 1), PATH_HALF_WIDTH + 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 1), postMat);
      post.position.set(0, 3, z);
      post.castShadow = true;
      gate.add(post);
    }
    const lock = makeLabel('🔒 solve the station to pass', { color: '#fff', size: 0.7 });
    lock.position.y = 6.8;
    gate.add(lock);
    scene.add(gate);
    gates.set(id, { x, group: gate, field, open: false });
    animated.push((t) => {
      field.material.opacity = 0.45 + Math.sin(t * 4 + x) * 0.1;
    });
  }
  animated.push((t) => {
    portalTex.offset.set(t * 0.15, Math.sin(t * 0.7) * 0.2);
  });

  // --- network -------------------------------------------------------------
  const cables = new Map();
  const addCable = (a, b, key) => {
    const n = Math.max(2, Math.round(a.distanceTo(b) / 0.5));
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.24, 0.24, 0.24),
      new THREE.MeshBasicMaterial({ color: CABLE_COLOR, transparent: true, opacity: 0.9 }),
      n + 1,
    );
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      p.lerpVectors(a, b, i / n);
      mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    }
    scene.add(mesh);
    if (key) cables.set(key, mesh);
  };
  addCable(new THREE.Vector3(-2, 0.3, -0.5), nodePosition('GW'), 'LAN-GW');
  addCable(nodePosition('SW'), new THREE.Vector3(44, 0.3, 2.5), 'SW-LAN');
  for (const [a, b] of LINKS) addCable(nodePosition(a), nodePosition(b), `${a}-${b}`);

  const routerMats = boxMaterials({ top: 'router_top', side: 'router_face', bottom: 'router_face' }, THREE.MeshLambertMaterial, { emissive: '#1a2a55', emissiveIntensity: 0.4 });
  const arrowMat = new THREE.MeshBasicMaterial({ map: tileTexture('lamp_link') });
  for (const id of Object.keys(NODES)) {
    const pos = nodePosition(id);
    const g = new THREE.Group();
    g.position.copy(pos);
    const isSwitch = id === 'SW';
    const body = new THREE.Mesh(isSwitch ? new THREE.BoxGeometry(3.4, 0.9, 2) : new THREE.BoxGeometry(3, 1, 3), routerMats);
    body.castShadow = true;
    g.add(body);
    if (!isSwitch) {
      // four data blocks orbiting the router: "routing" in motion
      const spinner = new THREE.Group();
      spinner.position.y = 0.95;
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), arrowMat);
        b.position.set(Math.cos((i * Math.PI) / 2) * 1, 0, Math.sin((i * Math.PI) / 2) * 1);
        spinner.add(b);
      }
      g.add(spinner);
      animated.push((t) => { spinner.rotation.y = t; });
    }
    const label = makeLabel(NODE_LABELS[id], { color: '#bfe9ff', size: 0.75 });
    label.position.y = 2.3;
    g.add(label);
    const beacon = makeBeacon(CABLE_COLOR);
    beacon.visible = false;
    g.add(beacon);
    scene.add(g);
    routers.set(id, { id, group: g, beacon, body });
    animated.push(() => { beacon.material.opacity = beacon.visible ? 0.22 : 0; });
  }

  scene.add(makeBitDust(animated));
  const beam = makeLighthouseBeam(animated, sky);
  scene.add(beam);

  // --- knowledge orbs ("?" blocks) ------------------------------------------
  const orbs = new Map();
  const qTex = tileTexture('qblock');
  for (const entry of GLOSSARY) {
    const color = LAYERS[entry.layer].color;
    const g = new THREE.Group();
    g.position.set(entry.x, heightAt(entry.x) + 1.6, entry.z);
    const gem = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.85, 0.85),
      new THREE.MeshLambertMaterial({ map: qTex, emissive: '#ffcc55', emissiveIntensity: 0.45, transparent: true }),
    );
    gem.castShadow = true;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 4, 4), new THREE.MeshBasicMaterial({ color, transparent: true }));
    g.add(gem, halo);
    scene.add(g);
    orbs.set(entry.id, { entry, group: g, gem, halo, collected: false });
    const phase = entry.x * 0.37;
    animated.push((t) => {
      if (!g.visible) return;
      gem.rotation.y = t * 1.2 + phase;
      halo.rotation.set(Math.PI / 2, 0, Math.PI / 4 + t * 0.8);
      g.position.y = heightAt(entry.x) + 1.6 + Math.sin(t * 2 + phase) * 0.25;
    });
  }

  // --- treasure chests -------------------------------------------------------
  const chests = new Map();
  const chestMats = boxMaterials({ top: 'chest_top', side: 'chest_side', bottom: 'chest_top', front: 'chest_front' });
  const sparkleMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true });
  for (const s of SECRETS) {
    const g = new THREE.Group();
    g.position.set(s.x, ground.terrain(s.x, s.z), s.z);
    g.rotation.y = s.z > 0 ? Math.PI : 0; // face the path
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.9), chestMats);
    body.position.y = 0.375;
    body.castShadow = true;
    const lid = new THREE.Group();
    lid.position.set(0, 0.75, -0.45);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.9), chestMats);
    lidMesh.position.set(0, 0.15, 0.45);
    lidMesh.castShadow = true;
    lid.add(lidMesh);
    const sparkles = [0, 1, 2].map(() => {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), sparkleMat);
      g.add(sp);
      return sp;
    });
    g.add(body, lid);
    scene.add(g);
    chests.set(s.id, { entry: s, group: g, lid, sparkles, opened: false });
    const phase = s.x;
    animated.push((t) => {
      sparkles.forEach((sp, i) => {
        sp.visible = !chests.get(s.id).opened;
        const a = t * 1.5 + i * 2.1 + phase;
        sp.position.set(Math.cos(a) * 0.8, 1.2 + ((t * 0.6 + i / 3) % 1) * 1.2, Math.sin(a) * 0.8);
      });
      sparkleMat.opacity = 0.6 + Math.sin(t * 5) * 0.3;
    });
  }

  const creatures = buildCreatures(scene, ground);

  return {
    orbs,
    chests,
    sky,
    sun: sky.sun,
    ground,
    walkables,
    stations,
    gates,
    routers,
    cables,
    update(t, dt, focus, camera) {
      sky.update(t, dt, focus, camera);
      water.material.map.offset.set(t * 0.02, Math.sin(t * 0.3) * 0.03);
      water.material.color.copy(sky.water);
      creatures.update(t, dt);
      for (const fn of animated) fn(t, dt);
    },
  };
}

function makeBeacon(color) {
  // A square beam of light, like a beacon block's.
  const beacon = new THREE.Mesh(
    new THREE.BoxGeometry(1, 80, 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beacon.position.y = 40;
  return beacon;
}

function makePlants(plants, atlas) {
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  for (const p of plants) {
    const [u0, v0, u1, v1] = atlas.uv(p.tile);
    const cx = p.x + 0.5;
    const cz = p.z + 0.5;
    const s = 0.45;
    for (const [dx, dz] of [[s, s], [s, -s]]) {
      const b = pos.length / 3;
      pos.push(cx - dx, p.y, cz - dz, cx + dx, p.y, cz + dz, cx + dx, p.y + 1, cz + dz, cx - dx, p.y + 1, cz - dz);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.5, side: THREE.DoubleSide }));
}

function makeWater() {
  const tex = tileTexture('water').clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(250, 200);
  tex.needsUpdate = true;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 800),
    new THREE.MeshLambertMaterial({ map: tex, color: '#5d8fe8', transparent: true, opacity: 0.82, depthWrite: false }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(10, SEA_LEVEL, 0);
  water.receiveShadow = true;
  water.renderOrder = 1;
  return water;
}

// Alpha mask for gate curtains: solid over the path, fading over the hills
// and towards the top.
function makeCurtainAlpha() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 32);
  const pathFrac = (PATH_HALF_WIDTH + 1) / (EXPLORE_HALF_WIDTH + 2);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 128; x++) {
      const u = Math.abs(x / 127 - 0.5) * 2;
      const side = u < pathFrac ? 1 : 0.45 * (1 - (u - pathFrac) / (1 - pathFrac)) + 0.15;
      const v = 1 - y / 31; // 1 at the bottom
      const a = side * Math.min(1, v * 1.8) * (y % 4 === 0 ? 0.7 : 1);
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

// Glowing bit-blocks drifting up out of the sea between the routers.
function makeBitDust(animated) {
  const n = 160;
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.28),
    new THREE.MeshBasicMaterial({ color: CABLE_COLOR, transparent: true, opacity: 0.6, depthWrite: false }),
    n,
  );
  const bits = Array.from({ length: n }, (_, i) => ({
    x: -2 + ((i * 37) % 46) + Math.random(),
    y: SEA_LEVEL + Math.random() * 12,
    z: -24 + Math.random() * 48,
    speed: 0.3 + Math.random() * 0.8,
    s: i % 2 ? 1 : 0.55,
  }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  animated.push((t, dt = 1 / 60) => {
    bits.forEach((b, i) => {
      b.y += b.speed * dt;
      if (b.y > 10) b.y = SEA_LEVEL;
      sc.setScalar(b.s);
      mesh.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), q, sc));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  mesh.frustumCulled = false;
  return mesh;
}

function makeLighthouseBeam(animated, sky) {
  const g = new THREE.Group();
  g.position.set(LIGHTHOUSE.x + 0.5, LIGHTHOUSE.height + 1.5, LIGHTHOUSE.z + 0.5);
  const mat = new THREE.MeshBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const s of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(60, 1.4, 1.4), mat);
    beam.position.x = 30.5 * s;
    g.add(beam);
  }
  const light = new THREE.PointLight('#ffd98a', 0, 40, 1.5);
  g.add(light);
  animated.push((t) => {
    g.rotation.y = t * 0.6;
    mat.opacity = 0.03 + sky.night * 0.22;
    light.intensity = sky.night * 60;
  });
  return g;
}

function makeLaptop() {
  const g = new THREE.Group();
  g.position.set(LAPTOP.x, heightAt(LAPTOP.x), LAPTOP.z);
  const mat = new THREE.MeshLambertMaterial({ color: '#c9cfe6' });
  const base = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 8), mat);
  base.position.y = 0.25;
  base.castShadow = true;
  g.add(base);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 4), new THREE.MeshLambertMaterial({ color: '#3a3f55' }));
  keys.position.set(0, 0.55, 0.6);
  g.add(keys);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 0.4), mat);
  lid.position.set(0, 4.2, -4);
  lid.rotation.x = -0.15;
  lid.castShadow = true;
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
  const tag = makeLabel("Alice's laptop", { size: 1, color: '#fff' });
  tag.position.set(0, 9.6, -4);
  g.add(tag);
  return g;
}

function makeServerRack(animated) {
  const g = new THREE.Group();
  g.position.set(RACK.x, heightAt(RACK.x), RACK.z);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(4, 12, 5), boxMaterials({ top: 'router_top', side: 'router_face' }));
  rack.position.y = 6;
  rack.castShadow = true;
  g.add(rack);
  const leds = [];
  for (let i = 0; i < 8; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: '#35d07f' }));
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
