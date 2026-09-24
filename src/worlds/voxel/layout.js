// Where everything sits in the world. Pure data and math (no three.js, no DOM)
// so the terrain generator, the game and the tests can all share it.

export const PATH_HALF_WIDTH = 9;
// How far off the paved path you may wander to explore.
export const EXPLORE_HALF_WIDTH = 30;

export const PROFILE = {
  sender: [[-124, 15], [-88, 15], [-78, 10], [-58, 10], [-48, 5], [-28, 5], [-18, 0], [-2, 0]],
  receiver: [[44, 0], [60, 0], [70, 5], [86, 5], [96, 10], [112, 10], [122, 15], [146, 15]],
};

export const PLATEAUS = [
  { side: 'sender', layer: 'app', x0: -124, x1: -88, h: 15 },
  { side: 'sender', layer: 'transport', x0: -78, x1: -58, h: 10 },
  { side: 'sender', layer: 'internet', x0: -48, x1: -28, h: 5 },
  { side: 'sender', layer: 'link', x0: -18, x1: -2, h: 0 },
  { side: 'receiver', layer: 'link', x0: 44, x1: 60, h: 0 },
  { side: 'receiver', layer: 'internet', x0: 70, x1: 86, h: 5 },
  { side: 'receiver', layer: 'transport', x0: 96, x1: 112, h: 10 },
  { side: 'receiver', layer: 'app', x0: 122, x1: 146, h: 15 },
];

export const STATION_X = {
  'send-app': -100,
  'send-transport': -68,
  'send-internet': -38,
  'send-link': -10,
  'recv-link': 52,
  'recv-internet': 78,
  'recv-transport': 104,
  'recv-app': 132,
};
export const STATION_Z = -5.5;

// A locked gate at the downhill/uphill exit of each plateau.
export const GATE_X = {
  'send-app': -88,
  'send-transport': -58,
  'send-internet': -28,
  'send-link': -2,
  'recv-link': 60,
  'recv-internet': 86,
  'recv-transport': 112,
};

export const SIDE_BOUNDS = { sender: [-121, -2.5], receiver: [45.5, 143] };

export const NODES = {
  GW: [5, 0],
  R1: [16, 0],
  R2: [26, -15],
  R3: [25, 15],
  R4: [32, 0],
  R5: [14, -17],
  R6: [39, -14],
  SW: [41, 3],
};
export const NODE_Y = 1.2;
export const SEA_LEVEL = -1.4;

export const LAPTOP = { x: -114, z: -15 };
export const RACK = { x: 142, z: -3 };
// Big pixel-number monuments behind each plateau.
export const MONUMENT_Z = -21;

// Piecewise-linear profile of the paved path; the voxel world rounds it per
// block column, so the ramps between layers become staircases.
export function profileHeight(x) {
  const pts = x < 20 ? PROFILE.sender : PROFILE.receiver;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

export function columnHeight(cx) {
  return Math.round(profileHeight(cx + 0.5));
}

// Ground height of the paved path at x.
export function heightAt(x) {
  return columnHeight(Math.floor(x));
}

export function plateauAt(x) {
  return PLATEAUS.find((p) => x >= p.x0 && x < p.x1) ?? null;
}
