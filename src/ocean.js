import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Underwater building blocks: the sky seen from below the surface, light
// shafts, caustics, marine snow and all the sea life. Everything animated
// reads the shared OCEAN_TIME uniform or registers an update function.

export const OCEAN_TIME = { value: 0 };

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Seeded random so props land in the same place on every visit.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ caustics
// Patches a MeshStandardMaterial so upward-facing surfaces get the dancing
// light net you see on a sunny sea floor. It fades out with depth.
const CAUSTIC_FN = `
  float causticNet(vec2 p, float t) {
    vec2 i = p;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < 3; n++) {
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c /= 3.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 8.0), 0.0, 1.5);
  }
`;
const CAUSTIC_GLSL = `
  uniform float uTime;
  uniform float uCaustic;
  varying vec3 vCWorld;
  varying vec3 vCNormal;
  ${CAUSTIC_FN}
`;

export function withCaustics(mat, strength = 1) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = OCEAN_TIME;
    shader.uniforms.uCaustic = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCWorld;\nvarying vec3 vCNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 cwp = vec4(transformed, 1.0);
        vec3 cn = objectNormal;
        #ifdef USE_INSTANCING
          cwp = instanceMatrix * cwp;
          cn = mat3(instanceMatrix) * cn;
        #endif
        vCWorld = (modelMatrix * cwp).xyz;
        vCNormal = normalize(mat3(modelMatrix) * cn);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CAUSTIC_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float cDepth = smoothstep(-14.0, 16.0, vCWorld.y);
        float cUp = smoothstep(0.1, 0.9, vCNormal.y) * 0.8 + 0.2;
        float cNet = causticNet(vCWorld.xz * 0.2 - 250.0, uTime * 0.45);
        cNet += 0.6 * causticNet(vCWorld.xz * 0.33 - 260.0, uTime * 0.35 + 3.0);
        totalEmissiveRadiance += vec3(0.45, 0.8, 1.0) * cNet * 0.75 * uCaustic * cDepth * cUp;`);
  };
  mat.customProgramCacheKey = () => 'caustics';
  return mat;
}

// ---------------------------------------------------------------- the water
// Background dome: dark below, blue-green all around and a bright rippling
// "Snell's window" overhead, where the sky shows through the surface.
export function makeOceanSky(fogColor) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: OCEAN_TIME, uFog: { value: fogColor }, uDeep: { value: new THREE.Color('#010812') } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uFog;
      uniform vec3 uDeep;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 up = uFog * 2.6 + vec3(0.02, 0.09, 0.1);
        vec3 col = mix(uDeep, uFog, smoothstep(-0.55, 0.02, h));
        col = mix(col, up, smoothstep(0.08, 0.8, h));
        float a = atan(vDir.z, vDir.x);
        float win = smoothstep(0.8, 0.93, h);
        float rip = 0.5 + 0.5 * sin(a * 11.0 + uTime * 0.5 + sin(h * 40.0 - uTime * 1.2) * 2.0);
        col += win * (0.5 + 0.35 * rip) * vec3(0.55, 0.9, 1.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(420, 48, 24), mat);
  mesh.renderOrder = -1;
  return mesh;
}

// The underside of the waves, far overhead.
export function makeWaterSurface(y = 62) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: OCEAN_TIME },
    vertexShader: `
      uniform float uTime;
      varying vec2 vPos;
      void main() {
        vec3 p = position;
        p.z += sin(p.x * 0.05 + uTime * 0.7) * 1.2 + sin(p.y * 0.07 - uTime * 0.5) * 0.9;
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vPos;
      ${CAUSTIC_FN}
      void main() {
        float n = causticNet(vPos * 0.035 - 250.0, uTime * 0.25);
        vec3 col = mix(vec3(0.06, 0.35, 0.45), vec3(0.75, 0.97, 1.0), clamp(n * 0.8, 0.0, 1.0));
        float fade = 1.0 - smoothstep(90.0, 320.0, length(vPos));
        gl_FragColor = vec4(col, (0.28 + n * 0.5) * fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 90, 90), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(10, y, 0);
  return mesh;
}

// Slanted shafts of sunlight. Each is a soft additive quad that turns to
// face the camera around its own axis.
export function makeGodRays({ count = 34, x0 = -150, x1 = 170, top = 62 } = {}) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: OCEAN_TIME },
    vertexShader: `
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv;
        vSeed = aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        float across = pow(sin(3.14159 * vUv.x), 2.5);
        float along = smoothstep(0.0, 0.55, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
        float flicker = 0.55 + 0.45 * sin(uTime * (0.35 + vSeed * 0.4) + vSeed * 40.0);
        float a = across * along * flicker * 0.11;
        gl_FragColor = vec4(vec3(0.55, 0.9, 1.0) * a, a);
      }`,
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, -0.5, 0);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const rays = Array.from({ length: count }, (_, i) => ({
    x: x0 + ((i + Math.random()) / count) * (x1 - x0),
    z: rand(-45, 25),
    w: rand(3, 9),
    len: rand(55, 85),
    lean: rand(0.12, 0.22),
  }));
  group.add(mesh);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  return {
    group,
    update(t, camera) {
      rays.forEach((r, i) => {
        const yaw = Math.atan2(camera.position.x - r.x, camera.position.z - r.z);
        e.set(0, yaw, 0, 'YXZ');
        q.setFromEuler(e);
        // lean the shaft with the sun, in world space
        const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -r.lean + Math.sin(t * 0.1 + i) * 0.02);
        q.premultiply(lean);
        pos.set(r.x, top, r.z);
        s.set(r.w, r.len, 1);
        m.compose(pos, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// Drifting specks of "marine snow" throughout the water.
export function makeMarineSnow({ count = 4500, box = [-160, 180, -14, 58, -70, 70] } = {}) {
  const [x0, x1, y0, y1, z0, z1] = box;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(x0, x1);
    pos[i * 3 + 1] = rand(y0, y1);
    pos[i * 3 + 2] = rand(z0, z1);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: OCEAN_TIME, uY0: { value: y0 }, uH: { value: y1 - y0 } },
    vertexShader: `
      uniform float uTime;
      uniform float uY0;
      uniform float uH;
      attribute float aSeed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = uY0 + mod(p.y - uY0 - uTime * (0.25 + aSeed * 0.5), uH);
        p.x += sin(uTime * 0.3 + aSeed * 30.0) * 0.8;
        p.z += cos(uTime * 0.25 + aSeed * 20.0) * 0.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        gl_PointSize = min((1.2 + aSeed * 2.2) * (220.0 / max(d, 1.0)), 7.0);
        vAlpha = exp(-d * 0.018) * (0.35 + aSeed * 0.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, r) * vAlpha;
        gl_FragColor = vec4(vec3(0.8, 0.95, 1.0), a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

// Columns of bubbles rising from vents: each source is { x, y, z, spread }.
export function makeBubbles(sources, { perSource = 14, top = 60, size = 0.14 } = {}) {
  const count = sources.length * perSource;
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#dff8ff', emissive: '#6fd6ff', emissiveIntensity: 0.35, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2, depthWrite: false }),
    count,
  );
  mesh.frustumCulled = false;
  const bubbles = [];
  sources.forEach((src, si) => {
    for (let k = 0; k < perSource; k++) {
      bubbles.push({ src, y: src.y + Math.random() * (top - src.y), phase: Math.random() * 6.28, speed: rand(2, 4.5), r: size * rand(0.5, 1.6), si });
    }
  });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  return {
    mesh,
    update(t, dt = 1 / 60) {
      bubbles.forEach((b, i) => {
        b.y += b.speed * dt;
        const ceiling = b.src.top ?? top;
        if (b.y > ceiling) b.y = b.src.y;
        const rise = b.y - b.src.y;
        const spread = b.src.spread ?? 0.3;
        p.set(
          b.src.x + Math.sin(t * 2.4 + b.phase) * (0.12 + rise * 0.015) + Math.cos(b.phase) * spread,
          b.y,
          b.src.z + Math.cos(t * 2 + b.phase) * (0.12 + rise * 0.015) + Math.sin(b.phase) * spread,
        );
        const grow = b.r * (1 + Math.min(rise, 30) * 0.02);
        s.set(grow, grow * 0.85, grow);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ----------------------------------------------------------------- sea life
function wiggleMaterial(params, amount = 0.14, freq = 8) {
  const mat = new THREE.MeshStandardMaterial(params);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = OCEAN_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float wPhase = float(gl_InstanceID) * 1.7;
        transformed.x += sin(uTime * ${freq.toFixed(1)} + wPhase + transformed.z * 4.0) * ${amount.toFixed(3)} * smoothstep(0.35, -1.0, transformed.z);`);
  };
  mat.customProgramCacheKey = () => `wiggle-${amount}-${freq}`;
  return mat;
}

// A small fish, nose along +z, about one unit long.
function fishGeometry() {
  const body = new THREE.SphereGeometry(0.5, 14, 8);
  body.scale(0.32, 0.55, 1);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.38, 0, 0.36, -0.82, 0, 0, -0.62,
    0, 0, -0.38, 0, 0, -0.62, 0, -0.36, -0.82,
  ], 3));
  const fin = new THREE.BufferGeometry();
  fin.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.2, 0.15, 0, 0.44, -0.12, 0, 0.22, -0.3], 3));
  const parts = [body.toNonIndexed(), tail, fin];
  for (const g of parts) {
    g.deleteAttribute('uv');
    g.computeVertexNormals();
  }
  return mergeGeometries(parts);
}

// A school of fish milling around a centre point.
export function makeFishSchool({ center, radius = 7, height = 2.5, count = 30, colors = ['#ffd166'], size = 0.6, speed = 0.35, flatten = 0.6, emissive = 0.15 }) {
  const mat = wiggleMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide, emissive: '#0a3a4a', emissiveIntensity: emissive });
  const mesh = new THREE.InstancedMesh(fishGeometry(), mat, count);
  mesh.frustumCulled = false;
  const cols = colors.map((c) => new THREE.Color(c));
  const fish = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, cols[i % cols.length]);
    return { a: Math.random() * Math.PI * 2, r: radius * rand(0.55, 1.1), y: rand(-height, height), w: speed * rand(0.85, 1.15), s: size * rand(0.8, 1.2), ph: Math.random() * 6.28 };
  });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const next = new THREE.Vector3();
  const fwd = new THREE.Vector3(0, 0, 1);
  const dir = new THREE.Vector3();
  const place = (f, t, out) => {
    const a = f.a + t * f.w;
    const r = f.r + Math.sin(t * 0.6 + f.ph) * radius * 0.18;
    out.set(center.x + Math.cos(a) * r, center.y + f.y + Math.sin(a * 2 + f.ph) * height * 0.4, center.z + Math.sin(a) * r * flatten);
  };
  return {
    mesh,
    update(t) {
      fish.forEach((f, i) => {
        place(f, t, p);
        place(f, t + 0.05, next);
        dir.subVectors(next, p).normalize();
        q.setFromUnitVectors(fwd, dir);
        sc.setScalar(f.s);
        m.compose(p, q, sc);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// A glowing jellyfish that pulses upward and slowly sinks.
export function makeJellyfish(color, scale = 1) {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  const bell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, roughness: 0.2 }),
  );
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 10), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8 }));
  inner.position.y = 0.25;
  g.add(bell, inner);
  const tentMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? 0.75 : 0.35;
    const len = rand(2.2, 4);
    const pts = [];
    for (let k = 0; k <= 6; k++) pts.push(new THREE.Vector3(Math.cos(a) * r + Math.sin(k) * 0.1, 0.05 - (k / 6) * len, Math.sin(a) * r + Math.cos(k * 1.3) * 0.1));
    const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, i % 2 ? 0.025 : 0.06, 5), tentMat);
    g.add(t);
    tentacles.push(t);
  }
  g.scale.setScalar(scale);
  const phase = Math.random() * 6.28;
  const rate = rand(1.4, 2.2);
  return {
    group: g,
    update(t) {
      const k = Math.sin(t * rate + phase);
      const squeeze = Math.max(0, k);
      bell.scale.set(1 + 0.1 * k, 1 - 0.18 * squeeze, 1 + 0.1 * k);
      tentacles.forEach((tt, i) => {
        tt.rotation.x = Math.sin(t * 1.2 + i + phase) * 0.12;
        tt.rotation.z = Math.cos(t * 1.1 + i * 2 + phase) * 0.12;
      });
    },
    pulse: (t) => Math.max(0, Math.sin(t * rate + phase)),
  };
}

// A humpback-ish whale built from a lathe profile, with a beating tail.
export function makeWhale() {
  const g = new THREE.Group();
  const profile = [
    [0.0, -7.0], [0.55, -6.6], [0.9, -5.6], [1.35, -3.8], [1.9, -1.5], [2.1, 0.5], [2.05, 2.2], [1.8, 3.8], [1.4, 5.0], [0.9, 6.0], [0.35, 6.9], [0.0, 7.1],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const bodyGeo = new THREE.LatheGeometry(profile, 28);
  bodyGeo.rotateX(Math.PI / 2); // lathe axis y -> z, nose at -z... flip below
  bodyGeo.rotateY(Math.PI); // nose towards +z
  bodyGeo.scale(1, 0.8, 1);
  // Two-tone: dark back, pale grooved belly.
  const pos = bodyGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const dark = new THREE.Color('#2a3d57');
  const pale = new THREE.Color('#c9d6df');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = THREE.MathUtils.smoothstep(-y, 0.1, 1.2);
    const groove = y < -0.6 && z > -1 && Math.sin(Math.atan2(pos.getX(i), -y) * 40) > 0.4 ? 0.8 : 1;
    tmp.copy(dark).lerp(pale, k).multiplyScalar(groove);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
  const body = new THREE.Mesh(bodyGeo, mat);
  g.add(body);

  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.quadraticCurveTo(2.5, -0.6, 5.2, -2.2);
  finShape.quadraticCurveTo(2.8, 0.6, 0, 0.9);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false });
  const finMat = new THREE.MeshStandardMaterial({ color: '#3b5070', roughness: 0.6 });
  const fins = [1, -1].map((side) => {
    const f = new THREE.Mesh(finGeo, finMat);
    f.rotation.set(Math.PI / 2, 0, side > 0 ? -0.3 : Math.PI + 0.3);
    f.scale.set(1, side, 1);
    f.position.set(side * 1.7, -0.9, 2.6);
    g.add(f);
    return f;
  });

  const tail = new THREE.Group();
  tail.position.z = -6.6;
  const flukeShape = new THREE.Shape();
  flukeShape.moveTo(0, 0);
  flukeShape.quadraticCurveTo(1.8, -0.6, 3.6, -2.2);
  flukeShape.quadraticCurveTo(2.2, -2.0, 0.3, -1.3);
  flukeShape.lineTo(0, -1.0);
  flukeShape.lineTo(-0.3, -1.3);
  flukeShape.quadraticCurveTo(-2.2, -2.0, -3.6, -2.2);
  flukeShape.quadraticCurveTo(-1.8, -0.6, 0, 0);
  const fluke = new THREE.Mesh(new THREE.ExtrudeGeometry(flukeShape, { depth: 0.15, bevelEnabled: false }), finMat);
  fluke.rotation.x = Math.PI / 2;
  tail.add(fluke);
  g.add(tail);
  body.castShadow = true;
  return {
    group: g,
    update(t) {
      tail.rotation.x = Math.sin(t * 1.1) * 0.35;
      body.rotation.x = Math.sin(t * 1.1 + 1.2) * 0.03;
      fins.forEach((f, i) => { f.rotation.y = Math.sin(t * 0.8 + i) * 0.15; });
    },
  };
}

// A manta ray: a flat diamond whose wing tips flap.
export function makeManta(color = '#1d2c3f') {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide });
  const belly = new THREE.MeshStandardMaterial({ color: '#dfe7ee', roughness: 0.7, side: THREE.DoubleSide });
  const wings = [1, -1].map((side) => {
    const s = new THREE.Shape();
    s.moveTo(0, 1.6);
    s.quadraticCurveTo(side * 2.2, 0.9, side * 4.2, -0.3);
    s.quadraticCurveTo(side * 1.8, -0.7, 0, -1.7);
    s.closePath();
    const geo = new THREE.ShapeGeometry(s, 8);
    geo.rotateX(-Math.PI / 2);
    const w = new THREE.Group();
    const top = new THREE.Mesh(geo, mat);
    const under = new THREE.Mesh(geo, belly);
    under.position.y = -0.04;
    w.add(top, under);
    g.add(w);
    return { w, side };
  });
  const tailGeo = new THREE.CylinderGeometry(0.02, 0.07, 3.2, 5);
  tailGeo.rotateX(Math.PI / 2);
  const tail = new THREE.Mesh(tailGeo, mat);
  tail.position.z = -3.1;
  g.add(tail);
  const phase = Math.random() * 6;
  return {
    group: g,
    update(t) {
      for (const { w, side } of wings) w.rotation.z = side * Math.sin(t * 1.6 + phase) * 0.35;
      tail.rotation.y = Math.sin(t * 1.2 + phase) * 0.2;
    },
  };
}

// A sea turtle paddling along.
export function makeTurtle() {
  const g = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#5a4a24';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c8a45a';
      ctx.lineWidth = 3;
      for (let y = 0; y < h; y += 28) {
        for (let x = (y / 28) % 2 ? 14 : 0; x < w + 28; x += 28) {
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    }),
    roughness: 0.6,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), shellMat);
  shell.scale.set(1, 0.38, 1.3);
  const skin = new THREE.MeshStandardMaterial({ color: '#7f9a64', roughness: 0.8 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), skin);
  head.scale.set(1, 0.8, 1.3);
  head.position.set(0, 0.05, 1.5);
  g.add(shell, head);
  const flippers = [[1, 0.6, 1.8], [-1, 0.6, 1.8], [1, -0.9, 0.9], [-1, -0.9, 0.9]].map(([side, z, len]) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.8, -0.05, z);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), skin);
    f.scale.set(len * 0.9, 0.12, 0.45);
    f.position.x = side * len * 0.4;
    pivot.add(f);
    g.add(pivot);
    return { pivot, side, front: z > 0 };
  });
  return {
    group: g,
    update(t) {
      for (const f of flippers) {
        const k = Math.sin(t * (f.front ? 1.4 : 1.4) + (f.front ? 0 : 1.5));
        f.pivot.rotation.z = f.side * k * (f.front ? 0.5 : 0.25);
        f.pivot.rotation.y = f.side * k * 0.25;
      }
      head.rotation.y = Math.sin(t * 0.5) * 0.2;
    },
  };
}

// Moves a creature along a closed curve, facing where it swims.
export function swimAlong(creature, curve, period, offset = 0) {
  const p = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  return (t) => {
    const k = ((t / period + offset) % 1 + 1) % 1;
    curve.getPointAt(k, p);
    curve.getPointAt((k + 0.004) % 1, ahead);
    creature.group.position.copy(p);
    creature.group.lookAt(ahead);
    creature.update(t);
  };
}

export function loopCurve(points) {
  return new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
}

// ------------------------------------------------------------------ flora
// Kelp: tall crossed blades that sway more towards the tip.
export function makeKelp(spots, { height = 14, color = '#6f8a2c' } = {}) {
  const tex = canvasTexture(64, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(w / 2 - 3, 0, 6, h);
    for (let y = 20; y < h - 10; y += 26) {
      const side = (y / 26) % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.ellipse(w / 2 + side * 14, y, 13, 22, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const mat = new THREE.MeshStandardMaterial({ color, alphaMap: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7, emissive: '#1b2a08', emissiveIntensity: 0.4 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = OCEAN_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 kBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float kTip = pow(max(position.y, 0.0), 1.6) * 0.012;
        transformed.x += sin(uTime * 0.7 + kBase.x * 0.21 + position.y * 0.18) * kTip * 6.0;
        transformed.z += cos(uTime * 0.55 + kBase.z * 0.17 + position.y * 0.15) * kTip * 4.0;`);
  };
  mat.customProgramCacheKey = () => 'kelp';
  const a = new THREE.PlaneGeometry(1.6, height, 1, 18);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const geo = mergeGeometries([a, b]);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  spots.forEach(([x, y, z, s = 1], i) => {
    e.set(0, Math.random() * Math.PI, 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, s, 1));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(color).offsetHSL(rand(-0.03, 0.03), 0, rand(-0.08, 0.08)));
  });
  return mesh;
}

// Branching coral: a few recursive variants, instanced with bright colours.
function branchGeometry(seed, depth = 4) {
  const rnd = seeded(seed);
  const parts = [];
  const grow = (base, dir, len, rad, d) => {
    const end = base.clone().addScaledVector(dir, len);
    const geo = new THREE.CylinderGeometry(rad * 0.7, rad, len, 6, 1);
    geo.translate(0, len / 2, 0);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    geo.translate(base.x, base.y, base.z);
    parts.push(geo.toNonIndexed());
    if (d === 0) {
      const tip = new THREE.SphereGeometry(rad * 0.9, 6, 4);
      tip.translate(end.x, end.y, end.z);
      parts.push(tip.toNonIndexed());
      return;
    }
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const nd = dir.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.3, rnd() * 0.3, (rnd() - 0.5) * 1.3)).normalize();
      grow(end, nd, len * (0.65 + rnd() * 0.15), rad * 0.72, d - 1);
    }
  };
  grow(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.9, 0.18, depth);
  for (const p of parts) p.deleteAttribute('uv');
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

function brainGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 4);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 9 + Math.sin(v.z * 7) * 2) * Math.cos(v.z * 8 + v.y * 5);
    v.multiplyScalar(1 + n * 0.05);
    v.y = Math.max(v.y, -0.2) * 0.72;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function tubeSpongeGeometry(seed) {
  const rnd = seeded(seed);
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const h = 0.8 + rnd() * 1.8;
    const r = 0.14 + rnd() * 0.12;
    const g = new THREE.CylinderGeometry(r * 1.15, r, h, 10, 1, true);
    g.translate((rnd() - 0.5) * 0.7, h / 2, (rnd() - 0.5) * 0.7);
    parts.push(g.toNonIndexed());
  }
  for (const p of parts) p.deleteAttribute('uv');
  return mergeGeometries(parts);
}

function anemoneGeometry() {
  const parts = [];
  const disc = new THREE.CylinderGeometry(0.45, 0.55, 0.35, 12);
  disc.translate(0, 0.17, 0);
  parts.push(disc.toNonIndexed());
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 * 3;
    const r = 0.12 + (i / 26) * 0.35;
    const len = 0.5 + Math.random() * 0.35;
    const g = new THREE.CylinderGeometry(0.02, 0.05, len, 4);
    g.translate(0, len / 2, 0);
    g.rotateX((r / 0.47) * 0.6);
    g.rotateY(a);
    g.translate(Math.cos(a) * r, 0.33, Math.sin(a) * r);
    parts.push(g.toNonIndexed());
  }
  for (const p of parts) p.deleteAttribute('uv');
  return mergeGeometries(parts);
}

export function rockGeometry(seed, detail = 1) {
  const rnd = seeded(seed);
  const g = new THREE.DodecahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const k = [rnd() * 3, rnd() * 3, rnd() * 3];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.3 + k[0]) * Math.sin(v.y * 2.9 + k[1]) * Math.sin(v.z * 2.1 + k[2]);
    v.multiplyScalar(1 + n * 0.28);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export const CORAL_COLORS = ['#ff6f91', '#ff9671', '#ffc75f', '#c34a92', '#f9f871', '#ff5e78', '#b36bff', '#ff8c42'];

// Instanced reef props. `items` are { kind, x, y, z, s, rot, color }.
export function makeReef(items) {
  const kinds = {
    branch0: () => branchGeometry(11),
    branch1: () => branchGeometry(29, 3),
    branch2: () => branchGeometry(47),
    brain: brainGeometry,
    sponge: () => tubeSpongeGeometry(5),
    anemone: anemoneGeometry,
    rock: () => rockGeometry(3),
    rock2: () => rockGeometry(8),
  };
  const group = new THREE.Group();
  const byKind = {};
  for (const it of items) (byKind[it.kind] ??= []).push(it);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const [kind, list] of Object.entries(byKind)) {
    const isRock = kind.startsWith('rock');
    const mat = withCaustics(new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: isRock ? 0.95 : 0.55,
      metalness: 0,
      emissive: kind === 'anemone' ? '#ff3d7f' : '#000000',
      emissiveIntensity: kind === 'anemone' ? 0.25 : 0,
      side: kind === 'sponge' ? THREE.DoubleSide : THREE.FrontSide,
    }), isRock ? 1 : 0.7);
    const mesh = new THREE.InstancedMesh(kinds[kind](), mat, list.length);
    list.forEach((it, i) => {
      e.set(it.tilt ?? 0, it.rot ?? Math.random() * 6.28, 0);
      q.setFromEuler(e);
      const s = it.s ?? 1;
      const sv = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
      m.compose(new THREE.Vector3(it.x, it.y, it.z), q, sv);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(it.color ?? (isRock ? '#6b6a70' : pick(CORAL_COLORS))));
    });
    mesh.castShadow = !isRock;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// A flat sea fan: a lattice on a fan shape, slowly rocking.
export function makeSeaFan(color) {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#fff';
    const rnd = seeded(7);
    const branch = (x, y, a, len, width) => {
      if (len < 6) return;
      const x2 = x + Math.cos(a) * len;
      const y2 = y - Math.sin(a) * len;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      branch(x2, y2, a + 0.35 + rnd() * 0.2, len * 0.72, width * 0.75);
      branch(x2, y2, a - 0.35 - rnd() * 0.2, len * 0.72, width * 0.75);
    };
    branch(w / 2, h, Math.PI / 2, 70, 7);
    ctx.lineWidth = 1.5;
    for (let r = 30; r < 220; r += 14) {
      ctx.beginPath();
      ctx.arc(w / 2, h, r, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
  });
  const mat = new THREE.MeshStandardMaterial({ color, alphaMap: tex, alphaTest: 0.35, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.25 });
  const geo = new THREE.PlaneGeometry(3.4, 3.4);
  geo.translate(0, 1.7, 0);
  return new THREE.Mesh(geo, mat);
}

export function makeStarfish(color) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.2 : 0.55;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
}

// Sandy ground with ripples and a faint tint of the layer's colour.
export function sandTexture(tint, repeatX, repeatY) {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c9b48a';
    ctx.fillRect(0, 0, w, h);
    const rnd = seeded(99);
    for (let i = 0; i < 2600; i++) {
      const v = rnd();
      ctx.fillStyle = v > 0.5 ? 'rgba(255,245,220,0.35)' : 'rgba(90,70,40,0.25)';
      ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
    }
    ctx.strokeStyle = 'rgba(120,95,60,0.22)';
    ctx.lineWidth = 3;
    for (let y = -20; y < h + 20; y += 16) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 4) * 5);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = tint;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(0, 0, w, h);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

export function rockTexture(repeatX = 1, repeatY = 1, base = '#4a4f5c') {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const rnd = seeded(5);
    for (let i = 0; i < 900; i++) {
      const r = 2 + rnd() * 10;
      ctx.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rnd() * 0.07})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = pick(['rgba(255,111,145,0.35)', 'rgba(255,199,95,0.3)', 'rgba(120,200,120,0.25)', 'rgba(180,107,255,0.3)']);
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 1 + rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}
