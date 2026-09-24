// Watches the real frame rate and steps graphics detail down when a device
// struggles, so a phone or an old laptop still plays smoothly.
// Tiers, from best to cheapest:
//   0  full resolution, glow, soft shadows
//   1  1x resolution, glow, soft shadows
//   2  1x resolution, no glow
//   3  0.75x resolution, no glow, no shadows

export const TIERS = [
  { name: 'Ultra', ratio: 1.75, bloom: true, shadows: true },
  { name: 'High', ratio: 1, bloom: true, shadows: true },
  { name: 'Medium', ratio: 1, bloom: false, shadows: true },
  { name: 'Low', ratio: 0.75, bloom: false, shadows: false },
];

const WINDOW = 2.5; // seconds of frames to average
const SLOW_FPS = 32;
const GRACE = 3; // seconds to ignore after a change (shader compiles, resizes)

export class AdaptiveQuality {
  constructor({ tier = 0, auto = true, onChange }) {
    this.tier = tier;
    this.auto = auto;
    this.onChange = onChange;
    this.frames = 0;
    this.elapsed = 0;
    this.grace = GRACE;
    this.fps = 60;
  }

  // Feed the unclamped frame time in seconds.
  sample(realDt) {
    if (realDt <= 0 || realDt > 1) return; // tab switch or a hitch, not a trend
    if (this.grace > 0) {
      this.grace -= realDt;
      return;
    }
    this.frames++;
    this.elapsed += realDt;
    if (this.elapsed < WINDOW) return;
    this.fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    if (this.auto && this.fps < SLOW_FPS && this.tier < TIERS.length - 1) this.set(this.tier + 1, true);
  }

  set(tier, automatic = false) {
    this.tier = Math.max(0, Math.min(TIERS.length - 1, tier));
    this.grace = GRACE;
    this.onChange?.(TIERS[this.tier], automatic);
  }
}
