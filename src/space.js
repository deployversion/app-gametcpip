import * as THREE from 'three';
import { makeLabel } from './labels.js';

// Deep-space backdrop: nebula sky, planets, a sun, the asteroid belt the
// network crosses, and far-off traffic. Everything here is scenery; nothing
// is walkable. Each maker returns an Object3D and may push per-frame
// callbacks `(t, dt)` onto `animated`.

// Where the sun sits in the sky; planets are lit from this direction.
export const SUN_DIR = new THREE.Vector3(-0.55, 0.32, -0.77).normalize();

const rand = (a, b) => a + Math.random() * (b - a);

// Shared GLSL: value noise + fbm, used by the sky and the planets.
const NOISE = `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

// A sphere around the camera: black space, a milky-way band, two-tone
// nebula clouds and twinkling procedural stars.
export function makeSpaceSky() {
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
      ${NOISE}
      float stars(vec3 d, float scale, float threshold) {
        vec3 p = d * scale;
        vec3 id = floor(p);
        float h = hash(id);
        if (h < threshold) return 0.0;
        vec3 c = id + 0.5 + (vec3(hash(id + 1.3), hash(id + 2.7), hash(id + 4.1)) - 0.5) * 0.6;
        float dist = length(p - c);
        float tw = 0.65 + 0.35 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
        return smoothstep(0.16, 0.0, dist) * tw * (h - threshold) / (1.0 - threshold);
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = vec3(0.004, 0.006, 0.018);
        // milky-way band, tilted across the sky
        vec3 axis = normalize(vec3(0.35, 0.9, 0.25));
        float band = exp(-pow(dot(d, axis) * 3.2, 2.0));
        float dust = fbm(d * 6.0);
        col += band * vec3(0.05, 0.05, 0.09) * (0.5 + dust);
        // nebula: magenta and teal clouds
        float n1 = fbm(d * 2.2 + vec3(3.1, 0.0, 1.7));
        float n2 = fbm(d * 3.1 + vec3(-2.0, 4.0, 0.3));
        col += vec3(0.30, 0.05, 0.28) * pow(smoothstep(0.45, 0.9, n1), 2.0) * 0.55;
        col += vec3(0.02, 0.22, 0.30) * pow(smoothstep(0.5, 0.9, n2), 2.0) * 0.5;
        // dark dust lanes inside the band
        col *= 1.0 - band * smoothstep(0.55, 0.75, fbm(d * 9.0)) * 0.6;
        // stars: dense faint layer + sparse bright layer
        float s = stars(d, 180.0, 0.93) * 0.7 + stars(d, 70.0, 0.965) * 1.6 + band * stars(d, 320.0, 0.9) * 0.6;
        vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.85, 0.7), hash(floor(d * 70.0)));
        col += s * tint;
        // soft glow around the sun
        float sd = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.75, 0.45) * pow(sd, 60.0) * 0.8 + vec3(0.5, 0.35, 0.3) * pow(sd, 8.0) * 0.12;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), mat);
  mesh.renderOrder = -2;
  return { mesh, update: (t) => { mat.uniforms.uTime.value = t; } };
}

// The sun: a bright disc with a big additive halo and a couple of flare rings.
export function makeSun(distance = 620) {
  const group = new THREE.Group();
  group.position.copy(SUN_DIR).multiplyScalar(distance);
  const halo = (size, color, opacity, falloff) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, color);
    g.addColorStop(falloff, 'rgba(255,200,140,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, opacity, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }));
    s.scale.setScalar(size);
    return s;
  };
  group.add(halo(170, 'rgba(255,240,220,1)', 0.9, 0.12), halo(60, 'rgba(255,255,255,1)', 1, 0.35));
  // a faint flare ring around the sun
  const rc = document.createElement('canvas');
  rc.width = rc.height = 256;
  const rctx = rc.getContext('2d');
  rctx.strokeStyle = 'rgba(255,180,110,0.5)';
  rctx.lineWidth = 3;
  rctx.beginPath();
  rctx.arc(128, 128, 120, 0, Math.PI * 2);
  rctx.stroke();
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(rc), transparent: true, opacity: 0.35, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  flare.scale.setScalar(150);
  group.add(flare);
  return { group };
}

// A planet with a procedural surface, clouds, day/night shading from the
// sun and a glowing atmosphere rim.
//   kind: 'terra' (oceans, continents, city lights) or 'giant' (gas bands)
export function makePlanet({ radius, kind, tint = '#ffffff', atmosphere = '#6fb6ff', rings = false, spin = 0.01, seed = 0 }) {
  const group = new THREE.Group();
  const surface = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: SUN_DIR },
      uTint: { value: new THREE.Color(tint) },
      uKind: { value: kind === 'terra' ? 0 : kind === 'moon' ? 2 : 1 },
      uSeed: { value: seed },
    },
    vertexShader: `
      varying vec3 vObj;
      varying vec3 vNormalW;
      void main() {
        vObj = normalize(position);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSun;
      uniform vec3 uTint;
      uniform float uKind;
      uniform float uSeed;
      varying vec3 vObj;
      varying vec3 vNormalW;
      ${NOISE}
      void main() {
        vec3 p = vObj + uSeed;
        float light = dot(normalize(vNormalW), uSun);
        float day = smoothstep(-0.15, 0.35, light);
        vec3 col;
        vec3 night = vec3(0.0);
        if (uKind < 0.5) {
          float h = fbm(p * 2.4);
          float land = smoothstep(0.52, 0.56, h);
          vec3 ocean = mix(vec3(0.02, 0.09, 0.25), vec3(0.04, 0.2, 0.42), smoothstep(0.3, 0.52, h));
          vec3 ground = mix(vec3(0.12, 0.3, 0.1), vec3(0.45, 0.38, 0.22), smoothstep(0.58, 0.72, h));
          float ice = smoothstep(0.78, 0.9, abs(vObj.y));
          col = mix(mix(ocean, ground, land), vec3(0.75, 0.8, 0.88), ice);
          float clouds = smoothstep(0.5, 0.75, fbm(p * 3.5 + vec3(uTime * 0.01, 0.0, uTime * 0.006)));
          col = mix(col, vec3(0.78, 0.82, 0.88), clouds * 0.6);
          // city lights on the night side: clusters on land
          float cities = land * smoothstep(0.62, 0.7, noise(p * 40.0)) * (1.0 - ice) * (1.0 - clouds);
          night = vec3(1.0, 0.72, 0.35) * cities * 1.4;
          float spec = pow(max(dot(reflect(-uSun, normalize(vNormalW)), vec3(0.0, 0.0, 1.0)), 0.0), 30.0) * (1.0 - land) * 0.3;
          col += spec;
        } else if (uKind < 1.5) {
          float warp = fbm(p * vec3(2.0, 8.0, 2.0) + vec3(uTime * 0.02, 0.0, 0.0)) * 0.25;
          float bands = sin((vObj.y + warp) * 22.0) * 0.5 + 0.5;
          float fine = sin((vObj.y + warp * 1.6) * 61.0) * 0.5 + 0.5;
          col = mix(vec3(0.55, 0.3, 0.15), vec3(0.95, 0.8, 0.55), bands) * uTint;
          col *= 0.85 + fine * 0.2;
          // a big storm eye
          float storm = smoothstep(0.16, 0.05, length(vec2(atan(vObj.z, vObj.x) - 0.8, (vObj.y + 0.28) * 2.2)));
          col = mix(col, vec3(0.75, 0.25, 0.12), storm * 0.8);
        } else {
          float h = fbm(p * 5.0);
          float craters = smoothstep(0.62, 0.66, noise(p * 14.0)) * 0.25;
          col = vec3(0.42, 0.41, 0.44) * (0.7 + h * 0.6) - craters;
        }
        vec3 lit = col * (0.03 + day * (uKind < 0.5 ? 0.75 : 0.9)) + night * (1.0 - day);
        gl_FragColor = vec4(lit, 1.0);
      }`,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), surface);
  group.add(body);

  if (atmosphere) {
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.045, 64, 32),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(atmosphere) }, uSun: { value: SUN_DIR } },
        vertexShader: `
          varying vec3 vNormalW;
          varying vec3 vView;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vNormalW = normalize(mat3(modelMatrix) * normal);
            vView = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          uniform vec3 uColor;
          uniform vec3 uSun;
          varying vec3 vNormalW;
          varying vec3 vView;
          void main() {
            float rim = pow(1.0 - abs(dot(vNormalW, vView)), 2.0);
            float lit = smoothstep(-0.4, 0.4, dot(-vNormalW, uSun));
            gl_FragColor = vec4(uColor * rim * (0.12 + lit * 0.7), 1.0);
          }`,
      }),
    );
    group.add(atmo);
  }

  if (rings) {
    const inner = radius * 1.35;
    const outer = radius * 2.3;
    const geo = new THREE.RingGeometry(inner, outer, 160, 1);
    const ringMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      uniforms: { uInner: { value: inner }, uOuter: { value: outer } },
      vertexShader: `
        varying vec3 vPos;
        void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uInner;
        uniform float uOuter;
        varying vec3 vPos;
        float h(float x) { return fract(sin(x * 91.7) * 43758.5); }
        void main() {
          float r = (length(vPos.xy) - uInner) / (uOuter - uInner);
          float b = floor(r * 90.0);
          float density = 0.35 + 0.65 * h(b) * h(floor(r * 23.0) + 3.0);
          density *= smoothstep(0.0, 0.06, r) * smoothstep(1.0, 0.85, r);
          density *= 1.0 - smoothstep(0.54, 0.56, r) * smoothstep(0.62, 0.6, r); // a gap
          vec3 col = mix(vec3(0.75, 0.62, 0.45), vec3(0.95, 0.88, 0.75), h(b + 7.0));
          gl_FragColor = vec4(col * 0.9, density * 0.75);
        }`,
    });
    const ring = new THREE.Mesh(geo, ringMat);
    ring.rotation.x = Math.PI / 2 - 0.35;
    ring.rotation.y = 0.25;
    group.add(ring);
  }

  return {
    group,
    body,
    update(t) {
      surface.uniforms.uTime.value = t;
      body.rotation.y = t * spin;
    },
  };
}

// Tumbling rocks. `volume` is a function returning a position for rock i.
export function makeAsteroids(count, volume, animated, { minSize = 0.4, maxSize = 2.6, drift = null } = {}) {
  const group = new THREE.Group();
  const variants = [0, 1, 2].map((v) => {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i);
      const k = 0.72 + 0.28 * Math.sin(tmp.x * (3 + v) + v) * Math.cos(tmp.y * (2 + v)) + Math.random() * 0.12;
      tmp.multiplyScalar(k);
      tmp.y *= 0.8;
      pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    geo.computeVertexNormals();
    return geo;
  });
  const mat = new THREE.MeshStandardMaterial({ color: '#6b6470', roughness: 0.95, metalness: 0.05, flatShading: true });
  const per = Math.ceil(count / variants.length);
  const meshes = variants.map((geo) => new THREE.InstancedMesh(geo, mat, per));
  const rocks = [];
  const tint = [new THREE.Color('#8a8190'), new THREE.Color('#6d6a78'), new THREE.Color('#8f7a66'), new THREE.Color('#5d6474')];
  for (let i = 0; i < per * variants.length; i++) {
    const p = volume(i);
    rocks.push({
      mesh: meshes[i % variants.length],
      index: Math.floor(i / variants.length),
      pos: p,
      rot: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
      spin: new THREE.Vector3(rand(-0.4, 0.4), rand(-0.4, 0.4), rand(-0.4, 0.4)),
      scale: new THREE.Vector3(1, rand(0.6, 1), rand(0.7, 1.2)).multiplyScalar(minSize + Math.pow(Math.random(), 2.2) * (maxSize - minSize)),
    });
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  rocks.forEach((r) => r.mesh.setColorAt(r.index, tint[Math.floor(Math.random() * tint.length)]));
  const write = (t) => {
    for (const r of rocks) {
      e.set(r.rot.x + r.spin.x * t, r.rot.y + r.spin.y * t, r.rot.z + r.spin.z * t);
      q.setFromEuler(e);
      const p = drift ? drift(r.pos, t) : r.pos;
      m.compose(p, q, r.scale);
      r.mesh.setMatrixAt(r.index, m);
    }
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  };
  write(0);
  let acc = 0;
  animated.push((t, dt = 1 / 60) => {
    acc += dt;
    if (acc < 1 / 30) return; // rocks are slow: 30 updates a second is plenty
    acc = 0;
    write(t);
  });
  for (const mesh of meshes) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }
  return group;
}

// Small ships crossing the far background on looping lanes, with an engine
// glow and a fading trail.
export function makeSpaceTraffic(animated) {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: '#c9d0e6', metalness: 0.6, roughness: 0.4, fog: false });
  const lanes = [
    { from: new THREE.Vector3(-260, 60, -180), to: new THREE.Vector3(300, 40, -220), speed: 0.03, color: '#4be1ff' },
    { from: new THREE.Vector3(320, 90, -120), to: new THREE.Vector3(-300, 110, -260), speed: 0.022, color: '#ff8a3d' },
    { from: new THREE.Vector3(-200, -40, 160), to: new THREE.Vector3(260, -10, 120), speed: 0.026, color: '#b56cff' },
    { from: new THREE.Vector3(250, 20, 220), to: new THREE.Vector3(-240, 70, -90), speed: 0.018, color: '#35d07f' },
  ];
  lanes.forEach((lane, i) => {
    const ship = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 3.2, 4, 10), hull);
    body.rotation.z = Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 4.2), hull);
    wing.position.x = -0.6;
    const engine = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshBasicMaterial({ color: lane.color, fog: false }));
    engine.position.x = -2.6;
    ship.add(body, wing, engine);
    const trailN = 24;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailN * 3), 3));
    const colors = new Float32Array(trailN * 3);
    const c = new THREE.Color(lane.color);
    for (let k = 0; k < trailN; k++) {
      const f = 1 - k / trailN;
      colors.set([c.r * f, c.g * f, c.b * f], k * 3);
    }
    trailGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, fog: false }));
    trail.frustumCulled = false;
    group.add(ship, trail);
    const dir = lane.to.clone().sub(lane.from).normalize();
    ship.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    const phase = i * 0.27;
    animated.push((t) => {
      const k = (t * lane.speed + phase) % 1;
      ship.position.lerpVectors(lane.from, lane.to, k);
      const pos = trail.geometry.attributes.position;
      for (let j = 0; j < trailN; j++) {
        const kk = Math.max(0, k - j * 0.004);
        const v = new THREE.Vector3().lerpVectors(lane.from, lane.to, kk);
        pos.setXYZ(j, v.x - dir.x * 2.6, v.y, v.z - dir.z * 2.6);
      }
      pos.needsUpdate = true;
    });
  });
  return group;
}

// Shooting stars: every few seconds a bright streak crosses the sky.
export function makeShootingStars(animated) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0]), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, fog: false }));
  line.frustumCulled = false;
  const state = { start: 0, dur: 0.9, a: new THREE.Vector3(), b: new THREE.Vector3(), next: 2 };
  animated.push((t) => {
    if (t > state.next) {
      state.start = t;
      state.next = t + rand(3, 7);
      const th = rand(0, Math.PI * 2);
      state.a.set(Math.cos(th) * 420, rand(80, 260), Math.sin(th) * 420 - 100);
      state.b.copy(state.a).add(new THREE.Vector3(rand(-200, 200), rand(-120, -60), rand(-200, 200)));
    }
    const k = (t - state.start) / state.dur;
    line.visible = k >= 0 && k <= 1;
    if (!line.visible) return;
    const head = new THREE.Vector3().lerpVectors(state.a, state.b, k);
    const tail = new THREE.Vector3().lerpVectors(state.a, state.b, Math.max(0, k - 0.25));
    const pos = geo.attributes.position;
    pos.setXYZ(0, head.x, head.y, head.z);
    pos.setXYZ(1, tail.x, tail.y, tail.z);
    pos.needsUpdate = true;
  });
  return line;
}

// Far-away stations and satellites dotting the sky, each with a blinking
// light: the rest of the internet.
export function makeDistantStations(animated) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#8b93b8', metalness: 0.6, roughness: 0.5, fog: false });
  const panel = new THREE.MeshStandardMaterial({ color: '#1d3a8a', emissive: '#0b1c55', emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.4, fog: false });
  const blinkers = [];
  const spots = [
    [-300, 120, -330, 'AS 64500'], [120, 150, -420, 'AS 64510'], [360, 70, -250, 'CDN edge'], [-420, 40, 60, 'AS 64520'], [80, -120, -380, 'DNS root'],
  ];
  for (const [x, y, z, name] of spots) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 14, 12), mat);
    core.rotation.z = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.9, 8, 32), mat);
    ring.rotation.y = Math.PI / 2;
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 18), panel);
    p1.position.x = 9;
    const p2 = p1.clone();
    p2.position.x = -9;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff4d6d', fog: false }));
    light.position.y = 3;
    blinkers.push(light);
    const label = makeLabel(name, { size: 5, color: '#9fb0e6', bg: null });
    label.material.fog = false;
    label.position.y = 13;
    g.add(core, ring, p1, p2, light, label);
    g.lookAt(0, 0, 0);
    group.add(g);
    animated.push((t) => { ring.rotation.x = t * 0.2; });
  }
  animated.push((t) => blinkers.forEach((b, i) => { b.visible = Math.sin(t * 2.2 + i * 1.3) > 0.4; }));
  return group;
}
