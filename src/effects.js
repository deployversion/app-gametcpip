import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Bloom post-processing. Glowing things (beacons, cables, LEDs) get a halo.
export function createComposer(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.75, 0.45, 0.72);
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

// A night sky dome: deep blue overhead, the warm glow of town lights on the
// horizon, a large moon and a faint band of the Milky Way.
export const MOON_DIR = new THREE.Vector3(0.35, 0.34, -0.87).normalize();

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 }, uMoon: { value: MOON_DIR } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uMoon;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 top = vec3(0.01, 0.02, 0.07);
        vec3 mid = vec3(0.03, 0.06, 0.16);
        vec3 horizon = vec3(0.16, 0.11, 0.16);
        vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
        col = mix(col, top, smoothstep(0.22, 0.85, h));
        // town glow low on the horizon
        col += vec3(0.18, 0.09, 0.03) * exp(-max(h, 0.0) * 18.0) * 0.6;
        // milky way: a soft diagonal band with speckles
        float band = exp(-pow(dot(d, normalize(vec3(0.5, 0.2, 0.84))) * 5.0, 2.0)) * smoothstep(0.05, 0.4, h);
        float speck = step(0.992, hash(floor(d.xz * 900.0 + d.y * 400.0)));
        col += band * (vec3(0.05, 0.06, 0.1) + speck * 0.35);
        // the moon, with a halo
        float m = dot(d, uMoon);
        float disc = smoothstep(0.9994, 0.9997, m);
        float spots = 0.85 + 0.15 * sin(d.x * 900.0) * sin(d.y * 700.0);
        col = mix(col, vec3(0.95, 0.93, 0.85) * spots, disc);
        col += vec3(0.25, 0.3, 0.45) * pow(max(m, 0.0), 120.0) * 0.8;
        col += vec3(0.08, 0.1, 0.18) * pow(max(m, 0.0), 12.0) * 0.5;
        col = mix(col, vec3(0.02, 0.03, 0.07), smoothstep(-0.02, -0.4, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  sky.renderOrder = -1;
  return { mesh: sky, update: (t) => { mat.uniforms.uTime.value = t; } };
}

// The sea: a see-through surface so the cables on the sea floor stay
// visible, with moving ripples, moonlit glints and a darker look at grazing
// angles.
export function makeWater(w, d) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uMoon: { value: MOON_DIR } }]),
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uMoon;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float w1 = sin(p.x * 0.35 + uTime * 1.1) * 0.5 + sin(p.y * 0.42 - uTime * 0.8) * 0.5;
        float w2 = sin((p.x + p.y) * 0.9 + uTime * 1.9) * 0.5 + sin((p.x - p.y) * 1.3 - uTime * 1.4) * 0.5;
        vec3 n = normalize(vec3(w1 * 0.12 + w2 * 0.06, 1.0, w2 * 0.12 - w1 * 0.05));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 deep = vec3(0.01, 0.06, 0.11);
        vec3 shallow = vec3(0.02, 0.17, 0.24);
        vec3 col = mix(deep, shallow, 0.5 + 0.25 * w1);
        vec3 sky = vec3(0.1, 0.14, 0.26);
        col = mix(col, sky, fres * 0.85);
        vec3 r = reflect(-V, n);
        float spec = pow(max(dot(r, uMoon), 0.0), 180.0);
        float glint = pow(max(0.0, w2), 10.0) * 0.25;
        col += vec3(0.85, 0.88, 1.0) * (spec * 1.6 + glint * 0.35);
        float alpha = mix(0.42, 0.93, fres);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return { mesh, update: (t) => { mat.uniforms.uTime.value = t; } };
}
