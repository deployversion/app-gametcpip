import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Bloom post-processing. Glowing things (lanterns, beacons, sky-roads) get a halo.
export function createComposer(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.5, 0.88);
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

// A golden-hour sky dome: deep blue overhead, peach and rose at the
// horizon, with a soft sun glow.
export const SUN_DIR = new THREE.Vector3(0.45, 0.5, 0.74).normalize();

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
      void main() {
        float h = vDir.y;
        vec3 zenith = vec3(0.16, 0.24, 0.48);
        vec3 mid = vec3(0.45, 0.50, 0.72);
        vec3 horizon = vec3(0.98, 0.72, 0.55);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, zenith, smoothstep(0.22, 0.75, h));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        col += vec3(1.0, 0.62, 0.32) * pow(s, 8.0) * 0.55;
        col += vec3(1.0, 0.9, 0.7) * pow(s, 400.0) * 1.2;
        col = mix(col, vec3(0.55, 0.52, 0.62), smoothstep(0.0, -0.3, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), mat);
  sky.renderOrder = -1;
  return { mesh: sky, update: (t) => { mat.uniforms.uTime.value = t; } };
}

// The Sea of Routes under the network: rolling waves with sun glints,
// fading into the horizon haze.
export function makeSea(horizon = '#e8b59a') {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHorizon: { value: new THREE.Color(horizon) }, uSun: { value: SUN_DIR } },
    vertexShader: `
      uniform float uTime;
      varying vec2 vPos;
      varying float vH;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        float h = sin(p.x * 0.09 + uTime * 0.7) * 0.5 + sin(p.y * 0.13 - uTime * 0.5) * 0.4 + sin((p.x + p.y) * 0.05 + uTime * 0.35) * 0.7;
        p.z += h;
        vPos = position.xy;
        vH = h;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      varying vec2 vPos;
      varying float vH;
      varying vec3 vWorld;
      void main() {
        vec3 deep = vec3(0.05, 0.22, 0.34);
        vec3 shallow = vec3(0.18, 0.52, 0.58);
        vec3 col = mix(deep, shallow, clamp(vH * 0.35 + 0.5, 0.0, 1.0));
        float glint = sin(vPos.x * 0.9 + uTime * 1.3) * sin(vPos.y * 1.1 - uTime * 0.9) * sin((vPos.x - vPos.y) * 0.37 + uTime);
        float near = 1.0 - smoothstep(30.0, 120.0, length(vWorld.xz - cameraPosition.xz));
        col += vec3(1.0, 0.85, 0.6) * smoothstep(0.9, 1.0, glint) * 0.35 * near;
        vec3 view = normalize(vWorld - cameraPosition);
        vec3 refl = reflect(view, vec3(0.0, 1.0, 0.0));
        col += vec3(1.0, 0.6, 0.35) * pow(max(dot(refl, uSun), 0.0), 24.0) * 0.8;
        float d = length(vWorld.xz - cameraPosition.xz);
        col = mix(col, uHorizon, smoothstep(90.0, 330.0, d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(800, 800, 200, 200), mat);
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, update: (t) => { mat.uniforms.uTime.value = t; } };
}
