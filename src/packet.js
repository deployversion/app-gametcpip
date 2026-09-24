import * as THREE from 'three';
import { LAYERS } from './content.js';
import { tween, ease } from './tween.js';
import { makeLabel } from './labels.js';
import { makeLoco, makeWagon, Steam } from './trains.js';

// You are the packet, and the packet is a train. The locomotive is the request
// on its way; every layer couples one wagon behind it. A new header always
// goes straight behind the engine, in front of what was already there, just
// like a header goes in front of the data it wraps. The link layer also adds
// a red-lamped caboose at the very end: the frame's trailer (FCS).

const RIDE = 1.4; // the avatar's origin floats this far above the rails
const SPACING = 0.3; // gap between cars
const LOCO_BACK = 1.75; // from the loco's origin to its rear buffer

const ORDER = ['link', 'internet', 'transport', 'app', 'fcs'];
const WAGONS = {
  app: { title: 'HTTP', detail: 'GET /cat.png', kind: 'open' },
  transport: { title: 'TCP', detail: ':51514 → :443', kind: 'box' },
  internet: { title: 'IP', detail: '→ 203.0.113.80', kind: 'tank' },
  link: { title: 'ETH', detail: 'MAC → MAC', kind: 'box' },
  fcs: { title: 'FCS', detail: 'checksum', kind: 'caboose', color: '#2f6fd1', len: 1.9 },
};

export class PacketAvatar {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    scene.add(this.group);

    const loco = makeLoco();
    loco.group.position.y = -RIDE;
    this.body.add(loco.group);
    this.loco = loco;

    // Before the application layer creates data you are just an engine with
    // its lamp on: the spark of a request.
    this.spark = loco.headlamp;

    this.light = new THREE.PointLight('#ffd9a0', 9, 14, 1.6);
    this.light.position.set(0, 0.6, 2.2);
    this.body.add(this.light);

    // The wagons live in world space and follow the loco's trail.
    this.consist = new THREE.Group();
    scene.add(this.consist);
    this.cars = new Map();
    this.trail = [];
    this.heading = 0;
    this.wheelSpin = 0;
    this.steam = new Steam(scene, 70);
    this.steamTimer = 0;
    this.sparks = [];
    this.bitsMode = false;
    this.bitTimer = 0;
    this.lastPos = new THREE.Vector3();

    this.tag = makeLabel('you', { size: 0.5, color: '#fff' });
    this.tag.position.y = 2.2;
    this.group.add(this.tag);
  }

  get position() {
    return this.group.position;
  }

  async addLayer(layer) {
    await this.couple(layer);
    if (layer === 'link') await this.couple('fcs');
  }

  async couple(layer) {
    if (this.cars.has(layer)) return;
    const spec = WAGONS[layer];
    const color = spec.color ?? LAYERS[layer].color;
    const wagon = makeWagon({ ...spec, color });
    this.consist.add(wagon.group);
    const car = { layer, ...wagon, slot: null, drop: 0 };
    this.cars.set(layer, car);
    // Pop the new wagon in where it belongs, then let the others shuffle back.
    wagon.group.scale.setScalar(0.01);
    await tween(0.6, (k) => wagon.group.scale.setScalar(Math.max(0.01, k)), ease.back);
  }

  async removeLayer(layer) {
    // Take the cars off the train at once so a quick re-couple can't race them.
    const cars = [layer, ...(layer === 'link' ? ['fcs'] : [])].map((l) => this.cars.get(l)).filter(Boolean);
    for (const car of cars) this.cars.delete(car.layer);
    await Promise.all(cars.map((car) => this.uncouple(car)));
  }

  async uncouple(car) {
    // The wagon rolls off sideways onto a siding and fades out.
    const g = car.group;
    const side = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading)).multiplyScalar(4);
    const start = g.position.clone();
    const mats = [];
    g.traverse((o) => {
      if (o.material && !Array.isArray(o.material)) {
        o.material = o.material.clone();
        o.material.transparent = true;
        mats.push(o.material);
      } else if (Array.isArray(o.material)) {
        o.material = o.material.map((m) => { const c = m.clone(); c.transparent = true; mats.push(c); return c; });
      }
    });
    await tween(0.7, (k) => {
      g.position.copy(start).addScaledVector(side, k);
      g.position.y = start.y + Math.sin(k * Math.PI) * 0.6;
      for (const m of mats) m.opacity = 1 - k;
    }, ease.out);
    this.consist.remove(g);
  }

  reset() {
    for (const layer of [...this.cars.keys()]) {
      this.consist.remove(this.cars.get(layer).group);
      this.cars.delete(layer);
    }
    this.trail.length = 0;
  }

  setBits(on) {
    this.bitsMode = on;
  }

  // For the crash effect: every car as a free-standing copy at its place.
  snapshot() {
    const copies = [];
    const loco = this.loco.group.clone();
    loco.applyMatrix4(this.body.matrixWorld);
    copies.push(loco);
    for (const car of this.cars.values()) {
      const c = car.group.clone();
      c.position.copy(car.group.position);
      c.quaternion.copy(car.group.quaternion);
      copies.push(c);
    }
    return copies;
  }

  // Where the trail says a point `dist` behind the loco is, with its heading.
  sampleTrail(dist, out) {
    const p = this.group.position;
    let prev = p;
    let left = dist;
    for (const q of this.trail) {
      const d = prev.distanceTo(q);
      if (d >= left && d > 0) {
        out.pos.lerpVectors(prev, q, left / d);
        out.dir.subVectors(prev, q).normalize();
        return out;
      }
      left -= d;
      prev = q;
    }
    // Trail too short: carry on straight behind the last known point.
    const back = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const last = this.trail.length ? this.trail[this.trail.length - 1] : p;
    const before = this.trail.length > 1 ? this.trail[this.trail.length - 2] : p;
    if (last !== before && last.distanceTo(before) > 0.01) back.subVectors(last, before).normalize();
    out.pos.copy(last).addScaledVector(back, left);
    out.dir.copy(back).negate();
    return out;
  }

  update(dt, t, moveDir) {
    const p = this.group.position;
    const moved = p.distanceTo(this.lastPos);
    if (moved > 5) this.trail.length = 0; // teleported
    this.lastPos.copy(p);

    if (moveDir && moveDir.lengthSq() > 0.0001) {
      const target = Math.atan2(moveDir.x, moveDir.z);
      let diff = target - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * 8);
    }
    this.body.rotation.y = this.heading;
    const speed = moved / Math.max(dt, 1e-4);
    this.body.position.y = speed > 0.5 ? Math.sin(t * 30) * 0.02 : 0;

    // record the trail
    if (!this.trail.length || this.trail[0].distanceTo(p) > 0.25) {
      this.trail.unshift(p.clone());
      if (this.trail.length > 160) this.trail.pop();
    }

    // wheels
    this.wheelSpin += moved / 0.4;
    for (const w of this.loco.wheels) {
      if (w.geometry.type === 'BoxGeometry') {
        w.position.y = 0.5 + Math.sin(this.wheelSpin) * 0.18;
        w.position.z = 0.4 + Math.cos(this.wheelSpin) * 0.18;
      } else {
        w.rotation.x = this.wheelSpin;
      }
    }

    // cars follow the trail, each slot sliding smoothly when the train changes
    const tmp = { pos: new THREE.Vector3(), dir: new THREE.Vector3() };
    let dist = LOCO_BACK + SPACING;
    this.consist.visible = this.body.visible;
    for (const layer of ORDER) {
      const car = this.cars.get(layer);
      if (!car) continue;
      const want = dist + car.len / 2;
      car.slot = car.slot === null ? want : THREE.MathUtils.lerp(car.slot, want, Math.min(1, dt * 5));
      this.sampleTrail(car.slot, tmp);
      car.group.position.set(tmp.pos.x, tmp.pos.y - RIDE, tmp.pos.z);
      if (tmp.dir.lengthSq() > 0) {
        const flat = Math.hypot(tmp.dir.x, tmp.dir.z);
        car.group.rotation.set(0, 0, 0);
        car.group.rotation.order = 'YXZ';
        car.group.rotation.y = Math.atan2(tmp.dir.x, tmp.dir.z);
        car.group.rotation.x = -Math.atan2(tmp.dir.y, flat);
      }
      for (const w of car.wheels) w.rotation.x = this.wheelSpin * 1.4;
      dist += car.len + SPACING;
    }

    // steam from the chimney, more when moving
    this.steamTimer -= dt;
    if (this.body.visible && this.steamTimer <= 0) {
      this.steamTimer = speed > 1 ? 0.07 : 0.35;
      const tip = this.loco.chimneyTip.clone();
      tip.y -= RIDE;
      this.body.localToWorld(tip);
      this.steam.emit(tip, { size: speed > 1 ? 0.8 : 0.5, rise: 1.8 });
    }
    this.steam.update(dt);

    // on the wire: sparks fly off the wheels
    if (this.bitsMode) {
      this.bitTimer -= dt;
      if (this.bitTimer <= 0) {
        this.bitTimer = 0.03;
        this.spawnBit();
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const b = this.sparks[i];
      b.userData.life -= dt * 1.6;
      b.userData.v.y -= 9 * dt;
      b.position.addScaledVector(b.userData.v, dt);
      b.material.opacity = Math.max(0, b.userData.life);
      if (b.userData.life <= 0) {
        this.scene.remove(b);
        b.material.dispose();
        this.sparks.splice(i, 1);
      }
    }
  }

  spawnBit() {
    const on = Math.random() > 0.5;
    const b = new THREE.Mesh(
      sparkGeo,
      new THREE.MeshBasicMaterial({ color: on ? '#ffd27a' : '#4be1ff', transparent: true }),
    );
    const side = Math.random() > 0.5 ? 0.6 : -0.6;
    const local = new THREE.Vector3(side, -RIDE + 0.2, (Math.random() - 0.5) * 2);
    this.body.localToWorld(local);
    b.position.copy(local);
    b.userData.life = 1;
    b.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3);
    this.scene.add(b);
    this.sparks.push(b);
  }
}

const sparkGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
