import * as THREE from 'three';
import { fbm, mulberry32 } from './noise.js';

// Sky dome, square sun and moon, drifting block clouds, stars, and the
// day → sunset → night cycle that drives all of the scene's lighting.

const KEYS = [
  {
    name: 'Day', top: '#3f86e6', horizon: '#a6d2ff', fog: '#b7dcff', hemiSky: '#d6ebff', hemiGround: '#6a6f3c', hemi: 1.25,
    sun: '#fff1d2', sunI: 2.3, elev: 0.95, stars: 0, water: '#5d8fe8', cloud: '#ffffff', night: 0,
  },
  {
    name: 'Sunset', top: '#35468f', horizon: '#ff9458', fog: '#e7a27f', hemiSky: '#ffc69c', hemiGround: '#4b3b3b', hemi: 0.95,
    sun: '#ffa760', sunI: 1.7, elev: 0.2, stars: 0.15, water: '#6b6fb8', cloud: '#ffc9a8', night: 0.25,
  },
  {
    name: 'Night', top: '#050a22', horizon: '#1d2a5c', fog: '#16204a', hemiSky: '#8ea2ee', hemiGround: '#2a2a50', hemi: 1.05,
    sun: '#a9bcff', sunI: 0.9, elev: 0.85, stars: 1, water: '#1f2d66', cloud: '#5a6390', night: 1,
  },
];
export const TIME_NAMES = KEYS.map((k) => k.name);

const col = (hex) => new THREE.Color(hex);
const lerpColor = (a, b, t) => col(a).lerp(col(b), t);

function pixelSprite(draw, size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthWrite: false }));
}

export function buildSky(scene) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: col(KEYS[0].top) }, horizon: { value: col(KEYS[0].horizon) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, -0.2, 1.0); float t = pow(max(h, 0.0), 0.55);
        vec3 c = mix(horizon, top, t); if (h < 0.0) c = mix(horizon, horizon * 0.7, -h * 5.0);
        gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  const sunSprite = pixelSprite((ctx) => {
    ctx.fillStyle = '#fff4b0'; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(3, 3, 10, 10);
    ctx.fillStyle = '#fffbe0'; ctx.fillRect(1, 1, 2, 2); ctx.fillRect(13, 13, 2, 2);
  });
  sunSprite.scale.setScalar(38);
  const moonSprite = pixelSprite((ctx) => {
    ctx.fillStyle = '#dfe6ff'; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#b8c3e6'; ctx.fillRect(3, 4, 3, 3); ctx.fillRect(10, 9, 4, 3); ctx.fillRect(6, 11, 2, 2);
  });
  moonSprite.scale.setScalar(26);
  scene.add(sunSprite, moonSprite);

  // stars
  const n = 1400;
  const pos = new Float32Array(n * 3);
  const rnd = mulberry32(99);
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2;
    const ph = 0.05 + rnd() * Math.PI * 0.45;
    pos[i * 3] = 450 * Math.cos(th) * Math.cos(ph);
    pos[i * 3 + 1] = 450 * Math.sin(ph);
    pos[i * 3 + 2] = 450 * Math.sin(th) * Math.cos(ph);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
  stars.frustumCulled = false;
  scene.add(stars);

  // flat block clouds
  const cells = [];
  const CELL = 9;
  for (let i = -45; i < 45; i++) {
    for (let j = -30; j < 30; j++) {
      if (fbm(i * 0.16, j * 0.16, 77, 3) > 0.6) cells.push([i * CELL, j * CELL]);
    }
  }
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, transparent: true, opacity: 0.88, depthWrite: false });
  const clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 3, CELL), cloudMat, cells.length);
  const m = new THREE.Matrix4();
  cells.forEach(([x, z], i) => clouds.setMatrixAt(i, m.makeTranslation(x, 0, z)));
  clouds.position.y = 78;
  clouds.frustumCulled = false;
  scene.add(clouds);

  const hemi = new THREE.HemisphereLight('#d6ebff', '#6a6f3c', 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 200 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog('#b7dcff', 90, 290);
  scene.background = col('#b7dcff');

  const state = { value: 0, target: 0, current: null };
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();

  function sample(v) {
    const i = Math.floor(v) % KEYS.length;
    const j = (i + 1) % KEYS.length;
    const t = v - Math.floor(v);
    const a = KEYS[i];
    const b = KEYS[j];
    const num = (k) => a[k] + (b[k] - a[k]) * t;
    return {
      top: lerpColor(a.top, b.top, t), horizon: lerpColor(a.horizon, b.horizon, t), fog: lerpColor(a.fog, b.fog, t),
      hemiSky: lerpColor(a.hemiSky, b.hemiSky, t), hemiGround: lerpColor(a.hemiGround, b.hemiGround, t),
      sun: lerpColor(a.sun, b.sun, t), water: lerpColor(a.water, b.water, t), cloud: lerpColor(a.cloud, b.cloud, t),
      hemi: num('hemi'), sunI: num('sunI'), elev: num('elev'), stars: num('stars'), night: num('night'),
    };
  }

  function apply(s) {
    dome.material.uniforms.top.value.copy(s.top);
    dome.material.uniforms.horizon.value.copy(s.horizon);
    scene.fog.color.copy(s.fog);
    scene.background.copy(s.fog);
    hemi.color.copy(s.hemiSky);
    hemi.groundColor.copy(s.hemiGround);
    hemi.intensity = s.hemi;
    sun.color.copy(s.sun);
    sun.intensity = s.sunI;
    stars.material.opacity = s.stars;
    cloudMat.color.copy(s.cloud);
    cloudMat.emissive.copy(s.cloud).multiplyScalar(0.35);
    // The sun sets in the west (behind the sender); the moon rises opposite.
    const sunElev = s.night > 0.6 ? -0.4 : s.elev * (1 - s.night);
    sunDir.set(-Math.cos(sunElev) * 0.8, Math.sin(Math.max(0.12, sunElev)), 0.55).normalize();
    moonDir.set(0.7, 0.75, -0.35).normalize();
    sunSprite.material.opacity = 1 - s.night;
    moonSprite.material.opacity = Math.min(1, s.night * 1.3);
    state.current = s;
  }
  apply(sample(0));

  return {
    sun,
    get night() { return state.current.night; },
    get water() { return state.current.water; },
    get name() { return KEYS[Math.round(state.target) % KEYS.length].name; },
    // Advance to the next time of day; returns its name.
    cycle() {
      state.target = Math.round(state.target) + 1;
      return KEYS[state.target % KEYS.length].name;
    },
    set(index) {
      state.value = state.target = index;
      apply(sample(index % KEYS.length));
    },
    update(t, dt, focus, camera) {
      if (state.value !== state.target) {
        state.value = Math.min(state.target, state.value + dt * 0.5);
        if (state.value >= KEYS.length && state.target >= KEYS.length) {
          state.value -= KEYS.length;
          state.target -= KEYS.length;
        }
        apply(sample(state.value));
      }
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      stars.rotation.y = t * 0.004;
      const light = state.current.night > 0.6 ? moonDir : sunDir;
      sun.position.copy(focus).addScaledVector(light, 90);
      sun.target.position.copy(focus);
      sunSprite.position.copy(camera.position).addScaledVector(sunDir, 420);
      moonSprite.position.copy(camera.position).addScaledVector(moonDir, 420);
      const span = 90 * CELL;
      const shift = t * 1.2;
      cells.forEach(([x, z], i) => {
        const cx = ((((x + shift + span / 2) % span) + span) % span) - span / 2;
        clouds.setMatrixAt(i, m.makeTranslation(cx, 0, z));
      });
      clouds.instanceMatrix.needsUpdate = true;
    },
  };
}
