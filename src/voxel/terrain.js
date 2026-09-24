import { B, LAYER_TILE, LAYER_LAMP } from './blocks.js';
import { VoxelGrid } from './grid.js';
import { fbm, hash2, smoothstep } from './noise.js';
import { FONT } from './textures.js';
import {
  columnHeight, plateauAt, PLATEAUS, NODES, LAPTOP, RACK, MONUMENT_Z, PATH_HALF_WIDTH,
} from '../layout.js';
import { SECRETS } from '../secrets.js';

// The whole landscape as one block grid:
//  * the sender's side is a green highland whose terraces are the four layers,
//  * the network is a sea with a router on every island,
//  * the receiver's side is a red mesa, terraced the same way.

export const BOUNDS = { x0: -176, x1: 192, y0: -14, y1: 54, z0: -72, z1: 58 };
const PATH_EDGE = PATH_HALF_WIDTH + 1; // paved strip covers |z| <= 10
const SNOW_LINE = 36;
export const LIGHTHOUSE = { x: 21, z: -31, height: 16 };

const LAYER_NUM = { app: 4, transport: 3, internet: 2, link: 1 };

// Flat ground for props. `base` zones sit at the path's height; the others
// (chest clearings) level out at the hill height of their centre, so a chest
// never ends up at the bottom of a pit.
const FLAT_ZONES = [
  { x: LAPTOP.x, z: LAPTOP.z, r: 10, base: true },
  ...PLATEAUS.map((p) => ({ x: (p.x0 + p.x1) / 2, z: MONUMENT_Z, r: 9, base: true })),
  ...SECRETS.map((s) => ({ x: s.x, z: s.z, r: 4 })),
];

function flatZone(x, z) {
  let best = null;
  let f = 0;
  for (const zn of FLAT_ZONES) {
    const d = Math.hypot(x - zn.x, z - zn.z);
    const k = 1 - smoothstep(zn.r * 0.6, zn.r, d);
    if (k > f) {
      f = k;
      best = zn;
    }
  }
  return { f, zone: best };
}

function flatness(x, z) {
  return flatZone(x, z).f;
}

function hillBump(x, z, side) {
  const az = Math.abs(z);
  const s = smoothstep(PATH_EDGE, PATH_EDGE + 5, az);
  let hills = fbm(x * 0.045, z * 0.045, 1) * 7 - 1.5;
  if (side === 'receiver') hills = Math.round(hills / 2.5) * 2.5; // mesa steps
  return Math.max(0, hills) * s;
}

function coastDistance(x, z) {
  const az = Math.abs(z);
  if (x < 20) {
    const edge = az <= PATH_EDGE ? -2 : -4 - fbm(z * 0.07, 3, 5) * 10;
    return edge - x;
  }
  const edge = az <= PATH_EDGE ? 44 : 46 + fbm(z * 0.07, 9, 6) * 10;
  return x - edge;
}

// Height (y of the top face) and biome of one block column.
function column(cx, cz) {
  const x = cx + 0.5;
  const z = cz + 0.5;
  const az = Math.abs(z);
  const side = x < 20 ? 'sender' : 'receiver';
  const coast = coastDistance(x, z);
  const base = columnHeight(cx);
  const seabed = -5 - Math.round(fbm(x * 0.05, z * 0.05, 11) * 4);

  if (az <= PATH_EDGE && coast >= 0) return { h: base, kind: 'path' };

  const { f: flat, zone } = flatZone(x, z);
  let bump = hillBump(x, z, side);
  if (zone) {
    const level = zone.base ? 0 : Math.round(hillBump(zone.x + 0.5, zone.z + 0.5, side));
    bump = bump * (1 - flat) + level * flat;
  }
  let h = base + Math.round(bump);

  if (z < -24) {
    const rise = (-z - 24) * (0.7 + fbm(x * 0.03, z * 0.03, 2) * 1.1);
    h += side === 'receiver' ? Math.round(rise / 4) * 4 : Math.round(rise);
  }
  if (z > 22) h -= Math.round((z - 22) * (0.45 + fbm(x * 0.04, z * 0.04, 4) * 0.5));

  h = Math.min(h, Math.floor(-1 + coast * 0.75));
  h = Math.max(h, seabed);

  // Router islands and sand bars in the sea.
  for (const [nx, nz] of Object.values(NODES)) {
    const d = Math.hypot(x - nx, z - nz);
    if (d < 3.3) h = Math.max(h, 0);
    else if (d < 4.6) h = Math.max(h, -1);
  }
  {
    const d = Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z);
    if (d < 4) h = Math.max(h, 0);
    else if (d < 5.5) h = Math.max(h, -1);
  }
  h = Math.min(h, BOUNDS.y1 - 3);
  return { h, kind: h < 0 && coast < 0 ? 'sea' : side };
}

const MESA_BANDS = [B.TERRA_ORANGE, B.TERRA_WHITE, B.TERRA_ORANGE, B.TERRA_BROWN, B.TERRA_YELLOW, B.TERRA_ORANGE, B.TERRA_RED, B.TERRA_WHITE, B.TERRA_ORANGE];

export function generateWorld() {
  const grid = new VoxelGrid(BOUNDS);
  const { x0, x1, z0, z1, y0 } = BOUNDS;
  const W = x1 - x0;
  const D = z1 - z0;
  const heights = new Int16Array(W * D);
  const kinds = new Array(W * D);
  const at = (cx, cz) => (cx - x0) * D + (cz - z0);
  for (let cx = x0; cx < x1; cx++) {
    for (let cz = z0; cz < z1; cz++) {
      const c = column(cx, cz);
      heights[at(cx, cz)] = c.h;
      kinds[at(cx, cz)] = c.kind;
    }
  }
  const hAt = (cx, cz) => (cx < x0 || cx >= x1 || cz < z0 || cz >= z1 ? -99 : heights[at(cx, cz)]);

  // ---- fill columns ------------------------------------------------------
  for (let cx = x0; cx < x1; cx++) {
    for (let cz = z0; cz < z1; cz++) {
      const h = hAt(cx, cz);
      const kind = kinds[at(cx, cz)];
      let steep = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) steep = Math.max(steep, h - hAt(cx + dx, cz + dz));
      const plateau = kind === 'path' ? plateauAt(cx + 0.5) : null;
      const border = cz === -PATH_EDGE || cz === PATH_EDGE - 1;
      for (let y = y0; y < h; y++) {
        const depth = h - 1 - y;
        let id;
        if (kind === 'path') {
          if (depth === 0) id = plateau ? (border ? LAYER_LAMP[plateau.layer] : LAYER_TILE[plateau.layer]) : B.BRICKS;
          else id = depth < 3 ? B.BRICKS : B.STONE;
        } else if (kind === 'sea') {
          id = depth === 0 ? (hash2(cx, cz, 3) < 0.3 ? B.GRAVEL : B.SAND) : depth < 3 ? B.SAND : B.STONE;
        } else if (kind === 'sender') {
          if (depth === 0) {
            if (h >= SNOW_LINE) id = B.SNOW;
            else if (h <= 0) id = B.SAND;
            else if (steep >= 3) id = h > 20 ? B.STONE : B.GRASS;
            else id = B.GRASS;
          } else if (depth < 4 && h > 0 && h < SNOW_LINE && steep < 3) id = B.DIRT;
          else if (depth < 3 && h <= 0) id = B.SAND;
          else id = hash2(cx * 7 + y, cz, 5) < 0.08 ? B.COBBLE : B.STONE;
        } else {
          if (h <= 0) id = depth < 3 ? B.SAND : B.STONE;
          else if (depth === 0 && steep < 2) id = B.RED_SAND;
          else if (y < -3) id = B.STONE;
          else id = MESA_BANDS[((y % MESA_BANDS.length) + MESA_BANDS.length) % MESA_BANDS.length];
        }
        grid.set(cx, y, cz, id);
      }
    }
  }

  const plants = [];
  buildMonuments(grid);
  buildLampPosts(grid);
  buildPiers(grid);
  buildRouterPedestals(grid);
  buildLighthouse(grid);
  buildTrees(grid, hAt, kinds, at, plants);
  buildBarriers(grid);

  return { grid, plants, heights: hAt };
}

function buildMonuments(grid) {
  for (const p of PLATEAUS) {
    const cx = Math.floor((p.x0 + p.x1) / 2);
    const num = LAYER_NUM[p.layer];
    const lamp = LAYER_LAMP[p.layer];
    const W = 12;
    const H = 14;
    const left = cx - W / 2;
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < H; j++) {
        const edge = i === 0 || i === W - 1 || j === 0 || j === H - 1;
        grid.set(left + i, p.h + j, MONUMENT_Z, edge ? B.BRICKS : B.OBSIDIAN);
        if (edge) grid.set(left + i, p.h + j, MONUMENT_Z - 1, B.BRICKS);
      }
    }
    // pillars on the corners reaching down into the hillside
    for (const i of [0, W - 1]) for (let j = -4; j < 0; j++) grid.set(left + i, p.h + j, MONUMENT_Z, B.BRICKS);
    // the layer number in glowing blocks, 2× scale
    FONT[num].forEach((row, r) => [...row].forEach((bit, c) => {
      if (bit !== '1') return;
      for (let sx = 0; sx < 2; sx++) for (let sy = 0; sy < 2; sy++) {
        grid.set(left + 3 + c * 2 + sx, p.h + H - 3 - r * 2 - sy, MONUMENT_Z + 1, lamp);
      }
    }));
    // a little lamp cap on top
    for (let i = 1; i < W - 1; i += 3) grid.set(left + i, p.h + H, MONUMENT_Z, lamp);
  }
}

// Lantern posts along both edges of every plateau.
function buildLampPosts(grid) {
  for (const p of PLATEAUS) {
    for (let x = p.x0 + 3; x < p.x1 - 2; x += 7) {
      for (const z of [-PATH_EDGE - 1, PATH_EDGE]) {
        const ground = grid.surface(x, z);
        if (ground < p.h - 1 || ground > p.h + 1) continue;
        grid.set(x, ground, z, B.LOG);
        grid.set(x, ground + 1, z, B.LOG);
        grid.set(x, ground + 2, z, LAYER_LAMP[p.layer]);
      }
    }
  }
}

function buildPiers(grid) {
  const pier = (xa, xb, za, zb) => {
    for (let x = xa; x <= xb; x++) {
      for (let z = za; z <= zb; z++) grid.set(x, -1, z, B.PLANKS);
      if ((x - xa) % 3 === 0) for (const z of [za, zb]) for (let y = -2; y >= -8; y--) if (!grid.solid(x, y, z)) grid.set(x, y, z, B.LOG);
    }
  };
  pier(-2, 3, -1, 0);
  pier(42, 44, 2, 3);
}

function buildRouterPedestals(grid) {
  for (const [nx, nz] of Object.values(NODES)) {
    for (let x = nx - 1; x <= nx; x++) for (let z = nz - 1; z <= nz; z++) grid.set(x, 0, z, B.BRICKS);
  }
}

function buildLighthouse(grid) {
  const { x: lx, z: lz, height } = LIGHTHOUSE;
  for (let y = 0; y < height; y++) {
    const band = Math.floor(y / 3) % 2 ? B.TERRA_RED : B.TERRA_WHITE;
    const r = y < 3 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      grid.set(lx + dx, y, lz + dz, band);
    }
  }
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) grid.set(lx + dx, height, lz + dz, B.BRICKS);
  grid.set(lx, height + 1, lz, B.LAMP);
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) grid.set(lx + dx, height + 1, lz + dz, B.LOG);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) grid.set(lx + dx, height + 2, lz + dz, B.TERRA_RED);
  grid.set(lx, height + 3, lz, B.TERRA_RED);
}

function buildTrees(grid, hAt, kinds, at, plants) {
  const { x0, x1, z0, z1 } = BOUNDS;
  const trunks = [];
  const farFrom = (x, z, r) => trunks.every(([tx, tz]) => Math.abs(tx - x) > r || Math.abs(tz - z) > r);
  // Leaves never hang lower than two blocks above the ground, so you can
  // always walk underneath a canopy.
  const setIfAir = (x, y, z, id) => { if (!grid.solid(x, y, z) && y >= hAt(x, z) + 2) grid.set(x, y, z, id); };

  for (let cx = x0 + 2; cx < x1 - 2; cx++) {
    for (let cz = z0 + 2; cz < z1 - 2; cz++) {
      const kind = kinds[at(cx, cz)];
      const h = hAt(cx, cz);
      const az = Math.abs(cz + 0.5);
      if (kind !== 'sender' && kind !== 'receiver') continue;
      if (az < PATH_EDGE + 2.5 || h < 1) continue;
      if (flatness(cx + 0.5, cz + 0.5) > 0) continue;
      const top = grid.get(cx, h - 1, cz);
      const r = hash2(cx, cz, 21);

      if (kind === 'sender' && top === B.GRASS) {
        const forest = smoothstep(0.4, 0.62, fbm(cx * 0.035, cz * 0.035, 7));
        if (r < 0.06 * forest + 0.004 && farFrom(cx, cz, 3)) {
          trunks.push([cx, cz]);
          if (h > 22 || hash2(cx, cz, 22) < 0.3) spruce(cx, h, cz);
          else oak(cx, h, cz);
          continue;
        }
        const p = hash2(cx, cz, 23);
        if (p < 0.16) plants.push({ x: cx, y: h, z: cz, tile: 'tallgrass' });
        else if (p < 0.2) plants.push({ x: cx, y: h, z: cz, tile: ['flower_red', 'flower_yellow', 'flower_blue'][Math.floor(hash2(cx, cz, 24) * 3)] });
      } else if (kind === 'receiver' && top === B.RED_SAND) {
        if (r < 0.012 && farFrom(cx, cz, 2)) {
          trunks.push([cx, cz]);
          const tall = 1 + Math.floor(hash2(cx, cz, 25) * 3);
          for (let y = 0; y < tall; y++) grid.set(cx, h + y, cz, B.CACTUS);
        } else if (hash2(cx, cz, 26) < 0.025) plants.push({ x: cx, y: h, z: cz, tile: 'deadbush' });
      }
    }
  }

  function oak(x, h, z) {
    const t = 4 + Math.floor(hash2(x, z, 30) * 2);
    for (let y = 0; y < t; y++) grid.set(x, h + y, z, B.LOG);
    for (let y = t - 2; y <= t + 1; y++) {
      const rad = y >= t ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && (y === t + 1 || hash2(x + dx, z + dz, y) < 0.5)) continue;
        setIfAir(x + dx, h + y, z + dz, B.LEAVES);
      }
    }
  }

  function spruce(x, h, z) {
    const t = 6 + Math.floor(hash2(x, z, 31) * 3);
    for (let y = 0; y < t; y++) grid.set(x, h + y, z, B.LOG);
    const radii = [];
    for (let y = 2; y <= t; y++) radii.push([y, (t - y) % 2 === 0 ? (y < t - 2 ? 2 : 1) : 1]);
    for (const [y, rad] of radii) {
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (rad === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        setIfAir(x + dx, h + y, z + dz, B.LEAVES_DARK);
      }
    }
    setIfAir(x, h + t, z, B.LEAVES_DARK);
    setIfAir(x, h + t + 1, z, B.LEAVES_DARK);
  }
}

// Solid-but-invisible volumes so you cannot walk through big props.
function buildBarriers(grid) {
  const box = (xa, xb, za, zb, ya, yb) => {
    for (let x = xa; x <= xb; x++) for (let z = za; z <= zb; z++) for (let y = ya; y <= yb; y++) if (!grid.solid(x, y, z)) grid.set(x, y, z, B.BARRIER);
  };
  box(LAPTOP.x - 6, LAPTOP.x + 5, LAPTOP.z - 4, LAPTOP.z + 3, 15, 24);
  box(RACK.x - 2, RACK.x + 1, RACK.z - 3, RACK.z + 2, 15, 28);
}

// Walking query: where would a walker whose feet are at integer height `feet`
// stand in the block column containing (x, z)? A hovering packet can climb
// up to `maxUp` blocks at once and needs two free blocks of headroom, so it
// can walk under tree canopies. Returns null for walls and open water.
export function makeGround(grid, heights) {
  return {
    surface: (x, z) => grid.surface(Math.floor(x), Math.floor(z)),
    // natural ground height, ignoring trees and props
    terrain: (x, z) => heights(Math.floor(x), Math.floor(z)),
    step(x, z, feet, maxUp = 2) {
      const cx = Math.floor(x);
      const cz = Math.floor(z);
      for (let y = feet + maxUp - 1; y >= grid.y0; y--) {
        if (!grid.solid(cx, y, cz)) continue;
        if (grid.solid(cx, y + 1, cz) || grid.solid(cx, y + 2, cz)) return null;
        return y + 1 < -1 ? null : y + 1;
      }
      return null;
    },
  };
}
