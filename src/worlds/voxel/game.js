import { SCENARIO, bestKey } from '../../shared/scenarios.js';
import * as THREE from 'three';
import { STATIONS, ROUTES, LAYERS } from '../../shared/content.js';
import {
  buildWorld, heightAt, nodePosition, EXPLORE_HALF_WIDTH, SIDE_BOUNDS, SPAWN, NETWORK_EDGE, GATE_X,
} from './world.js';
import { PacketAvatar } from './packet.js';
import { UI } from './ui.js';
import { tween, updateTweens, wait, ease } from '../../shared/tween.js';
import { makeLabel } from './labels.js';
import { sfx } from './sound.js';
import { RouterRush } from './rush.js';

const BEST_KEY = bestKey(SCENARIO.id);
const ORB_RADIUS = 1.8;
const CHEST_RADIUS = 2.4;
const JUMP_TIME = 0.6;

const WALK_SPEED = 12;
const HOVER = 1.4;
const INTERACT_RADIUS = 5.5;
const PEDESTAL_RADIUS = 2.6;
const MAX_SCORE = STATIONS.flatMap((s) => s.steps).filter((s) => s.type !== 'info').length * 100;

export class Game {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 800);
    this.world = buildWorld(this.scene);
    this.packet = new PacketAvatar(this.scene);

    this.ui = new UI({
      onStart: () => this.start(),
      onRestart: () => window.location.reload(),
      onInteract: () => this.tryInteract(),
      onRush: (from) => this.startRush(from),
      onTime: () => this.cycleTime(),
    });
    this.rush = new RouterRush({
      onExit: () => this.exitRush(),
      onCorrect: () => this.flashRandomRouter(),
    });

    this.cam = { yaw: -Math.PI / 2 + 0.45, pitch: 0.42, dist: 17, target: new THREE.Vector3() };
    this.keys = new Set();
    this.moveTarget = null;
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.time = 0;

    this.state = {
      mode: 'intro',
      side: 'sender',
      stationIndex: 0,
      packet: {},
      score: 0,
      mistakes: 0,
      startedAt: 0,
      results: [],
    };
    this.after = null;

    this.placeAt(SPAWN.sender);
    this.snapCamera();
    this.ui.renderPacket(this.state.packet);
    this.ui.setScore(0, MAX_SCORE);
    this.bindInput();
    this.updateBeacons();
    window.addEventListener('resize', () => this.onResize());
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ------------------------------------------------------------ API for content
  get api() {
    return {
      toast: (msg) => this.ui.toast(msg),
      setLayer: (layer, fields) => this.setLayer(layer, fields),
      removeLayer: (layer) => this.removeLayer(layer),
      startNetwork: () => { this.after = () => this.flyFromSender(); },
      routerArrive: (index, patch) => this.routerArrive(index, patch),
      routeTo: (index, next) => { this.after = () => this.flyToNextHop(index, next); },
      finish: () => { this.after = () => this.finale(); },
      retransmit: () => { this.after = () => this.flyRetransmit(); },
      fx: {
        handshake: (flag, dir) => this.fxHandshake(flag, dir),
        broadcast: () => this.fxBroadcast(),
      },
    };
  }

  setLayer(layer, fields) {
    this.state.packet = { ...this.state.packet, [layer]: fields };
    this.ui.renderPacket(this.state.packet);
    this.packet.addLayer(layer);
  }

  patchLayer(layer, fields) {
    this.state.packet = { ...this.state.packet, [layer]: { ...this.state.packet[layer], ...fields } };
    this.ui.renderPacket(this.state.packet);
  }

  removeLayer(layer) {
    const { [layer]: _removed, ...rest } = this.state.packet;
    this.state.packet = rest;
    this.ui.renderPacket(this.state.packet);
    return this.packet.removeLayer(layer);
  }

  // --------------------------------------------------------------- game flow
  get station() {
    return STATIONS[this.state.stationIndex];
  }

  start() {
    sfx.unlock();
    this.ui.hideIntro();
    this.state.mode = 'walk';
    this.state.startedAt = performance.now();
    this.refreshObjective();
  }

  refreshObjective() {
    const st = this.station;
    if (st) this.ui.setObjective(st.objective);
    this.updateBeacons();
  }

  updateBeacons() {
    for (const [id, s] of this.world.stations) s.beacon.visible = this.station?.id === id;
    for (const [id, r] of this.world.routers) r.beacon.visible = this.station?.router === id;
  }

  tryInteract() {
    if (this.state.mode !== 'walk') return;
    const st = this.station;
    if (!st || st.side === 'network') return;
    if (this.distanceToStation(st.id) <= INTERACT_RADIUS) this.openStation();
  }

  distanceToStation(id) {
    const s = this.world.stations.get(id);
    if (!s) return Infinity;
    const p = this.packet.position;
    return Math.hypot(p.x - s.position.x, p.z - s.position.z);
  }

  async openStation() {
    const st = this.station;
    this.state.mode = 'panel';
    this.ui.showPrompt(null);
    this.ui.setActiveLayer(st.layer);
    if (st.side === 'network') this.ui.setObjective(st.router ? `${st.title}: choose the next hop` : st.objective);
    this.moveTarget = null;
    this.keys.clear();
    await this.ui.runStation(st, {
      onEnter: (step) => step.onEnter?.(this.api),
      onSolve: (step) => step.onSolve?.(this.api),
      onScore: (points, mistakes, step) => {
        this.state.results.push({ topic: step.topic, layer: st.layer, mistakes });
        this.state.score += points;
        this.ui.setScore(this.state.score, MAX_SCORE);
      },
      onMistake: () => { this.state.mistakes++; },
    });
    this.completeStation(st);
  }

  completeStation(st) {
    const s = this.world.stations.get(st.id);
    if (s) {
      s.icon.material.color.set('#ffffff');
      s.icon.material.emissive.set('#9fffc8');
    }
    this.state.stationIndex++;
    if (GATE_X[st.id] !== undefined && st.id !== 'send-link') this.openGate(st.id);
    this.refreshObjective();
    const after = this.after;
    this.after = null;
    if (after) after();
    else this.state.mode = 'walk';
  }

  async openGate(id) {
    const gate = this.world.gates.get(id);
    gate.open = true;
    sfx.gate();
    this.ui.toast(this.state.side === 'sender' ? 'Gate open! Go down the ramp to the next layer.' : 'Gate open! Climb up to the next layer.');
    await tween(0.8, (k) => { gate.group.scale.y = Math.max(0.001, 1 - k); }, ease.inOut);
    gate.group.visible = false;
  }

  // ----------------------------------------------------------- network flight
  async travel(points, speed = 14, cable = null) {
    const start = this.packet.position.clone();
    const pts = [start, ...points];
    const lens = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = pts[i].distanceTo(pts[i - 1]);
      lens.push(l);
      total += l;
    }
    if (cable) cable.material.color.set('#ffffff');
    const dir = new THREE.Vector3();
    await tween(total / speed, (k) => {
      let d = k * total;
      let i = 0;
      while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
      const t = lens[i] ? d / lens[i] : 1;
      dir.subVectors(pts[i + 1], pts[i]);
      this.packet.position.lerpVectors(pts[i], pts[i + 1], t);
      this.moveDir = dir;
    }, ease.inOut);
    this.moveDir = null;
    if (cable) cable.material.color.set('#4be1ff');
  }

  cableBetween(a, b) {
    return this.world.cables.get(`${a}-${b}`) ?? this.world.cables.get(`${b}-${a}`);
  }

  async flyFromSender() {
    this.state.mode = 'cinematic';
    this.ui.setObjective('Riding the wire as bits…');
    this.packet.setBits(true);
    sfx.whoosh();
    const edge = NETWORK_EDGE.sender.clone().setY(HOVER);
    await this.travel([edge], 12);
    await this.travel([nodePosition('GW').add(new THREE.Vector3(0, 1.5, 0))], 16, this.world.cables.get('LAN-GW'));
    this.packet.setBits(false);
    this.openStation();
  }

  async routerArrive(index, patch) {
    await this.removeLayer('link');
    this.patchLayer('internet', { ...patch, ttl: this.state.packet.internet.ttl - 1 });
    this.ui.toast(`TTL lowered to ${this.state.packet.internet.ttl}`);
  }

  async flyToNextHop(index, next) {
    this.state.mode = 'cinematic';
    const from = ROUTES[index].id;
    this.setLayer('link', { ...ROUTES[index].frame, type: 'IPv4', fcs: 'OK' });
    this.ui.setObjective(`Forwarding to ${next === 'SW' ? 'the server LAN' : next}…`);
    await wait(0.5);
    this.packet.setBits(true);
    sfx.whoosh();
    const up = new THREE.Vector3(0, 1.5, 0);
    const cable = this.cableBetween(from, next);
    if (this.station?.id === 'net-loss') {
      // The link is congested: the packet gets dropped halfway.
      const mid = nodePosition(from).add(up).lerp(nodePosition(next).add(up), 0.55);
      await this.travel([mid], 16, cable);
      this.packet.setBits(false);
      cable.material.color.set('#ff5d73');
      this.ui.toast('Queue full at R4: packet dropped!');
      await this.fxShatter();
      this.openStation();
      return;
    }
    await this.travel([nodePosition(next).add(up)], 16, cable);
    if (next === 'SW') {
      const spawn = SPAWN.receiver.clone().setY(heightAt(SPAWN.receiver.x) + HOVER);
      await this.travel([NETWORK_EDGE.receiver.clone().setY(HOVER), spawn], 12, this.world.cables.get('SW-LAN'));
      this.packet.setBits(false);
      this.state.side = 'receiver';
      this.state.mode = 'walk';
      this.refreshObjective();
      return;
    }
    this.packet.setBits(false);
    this.openStation();
  }

  async flyRetransmit() {
    this.state.mode = 'cinematic';
    this.ui.setObjective('Retransmitting…');
    const up = new THREE.Vector3(0, 1.5, 0);
    this.packet.position.copy(nodePosition('GW').add(up));
    this.packet.body.visible = true;
    this.packet.tag.visible = true;
    this.packet.body.scale.setScalar(0.01);
    await tween(0.4, (k) => this.packet.body.scale.setScalar(Math.max(0.01, k)), ease.back);
    this.packet.setBits(true);
    sfx.whoosh();
    await this.travel([nodePosition('R1').add(up)], 26, this.cableBetween('GW', 'R1'));
    await this.travel([nodePosition('R4').add(up)], 18, this.cableBetween('R1', 'R4'));
    this.packet.setBits(false);
    this.openStation();
  }

  async finale() {
    this.state.mode = 'done';
    this.ui.setObjective(`Mission complete! Now ${SCENARIO.item} travels back to Alice.`);
    const seconds = (performance.now() - this.state.startedAt) / 1000;
    sfx.fanfare();
    let best = 0;
    try {
      best = Math.max(Number(localStorage.getItem(BEST_KEY)) || 0, this.state.score);
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      best = this.state.score;
    }
    this.cinematicCam = { pos: new THREE.Vector3(10, 70, 110), look: new THREE.Vector3(10, 0, 0) };

    const reply = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.2, 24, 16), new THREE.MeshStandardMaterial({ color: '#ff6fb5', emissive: '#ff6fb5', emissiveIntensity: 0.9 }));
    const tag = makeLabel(`${SCENARIO.emoji} 200 OK`, { size: 1.4, color: '#fff', border: '#ff6fb5' });
    tag.position.y = 2.6;
    reply.add(ball, tag, new THREE.PointLight('#ff6fb5', 30, 20, 1.5));
    this.scene.add(reply);

    const xs = [140, 132, 117, 104, 91, 78, 65, 52];
    const route = xs.map((x) => new THREE.Vector3(x, heightAt(x) + 2, 0));
    for (const id of ['SW', 'R4', 'R1', 'GW']) route.push(nodePosition(id).add(new THREE.Vector3(0, 2, 0)));
    for (const x of [-10, -23, -38, -53, -68, -83, -100, -118]) route.push(new THREE.Vector3(x, heightAt(x) + 2, 0));
    const curve = new THREE.CatmullRomCurve3(route);
    await tween(7, (k) => reply.position.copy(curve.getPointAt(k)), ease.inOut);
    this.ui.showEnd({
      score: this.state.score, max: MAX_SCORE, mistakes: this.state.mistakes, seconds, results: this.state.results, best,
    });
  }

  // ------------------------------------------------------------ router rush
  startRush(from) {
    this.rushReturn = { from, mode: this.state.mode, cam: this.cinematicCam };
    document.querySelector(from === 'intro' ? '#intro' : '#end').hidden = true;
    this.state.mode = 'rush';
    this.cinematicCam = { pos: new THREE.Vector3(), look: new THREE.Vector3(21, 0, 0) };
    this.rush.start();
  }

  exitRush() {
    const { from, mode, cam } = this.rushReturn;
    this.state.mode = mode;
    this.cinematicCam = cam;
    document.querySelector(from === 'intro' ? '#intro' : '#end').hidden = false;
  }

  async flashRandomRouter() {
    const routers = [...this.world.routers.values()];
    const r = routers[Math.floor(Math.random() * routers.length)];
    r.beacon.visible = true;
    await wait(0.5);
    r.beacon.visible = this.station?.router === r.id;
  }

  // ---------------------------------------------------------------- effects
  async fxShatter() {
    sfx.drop();
    const origin = this.packet.position.clone();
    this.packet.body.visible = false;
    this.packet.tag.visible = false;
    const colors = ['#b56cff', '#ff8a3d', '#35d07f', '#3d9bff', '#ffffff'];
    const shards = Array.from({ length: 36 }, (_, i) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.25, 0.25),
        new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true }),
      );
      m.position.copy(origin);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 8, (Math.random() - 0.5) * 10);
      this.scene.add(m);
      return m;
    });
    let last = 0;
    await tween(1.6, (k, raw) => {
      const dt = (raw - last) * 1.6;
      last = raw;
      for (const m of shards) {
        m.userData.v.y -= 18 * dt;
        m.position.addScaledVector(m.userData.v, dt);
        m.rotation.x += dt * 6;
        m.material.opacity = 1 - raw;
      }
    }, ease.linear);
    shards.forEach((m) => this.scene.remove(m));
  }

  async fxHandshake(flag, dir) {
    const color = dir === 'out' ? LAYERS.transport.color : '#4be1ff';
    const token = makeLabel(flag, { size: 1.2, color: '#fff', bg: color });
    const near = this.packet.position.clone().add(new THREE.Vector3(0, 2, 0));
    const far = near.clone().add(new THREE.Vector3(60, 14, 0));
    const [a, b] = dir === 'out' ? [near, far] : [far, near];
    this.scene.add(token);
    this.ui.toast(dir === 'out' ? `You → server: ${flag}` : `Server → you: ${flag}`);
    await tween(1.4, (k) => {
      token.position.lerpVectors(a, b, k);
      token.position.y += Math.sin(k * Math.PI) * 6;
      token.material.opacity = dir === 'out' ? 1 - k * 0.8 : 0.2 + k * 0.8;
    }, ease.inOut);
    this.scene.remove(token);
  }

  async fxBroadcast() {
    this.ui.toast('ARP: "Who has 192.168.1.1?" → everyone');
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 64), new THREE.MeshBasicMaterial({ color: LAYERS.link.color, transparent: true }));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(this.packet.position);
    this.scene.add(ring);
    await tween(1.4, (k) => {
      ring.scale.setScalar(1 + k * 18);
      ring.material.opacity = 1 - k;
    }, ease.out);
    this.scene.remove(ring);
    this.ui.toast('Home router: "192.168.1.1 is at f0:9f:c2:0a:11:01"');
  }

  // ----------------------------------------------------------------- input
  bindInput() {
    const canvas = this.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('#panel')) return;
      const k = e.key.toLowerCase();
      if (k === 'g' && ['walk', 'panel', 'cinematic'].includes(this.state.mode)) this.ui.toggleGlossary();
      if (k === 'escape') this.ui.toggleGlossary(false);
      if (this.ui.glossaryOpen) return;
      if (k === 'e' || k === 'enter') this.tryInteract();
      if (k === 't' && this.state.mode !== 'rush') this.cycleTime();
      if (k === ' ' && this.state.mode === 'walk') {
        if (!this.jumpTimer) sfx.jump();
        this.jumpTimer = JUMP_TIME;
        e.preventDefault();
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        this.moveTarget = null;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    let down = null;
    canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, yaw: this.cam.yaw, pitch: this.cam.pitch, dragged: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) down.dragged = true;
      if (down.dragged) {
        this.cam.yaw = down.yaw - dx * 0.005;
        this.cam.pitch = THREE.MathUtils.clamp(down.pitch + dy * 0.004, 0.08, 1.35);
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (down && !down.dragged) this.onClick(e);
      down = null;
    });
    canvas.addEventListener('wheel', (e) => {
      this.cam.dist = THREE.MathUtils.clamp(this.cam.dist + e.deltaY * 0.02, 7, 45);
    }, { passive: true });
  }

  onClick(e) {
    if (this.state.mode !== 'walk') return;
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const st = this.station;
    const stEntry = st && this.world.stations.get(st.id);
    if (stEntry && this.raycaster.intersectObjects(stEntry.clickTargets, false).length) {
      if (this.distanceToStation(st.id) <= INTERACT_RADIUS) this.openStation();
      else this.moveTarget = stEntry.position.clone().setZ(-1.5);
      return;
    }
    const hit = this.raycaster.intersectObjects(this.world.walkables, false)[0];
    if (hit) this.moveTarget = hit.point.clone();
  }

  // ------------------------------------------------------------- movement
  placeAt(v) {
    this.packet.position.set(v.x, heightAt(v.x) + HOVER, v.z);
    this.feet = null;
  }

  walkBounds() {
    const side = this.state.side;
    let [minX, maxX] = SIDE_BOUNDS[side];
    for (const [id, gate] of this.world.gates) {
      const onSide = STATIONS.find((s) => s.id === id).side === side;
      if (onSide && !gate.open && gate.x > this.packet.position.x) maxX = Math.min(maxX, gate.x - 1.2);
    }
    return [minX, maxX];
  }

  walk(dt) {
    const input = new THREE.Vector3();
    const f = new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) input.add(f);
    if (k.has('s') || k.has('arrowdown')) input.sub(f);
    if (k.has('d') || k.has('arrowright')) input.add(r);
    if (k.has('a') || k.has('arrowleft')) input.sub(r);

    const p = this.packet.position;
    if (input.lengthSq() === 0 && this.moveTarget) {
      input.set(this.moveTarget.x - p.x, 0, this.moveTarget.z - p.z);
      if (input.length() < 0.4) {
        this.moveTarget = null;
        input.set(0, 0, 0);
      }
    }
    if (input.lengthSq() > 0) input.normalize().multiplyScalar(WALK_SPEED * dt);
    this.moveDir = input.clone();

    const ground = this.world.ground;
    if (this.feet == null) this.feet = ground.terrain(p.x, p.z);
    const [minX, maxX] = this.walkBounds();
    const nx = THREE.MathUtils.clamp(p.x + input.x, minX, maxX);
    const nz = THREE.MathUtils.clamp(p.z + input.z, -EXPLORE_HALF_WIDTH, EXPLORE_HALF_WIDTH);
    // Block-world movement: climb up to two blocks, drop down any height,
    // slide along walls and never walk into the sea.
    const dir = input.clone().normalize();
    const tryMove = (x, z) => {
      const maxUp = this.jumpTimer > 0 ? 4 : 2;
      const g = ground.step(x, z, this.feet, maxUp);
      if (g === null) return null;
      const probe = ground.step(x + dir.x * 0.45, z + dir.z * 0.45, this.feet, maxUp);
      return probe === null ? null : g;
    };
    let moved = false;
    if (input.lengthSq() > 0) {
      for (const [x, z] of [[nx, nz], [nx, p.z], [p.x, nz]]) {
        if (x === p.x && z === p.z) continue;
        const g = tryMove(x, z);
        if (g !== null) {
          p.x = x;
          p.z = z;
          this.feet = g;
          moved = true;
          break;
        }
      }
    }
    if (this.moveTarget && !moved) this.moveTarget = null;

    // keep out of the pedestals
    for (const s of this.world.stations.values()) {
      const dx = p.x - s.position.x;
      const dz = p.z - s.position.z;
      const d = Math.hypot(dx, dz);
      if (d < PEDESTAL_RADIUS && d > 0.0001) {
        p.x = s.position.x + (dx / d) * PEDESTAL_RADIUS;
        p.z = s.position.z + (dz / d) * PEDESTAL_RADIUS;
      }
    }
    this.jumpTimer = Math.max(0, (this.jumpTimer ?? 0) - dt);
    const hop = this.jumpTimer > 0 ? Math.sin((this.jumpTimer / JUMP_TIME) * Math.PI) * 2.2 : 0;
    p.y = THREE.MathUtils.lerp(p.y, this.feet + HOVER + hop, Math.min(1, dt * 12));

    for (const orb of this.world.orbs.values()) {
      if (!orb.collected && Math.hypot(p.x - orb.group.position.x, p.z - orb.group.position.z) < ORB_RADIUS) this.collectOrb(orb);
    }
    for (const chest of this.world.chests.values()) {
      if (!chest.opened && Math.hypot(p.x - chest.group.position.x, p.z - chest.group.position.z) < CHEST_RADIUS) this.openChest(chest);
    }

    const st = this.station;
    const near = st && st.side !== 'network' && this.distanceToStation(st.id) <= INTERACT_RADIUS;
    this.ui.showPrompt(near ? st.title : null);
    this.ui.setActiveLayer(this.layerAt(p.x));
  }

  async collectOrb(orb) {
    orb.collected = true;
    sfx.collect();
    this.ui.collect(orb.entry.id);
    this.ui.toast(`📖 New card: ${orb.entry.term} (press G or tap 📖)`);
    const start = orb.group.scale.x;
    await tween(0.5, (k) => {
      orb.group.scale.setScalar(start * (1 + k * 1.5));
      orb.gem.material.opacity = 1 - k;
      orb.halo.material.opacity = 1 - k;
    }, ease.out);
    orb.group.visible = false;
  }

  async openChest(chest) {
    chest.opened = true;
    sfx.collect();
    this.ui.collectSecret(chest.entry);
    await tween(0.6, (k) => { chest.lid.rotation.x = -k * 1.9; }, ease.back);
  }

  cycleTime() {
    const name = this.world.sky.cycle();
    this.ui.setTime(name);
  }

  layerAt(x) {
    if (this.state.mode === 'cinematic' || (x > 0 && x < 44)) return 'internet';
    const cuts = this.state.side === 'sender'
      ? [[-83, 'app'], [-53, 'transport'], [-23, 'internet'], [Infinity, 'link']]
      : [[65, 'link'], [91, 'internet'], [117, 'transport'], [Infinity, 'app']];
    return cuts.find(([edge]) => x < edge)[1];
  }

  // --------------------------------------------------------------- camera
  cameraGoal() {
    const { yaw, pitch } = this.cam;
    const dist = this.state.mode === 'cinematic' ? Math.max(this.cam.dist, 24) : this.cam.dist;
    const target = this.packet.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    if (this.state.mode === 'panel') target.z -= 2;
    const offset = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
    return { pos: target.clone().add(offset), look: target };
  }

  snapCamera() {
    const { pos, look } = this.cameraGoal();
    this.camera.position.copy(pos);
    this.cam.target.copy(look);
    this.camera.lookAt(look);
  }

  updateCamera(dt) {
    const goal = this.cinematicCam ?? this.cameraGoal();
    const k = 1 - Math.exp(-dt * (this.cinematicCam ? 1.5 : 6));
    this.camera.position.lerp(goal.pos, k);
    // keep the camera above the blocks when you look back towards a hill
    const floor = this.world.ground.surface(this.camera.position.x, this.camera.position.z) + 1.2;
    if (!this.cinematicCam && this.camera.position.y < floor) this.camera.position.y = floor;
    this.cam.target.lerp(goal.look, k);
    this.camera.lookAt(this.cam.target);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    updateTweens(dt);
    if (this.state.mode === 'walk') this.walk(dt);
    else {
      this.ui.showPrompt(null);
      this.feet = null;
    }
    this.packet.update(dt, this.time, this.moveDir);
    this.world.update(this.time, dt, this.packet.position, this.camera);
    if (this.state.mode === 'rush') {
      const a = this.time * 0.12;
      this.cinematicCam.pos.set(21 + Math.cos(a) * 55, 32, Math.sin(a) * 55);
    }
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

