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

// A gradient sky dome with a soft aurora band near the horizon.
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 top = vec3(0.012, 0.02, 0.08);
        vec3 mid = vec3(0.03, 0.03, 0.11);
        vec3 horizon = vec3(0.09, 0.04, 0.17);
        vec3 col = mix(horizon, mid, smoothstep(-0.05, 0.25, h));
        col = mix(col, top, smoothstep(0.25, 0.8, h));
        float a = atan(vDir.z, vDir.x);
        float band = exp(-pow((h - 0.12 - 0.05 * sin(a * 3.0 + uTime * 0.05)) * 9.0, 2.0));
        float wave = 0.5 + 0.5 * sin(a * 7.0 + uTime * 0.15) * sin(a * 3.0 - uTime * 0.1);
        col += band * wave * vec3(0.03, 0.25, 0.22) * 0.5;
        col = mix(col, vec3(0.03, 0.03, 0.1), smoothstep(-0.02, -0.4, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  sky.renderOrder = -1;
  return { mesh: sky, update: (t) => { mat.uniforms.uTime.value = t; } };
}

// The "data ocean" under the network: rolling waves with a glowing grid.
export function makeDataOcean() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      uniform float uTime;
      varying vec2 vPos;
      varying float vH;
      void main() {
        vec3 p = position;
        float h = sin(p.x * 0.08 + uTime * 0.6) * 0.8 + sin(p.y * 0.11 - uTime * 0.4) * 0.6 + sin((p.x + p.y) * 0.05 + uTime * 0.3) * 0.9;
        p.z += h;
        vPos = position.xy;
        vH = h;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vPos;
      varying float vH;
      float line(float v, float w) { float f = abs(fract(v) - 0.5); return smoothstep(w, 0.0, f - (0.5 - w)); }
      void main() {
        vec2 g = vPos / 4.0;
        float grid = max(line(g.x, 0.04), line(g.y, 0.04));
        float pulse = smoothstep(0.96, 1.0, sin(vPos.x * 0.05 - uTime * 1.5) * 0.5 + 0.5);
        vec3 base = mix(vec3(0.005, 0.015, 0.06), vec3(0.015, 0.06, 0.16), vH * 0.25 + 0.5);
        vec3 col = base + grid * vec3(0.08, 0.3, 0.7) * (0.25 + pulse * 0.9);
        float fade = 1.0 - smoothstep(60.0, 180.0, length(vPos));
        gl_FragColor = vec4(col, fade);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 160, 160), mat);
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, update: (t) => { mat.uniforms.uTime.value = t; } };
}
