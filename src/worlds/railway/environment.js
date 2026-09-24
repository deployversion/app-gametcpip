import { SCENARIO } from '../../shared/scenarios.js';
import * as THREE from 'three';
import { LAYERS, NET } from '../../shared/content.js';
import { makeLabel } from '../../shared/labels.js';
import { mat, glowMat, canvasTexture, makeTrack, makeLoco, makeWagon, Steam } from './trains.js';

// Railway scenery for every layer plateau. Each plateau is a station on the
// line, and each layer is a different kind of railway place:
//   Application · the grand terminal, with a departures board of ports
//   Transport   · the freight yard, where cargo is split into numbered wagons
//   Internet    · the junction and its signal box, where routes are chosen
//   Link        · the engine shed and the local line, bits on the wire
//
// Each builder adds meshes to `ctx.group`, animations to `ctx.animated` and
// circular colliders ({ x, z, r }) to `ctx.colliders` for props inside the
// walkable strip (|z| <= 12.5).
//
// Layout convention: z < 0 is the far side (behind the stations, tall props
// are fine), z > 0 is the camera side (keep props low so they never hide the
// train).

export const DECK_HALF = 18;

const rand = (a, b) => a + Math.random() * (b - a);

function brickTexture(base = '#8a4b3a', rows = 16) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5c3a30';
    ctx.fillRect(0, 0, w, h);
    const bh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 8;
      for (let x = -off; x < w; x += 16) {
        const c = new THREE.Color(base).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
        ctx.fillStyle = `#${c.getHexString()}`;
        ctx.fillRect(x + 1, r * bh + 1, 14, bh - 2);
      }
    }
  });
}

// Arched, warmly lit window with glazing bars.
function archWindowTexture() {
  return canvasTexture(64, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(4, h - 4);
    ctx.lineTo(4, 32);
    ctx.arc(32, 32, 28, Math.PI, 0);
    ctx.lineTo(60, h - 4);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffe7a8');
    g.addColorStop(1, '#ffb45a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#3b2a22';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, 4); ctx.lineTo(32, h - 4);
    for (let y = 48; y < h; y += 26) { ctx.moveTo(4, y); ctx.lineTo(60, y); }
    ctx.stroke();
  });
}

function signTexture(lines, { bg = '#14305e', fg = '#ffffff', w = 512, h = 128, font = 'bold 56px', border = '#ffffff' } = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = border;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((l, i) => {
      ctx.font = `${i === 0 ? font : '600 30px'} "Segoe UI", sans-serif`;
      ctx.fillText(l, w / 2, h * ((i + 0.5) / n) + (n > 1 ? (i === 0 ? 6 : -4) : 0));
    });
  });
}

function plane(w, h, texOrMat) {
  const m = texOrMat.isMaterial ? texOrMat : new THREE.MeshStandardMaterial({ map: texOrMat, roughness: 0.7 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

// A pitched roof: triangle prism running along x.
function pitchedRoof(len, width, height, color = '#3a3440') {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(0, height);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  geo.translate(0, 0, -len / 2);
  geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat(color, { roughness: 0.8 }));
  m.castShadow = true;
  return m;
}

// A brick building along x with a row of lit arched windows on its +z face.
function building(ctx, { x, z, h, len, depth, height, brick = '#8a4b3a', windows = true, roof = '#3a3440' }) {
  const tex = brickTexture(brick);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(len / 4, height / 4);
  const box = new THREE.Mesh(new THREE.BoxGeometry(len, height, depth), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  box.position.set(x, h + height / 2, z);
  box.castShadow = true;
  box.receiveShadow = true;
  ctx.group.add(box);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, 0.4, depth + 0.4), mat('#d9c9a8'));
  cornice.position.set(x, h + height, z);
  ctx.group.add(cornice);
  const r = pitchedRoof(len + 0.6, depth + 0.8, Math.min(3, depth * 0.6), roof);
  r.position.set(x, h + height + 0.2, z);
  ctx.group.add(r);
  if (windows) {
    const wm = new THREE.MeshStandardMaterial({ map: archWindowTexture(), transparent: true, emissive: '#ffb45a', emissiveMap: archWindowTexture(), emissiveIntensity: 0.9, alphaTest: 0.1 });
    const n = Math.floor(len / 3.2);
    for (let i = 0; i < n; i++) {
      const w = plane(1.3, Math.min(3.2, height * 0.45), wm);
      w.position.set(x - len / 2 + (i + 0.5) * (len / n), h + height * 0.5, z + depth / 2 + 0.02);
      ctx.group.add(w);
    }
  }
  return box;
}

function lamp(ctx, x, h, z) {
  ctx.lamps.push(new THREE.Vector3(x, h, z));
}

function bench(ctx, x, h, z, rotY = 0) {
  const g = new THREE.Group();
  const wood = mat('#8a5a34', { roughness: 0.9 });
  const iron = mat('#2a2a30', { metalness: 0.6 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.6), wood);
  seat.position.y = 0.55;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.08), wood);
  back.position.set(0, 0.95, -0.28);
  g.add(seat, back);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.6), iron);
    leg.position.set(sx * 1.05, 0.28, 0);
    g.add(leg);
  }
  g.position.set(x, h, z);
  g.rotation.y = rotY;
  ctx.group.add(g);
  ctx.colliders.push({ x: x - 0.7, z, r: 0.7 }, { x: x + 0.7, z, r: 0.7 });
}

// ------------------------------------------------------------ application
// The grand terminal: brick façade, clock tower, iron canopy, and a
// departures board that lists ports as platforms.
function buildApplication(ctx, p, stationX) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  const w = p.x1 - p.x0;
  const h = p.h;
  const sender = p.side === 'sender';

  building(ctx, { x: cx, z: -16.5, h, len: w - 2, depth: 3, height: 8, brick: '#9a5a44' });

  // clock tower with a working clock
  const towerX = sender ? cx - 6 : cx - 7;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4.4, 17, 4.4), new THREE.MeshStandardMaterial({ map: brickTexture('#a0624a'), roughness: 0.9 }));
  tower.position.set(towerX, h + 8.5, -16.5);
  tower.castShadow = true;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5, 4), mat('#2f5a55', { metalness: 0.4 }));
  spire.rotation.y = Math.PI / 4;
  spire.position.set(towerX, h + 19.5, -16.5);
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshStandardMaterial({
    map: canvasTexture(256, 256, (c) => {
      c.fillStyle = '#fff6e0'; c.beginPath(); c.arc(128, 128, 124, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#2b2320'; c.lineWidth = 10; c.stroke();
      c.fillStyle = '#2b2320'; c.font = 'bold 30px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      ['XII', 'III', 'VI', 'IX'].forEach((n, i) => c.fillText(n, 128 + Math.sin(i * Math.PI / 2) * 92, 128 - Math.cos(i * Math.PI / 2) * 92));
    }),
    emissive: '#ffe2a0',
    emissiveIntensity: 0.45,
  }));
  face.position.set(towerX, h + 14.5, -14.27);
  const hand = (len, wdt) => {
    const geo = new THREE.BoxGeometry(wdt, len, 0.05);
    geo.translate(0, len / 2, 0);
    const m = new THREE.Mesh(geo, mat('#1b1512'));
    m.position.set(towerX, h + 14.5, -14.2);
    return m;
  };
  const hourHand = hand(0.9, 0.14);
  const minHand = hand(1.35, 0.09);
  group.add(tower, spire, face, hourHand, minHand);
  animated.push(() => {
    const d = new Date();
    const m = d.getMinutes() + d.getSeconds() / 60;
    minHand.rotation.z = -(m / 60) * Math.PI * 2;
    hourHand.rotation.z = -(((d.getHours() % 12) + m / 60) / 12) * Math.PI * 2;
  });

  // iron canopy on columns
  const iron = mat('#2d4a46', { metalness: 0.6, roughness: 0.4 });
  for (let x = p.x0 + 3; x < p.x1 - 1; x += 6) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 6.4, 10), iron);
    col.position.set(x, h + 3.2, -11.5);
    col.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 5), iron);
    cap.position.set(x, h + 6.4, -13.5);
    group.add(col, cap);
    ctx.colliders.push({ x, z: -11.5, r: 0.3 });
  }
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(w - 1, 0.12, 6.5),
    new THREE.MeshStandardMaterial({ color: '#cfe3e6', transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.3 }),
  );
  glass.position.set(cx, h + 6.6, -12.3);
  glass.rotation.x = -0.08;
  const valance = new THREE.Mesh(new THREE.BoxGeometry(w - 1, 0.5, 0.08), mat('#e8dcc0'));
  valance.position.set(cx, h + 6.35, -9.1);
  group.add(glass, valance);

  // the departures board: every "train" is a connection, the platform is the port
  const rows = sender
    ? [[SCENARIO.server, '443', 'BOARDING'], ['mail.example', '993', 'ON TIME'], ['dns resolver', '53', 'DEPARTED'], ['video.example', '443', 'ON TIME'], ['ssh admin box', '22', 'CANCELLED']]
    : [['192.168.1.20 (Alice)', '443', 'ARRIVING'], ['10.0.0.9 (admin)', '22', 'ON TIME'], ['monitoring', '443', 'ARRIVED'], ['198.51.100.7', '443', 'ARRIVING'], ['unknown host', '25', 'REFUSED']];
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1024;
  boardCanvas.height = 384;
  const bctx = boardCanvas.getContext('2d');
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  let flip = 0;
  const drawBoard = () => {
    bctx.fillStyle = '#0d0f14';
    bctx.fillRect(0, 0, 1024, 384);
    bctx.fillStyle = '#ffcf40';
    bctx.font = 'bold 44px monospace';
    bctx.fillText(sender ? 'DEPARTURES' : 'ARRIVALS', 28, 56);
    bctx.fillStyle = '#9aa0ad';
    bctx.font = '26px monospace';
    bctx.fillText(sender ? 'DESTINATION' : 'FROM', 28, 100);
    bctx.fillText('PLATFORM = PORT', 560, 100);
    bctx.fillText('STATUS', 820, 100);
    rows.forEach(([dest, port, status], i) => {
      const y = 148 + i * 50;
      bctx.fillStyle = i % 2 ? '#15181f' : '#1b1f28';
      bctx.fillRect(16, y - 36, 992, 46);
      bctx.fillStyle = '#ffd966';
      bctx.font = 'bold 32px monospace';
      bctx.fillText(dest, 28, y);
      bctx.fillText(port.padStart(4, ' '), 600, y);
      const blink = status === 'BOARDING' || status === 'ARRIVING';
      bctx.fillStyle = status === 'CANCELLED' || status === 'REFUSED' ? '#ff6b6b' : blink ? '#7dffa8' : '#ffd966';
      if (!blink || flip % 2 === 0) bctx.fillText(status, 820, y);
    });
    boardTex.needsUpdate = true;
  };
  drawBoard();
  const boardX = sender ? stationX + 8 : stationX - 8;
  const board = new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 0.25), [mat('#222'), mat('#222'), mat('#222'), mat('#222'),
    new THREE.MeshStandardMaterial({ map: boardTex, emissive: '#ffffff', emissiveMap: boardTex, emissiveIntensity: 0.55 }), mat('#222')]);
  board.position.set(boardX, h + 4.4, -10.2);
  group.add(board);
  for (const sx of [-2.8, 2.8]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6), iron);
    rod.position.set(boardX + sx, h + 6.1, -10.2);
    group.add(rod);
  }
  let acc = 0;
  animated.push((t, dt = 1 / 60) => {
    acc += dt;
    if (acc > 0.7) {
      acc = 0;
      flip++;
      drawBoard();
    }
  });

  // information kiosk: ask here which IP a name has
  const kx = sender ? p.x0 + 20 : p.x0 + 16;
  const kiosk = new THREE.Group();
  const kbody = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 2.4, 8), mat('#2d4a46', { metalness: 0.4 }));
  kbody.position.y = 1.2;
  const kroof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1, 8), mat('#b0343a'));
  kroof.position.y = 2.9;
  const ksign = makeLabel(sender ? `ℹ️ DNS enquiries\n${SCENARIO.server} = ?` : 'ℹ️ Porter\nHTTP 200 OK', { size: 0.42, color: '#fff', border: '#ffcf40' });
  ksign.position.y = 4;
  kiosk.add(kbody, kroof, ksign);
  kiosk.position.set(kx, h, 10.5);
  group.add(kiosk);
  ctx.colliders.push({ x: kx, z: 10.5, r: 1.3 });

  // benches and a luggage cart on the camera side
  for (const x of [p.x0 + 8, p.x1 - 7]) bench(ctx, x, h, 12, Math.PI);
  const cart = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 1.1), mat('#6b4a2e'));
  bed.position.y = 0.55;
  cart.add(bed);
  ['#b56cff', '#3d9bff', '#ff8a3d', '#35d07f'].forEach((c, i) => {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.45), mat(c));
    bag.position.set(-0.5 + (i % 2) * 0.9, 0.85 + Math.floor(i / 2) * 0.45, (i % 2) * 0.1);
    bag.rotation.y = i * 0.3;
    cart.add(bag);
  });
  const cartX = sender ? p.x1 - 12 : p.x0 + 26;
  cart.position.set(cartX, h, 11);
  group.add(cart);
  ctx.colliders.push({ x: cartX, z: 11, r: 1.1 });

  for (let x = p.x0 + 2; x <= p.x1 - 2; x += 7) {
    lamp(ctx, x, h, 16);
    lamp(ctx, x, h, -8.6);
  }
}

// ------------------------------------------------------------ transport
// The freight yard: cargo is split into numbered wagons (segments), containers
// wear their port numbers, and semaphore signals play out the handshake.
function buildTransport(ctx, p, stationX) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  const h = p.h;
  const color = LAYERS.transport.color;

  // two sidings on the far side
  for (const z of [-11.2, -15.5]) {
    const tr = makeTrack(new THREE.Vector3(p.x0 + 0.5, h + 0.14, z), new THREE.Vector3(p.x1 - 0.5, h + 0.14, z), { liveOpacity: 0 });
    group.add(tr.group);
  }
  // numbered segment wagons on the inner siding
  const seqs = [NET.clientIsn + 1, NET.clientIsn + 1 + NET.mss, NET.clientIsn + 1 + NET.mss * 2];
  const wagons = [];
  seqs.forEach((seq, i) => {
    const wg = makeWagon({ color, title: `SEQ ${seq}`, detail: `segment ${i + 1} of 3`, kind: 'box', len: 2.8 });
    wg.group.rotation.y = Math.PI / 2;
    const x = p.x0 + 3 + i * 3.2;
    wg.group.position.set(x, h + 0.2, -11.2);
    group.add(wg.group);
    wagons.push(wg.group);
    ctx.colliders.push({ x, z: -11.2, r: 1.5 });
  });
  // flatcars with containers labelled by port on the outer siding
  const ports = [[':443 HTTPS', '#c0392b'], [':80 HTTP', '#2471a3'], [':53 DNS', '#b7950b'], [':22 SSH', '#1e8449'], [':25 SMTP', '#7d3c98']];
  let x = p.x0 + 2.2;
  for (const [text, c] of ports) {
    if (x > p.x1 - 2) break;
    const flat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 1.5), mat('#2a2a30'));
    flat.position.set(x, h + 1, -15.5);
    const ctex = canvasTexture(256, 96, (c2, w2, h2) => {
      c2.fillStyle = c; c2.fillRect(0, 0, w2, h2);
      c2.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < w2; i += 14) c2.fillRect(i, 0, 3, h2);
      c2.fillStyle = '#fff'; c2.font = 'bold 40px sans-serif'; c2.textAlign = 'center'; c2.fillText(text, w2 / 2, 62);
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.5, 1.4), [mat(c), mat(c), mat(c), mat(c), new THREE.MeshStandardMaterial({ map: ctex }), mat(c)]);
    box.position.set(x, h + 1.9, -15.5);
    box.castShadow = true;
    group.add(flat, box);
    x += 3.4;
  }

  // gantry crane over the sidings, its trolley shuttling a container
  const gx = cx + 3;
  const steel = mat('#e0a526', { metalness: 0.5, roughness: 0.4 });
  for (const lz of [-18, -8.8]) {
    for (const lx of [gx - 3, gx + 3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 8, 0.35), steel);
      leg.position.set(lx, h + 4, lz);
      leg.castShadow = true;
      group.add(leg);
    }
  }
  ctx.colliders.push({ x: gx - 3, z: -8.8, r: 0.5 }, { x: gx + 3, z: -8.8, r: 0.5 });
  for (const lx of [gx - 3, gx + 3]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 9.8), steel);
    beam.position.set(lx, h + 8, -13.4);
    group.add(beam);
  }
  const trolley = new THREE.Group();
  const tbody = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.6, 1.2), steel);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), mat('#222'));
  const load = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 1.3), mat('#16a085'));
  const loadTag = makeLabel(':443', { size: 0.5, color: '#fff', bg: null, font: 800 });
  trolley.add(tbody, cable, load, loadTag);
  trolley.position.set(gx, h + 8.6, -13);
  group.add(trolley);
  animated.push((t) => {
    const k = (Math.sin(t * 0.4) + 1) / 2;
    trolley.position.z = -16.5 + k * 6;
    const drop = 2.5 + Math.sin(t * 0.8) * 1.2;
    cable.scale.y = drop;
    cable.position.y = -drop / 2;
    load.position.y = -drop - 0.65;
    loadTag.position.set(0, -drop - 0.65, 0.8);
  });

  // turntable with a little shunting engine
  const ttX = stationX;
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.2, 40), mat('#3a3330', { roughness: 1 }));
  pit.position.set(ttX, h + 0.05, 9.4);
  const deck = new THREE.Group();
  deck.position.set(ttX, h + 0.2, 9.4);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 5.8), mat('#4b3b33'));
  const shunter = makeLoco({ color: '#1f5e3a', trim: '#e6c35c' });
  shunter.group.scale.setScalar(0.72);
  shunter.group.position.y = 0.1;
  deck.add(bridge, shunter.group);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.1, 6, 48), glowMat(color, 1.3));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(ttX, h + 0.2, 9.4);
  group.add(pit, deck, ring);
  ctx.colliders.push({ x: ttX, z: 9.4, r: 3 });
  animated.push((t) => { deck.rotation.y = t * 0.25; });
  ctx.steamers.push({ obj: shunter.group, tip: shunter.chimneyTip, every: 0.5 });

  // the handshake, played by three semaphore signals
  const flags = ['SYN', 'SYN-ACK', 'ACK'];
  const arms = flags.map((f, i) => {
    const sx = cx - 5 + i * 5;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8), mat('#e8e2d0'));
    post.position.set(sx, h + 2.5, 15);
    const armGeo = new THREE.BoxGeometry(1.6, 0.3, 0.06);
    armGeo.translate(0.7, 0, 0);
    const arm = new THREE.Mesh(armGeo, mat('#c0392b'));
    arm.position.set(sx, h + 4.5, 15.1);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glowMat('#ff4040', 2.5));
    light.position.set(sx, h + 4.0, 15.15);
    const tag = makeLabel(f, { size: 0.45, color: '#fff', bg: 'rgba(40,20,10,0.75)', border: color });
    tag.position.set(sx, h + 5.8, 15);
    group.add(post, arm, light, tag);
    return { arm, light };
  });
  animated.push((t) => {
    const phase = (t * 0.6) % 4.5;
    arms.forEach(({ arm, light }, i) => {
      const on = phase > i + 0.5;
      arm.rotation.z = THREE.MathUtils.lerp(arm.rotation.z, on ? 0.75 : 0, 0.08);
      light.material.color.set(on ? '#50ff8a' : '#ff4040');
      light.material.emissive.set(on ? '#50ff8a' : '#ff4040');
    });
  });

  for (let lx = p.x0 + 2; lx <= p.x1 - 2; lx += 7) lamp(ctx, lx, h, 17);
}

// ------------------------------------------------------------ internet
// The junction: a signal box picks routes, fingerposts are the routing table,
// and the tracks split towards different destinations.
function buildInternet(ctx, p, stationX) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  const h = p.h;
  const color = LAYERS.internet.color;
  const sender = p.side === 'sender';

  // diverging tracks out of the main line
  for (const dz of [-8, 8]) {
    const tr = makeTrack(new THREE.Vector3(p.x0 + 1, h + 0.14, 0), new THREE.Vector3(p.x1 - 1, h + 0.14, dz), { liveColor: color, liveOpacity: 0.25 });
    group.add(tr.group);
  }

  // signal box: brick base, glazed operating floor, levers inside
  const sbX = sender ? stationX + 5 : stationX + 4.5;
  building(ctx, { x: sbX, z: -15.5, h, len: 7, depth: 4, height: 3, brick: '#7d4535', windows: false, roof: '#2f3b3a' });
  const upper = new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 4), new THREE.MeshStandardMaterial({ color: '#ffd89a', emissive: '#ffb84d', emissiveIntensity: 0.7, roughness: 0.3 }));
  upper.position.set(sbX, h + 4.5, -15.5);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.25, 4.1), mat('#e8e2d0'));
  frame.position.set(sbX, h + 5.9, -15.5);
  const roof = pitchedRoof(7.8, 5, 2, '#2f3b3a');
  roof.position.set(sbX, h + 6, -15.5);
  group.add(upper, frame, roof);
  for (let i = 0; i < 7; i++) {
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), mat(['#c0392b', '#2c3e50', '#f1c40f'][i % 3]));
    lever.position.set(sbX - 2.7 + i * 0.9, h + 4.3, -13.45);
    lever.rotation.x = (i % 2 ? 1 : -1) * 0.3;
    group.add(lever);
  }
  const nameBoard = plane(6, 0.9, signTexture([sender ? 'GATEWAY JUNCTION' : 'SERVER JUNCTION'], { bg: '#1c1c1c', fg: '#f2e6c9', font: 'bold 60px', border: '#f2e6c9' }));
  nameBoard.position.set(sbX, h + 3.4, -13.47);
  group.add(nameBoard);

  // TTL countdown on a lamp-lit board by the signal box
  const ttlCanvas = document.createElement('canvas');
  ttlCanvas.width = 256;
  ttlCanvas.height = 128;
  const ttlCtx = ttlCanvas.getContext('2d');
  const ttlTex = new THREE.CanvasTexture(ttlCanvas);
  ttlTex.colorSpace = THREE.SRGBColorSpace;
  let ttl = 64;
  const drawTtl = () => {
    ttlCtx.fillStyle = '#101418';
    ttlCtx.fillRect(0, 0, 256, 128);
    ttlCtx.fillStyle = ttl > 8 ? '#7dffa8' : '#ff6b6b';
    ttlCtx.font = 'bold 30px monospace';
    ttlCtx.fillText('TTL', 18, 44);
    ttlCtx.font = 'bold 72px monospace';
    ttlCtx.fillText(String(ttl).padStart(2, '0'), 110, 100);
    ttlCtx.fillStyle = '#9aa0ad';
    ttlCtx.font = '18px monospace';
    ttlCtx.fillText('-1 per hop', 14, 110);
    ttlTex.needsUpdate = true;
  };
  drawTtl();
  const ttlBoard = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: ttlTex, emissive: '#ffffff', emissiveMap: ttlTex, emissiveIntensity: 0.6 }));
  const ttlX = sender ? p.x0 + 4 : p.x1 - 4;
  ttlBoard.position.set(ttlX, h + 3, -11.9);
  const ttlPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3), mat('#2a2a30'));
  ttlPost.position.set(ttlX, h + 1.5, -12);
  group.add(ttlBoard, ttlPost);
  ctx.colliders.push({ x: ttlX, z: -12, r: 0.4 });
  let acc = 0;
  animated.push((t, dt = 1 / 60) => {
    acc += dt;
    if (acc > 0.6) {
      acc = 0;
      ttl = ttl <= 1 ? 64 : ttl - 1;
      drawTtl();
    }
  });

  // fingerposts: the routing table as signposts
  const routes = sender
    ? [['192.168.1.0/24', 'deliver on the LAN'], ['0.0.0.0/0', 'to the gateway']]
    : [['203.0.113.80', 'this host, climb up'], ['0.0.0.0/0', 'back via R4']];
  routes.forEach(([dest, hop], i) => {
    const fx = cx - 1.5 + i * 4.5;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 8), mat('#e8e2d0'));
    post.position.set(fx, h + 1.8, 10.5);
    const arrowTex = canvasTexture(320, 96, (c) => {
      c.fillStyle = '#f2e6c9';
      c.beginPath();
      c.moveTo(0, 8); c.lineTo(270, 8); c.lineTo(316, 48); c.lineTo(270, 88); c.lineTo(0, 88); c.closePath(); c.fill();
      c.fillStyle = '#1c1c1c';
      c.font = 'bold 34px monospace';
      c.fillText(dest, 14, 46);
      c.font = '22px sans-serif';
      c.fillText(`→ ${hop}`, 14, 78);
    });
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.84), new THREE.MeshStandardMaterial({ map: arrowTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 }));
    arrow.position.set(fx + 1.3, h + 3 - i * 0.2, 10.5);
    arrow.rotation.y = i ? -0.35 : 0.35;
    group.add(post, arrow);
    ctx.colliders.push({ x: fx, z: 10.5, r: 0.4 });
  });

  // water tower in the far corner
  const wtX = sender ? p.x0 + 3 : p.x1 - 3;
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), mat('#3a2f2a'));
    leg.position.set(wtX + lx * 1.2, h + 3, -16 + lz * 1.2);
    group.add(leg);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 2.6, 20), mat('#6b4a33', { roughness: 0.9 }));
  tank.position.set(wtX, h + 7.3, -16);
  tank.castShadow = true;
  const tankRoof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.2, 20), mat('#3a3440'));
  tankRoof.position.set(wtX, h + 9.2, -16);
  group.add(tank, tankRoof);

  // semaphore gantry across the diverging tracks: the chosen route shows green
  const gantryX = p.x1 - 3;
  const g1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.5, 0.3), mat('#2a2a30'));
  g1.position.set(gantryX, h + 3.25, -13);
  const g2 = g1.clone();
  g2.position.z = 13.5;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 26.5), mat('#2a2a30'));
  top.position.set(gantryX, h + 6.5, 0.25);
  group.add(g1, g2, top);
  const aspects = [-8, 0, 8].map((z) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), glowMat('#ff4040', 2.5));
    l.position.set(gantryX - 0.2, h + 6, z);
    group.add(l);
    return l;
  });
  animated.push((t) => {
    const active = Math.floor(t / 2.5) % 3;
    aspects.forEach((l, i) => {
      const c = i === active ? '#50ff8a' : '#ff4040';
      l.material.color.set(c);
      l.material.emissive.set(c);
    });
  });

  for (let lx = p.x0 + 2; lx <= p.x1 - 2; lx += 7) lamp(ctx, lx, h, 16.5);
}

// ------------------------------------------------------------ link
// The engine shed and the local line: MAC addresses on the shed doors,
// telegraph wires carrying pulses (the physical wire), and a radio mast.
function buildLink(ctx, p, stationX) {
  const { group, animated } = ctx;
  const cx = (p.x0 + p.x1) / 2;
  const w = p.x1 - p.x0;
  const h = p.h;
  const color = LAYERS.link.color;
  const sender = p.side === 'sender';

  // engine shed with two doors, each labelled with a MAC address
  building(ctx, { x: cx, z: -15.8, h, len: w - 3, depth: 4, height: 6, brick: '#7a4a3c', windows: false, roof: '#34383f' });
  const macs = sender
    ? [[NET.client.mac, "Alice's laptop"], [NET.gateway.mac, 'home router']]
    : [[NET.server.mac, 'web server'], ['5c:5e:ab:40:00:09', 'router R4']];
  macs.forEach(([mac, who], i) => {
    const dx = cx + (i ? 3.5 : -3.5);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.6), new THREE.MeshStandardMaterial({ color: '#140f0c', emissive: '#ff9a3c', emissiveIntensity: 0.12 }));
    door.position.set(dx, h + 2.3, -13.78);
    const plate = plane(3.4, 0.8, signTexture([mac, who], { bg: '#10304f', fg: '#e6f2ff', font: 'bold 44px', w: 512, h: 128, border: color }));
    plate.position.set(dx, h + 5.1, -13.76);
    group.add(door, plate);
  });
  // an engine peeking out of the first door
  const resident = makeLoco({ color: '#24324a', trim: '#c9a54a' });
  resident.group.position.set(cx - 3.5, h + 0.14, -14.6);
  group.add(resident.group);
  ctx.steamers.push({ obj: resident.group, tip: resident.chimneyTip, every: 0.6 });
  const shedTrack = makeTrack(new THREE.Vector3(cx - 3.5, h + 0.14, -18), new THREE.Vector3(cx - 3.5, h + 0.14, -9.5), { liveOpacity: 0 });
  group.add(shedTrack.group);
  ctx.colliders.push({ x: cx - 3.5, z: -12.2, r: 1 });

  // telegraph poles with wires on the camera-side edge; pulses run along them
  const poles = [];
  for (let x = p.x0 + 1; x <= p.x1 - 1; x += 5) poles.push(x);
  for (const x of poles) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 6, 8), mat('#5a4030', { roughness: 1 }));
    pole.position.set(x, h + 3, 16.8);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.6), mat('#5a4030'));
    arm.position.set(x, h + 5.6, 16.8);
    group.add(pole, arm);
  }
  const wireMat = mat('#1a1a1a');
  const pulses = [];
  for (const dz of [-0.6, 0.6]) {
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, poles[poles.length - 1] - poles[0], 4), wireMat);
    wire.rotation.z = Math.PI / 2;
    wire.position.set((poles[0] + poles[poles.length - 1]) / 2, h + 5.72, 16.8 + dz);
    group.add(wire);
    for (let i = 0; i < 4; i++) {
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glowMat(i % 2 ? '#4be1ff' : '#ffd27a', 3));
      pulse.userData = { dz, off: i / 4 + (dz > 0 ? 0.12 : 0) };
      group.add(pulse);
      pulses.push(pulse);
    }
  }
  animated.push((t) => {
    const x0 = poles[0];
    const len = poles[poles.length - 1] - x0;
    for (const pl of pulses) {
      const k = (t * 0.35 + pl.userData.off) % 1;
      pl.position.set(sender ? x0 + k * len : x0 + (1 - k) * len, h + 5.72, 16.8 + pl.userData.dz);
    }
  });
  const wireSign = makeLabel('the wire: bits as pulses', { size: 0.4, color: '#e6f2ff', border: color });
  wireSign.position.set(cx, h + 7, 16.8);
  group.add(wireSign);

  // water crane for the engines
  const wcX = sender ? stationX - 2 : stationX;
  const wc = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3.4, 10), mat('#2d3a4a', { metalness: 0.5 }));
  wc.position.set(wcX, h + 1.7, 10.8);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.2, 8), mat('#2d3a4a', { metalness: 0.5 }));
  spout.rotation.z = Math.PI / 2;
  spout.position.set(wcX + 1, h + 3.3, 10.8);
  group.add(wc, spout);
  ctx.colliders.push({ x: wcX, z: 10.8, r: 0.5 });

  // radio mast (Wi-Fi is a link layer too) sending out rings
  const mx = sender ? p.x0 + 1.5 : p.x1 - 1.5;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.25, 11, 6), mat('#c8c8d0', { metalness: 0.7 }));
  mast.position.set(mx, h + 5.5, -11.5);
  const tipLight = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glowMat('#ff3b3b', 3));
  tipLight.position.set(mx, h + 11.1, -11.5);
  group.add(mast, tipLight);
  ctx.colliders.push({ x: mx, z: -11.5, r: 0.4 });
  const rings = [0, 1, 2].map((i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 40), new THREE.MeshBasicMaterial({ color, transparent: true }));
    r.position.set(mx, h + 10.5, -11.5);
    r.rotation.x = Math.PI / 2;
    r.userData.off = i / 3;
    group.add(r);
    return r;
  });
  animated.push((t) => {
    tipLight.visible = Math.sin(t * 3) > 0;
    for (const r of rings) {
      const k = (t * 0.5 + r.userData.off) % 1;
      r.scale.setScalar(1 + k * 7);
      r.material.opacity = 1 - k;
    }
  });

  // coal stack
  const coal = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 7), mat('#1a1a1c', { roughness: 1 }));
  coal.position.set(sender ? p.x1 - 3 : p.x0 + 3, h + 0.7, -11.2);
  group.add(coal);
  ctx.colliders.push({ x: coal.position.x, z: -11.2, r: 1.6 });

  for (let lx = p.x0 + 2; lx <= p.x1 - 2; lx += 7) lamp(ctx, lx, h, -9);
}

// ------------------------------------------------------------ other packets
// Other people's packets: little trolleys shunting about each platform.
function spawnTrolleys(ctx, p, count) {
  const colors = Object.values(LAYERS).map((l) => l.color);
  for (let i = 0; i < count; i++) {
    const wg = makeWagon({ color: colors[(i + Math.abs(p.x0)) % colors.length], kind: i % 2 ? 'open' : 'box', len: 1.6 });
    const npc = wg.group;
    npc.scale.setScalar(0.6);
    const state = { target: new THREE.Vector3(), speed: rand(1.5, 3), wait: rand(0, 2) };
    const newTarget = () => state.target.set(rand(p.x0 + 2, p.x1 - 2), 0, rand(-4, 8));
    newTarget();
    npc.position.set(rand(p.x0 + 2, p.x1 - 2), p.h, rand(-4, 8));
    ctx.group.add(npc);
    ctx.animated.push((t, dt = 1 / 60) => {
      if (state.wait > 0) {
        state.wait -= dt;
        return;
      }
      const dx = state.target.x - npc.position.x;
      const dz = state.target.z - npc.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        state.wait = rand(1, 4);
        newTarget();
      } else {
        npc.position.x += (dx / d) * state.speed * dt;
        npc.position.z += (dz / d) * state.speed * dt;
        npc.rotation.y = Math.atan2(dx, dz);
        for (const w of wg.wheels) w.rotation.x += state.speed * dt * 3;
      }
    });
  }
}

// Victorian platform lamps, all in two instanced meshes.
function buildLamps(ctx) {
  const n = ctx.lamps.length;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.13, 4, 8), mat('#1f2e2c', { metalness: 0.6 }), n);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 14, 10), glowMat('#ffcf7a', 2.6), n);
  const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(0.4, 0.35, 8), mat('#1f2e2c', { metalness: 0.6 }), n);
  const m = new THREE.Matrix4();
  ctx.lamps.forEach((v, i) => {
    m.makeTranslation(v.x, v.y + 2, v.z);
    poles.setMatrixAt(i, m);
    m.makeTranslation(v.x, v.y + 4.15, v.z);
    heads.setMatrixAt(i, m);
    m.makeTranslation(v.x, v.y + 4.55, v.z);
    caps.setMatrixAt(i, m);
  });
  ctx.group.add(poles, heads, caps);
}

const BUILDERS = { app: buildApplication, transport: buildTransport, internet: buildInternet, link: buildLink };

export function buildEnvironment(scene, plateaus, animatedList, stationX) {
  const ctx = { group: new THREE.Group(), animated: animatedList, colliders: [], lamps: [], steamers: [] };
  for (const p of plateaus) {
    const id = `${p.side === 'sender' ? 'send' : 'recv'}-${p.layer}`;
    BUILDERS[p.layer](ctx, p, stationX[id]);
    spawnTrolleys(ctx, p, 2);
  }
  buildLamps(ctx);
  scene.add(ctx.group);

  // parked engines breathe steam
  const steam = new Steam(scene, 90);
  const timers = ctx.steamers.map(() => Math.random());
  const tip = new THREE.Vector3();
  animatedList.push((t, dt = 1 / 60) => {
    ctx.steamers.forEach((s, i) => {
      timers[i] -= dt;
      if (timers[i] <= 0) {
        timers[i] = s.every;
        tip.copy(s.tip);
        s.obj.localToWorld(tip);
        steam.emit(tip, { size: 0.6, rise: 1.4 });
      }
    });
    steam.update(dt);
  });
  return { colliders: ctx.colliders };
}
