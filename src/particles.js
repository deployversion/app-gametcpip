import * as THREE from 'three';
import { makeLabel } from './labels.js';

// Pooled confetti/spark particles in one InstancedMesh, plus floating
// score popups. Call update(dt) every frame.
const MAX = 600;
const GRAVITY = 14;

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.04),
      new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      MAX,
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts = Array.from({ length: MAX }, () => ({
      life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), scale: 1,
    }));
    this.next = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, this.zero);
      this.mesh.setColorAt(i, new THREE.Color('#ffffff'));
    }
    scene.add(this.mesh);
    this.popups = [];
  }

  spawn(pos, { color = '#ffffff', speed = 6, up = 4, life = 1.2, scale = 1, spread = 0 } = {}) {
    const part = this.parts[this.next];
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    part.life = part.max = life * (0.7 + Math.random() * 0.6);
    part.p.copy(pos);
    if (spread) part.p.add(new THREE.Vector3((Math.random() - 0.5) * spread.x, (Math.random() - 0.5) * spread.y, (Math.random() - 0.5) * spread.z));
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
    part.v.copy(dir).multiplyScalar(speed * (0.4 + Math.random() * 0.6));
    part.v.y += up;
    part.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    part.scale = scale * (0.6 + Math.random() * 0.8);
    this.mesh.setColorAt(i, new THREE.Color(Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color));
    this.mesh.instanceColor.needsUpdate = true;
  }

  burst(pos, count, opts) {
    for (let i = 0; i < count; i++) this.spawn(pos, opts);
  }

  // A floating label that rises and fades, e.g. "+100".
  popup(pos, text, color = '#ffd166') {
    const label = makeLabel(text, { size: 0.9, color, bg: null, font: 900 });
    label.position.copy(pos);
    label.material.toneMapped = false;
    this.scene.add(label);
    this.popups.push({ label, life: 1.4 });
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      const part = this.parts[i];
      if (part.life <= 0) continue;
      part.life -= dt;
      if (part.life <= 0) {
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      part.v.y -= GRAVITY * dt;
      part.v.multiplyScalar(1 - dt * 0.8);
      part.p.addScaledVector(part.v, dt);
      part.rot.x += part.spin.x * dt;
      part.rot.y += part.spin.y * dt;
      part.rot.z += part.spin.z * dt;
      this.q.setFromEuler(part.rot);
      const k = part.scale * Math.min(1, part.life / (part.max * 0.4));
      this.s.set(k, k, k);
      this.m.compose(part.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life -= dt;
      pop.label.position.y += dt * 1.6;
      pop.label.material.opacity = Math.min(1, pop.life / 0.6);
      if (pop.life <= 0) {
        this.scene.remove(pop.label);
        pop.label.material.map.dispose();
        pop.label.material.dispose();
        this.popups.splice(i, 1);
      }
    }
  }
}
