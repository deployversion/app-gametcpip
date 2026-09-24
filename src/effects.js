import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Bloom post-processing. Lamps, signals and lit windows get a soft halo.
export function createComposer(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.5, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    composer,
    bloom,
    setSize(w, h) {
      composer.setSize(w, h);
    },
  };
}

// Golden-hour sky: a low sun, warm haze at the horizon, deep blue overhead
// with the first stars, and a slow drift of thin cloud streaks.
export const SUN_DIR = new THREE.Vector3(-0.75, 0.17, 0.62).normalize();

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSun;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float h = vDir.y;
        vec3 zenith = vec3(0.10, 0.16, 0.38);
        vec3 mid = vec3(0.55, 0.42, 0.62);
        vec3 horizon = vec3(1.0, 0.62, 0.38);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, zenith, smoothstep(0.2, 0.75, h));
        float sd = max(dot(vDir, uSun), 0.0);
        col += vec3(1.0, 0.55, 0.25) * pow(sd, 8.0) * 0.55;
        col += vec3(1.0, 0.85, 0.6) * pow(sd, 300.0) * 3.0;
        // cloud streaks
        vec2 uv = vDir.xz / max(h + 0.12, 0.05) * 1.6;
        float c = noise(uv * vec2(1.0, 3.0) + vec2(uTime * 0.01, 0.0)) * 0.6 + noise(uv * 3.1) * 0.4;
        c = smoothstep(0.55, 0.85, c) * smoothstep(0.02, 0.2, h) * (1.0 - smoothstep(0.5, 0.9, h));
        vec3 cloudCol = mix(vec3(1.0, 0.72, 0.55), vec3(0.95, 0.5, 0.45), smoothstep(0.1, 0.4, h)) + vec3(0.6, 0.3, 0.1) * pow(sd, 4.0);
        col = mix(col, cloudCol, c * 0.75);
        // first stars overhead
        vec2 sp = floor(vDir.xz / (h + 0.3) * 180.0);
        float star = step(0.9975, hash(sp)) * smoothstep(0.45, 0.9, h);
        col += star * (0.6 + 0.4 * sin(uTime * 2.0 + hash(sp + 3.0) * 20.0));
        col = mix(col, vec3(0.32, 0.22, 0.3), smoothstep(0.0, -0.25, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  sky.renderOrder = -1;
  return { mesh: sky, update: (t) => { mat.uniforms.uTime.value = t; } };
}

// The valley floor under the network: rolling meadows with a winding river.
export const VALLEY_Y = -10;

export function riverZ(x) {
  return Math.sin(x * 0.018) * 22 + Math.sin(x * 0.047 + 1.3) * 7 + 30;
}

export function valleyHeight(x, z) {
  const hills = Math.sin(x * 0.03) * Math.cos(z * 0.025) * 3 + Math.sin(x * 0.011 + z * 0.017) * 4;
  const r = Math.hypot(x - 21, z);
  const rim = Math.max(0, r - 150) * 0.12; // the valley walls rise far out
  const bank = Math.min(1, Math.abs(z - riverZ(x)) / 12);
  return VALLEY_Y + (hills + 4) * bank + rim - (1 - bank) * 1.5;
}

export function makeValley() {
  const size = 560;
  const geo = new THREE.PlaneGeometry(size, size, 220, 220);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color('#5d7a3a');
  const dry = new THREE.Color('#a08a4c');
  const mud = new THREE.Color('#6b5236');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + 21;
    const z = pos.getZ(i);
    const y = valleyHeight(x, z);
    pos.setX(i, x);
    pos.setY(i, y);
    const n = Math.sin(x * 0.21) * Math.sin(z * 0.17) * 0.5 + 0.5;
    c.copy(grass).lerp(dry, n * 0.6 + Math.max(0, y - VALLEY_Y - 4) * 0.05);
    if (Math.abs(z - riverZ(x)) < 9) c.lerp(mud, 0.6);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true;

  // the river: a ribbon following riverZ, with a shimmering shader
  const n = 260;
  const verts = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const x = 21 - size / 2 + (i / n) * size;
    const zc = riverZ(x);
    for (const s of [-1, 1]) {
      verts.push(x, VALLEY_Y - 0.6, zc + s * 6.5);
      uvs.push(i / n * 40, s * 0.5 + 0.5);
    }
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  rgeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  rgeo.setIndex(idx);
  const rmat = new THREE.MeshStandardMaterial({ color: '#4f7890', roughness: 0.12, metalness: 0.55, transparent: true, opacity: 0.92 });
  const river = new THREE.Mesh(rgeo, rmat);
  const group = new THREE.Group();
  group.add(ground, river);
  // a slow shimmer on the water
  return { mesh: group, update: (t) => { rmat.color.setHSL(0.56, 0.3, 0.4 + Math.sin(t * 0.8) * 0.03); } };
}
