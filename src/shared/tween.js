// Minimal promise-based tweening, driven by the game loop.
const active = new Set();

export const ease = {
  linear: (k) => k,
  inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  out: (k) => 1 - Math.pow(1 - k, 3),
  back: (k) => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2),
};

export function tween(duration, onUpdate, easing = ease.inOut) {
  return new Promise((resolve) => {
    active.add({ t: 0, duration: Math.max(duration, 0.0001), onUpdate, easing, resolve });
  });
}

export function wait(seconds) {
  return tween(seconds, () => {});
}

export function updateTweens(dt) {
  for (const tw of active) {
    tw.t += dt;
    const k = Math.min(tw.t / tw.duration, 1);
    tw.onUpdate(tw.easing(k), k);
    if (k >= 1) {
      active.delete(tw);
      tw.resolve();
    }
  }
}
