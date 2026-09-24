import * as THREE from 'three';
import { LAYERS } from '../content.js';
import { mulberry32 } from './noise.js';

// Every block face is a 16×16 pixel-art tile painted at startup on a canvas,
// so the game ships no image files. Tiles are packed into one atlas for the
// terrain mesh, and can also be pulled out as standalone textures.

export const TILE = 16;
const COLS = 8;

const LAYER_KEYS = ['app', 'transport', 'internet', 'link'];

// 3×5 pixel font for digits and the few letters we need.
export const FONT = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  A: ['010', '101', '111', '101', '101'],
  T: ['111', '010', '010', '010', '010'],
  I: ['111', '010', '010', '010', '111'],
  L: ['100', '100', '100', '100', '111'],
  '?': ['111', '001', '011', '000', '010'],
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb([r, g, b], f = 1) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
function mix(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

class Painter {
  constructor(ctx, ox, oy, seed) {
    this.ctx = ctx;
    this.ox = ox;
    this.oy = oy;
    this.r = mulberry32(seed);
  }
  set(x, y, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.ox + x, this.oy + y, 1, 1);
  }
  fill(color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.ox, this.oy, TILE, TILE);
  }
  noise(colors, x0 = 0, y0 = 0, x1 = TILE, y1 = TILE) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.set(x, y, colors[Math.floor(this.r() * colors.length)]);
  }
  // Base color with random brightness jitter per pixel.
  jitter(hex, amount = 0.12, x0 = 0, y0 = 0, x1 = TILE, y1 = TILE) {
    const c = hexToRgb(hex);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.set(x, y, rgb(c, 1 + (this.r() - 0.5) * 2 * amount));
  }
  glyph(ch, x0, y0, color, scale = 1) {
    FONT[ch].forEach((row, y) => [...row].forEach((bit, x) => {
      if (bit === '1') for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) this.set(x0 + x * scale + sx, y0 + y * scale + sy, color);
    }));
  }
  border(color) {
    for (let i = 0; i < TILE; i++) {
      this.set(i, 0, color); this.set(i, TILE - 1, color);
      this.set(0, i, color); this.set(TILE - 1, i, color);
    }
  }
}

const DIRT = ['#8a5a36', '#7a4e2e', '#94643e', '#6b4428', '#86583a'];
const STONE = ['#8d8d8d', '#7f7f7f', '#999999', '#747474', '#888888'];

const painters = {
  grass_top: (p) => p.noise(['#5fa83a', '#6cb842', '#559a33', '#79c24c', '#4f9130']),
  grass_side: (p) => {
    p.noise(DIRT);
    for (let x = 0; x < TILE; x++) {
      const d = 3 + Math.floor(p.r() * 3);
      for (let y = 0; y < d; y++) p.set(x, y, ['#5fa83a', '#6cb842', '#559a33'][Math.floor(p.r() * 3)]);
    }
  },
  dirt: (p) => p.noise(DIRT),
  stone: (p) => {
    p.noise(STONE);
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(p.r() * 14);
      const y = Math.floor(p.r() * 15);
      p.set(x, y, '#636363'); p.set(x + 1, y, '#636363'); p.set(x + 2, y + 1, '#6a6a6a');
    }
  },
  cobble: (p) => {
    p.noise(['#8a8a8a', '#9b9b9b', '#7a7a7a']);
    const dark = '#555555';
    for (let y = 0; y < TILE; y += 4) {
      const off = (y / 4) % 2 ? 2 : 0;
      for (let x = 0; x < TILE; x++) p.set(x, y, dark);
      for (let x = off; x < TILE; x += 5) for (let yy = y; yy < y + 4; yy++) p.set(x, yy, dark);
    }
  },
  sand: (p) => p.noise(['#e2d59a', '#d9ca8a', '#e9dda6', '#d2c283']),
  log_side: (p) => {
    for (let x = 0; x < TILE; x++) {
      const base = x % 4 === 0 ? '#4f3a1f' : x % 4 === 2 ? '#6e5230' : '#634827';
      for (let y = 0; y < TILE; y++) p.set(x, y, p.r() < 0.12 ? '#44321b' : base);
    }
  },
  log_top: (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      p.set(x, y, d > 6.5 ? '#634827' : Math.floor(d) % 2 ? '#b8945a' : '#a07c46');
    }
  },
  leaves: (p) => p.noise(['#3f8a2a', '#4a9a31', '#357522', '#2a5f1b', '#4f9f36', '#244f17']),
  leaves_dark: (p) => p.noise(['#2d5a33', '#264d2b', '#34663a', '#1d3d22', '#2f5f36']),
  planks: (p) => {
    p.jitter('#a8834f', 0.08);
    for (let y = 0; y < TILE; y += 4) {
      for (let x = 0; x < TILE; x++) p.set(x, y + 3, '#6f5230');
      const seam = (y * 5) % TILE;
      for (let yy = y; yy < y + 3; yy++) p.set(seam, yy, '#7d5d36');
    }
  },
  bricks: (p) => {
    p.noise(['#7b7b7b', '#848484', '#737373']);
    const m = '#4f4f4f';
    for (let x = 0; x < TILE; x++) { p.set(x, 7, m); p.set(x, 15, m); }
    for (let y = 0; y < 7; y++) { p.set(0, y, m); p.set(8, y + 8, m); }
    for (let x = 1; x < 7; x++) p.set(x, 1, '#969696');
  },
  red_sand: (p) => p.noise(['#be6a2f', '#b36128', '#c8753a', '#a95a24']),
  terra_orange: (p) => p.jitter('#a2552a', 0.06),
  terra_white: (p) => p.jitter('#cfae9e', 0.05),
  terra_brown: (p) => p.jitter('#5f3f2d', 0.07),
  terra_red: (p) => p.jitter('#8f3b2e', 0.06),
  terra_yellow: (p) => p.jitter('#b88830', 0.06),
  snow: (p) => p.noise(['#f4f8ff', '#e9f0fb', '#ffffff', '#dfe8f5']),
  snow_side: (p) => {
    p.noise(STONE);
    for (let x = 0; x < TILE; x++) {
      const d = 2 + Math.floor(p.r() * 3);
      for (let y = 0; y < d; y++) p.set(x, y, p.r() < 0.5 ? '#f4f8ff' : '#e3ebf7');
    }
  },
  gravel: (p) => p.noise(['#857a74', '#6f6660', '#9a918b', '#5d5550', '#8c847d']),
  obsidian: (p) => {
    p.noise(['#150f22', '#1b1330', '#100b1a', '#1f1636']);
    for (let i = 0; i < 6; i++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), '#4b2f7a');
  },
  lamp: (p) => {
    p.noise(['#f5d88a', '#ffe9a8', '#e6b95c', '#fff2c4']);
    p.border('#b88a3a');
  },
  cactus_side: (p) => {
    p.jitter('#4c8a2e', 0.1);
    for (let y = 0; y < TILE; y++) { p.set(0, y, '#2f5e1c'); p.set(15, y, '#2f5e1c'); if (y % 4 === 1) { p.set(4, y, '#1f3f12'); p.set(11, y + 2 > 15 ? y : y + 2, '#1f3f12'); } }
  },
  cactus_top: (p) => {
    p.jitter('#5c9a3a', 0.08);
    p.border('#2f5e1c');
  },
  chest_front: (p) => {
    p.jitter('#a7732c', 0.08);
    p.border('#4a2f10');
    for (let x = 1; x < 15; x++) p.set(x, 5, '#4a2f10');
    for (let y = 4; y < 9; y++) { p.set(7, y, '#c9c9c9'); p.set(8, y, '#c9c9c9'); }
  },
  chest_side: (p) => {
    p.jitter('#a7732c', 0.08);
    p.border('#4a2f10');
    for (let x = 1; x < 15; x++) p.set(x, 5, '#4a2f10');
  },
  chest_top: (p) => {
    p.jitter('#b8823a', 0.08);
    p.border('#4a2f10');
  },
  router_face: (p) => {
    p.jitter('#2c3448', 0.08);
    p.border('#161b27');
    for (let x = 2; x < 14; x += 3) { p.set(x, 11, '#0c0f16'); p.set(x + 1, 11, '#0c0f16'); p.set(x, 12, '#0c0f16'); p.set(x + 1, 12, '#0c0f16'); }
    for (let x = 3; x < 13; x += 2) p.set(x, 4, x % 4 === 1 ? '#39ff88' : '#4be1ff');
  },
  router_top: (p) => {
    p.jitter('#39445e', 0.06);
    p.border('#161b27');
    for (let i = 3; i < 13; i++) { p.set(i, 7, '#4be1ff'); p.set(7, i, '#4be1ff'); }
  },
  portal: (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = 0.55 + 0.45 * Math.sin((x + y * 0.5) * 0.9 + Math.sin(y * 0.7) * 2);
      p.set(x, y, rgb([255, 255, 255], 0.35 + v * 0.65));
    }
  },
  qblock: (p) => {
    p.jitter('#f0b429', 0.08);
    p.border('#9a6a10');
    p.glyph('?', 5, 4, '#fff6d8', 2);
  },
  water: (p) => p.noise(['#3a6fd8', '#4279e0', '#3466c9', '#4a84e8', '#3c72dc']),
  flower_red: (p) => {
    for (let y = 8; y < 16; y++) p.set(7, y, '#3f8a2a');
    p.set(6, 11, '#3f8a2a'); p.set(8, 12, '#3f8a2a');
    for (const [x, y] of [[7, 5], [6, 6], [8, 6], [7, 7], [6, 4], [8, 4]]) p.set(x, y, '#e8342c');
    p.set(7, 6, '#ffd23f');
  },
  flower_yellow: (p) => {
    for (let y = 9; y < 16; y++) p.set(8, y, '#3f8a2a');
    for (const [x, y] of [[8, 6], [7, 7], [9, 7], [8, 8], [7, 6], [9, 8]]) p.set(x, y, '#ffd83a');
    p.set(8, 7, '#e89a1c');
  },
  flower_blue: (p) => {
    for (let y = 9; y < 16; y++) p.set(7, y, '#3f8a2a');
    for (const [x, y] of [[7, 6], [6, 7], [8, 7], [7, 8], [6, 5], [8, 5]]) p.set(x, y, '#5aa8ff');
    p.set(7, 7, '#ffffff');
  },
  tallgrass: (p) => {
    for (let x = 1; x < 15; x += 2) {
      const h = 5 + Math.floor(p.r() * 9);
      for (let y = TILE - h; y < TILE; y++) p.set(x + (y % 3 === 0 ? 1 : 0), y, p.r() < 0.5 ? '#5fa83a' : '#4f9130');
    }
  },
  deadbush: (p) => {
    const c = '#8a6234';
    for (let y = 8; y < 16; y++) p.set(8, y, c);
    for (let i = 0; i < 5; i++) { p.set(8 - i, 10 - i, c); p.set(8 + i, 11 - i, c); p.set(6 - Math.floor(i / 2), 12 - i, c); }
  },
};

for (const key of LAYER_KEYS) {
  const base = hexToRgb(LAYERS[key].color);
  painters[`tile_${key}`] = (p) => {
    const dark = mix(base, [10, 14, 40], 0.55);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) p.set(x, y, rgb(mix(dark, base, 0.25 + p.r() * 0.12)));
    p.border(rgb(mix(dark, [0, 0, 0], 0.4)));
    for (let i = 3; i < 13; i++) { p.set(i, 3, rgb(base, 0.8)); p.set(i, 12, rgb(base, 0.8)); p.set(3, i, rgb(base, 0.8)); p.set(12, i, rgb(base, 0.8)); }
  };
  painters[`lamp_${key}`] = (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) p.set(x, y, rgb(mix(base, [255, 255, 255], p.r() * 0.35)));
    p.border(rgb(base, 0.55));
    for (let i = 5; i < 11; i++) { p.set(i, 7, '#ffffff'); p.set(i, 8, '#ffffff'); p.set(7, i, '#ffffff'); p.set(8, i, '#ffffff'); }
  };
  painters[`glyph_${key}`] = (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) p.set(x, y, rgb(mix(base, [255, 255, 255], 0.1 + p.r() * 0.15)));
    p.border(rgb(base, 0.5));
    p.glyph({ app: 'A', transport: 'T', internet: 'I', link: 'L' }[key], 5, 3, '#ffffff', 2);
  };
}

export const TILE_NAMES = Object.keys(painters);

let atlasCache = null;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function pixelTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

// The shared atlas: { texture, uv(name) → [u0, v0, u1, v1] }.
export function getAtlas() {
  if (atlasCache) return atlasCache;
  const rows = Math.ceil(TILE_NAMES.length / COLS);
  const canvas = makeCanvas(COLS * TILE, rows * TILE);
  const ctx = canvas.getContext('2d');
  const index = new Map();
  TILE_NAMES.forEach((name, i) => {
    const cx = (i % COLS) * TILE;
    const cy = Math.floor(i / COLS) * TILE;
    painters[name](new Painter(ctx, cx, cy, 1000 + i * 31));
    index.set(name, i);
  });
  const texture = pixelTexture(canvas);
  const eps = 0.02 / TILE;
  const uvs = new Map();
  for (const [name, i] of index) {
    const u0 = (i % COLS) / COLS;
    const v1 = 1 - Math.floor(i / COLS) / rows;
    uvs.set(name, [u0 + eps, v1 - 1 / rows + eps, u0 + 1 / COLS - eps, v1 - eps]);
  }
  atlasCache = { texture, canvas, uv: (name) => uvs.get(name) };
  return atlasCache;
}

const single = new Map();
// A standalone texture for one tile (for props that are not part of the terrain).
export function tileTexture(name, repeatX = 1, repeatY = 1) {
  const key = `${name}:${repeatX}:${repeatY}`;
  if (single.has(key)) return single.get(key);
  const { canvas } = getAtlas();
  const i = TILE_NAMES.indexOf(name);
  const c = makeCanvas(TILE, TILE);
  c.getContext('2d').drawImage(canvas, (i % COLS) * TILE, Math.floor(i / COLS) * TILE, TILE, TILE, 0, 0, TILE, TILE);
  const tex = pixelTexture(c);
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  single.set(key, tex);
  return tex;
}

// Six materials for a BoxGeometry: +x, -x, +y, -y, +z, -z.
export function boxMaterials({ top, side, bottom = top, front = side }, Material = THREE.MeshLambertMaterial, extra = {}) {
  const m = (n) => new Material({ map: tileTexture(n), ...extra });
  const s = m(side);
  return [s, s, m(top), m(bottom), m(front), s];
}
