import * as THREE from 'three';
import { B, BLOCKS, isOpaque } from './blocks.js';

// A dense block grid. Cell (x, y, z) fills the unit cube [x, x+1] × [y, y+1] × [z, z+1].
export class VoxelGrid {
  constructor({ x0, x1, y0, y1, z0, z1 }) {
    Object.assign(this, { x0, x1, y0, y1, z0, z1 });
    this.sx = x1 - x0;
    this.sy = y1 - y0;
    this.sz = z1 - z0;
    this.data = new Uint8Array(this.sx * this.sy * this.sz);
  }

  inside(x, y, z) {
    return x >= this.x0 && x < this.x1 && y >= this.y0 && y < this.y1 && z >= this.z0 && z < this.z1;
  }

  index(x, y, z) {
    return ((x - this.x0) * this.sz + (z - this.z0)) * this.sy + (y - this.y0);
  }

  get(x, y, z) {
    if (y < this.y0) return B.STONE;
    if (!this.inside(x, y, z)) return B.AIR;
    return this.data[this.index(x, y, z)];
  }

  set(x, y, z, id) {
    if (this.inside(x, y, z)) this.data[this.index(x, y, z)] = id;
  }

  solid(x, y, z) {
    return this.get(x, y, z) !== B.AIR;
  }

  // Height of the highest solid surface in a column (y of its top face).
  surface(x, z) {
    if (x < this.x0 || x >= this.x1 || z < this.z0 || z >= this.z1) return this.y0;
    const base = this.index(x, this.y0, z);
    for (let y = this.sy - 1; y >= 0; y--) if (this.data[base + y] !== B.AIR) return this.y0 + y + 1;
    return this.y0;
  }
}

// Face table. For each direction: normal, the two in-plane axes and a baked
// brightness so every side of a block reads differently, like in classic
// block games.
const FACES = [
  { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], kind: 'side', shade: 0.9 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], kind: 'side', shade: 0.9 },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], kind: 'top', shade: 1 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], kind: 'bottom', shade: 0.62 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], kind: 'side', shade: 0.8 },
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], kind: 'side', shade: 0.8 },
].map((f) => {
  const cross = [
    f.u[1] * f.v[2] - f.u[2] * f.v[1],
    f.u[2] * f.v[0] - f.u[0] * f.v[2],
    f.u[0] * f.v[1] - f.u[1] * f.v[0],
  ];
  const ccw = cross[0] * f.n[0] + cross[1] * f.n[1] + cross[2] * f.n[2] > 0;
  const corners = ccw ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
  const origin = f.n.map((c) => (c > 0 ? 1 : 0));
  return { ...f, corners, origin };
});

const AO_LEVELS = [0.5, 0.68, 0.85, 1];

class MeshBuffer {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  get empty() {
    return this.idx.length === 0;
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Greedy-free face culling mesher with per-vertex ambient occlusion.
// Returns one opaque and one glowing buffer per chunk of `chunk` columns in x.
export function meshGrid(grid, atlas, chunk = 32) {
  const out = [];
  const opaque = (x, y, z) => (isOpaque(grid.get(x, y, z)) ? 1 : 0);
  for (let cx = grid.x0; cx < grid.x1; cx += chunk) {
    const lit = new MeshBuffer();
    const glow = new MeshBuffer();
    for (let x = cx; x < Math.min(cx + chunk, grid.x1); x++) {
      for (let z = grid.z0; z < grid.z1; z++) {
        for (let y = grid.y0; y < grid.y1; y++) {
          const id = grid.data[grid.index(x, y, z)];
          if (!isOpaque(id)) continue;
          const def = BLOCKS[id];
          const buf = def.glow ? glow : lit;
          for (const f of FACES) {
            const nx = x + f.n[0];
            const ny = y + f.n[1];
            const nz = z + f.n[2];
            if (opaque(nx, ny, nz)) continue;
            const [u0, v0, u1, v1] = atlas.uv(def[f.kind]);
            const base = buf.pos.length / 3;
            const ao = [];
            for (const [cu, cv] of f.corners) {
              const du = cu ? 1 : -1;
              const dv = cv ? 1 : -1;
              const s1 = opaque(nx + f.u[0] * du, ny + f.u[1] * du, nz + f.u[2] * du);
              const s2 = opaque(nx + f.v[0] * dv, ny + f.v[1] * dv, nz + f.v[2] * dv);
              const c = opaque(nx + f.u[0] * du + f.v[0] * dv, ny + f.u[1] * du + f.v[1] * dv, nz + f.u[2] * du + f.v[2] * dv);
              const level = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
              ao.push(level);
              buf.pos.push(
                x + f.origin[0] + f.u[0] * cu + f.v[0] * cv,
                y + f.origin[1] + f.u[1] * cu + f.v[1] * cv,
                z + f.origin[2] + f.u[2] * cu + f.v[2] * cv,
              );
              buf.nor.push(...f.n);
              buf.uv.push(cu ? u1 : u0, cv ? v1 : v0);
              const b = AO_LEVELS[level] * f.shade;
              buf.col.push(b, b, b);
            }
            // Flip the quad's diagonal so AO gradients do not look creased.
            if (ao[0] + ao[2] < ao[1] + ao[3]) buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }
    out.push({ lit, glow });
  }
  return out;
}
