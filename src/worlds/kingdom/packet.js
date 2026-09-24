import * as THREE from 'three';
import { LAYERS } from '../../shared/content.js';
import { tween, ease } from '../../shared/tween.js';
import { makeLabel } from './labels.js';

// You are the packet: a letter. The application data is the letter itself,
// and every header wraps it in another translucent envelope, tied with the
// layer's ribbon and stamped with its wax seal.
const SHELL_SIZE = { transport: 1.35, internet: 1.8, link: 2.3 };

export class PacketAvatar {
  constructor(scene) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    scene.add(this.group);

    // Before the application layer creates data you are just a spark.
    this.spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1 }),
    );
    this.body.add(this.spark);

    // the letter: a folded parchment with a purple wax seal
    this.core = new THREE.Group();
    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.75, 0.16),
      new THREE.MeshStandardMaterial({ color: '#f6e7c1', emissive: '#f2c46d', emissiveIntensity: 0.25, roughness: 0.7 }),
    );
    paper.castShadow = true;
    const flap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.02, 3, 1, false),
      new THREE.MeshStandardMaterial({ color: '#e2c98f', roughness: 0.8 }),
    );
    flap.rotation.set(Math.PI / 2, 0, Math.PI);
    flap.scale.set(1, 1, 0.55);
    flap.position.set(0, 0.12, 0.09);
    const seal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.06, 16),
      new THREE.MeshStandardMaterial({ color: LAYERS.app.color, emissive: LAYERS.app.color, emissiveIntensity: 0.9 }),
    );
    seal.rotation.x = Math.PI / 2;
    seal.position.set(0, -0.02, 0.11);
    this.core.add(paper, flap, seal);
    this.core.visible = false;
    this.body.add(this.core);

    this.light = new THREE.PointLight('#ffe0b0', 7, 10, 1.6);
    this.light.position.y = 0.5;
    this.group.add(this.light);

    this.shells = {};
    this.heading = 0;
    this.trail = [];
    this.scene = scene;
    this.bitsMode = false;
    this.bitTimer = 0;

    this.tag = makeLabel('you', { size: 0.5, color: '#fff' });
    this.tag.position.y = 2.2;
    this.group.add(this.tag);
  }

  get position() {
    return this.group.position;
  }

  async addLayer(layer) {
    if (layer === 'app') {
      this.core.visible = true;
      this.core.scale.setScalar(0.01);
      await tween(0.6, (k) => {
        this.core.scale.setScalar(k);
        this.spark.scale.setScalar(1 - k);
      }, ease.back);
      this.spark.visible = false;
      return;
    }
    if (this.shells[layer]) return;
    const size = SHELL_SIZE[layer];
    const color = LAYERS[layer].color;
    const shell = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.18, emissive: color, emissiveIntensity: 0.3, depthWrite: false }),
    );
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color, transparent: true }));
    // a ribbon tied around the envelope, and the layer's wax seal on front
    const ribbonMat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(size * 1.01, size * 0.08, size * 1.01), ribbonMat);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(size * 0.08, size * 1.01, size * 1.01), ribbonMat);
    const seal = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.12, size * 0.12, 0.05, 16), new THREE.MeshBasicMaterial({ color, transparent: true }));
    seal.rotation.x = Math.PI / 2;
    seal.position.z = size / 2 + 0.03;
    shell.add(box, edges, r1, r2, seal);
    this.body.add(shell);
    this.shells[layer] = shell;
    const extras = shell.children.slice(2);
    await tween(0.7, (k) => {
      shell.scale.setScalar(3 - 2 * k);
      box.material.opacity = 0.18 * k;
      edges.material.opacity = k;
      for (const e of extras) e.material.opacity = k * 0.85;
    }, ease.out);
  }

  async removeLayer(layer) {
    const shell = this.shells[layer];
    if (!shell) return;
    delete this.shells[layer];
    const [box, edges, ...extras] = shell.children;
    await tween(0.6, (k) => {
      shell.scale.setScalar(1 + k * 2.5);
      box.material.opacity = 0.18 * (1 - k);
      edges.material.opacity = 1 - k;
      for (const e of extras) e.material.opacity = 0.85 * (1 - k);
    }, ease.out);
    this.body.remove(shell);
  }

  reset() {
    for (const layer of Object.keys(this.shells)) {
      this.body.remove(this.shells[layer]);
      delete this.shells[layer];
    }
    this.core.visible = false;
    this.spark.visible = true;
    this.spark.scale.setScalar(1);
  }

  setBits(on) {
    this.bitsMode = on;
  }

  update(dt, t, moveDir) {
    if (moveDir && moveDir.lengthSq() > 0.0001) {
      const target = Math.atan2(moveDir.x, moveDir.z);
      let diff = target - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * 10);
    }
    this.body.rotation.y = this.heading + Math.sin(t * 1.3) * 0.08;
    this.body.position.y = Math.sin(t * 3) * 0.15;
    const layers = Object.values(this.shells);
    layers.forEach((s, i) => { s.rotation.y = Math.sin(t * 0.7 + i) * 0.25; });

    if (this.bitsMode) {
      this.bitTimer -= dt;
      if (this.bitTimer <= 0) {
        this.bitTimer = 0.03;
        this.spawnBit();
      }
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const b = this.trail[i];
      b.userData.life -= dt;
      b.material.opacity = Math.max(0, b.userData.life);
      if (b.userData.life <= 0) {
        this.scene.remove(b);
        b.material.dispose();
        this.trail.splice(i, 1);
      }
    }
  }

  spawnBit() {
    const on = Math.random() > 0.5;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, on ? 0.5 : 0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: on ? '#ffe3a1' : '#f2a93b', transparent: true }),
    );
    b.position.copy(this.group.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
    b.userData.life = 1;
    this.scene.add(b);
    this.trail.push(b);
  }
}
