import * as THREE from 'three';
import { LAYERS } from '../../shared/content.js';
import { tween, ease } from '../../shared/tween.js';
import { makeLabel } from '../../shared/labels.js';

// You are the packet. The avatar is the application data at its core, with
// one translucent shell per header wrapped around it.
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

    this.core = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ color: LAYERS.app.color, emissive: LAYERS.app.color, emissiveIntensity: 0.8, roughness: 0.3 }),
    );
    this.core.castShadow = true;
    this.core.visible = false;
    this.body.add(this.core);

    this.light = new THREE.PointLight('#ffffff', 12, 10, 1.6);
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
    shell.add(box, edges);
    this.body.add(shell);
    this.shells[layer] = shell;
    await tween(0.7, (k) => {
      shell.scale.setScalar(3 - 2 * k);
      box.material.opacity = 0.18 * k;
      edges.material.opacity = k;
    }, ease.out);
  }

  async removeLayer(layer) {
    const shell = this.shells[layer];
    if (!shell) return;
    delete this.shells[layer];
    const [box, edges] = shell.children;
    await tween(0.6, (k) => {
      shell.scale.setScalar(1 + k * 2.5);
      box.material.opacity = 0.18 * (1 - k);
      edges.material.opacity = 1 - k;
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
      new THREE.MeshBasicMaterial({ color: on ? '#4be1ff' : '#1e6bff', transparent: true }),
    );
    b.position.copy(this.group.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
    b.userData.life = 1;
    this.scene.add(b);
    this.trail.push(b);
  }
}
