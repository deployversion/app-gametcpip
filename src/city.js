import * as THREE from 'three';
import { LAYERS } from './content.js';

// Neon Megacity: the TCP/IP stack as a rain-soaked cyberpunk city.
//
// The walkable layer plateaus become lit rooftop decks stacked on one huge
// arcology block, the network becomes the street canyon between the client
// district (sender) and the server district (receiver), and everything
// around them is procedurally generated towers, neon signs, hovercar
// traffic, rain, searchlights and a blimp that scrolls RFC numbers.
//
// Layout rules the generator respects so the city never hides the lesson:
//   · |z| < 17 along the decks is reserved (decks, sidewalks, layer signs).
//   · z > 0 is the camera side: towers there stay below the deck they face.
//   · Towers stand on a 16-unit grid with streets on the odd half-cells, so
//     hovercar lanes at z = 16k + 8 fly down streets instead of through walls.

export const FLOOR = -70;
export const SIDEWALK = 13; // decks are drawn out to |z| = 13; you walk |z| <= 9
const CELL = 16;
const FOG = new THREE.Color('#1d0d33');

// Small seeded RNG so the skyline is the same on every visit.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NEON = ['#ff2a6d', '#05d9e8', '#b967ff', '#ffb000', '#39ff88'];

// --------------------------------------------------------------- materials

// Unlit tower material: lit windows come from a hash of the world position,
// so thousands of instanced boxes get unique facades without textures.
export function buildingMaterial({ instanced = false, seed = 0 } = {}) {
  return new THREE.ShaderMaterial({
    fog: true,
    defines: instanced ? { INSTANCED_SEED: 1 } : {},
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSeed: { value: seed },
        uNeon: { value: NEON.slice(0, 4).map((c) => new THREE.Color(c)) },
      },
    ]),
    vertexShader: /* glsl */ `
      #ifdef INSTANCED_SEED
      attribute float aSeed;
      #endif
      uniform float uSeed;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vSeed;
      varying float vTop;
      #include <fog_pars_vertex>
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
        m = modelMatrix * instanceMatrix;
        #endif
        vec4 world = m * vec4(position, 1.0);
        vWorld = world.xyz;
        vN = normalize(mat3(m) * normal);
        vTop = (m * vec4(0.0, 0.5, 0.0, 1.0)).y;
        // integer seeds, re-rounded in the fragment shader, so interpolation
        // noise can't turn into per-pixel sparkle in the window hash
        #ifdef INSTANCED_SEED
        vSeed = aSeed;
        #else
        vSeed = uSeed;
        #endif
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uNeon[4];
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vSeed;
      varying float vTop;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vN);
        float seed = floor(vSeed + 0.5);
        vec3 col;
        if (abs(n.y) < 0.5) {
          vec2 uv = abs(n.x) > 0.5 ? vWorld.zy : vWorld.xy;
          vec2 cell = uv / vec2(1.5, 2.1);
          vec2 id = floor(cell);
          vec2 f = fract(cell);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.78);
          float r = hash(id + vec2(mod(seed, 61.0) * 7.0, mod(seed, 37.0) * 5.0 + (abs(n.x) > 0.5 ? 71.0 : 0.0)));
          // Some towers are mostly dark, some mostly lit.
          float density = 0.45 + 0.35 * fract(seed * 0.317);
          float lit = step(density, r);
          lit *= 1.0 - step(0.992, hash(id + floor(uTime * 3.0))) * step(0.9, r);
          vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.62, 0.82, 1.0), step(0.55, fract(r * 13.0)));
          int k = int(mod(floor(r * 97.0), 4.0));
          vec3 neon = uNeon[0];
          if (k == 1) neon = uNeon[1];
          if (k == 2) neon = uNeon[2];
          if (k == 3) neon = uNeon[3];
          vec3 wc = mix(warm, neon, step(0.82, fract(r * 7.0)));
          col = vec3(0.018, 0.018, 0.035);
          col += win * lit * wc * (0.35 + 0.45 * fract(r * 29.0));
          col += win * (1.0 - lit) * vec3(0.02, 0.025, 0.05);
          // floor slabs
          col += step(0.96, fract(uv.y / 8.4)) * vec3(0.03, 0.03, 0.06);
          #ifdef INSTANCED_SEED
          // neon crown on some roofs
          float crown = step(0.55, fract(seed * 0.731)) * (1.0 - smoothstep(0.0, 0.7, vTop - vWorld.y));
          int ck = int(mod(seed, 4.0));
          vec3 cc = uNeon[0];
          if (ck == 1) cc = uNeon[1];
          if (ck == 2) cc = uNeon[2];
          if (ck == 3) cc = uNeon[3];
          col = mix(col, cc * 1.6, crown);
          #endif
        } else {
          col = vec3(0.012, 0.012, 0.028);
          // hazard stripes on ramps and roofs
          if (n.y > 0.5) col += step(0.93, fract(vWorld.x * 0.25)) * vec3(0.08, 0.02, 0.06);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
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

// A neon tube sign: dark panel, glowing border and glowing text.
function signTexture(text, color, vertical) {
  const lines = vertical ? [...text] : [text];
  const w = vertical ? 128 : Math.max(256, 40 + text.length * 44);
  const h = vertical ? 40 + lines.length * 88 : 128;
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#0a0414';
    ctx.fillRect(0, 0, w, h);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.font = `800 ${vertical ? 76 : 72}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let pass = 0; pass < 3; pass++) {
      ctx.fillStyle = pass < 2 ? color : '#ffffff';
      ctx.shadowBlur = pass < 2 ? 26 : 6;
      lines.forEach((ch, i) => {
        const y = vertical ? 64 + i * 88 : h / 2 + 4;
        ctx.fillText(ch, w / 2, y);
      });
    }
  });
}

function glowSprite(color, size) {
  const tex = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

// ------------------------------------------------------------ neon signs
const SIGN_TEXT = {
  'sender-app': [['DNS NOODLE BAR', '#ff2a6d'], ['PORT 443', '#05d9e8'], ['HTTPS', '#b967ff', true], ['GET /cat.png', '#ffb000']],
  'sender-transport': [['HANDSHAKE HOTEL', '#ffb000'], ['SYN', '#ff2a6d', true], ['ACK', '#05d9e8', true], ['SEQ 1001', '#b967ff']],
  'sender-internet': [['TTL TOWER', '#39ff88'], ['IPv4', '#05d9e8', true], ['0.0.0.0/0', '#ff2a6d'], ['ICMP', '#ffb000', true]],
  'sender-link': [['ARP ALLEY', '#05d9e8'], ['MAC', '#ff2a6d', true], ['ETHERNET', '#b967ff'], ['FCS OK', '#39ff88']],
  'receiver-link': [['MAC MARKET', '#05d9e8'], ['FRAME', '#b967ff', true], ['0xCAFE', '#ff2a6d'], ['NIC', '#39ff88', true]],
  'receiver-internet': [['FIREWALL', '#ff2a6d'], ['NAT CLUB', '#b967ff'], ['DENY *', '#ffb000', true], ['TTL 57', '#39ff88']],
  'receiver-transport': [['REASSEMBLY YARD', '#ffb000'], ['SEQ', '#05d9e8', true], ['PORT 443', '#ff2a6d'], ['WIN 64K', '#b967ff']],
  'receiver-app': [['CATPICS.EXAMPLE', '#ff2a6d'], ['200 OK', '#39ff88'], ['HTTP', '#05d9e8', true], ['MEOW', '#ffb000', true]],
};

// Places to discover while exploring. Walking close shows the fact.
export const LANDMARKS = [
  { id: 'plaza', name: 'Port 443 Plaza', x: -118, z: 5, fact: 'HTTPS servers listen on port 443. Plain HTTP uses port 80, and your browser picks a random high port for its own end.' },
  { id: 'noodle', name: 'DNS Noodle Bar', x: -96, z: 6, fact: 'Your computer caches DNS answers for as long as their TTL says, so a second visit skips the lookup.' },
  { id: 'hotel', name: 'Handshake Hotel', x: -74, z: -6, fact: 'SYN, SYN-ACK, ACK: TCP spends a full round trip on the handshake before any data flows.' },
  { id: 'ttl', name: 'TTL Tower', x: -44, z: 6, fact: 'Each router lowers the TTL by one. At zero the packet is dropped and an ICMP "time exceeded" goes back. That is how traceroute works.' },
  { id: 'arp', name: 'ARP Alley', x: -14, z: 6, fact: 'ARP turns an IP address into a MAC address, but only inside one local network. It never crosses a router.' },
  { id: 'market', name: 'MAC Market', x: 56, z: 6, fact: 'A network card ignores frames that are not addressed to its MAC, unless they go to the broadcast address ff:ff:ff:ff:ff:ff.' },
  { id: 'firewall', name: 'Firewall Checkpoint', x: 82, z: 6, fact: 'Firewall rules are checked top to bottom, and the first rule that matches decides. Order matters!' },
  { id: 'yard', name: 'Reassembly Yard', x: 108, z: 6, fact: 'Segments can arrive out of order. Sequence numbers let TCP put the bytes back in the right order before the app sees them.' },
  { id: 'farm', name: 'Server Farm 203', x: 136, z: 6, fact: '203.0.113.0/24 is reserved for documentation, which is why examples like catpics.example can safely use it.' },
];

// ------------------------------------------------------------------- city
export function buildCity(scene, { plateaus, heightAt, nodes, renderer }) {
  const animated = [];
  const rand = mulberry32(20260924);
  const materials = [];

  // --- atmosphere --------------------------------------------------------
  scene.background = FOG.clone();
  scene.fog = new THREE.FogExp2(FOG, 0.0062);
  const sky = makeSky();
  scene.add(sky.mesh);

  if (renderer) scene.environment = makeNeonEnvironment(renderer);

  // --- towers ------------------------------------------------------------
  const deckTop = (x) => (x > 2 && x < 40 ? -12 : heightAt(THREE.MathUtils.clamp(x, -124, 146)));
  const routerSpots = Object.values(nodes);
  const towers = [];
  const frontRow = [];
  for (let cx = -304; cx <= 352; cx += CELL) {
    for (let cz = -288; cz <= 288; cz += CELL) {
      if (rand() < 0.1) continue; // a plaza
      const x = cx + (rand() - 0.5) * 2;
      const z = cz + (rand() - 0.5) * 2;
      const w = 6 + rand() * 5;
      const d = 6 + rand() * 5;
      const alongDecks = cx > -140 && cx < 162;
      let top;
      if (alongDecks && Math.abs(cz) < 17) {
        if (!(cx > 2 && cx < 40)) continue; // the arcology block is here
        if (routerSpots.some(([rx, rz]) => Math.hypot(rx - x, rz - z) < 9)) continue;
        top = -12 - rand() * 18;
      } else if (cz > 0 && cz < 64 && cx > -190 && cx < 210) {
        // camera side: stay under the deck you are looking past
        top = Math.min(deckTop(cx) - 8, 7) - rand() * 22;
      } else if (Math.abs(cz) < 64 && ((cx > -210 && cx <= -140) || (cx >= 162 && cx < 230))) {
        // just past either end of the decks, where the camera can swing
        top = 4 - rand() * 24;
      } else if (cz < 0 && cz > -20) {
        continue;
      } else {
        const r = rand();
        top = FLOOR + 45 + r * r * 170;
      }
      if (cz === -32 && alongDecks && !(cx > 2 && cx < 40)) top = Math.max(top, deckTop(cx) + 34 + rand() * 50);
      const t = { x, z, w, d, top, seed: rand() };
      towers.push(t);
      if (cz === -32 && alongDecks) frontRow.push(t);
    }
  }
  // Setbacks and spires on the tall ones.
  const extra = [];
  const spires = [];
  for (const t of towers) {
    if (t.top > 40 && rand() < 0.6) {
      const h = 8 + rand() * 24;
      extra.push({ x: t.x, z: t.z, w: t.w * 0.65, d: t.d * 0.65, top: t.top + h, bottom: t.top, seed: rand() });
      if (rand() < 0.7) spires.push({ x: t.x, z: t.z, y: t.top + h, h: 6 + rand() * 14 });
    } else if (t.top > 20 && rand() < 0.4) {
      spires.push({ x: t.x, z: t.z, y: t.top, h: 4 + rand() * 8 });
    }
  }
  const all = [...towers.map((t) => ({ ...t, bottom: FLOOR })), ...extra];
  const towerMat = buildingMaterial({ instanced: true });
  materials.push(towerMat);
  const towerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), towerMat, all.length);
  const seeds = new Float32Array(all.length);
  const m4 = new THREE.Matrix4();
  all.forEach((t, i) => {
    const h = t.top - t.bottom;
    m4.makeScale(t.w, h, t.d).setPosition(t.x, t.bottom + h / 2, t.z);
    towerMesh.setMatrixAt(i, m4);
    seeds[i] = Math.floor(t.seed * 1000);
  });
  towerMesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  towerMesh.frustumCulled = false;
  scene.add(towerMesh);

  // Antennas with blinking aircraft-warning lights.
  const spireMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.25, 1, 5), new THREE.MeshBasicMaterial({ color: '#1a1a2e' }), spires.length);
  const blinkA = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2030').multiplyScalar(3) }), spires.length);
  spires.forEach((s, i) => {
    m4.makeScale(1, s.h, 1).setPosition(s.x, s.y + s.h / 2, s.z);
    spireMesh.setMatrixAt(i, m4);
    m4.makeTranslation(s.x, s.y + s.h, s.z);
    blinkA.setMatrixAt(i, m4);
  });
  scene.add(spireMesh, blinkA);
  animated.push((t) => { blinkA.visible = (t % 1.6) < 0.35; });

  // --- neon signs on the front row, facing the decks ----------------------
  const signs = [];
  for (const p of plateaus) {
    const list = SIGN_TEXT[`${p.side}-${p.layer}`];
    const row = frontRow.filter((t) => t.x > p.x0 - 4 && t.x < p.x1 + 4);
    list.forEach(([text, color, vertical], i) => {
      const t = row[i % Math.max(1, row.length)];
      if (!t) return;
      const tex = signTexture(text, color, vertical);
      const aspect = tex.image.width / tex.image.height;
      const h = vertical ? 11 : 3.2;
      const w = h * aspect;
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      mat.color.setScalar(1.25);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      const slot = Math.floor(i / Math.max(1, row.length));
      const xOff = vertical ? (i % 2 ? 1 : -1) * (t.w / 2 - w / 2 - 0.2) : 0;
      const y = p.h + (vertical ? 16 : 9) + slot * 8 + (i % 2) * 3;
      sign.position.set(t.x + xOff, Math.min(y, t.top - h / 2 - 1), t.z + t.d / 2 + 0.06);
      scene.add(sign);
      signs.push({ sign, mat, flicker: rand() < 0.35, phase: rand() * 10 });
    });
  }
  animated.push((t) => {
    for (const s of signs) {
      if (!s.flicker) continue;
      const k = Math.sin(t * 23 + s.phase) + Math.sin(t * 7.3 + s.phase * 2);
      s.mat.color.setScalar(k > 1.55 ? 0.25 : 1.25);
    }
  });

  // --- city floor --------------------------------------------------------
  const floor = makeStreetFloor();
  floor.mesh.position.y = FLOOR;
  scene.add(floor.mesh);
  materials.push(floor.mat);

  // --- deck furniture ----------------------------------------------------
  buildDeckProps(scene, plateaus, rand, animated);

  // --- living city -------------------------------------------------------
  scene.add(makeTraffic(animated, rand));
  scene.add(makeSearchlights(animated, rand));
  scene.add(makeBlimp(animated));
  scene.add(makeHoloCat(animated));
  scene.add(makeSidewalkBots(plateaus, animated, rand));
  const rain = makeRain();
  scene.add(rain.mesh);

  // Landmark markers: a floating neon pin over each discoverable place.
  const landmarks = LANDMARKS.map((l) => {
    const pin = glowSprite('#ff2a6d', 1.6);
    pin.position.set(l.x, heightAt(l.x) + 7, l.z);
    scene.add(pin);
    return { ...l, pin, found: false };
  });
  animated.push((t) => {
    for (const l of landmarks) {
      if (l.found) continue;
      l.pin.position.y = heightAt(l.x) + 7 + Math.sin(t * 2 + l.x) * 0.4;
      l.pin.material.opacity = 0.55 + Math.sin(t * 4 + l.x) * 0.35;
    }
  });

  return {
    landmarks,
    update(t, dt, camera) {
      for (const m of materials) m.uniforms.uTime.value = t;
      sky.update(t, camera);
      rain.update(t, camera);
      for (const fn of animated) fn(t, dt, camera);
    },
  };
}

// A reflection map for the wet, metallic surfaces: a dark room with a few
// neon panels, pre-filtered once with PMREM.
function makeNeonEnvironment(renderer) {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color('#07030f');
  const panel = (color, x, y, z, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  panel('#ff2a6d', -8, 3, -6, 4, 8);
  panel('#05d9e8', 8, 4, -4, 3, 10);
  panel('#b967ff', 0, 8, 8, 10, 2);
  panel('#ffb000', 6, 1, 8, 2, 4);
  panel('#2a1060', 0, 12, 0, 20, 20);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  return tex;
}

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 }, uFog: { value: FOG } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uFog;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; } return v; }
      void main() {
        float h = vDir.y;
        vec3 top = vec3(0.008, 0.006, 0.03);
        vec3 col = mix(uFog, top, smoothstep(0.0, 0.55, h));
        // smog lit from below by the city
        vec2 p = vDir.xz / max(h + 0.25, 0.08);
        float c = fbm(p * 1.4 + vec2(uTime * 0.015, uTime * 0.006));
        float band = smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.25, 0.7, h));
        col += band * smoothstep(0.45, 0.85, c) * mix(vec3(0.5, 0.05, 0.3), vec3(0.1, 0.25, 0.45), fbm(p * 0.5)) * 0.35;
        col = mix(col, uFog, smoothstep(0.02, -0.15, h));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;

  // A huge pale moon behind the smog.
  const moon = glowSprite('rgba(255,190,230,0.6)', 170);
  moon.material.fog = false;
  moon.material.blending = THREE.NormalBlending;
  moon.position.set(-260, 420, -700);
  moon.renderOrder = -1;
  mesh.add(moon);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(38, 48), new THREE.MeshBasicMaterial({ color: '#ffd6ec', fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
  disc.position.copy(moon.position).multiplyScalar(0.99);
  disc.lookAt(0, 0, 0);
  disc.renderOrder = -1;
  mesh.add(disc);

  return {
    mesh,
    update(t, camera) {
      mat.uniforms.uTime.value = t;
      if (camera) mesh.position.copy(camera.position);
    },
  };
}

function makeStreetFloor() {
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */ `
      varying vec2 vP;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vP = world.xz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vP;
      #include <fog_pars_fragment>
      void main() {
        // streets run along the odd half-cells between tower blocks
        vec2 g = abs(fract((vP - 8.0) / 16.0) - 0.5) * 16.0;
        float roadX = smoothstep(2.2, 1.6, g.y);
        float roadZ = smoothstep(2.2, 1.6, g.x);
        float dashX = step(0.5, fract(vP.x * 0.25 - uTime * 2.0)) * smoothstep(0.35, 0.1, g.y);
        float dashZ = step(0.5, fract(vP.y * 0.25 + uTime * 1.6)) * smoothstep(0.35, 0.1, g.x);
        vec3 col = vec3(0.01, 0.008, 0.02);
        col += max(roadX, roadZ) * vec3(0.03, 0.02, 0.05);
        col += dashX * vec3(1.0, 0.55, 0.15) * 0.8 + dashZ * vec3(0.1, 0.7, 1.0) * 0.6;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), mat);
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, mat };
}

// Sidewalks, neon lamp posts, vending machines, food stalls and steam vents.
function buildDeckProps(scene, plateaus, rand, animated) {
  const group = new THREE.Group();
  const posts = [];
  const vend = [];
  const vents = [];
  for (const p of plateaus) {
    const color = LAYERS[p.layer].color;
    const w = p.x1 - p.x0;
    // sidewalk slabs beyond the neon curb
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.3, SIDEWALK - 10),
        new THREE.MeshStandardMaterial({ color: '#15121f', roughness: 0.25, metalness: 0.6 }),
      );
      walk.position.set((p.x0 + p.x1) / 2, p.h - 0.05, s * (10 + (SIDEWALK - 10) / 2));
      walk.receiveShadow = true;
      group.add(walk);
      // front fascia of the deck with a light strip
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), toneMapped: false }));
      strip.position.set((p.x0 + p.x1) / 2, p.h - 0.6, s * SIDEWALK);
      group.add(strip);
    }
    for (let x = p.x0 + 3; x < p.x1 - 1; x += 8) {
      posts.push({ x, z: -11.6, h: p.h, c: rand() < 0.5 ? '#ff2a6d' : '#05d9e8' });
      posts.push({ x: x + 4, z: 11.6, h: p.h, c: rand() < 0.5 ? '#b967ff' : '#05d9e8' });
    }
    // vending machines and vents on the far sidewalk
    for (let x = p.x0 + 6; x < p.x1 - 3; x += 9 + rand() * 6) {
      if (rand() < 0.55) vend.push({ x, h: p.h, c: NEON[Math.floor(rand() * NEON.length)] });
      else vents.push({ x, h: p.h });
    }
  }

  // Lamp posts: a pole, an arm and a glowing tube.
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.5, 6);
  const poleMesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: '#22202e', metalness: 0.8, roughness: 0.3 }), posts.length);
  const tubeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1.6, 0.22), new THREE.MeshBasicMaterial({ toneMapped: false }), posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach((p, i) => {
    m4.makeTranslation(p.x, p.h + 2.75, p.z);
    poleMesh.setMatrixAt(i, m4);
    m4.makeTranslation(p.x, p.h + 5.2, p.z + (p.z < 0 ? 0.35 : -0.35));
    tubeMesh.setMatrixAt(i, m4);
    tubeMesh.setColorAt(i, new THREE.Color(p.c).multiplyScalar(2));
  });
  group.add(poleMesh, tubeMesh);

  // Vending machines with a glowing front panel.
  const bodyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 2.6, 1.1), new THREE.MeshStandardMaterial({ color: '#1b1a28', metalness: 0.7, roughness: 0.35 }), vend.length);
  const faceMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.3, 1.9), new THREE.MeshBasicMaterial({ toneMapped: false }), vend.length);
  vend.forEach((v, i) => {
    m4.makeTranslation(v.x, v.h + 1.3, -11.9);
    bodyMesh.setMatrixAt(i, m4);
    m4.makeTranslation(v.x, v.h + 1.45, -11.34);
    faceMesh.setMatrixAt(i, m4);
    faceMesh.setColorAt(i, new THREE.Color(v.c).multiplyScalar(1.3));
  });
  group.add(bodyMesh, faceMesh);

  // Steam vents: a grate and rising puffs.
  const puffTex = canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(210,200,255,0.55)');
    g.addColorStop(1, 'rgba(210,200,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  const puffs = [];
  for (const v of vents) {
    const grate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 1.4), new THREE.MeshStandardMaterial({ color: '#2a2438', metalness: 0.9, roughness: 0.4, emissive: '#ff6a2a', emissiveIntensity: 0.25 }));
    grate.position.set(v.x, v.h + 0.12, -11.5);
    group.add(grate);
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
      s.userData = { base: new THREE.Vector3(v.x, v.h + 0.3, -11.5), t: i / 7 };
      group.add(s);
      puffs.push(s);
    }
  }
  animated.push((t, dt = 1 / 60) => {
    for (const s of puffs) {
      s.userData.t = (s.userData.t + dt * 0.28) % 1;
      const k = s.userData.t;
      s.position.copy(s.userData.base);
      s.position.y += k * 6;
      s.position.x += Math.sin(k * 5 + s.userData.base.x) * 0.6;
      s.scale.setScalar(1 + k * 3.5);
      s.material.opacity = Math.sin(k * Math.PI) * 0.7;
    }
  });

  // A ramen stall with paper lanterns on the application deck.
  const stall = new THREE.Group();
  stall.position.set(-104, 15, -11.6);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 1.6), new THREE.MeshStandardMaterial({ color: '#3a1f1a', roughness: 0.6 }));
  counter.position.y = 0.6;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7, 0.2, 2.4), new THREE.MeshStandardMaterial({ color: '#8a1030', emissive: '#ff2a6d', emissiveIntensity: 0.4 }));
  roof.position.y = 3.4;
  stall.add(counter, roof);
  for (const x of [-3.2, 3.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.4, 0.15), new THREE.MeshStandardMaterial({ color: '#222' }));
    leg.position.set(x, 1.7, 0.9);
    stall.add(leg);
  }
  for (let i = 0; i < 5; i++) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a3d').multiplyScalar(2), toneMapped: false }));
    lantern.scale.y = 1.3;
    lantern.position.set(-2.4 + i * 1.2, 2.9, 1.1);
    stall.add(lantern);
  }
  group.add(stall);
  scene.add(group);
}

// Hovercars cruising down the streets, lanes at different heights.
function makeTraffic(animated, rand) {
  const lanes = [
    { axis: 'x', c: -40, y: 18, dir: 1 }, { axis: 'x', c: -40, y: 24, dir: -1 },
    { axis: 'x', c: -56, y: 34, dir: 1 }, { axis: 'x', c: -88, y: 52, dir: -1 },
    { axis: 'x', c: -120, y: 70, dir: 1 }, { axis: 'x', c: 40, y: 12, dir: -1 },
    { axis: 'x', c: 72, y: 30, dir: 1 }, { axis: 'x', c: 104, y: 48, dir: -1 },
    { axis: 'z', c: 8, y: -5, dir: 1 }, { axis: 'z', c: 8, y: -10, dir: -1 },
    { axis: 'z', c: -184, y: 30, dir: 1 }, { axis: 'z', c: 216, y: 40, dir: -1 },
    { axis: 'z', c: -152, y: 14, dir: -1 }, { axis: 'z', c: 184, y: 20, dir: 1 },
  ];
  const cars = [];
  for (const lane of lanes) {
    const n = 7 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) cars.push({ lane, s: rand() * 700 - 330, v: 16 + rand() * 22, off: (rand() - 0.5) * 1.2 });
  }
  const group = new THREE.Group();
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.55, 1.1), new THREE.MeshStandardMaterial({ color: '#23213a', metalness: 0.9, roughness: 0.25 }), cars.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.16, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8f4ff').multiplyScalar(3), toneMapped: false }), cars.length);
  const tail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.16, 1.0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff1040').multiplyScalar(3), toneMapped: false }), cars.length);
  const under = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.05, 0.7), new THREE.MeshBasicMaterial({ toneMapped: false }), cars.length);
  cars.forEach((c, i) => under.setColorAt(i, new THREE.Color(NEON[i % NEON.length]).multiplyScalar(2)));
  for (const m of [body, head, tail, under]) m.frustumCulled = false;
  group.add(body, head, tail, under);
  const dummy = new THREE.Object3D();
  const place = (mesh, i, c, pos, forward) => {
    dummy.position.copy(pos);
    dummy.rotation.set(0, c.lane.axis === 'x' ? (c.lane.dir > 0 ? 0 : Math.PI) : (c.lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
    dummy.translateX(forward);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  const pos = new THREE.Vector3();
  animated.push((t, dt = 1 / 60) => {
    cars.forEach((c, i) => {
      c.s += c.v * dt * c.lane.dir;
      if (c.s > 370) c.s -= 700;
      if (c.s < -330) c.s += 700;
      const bob = Math.sin(t * 2 + i) * 0.15;
      if (c.lane.axis === 'x') pos.set(c.s, c.lane.y + bob, c.lane.c + c.off);
      else pos.set(c.lane.c + c.off, c.lane.y + bob, c.s * 0.8);
      place(body, i, c, pos, 0);
      place(head, i, c, pos, 1.22);
      place(tail, i, c, pos, -1.22);
      pos.y -= 0.32;
      place(under, i, c, pos, 0);
    });
    for (const m of [body, head, tail, under]) m.instanceMatrix.needsUpdate = true;
  });
  return group;
}

// Volumetric-looking searchlight beams sweeping the smog.
function makeSearchlights(animated, rand) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color('#9fb8ff') } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying vec2 vUv; void main() { gl_FragColor = vec4(uColor, 0.07 * (1.0 - vUv.y) * (0.6 + 0.4 * sin(vUv.x * 6.2831))); }',
  });
  const geo = new THREE.CylinderGeometry(9, 0.6, 260, 24, 1, true);
  geo.translate(0, 130, 0);
  const spots = [[-200, -150], [-60, -200], [90, -190], [230, -140], [-150, 180], [260, 160]];
  for (const [x, z] of spots) {
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(x, FLOOR + 60, z);
    const phase = rand() * 6;
    group.add(beam);
    animated.push((t) => {
      beam.rotation.z = Math.sin(t * 0.21 + phase) * 0.5;
      beam.rotation.x = Math.cos(t * 0.17 + phase) * 0.35;
    });
  }
  return group;
}

// An airship circling the skyline with a scrolling RFC ticker.
function makeBlimp(animated) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshStandardMaterial({ color: '#1c1a2c', metalness: 0.6, roughness: 0.4 }));
  hull.scale.set(26, 6.5, 6.5);
  g.add(hull);
  const text = '  RFC 791 · INTERNET PROTOCOL  ✦  RFC 793 · TCP  ✦  RFC 826 · ARP  ✦  RFC 1034 · DNS  ✦  RFC 9110 · HTTP  ✦  RFC 8446 · TLS 1.3  ✦';
  const tex = canvasTexture(2048, 128, (ctx, w, h) => {
    ctx.fillStyle = '#050208';
    ctx.fillRect(0, 0, w, h);
    ctx.font = '700 64px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#39ff88';
    ctx.shadowColor = '#39ff88';
    ctx.shadowBlur = 16;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, h / 2);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = 0.5;
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
  screenMat.color.setScalar(1.3);
  for (const s of [-1, 1]) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(30, 3.4), screenMat);
    screen.position.z = s * 6.05;
    screen.scale.x = s;
    g.add(screen);
  }
  const nav = [glowSprite('#ff2030', 4), glowSprite('#39ff88', 4)];
  nav[0].position.set(-24, 0, 0);
  nav[1].position.set(24, 0, 0);
  g.add(...nav);
  animated.push((t, dt = 1 / 60) => {
    const a = t * 0.035;
    g.position.set(20 + Math.cos(a) * 190, 95, Math.sin(a) * 190);
    g.rotation.y = -a - Math.PI / 2 + Math.PI;
    tex.offset.x = (tex.offset.x + dt * 0.04) % 1;
    nav.forEach((n, i) => { n.visible = ((t + i * 0.5) % 1.2) < 0.4; });
  });
  return g;
}

// A giant flickering hologram of the cat picture you are fetching, floating
// over the server district.
function makeHoloCat(animated) {
  const tex = canvasTexture(512, 512, (ctx) => {
    ctx.strokeStyle = '#7ff9ff';
    ctx.fillStyle = 'rgba(80,240,255,0.18)';
    ctx.lineWidth = 12;
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#05d9e8';
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.moveTo(110, 200); ctx.lineTo(130, 70); ctx.lineTo(210, 150);
    ctx.lineTo(302, 150); ctx.lineTo(382, 70); ctx.lineTo(402, 200);
    ctx.quadraticCurveTo(440, 420, 256, 440);
    ctx.quadraticCurveTo(72, 420, 110, 200);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7ff9ff';
    for (const x of [190, 322]) {
      ctx.beginPath();
      ctx.ellipse(x, 270, 22, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(240, 330); ctx.lineTo(272, 330); ctx.lineTo(256, 350); ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 5;
    for (const s of [-1, 1]) {
      for (const dy of [-12, 8]) {
        ctx.beginPath();
        ctx.moveTo(256 + s * 60, 340 + dy * 0.3);
        ctx.lineTo(256 + s * 190, 330 + dy);
        ctx.stroke();
      }
    }
  });
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uMap: { value: tex }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uTime; varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        float glitch = step(0.97, fract(sin(floor(uTime * 8.0) * 12.9898) * 43758.5453));
        uv.x += glitch * 0.03 * sin(uv.y * 80.0);
        vec4 c = texture2D(uMap, uv);
        float scan = 0.65 + 0.35 * sin(uv.y * 260.0 - uTime * 6.0);
        float flick = 0.85 + 0.15 * sin(uTime * 31.0);
        gl_FragColor = vec4(c.rgb * scan * flick * 1.4, c.a * scan);
      }`,
  });
  const g = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), mat);
  g.add(plane);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(15, 2, 44, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: '#05d9e8', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = -34;
  g.add(beam);
  g.position.set(130, 72, -21);
  animated.push((t, dt, camera) => {
    mat.uniforms.uTime.value = t;
    g.position.y = 72 + Math.sin(t * 0.6) * 1.5;
    if (camera) plane.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
  });
  return g;
}

// Little citizen packets wandering the sidewalks.
function makeSidewalkBots(plateaus, animated, rand) {
  const bots = [];
  for (const p of plateaus) {
    for (let i = 0; i < 4; i++) {
      bots.push({ p, x: p.x0 + 2 + rand() * (p.x1 - p.x0 - 4), z: (rand() < 0.5 ? -1 : 1) * (10.6 + rand() * 1.8), v: (rand() < 0.5 ? -1 : 1) * (1.5 + rand() * 2), phase: rand() * 6 });
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshStandardMaterial({ emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.3 }), bots.length);
  const colors = Object.values(LAYERS).map((l) => l.color);
  bots.forEach((b, i) => mesh.setColorAt(i, new THREE.Color(colors[i % colors.length])));
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  animated.push((t, dt = 1 / 60) => {
    bots.forEach((b, i) => {
      b.x += b.v * dt;
      if (b.x < b.p.x0 + 1 || b.x > b.p.x1 - 1) b.v *= -1;
      dummy.position.set(b.x, b.p.h + 0.7 + Math.abs(Math.sin(t * 5 + b.phase)) * 0.3, b.z);
      dummy.rotation.set(0, t + b.phase, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}

// Rain: line streaks in a box that wraps around the camera, all in the shader.
function makeRain() {
  const N = 7000;
  const BOX = new THREE.Vector3(110, 70, 110);
  const pos = new Float32Array(N * 2 * 3);
  const end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = Math.random() * BOX.x;
    const y = Math.random() * BOX.y;
    const z = Math.random() * BOX.z;
    pos.set([x, y, z, x, y, z], i * 6);
    end[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec3 uCam; uniform vec3 uBox;
      attribute float aEnd;
      varying float vA;
      void main() {
        vec3 p = position;
        p.y -= uTime * 38.0;
        vec3 origin = uCam - uBox * 0.5;
        vec3 w = origin + mod(p - origin, uBox);
        w.y += aEnd * 1.3;
        w.x += aEnd * 0.18;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vA = (1.0 - aEnd * 0.8) * smoothstep(55.0, 5.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(0.65, 0.75, 1.0, 0.32 * vA); }',
  });
  const mesh = new THREE.LineSegments(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    update(t, camera) {
      mat.uniforms.uTime.value = t;
      if (camera) mat.uniforms.uCam.value.copy(camera.position);
    },
  };
}
