// Tiny synthesized sound effects (Web Audio), so the game ships no audio files.
const STORAGE_KEY = 'packetquest.muted';

class Sfx {
  constructor() {
    this.ctx = null;
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  // Browsers only allow audio after a user gesture, so call this from one.
  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(this.ctx.destination);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.amb) this.amb.gain.gain.setTargetAtTime(muted ? 0 : this.amb.level, this.ctx.currentTime, 0.3);
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // storage unavailable: the setting just won't persist
    }
  }

  tone(freq, { at = 0, dur = 0.15, type = 'sine', vol = 1, slide = null } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // A low, filtered rumble of water plus the odd bubble. Deeper water
  // (setDepth, 0..1) sounds darker and a little louder.
  ambience() {
    if (!this.ctx || this.amb) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown noise: integrated white noise
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    const level = 0.5;
    gain.gain.value = this.muted ? 0 : level;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(filter.frequency);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    lfo.start();
    this.amb = { filter, gain, level };
    this.bubbleTimer = setInterval(() => {
      if (Math.random() < 0.6) this.blub();
    }, 1800);
  }

  setDepth(depth) {
    if (!this.amb) return;
    const t = this.ctx.currentTime;
    this.amb.filter.frequency.setTargetAtTime(420 - depth * 260, t, 0.5);
    this.amb.level = 0.5 + depth * 0.25;
    if (!this.muted) this.amb.gain.gain.setTargetAtTime(this.amb.level, t, 0.5);
  }

  blub() {
    const f = 300 + Math.random() * 500;
    this.tone(f, { dur: 0.09, vol: 0.12, slide: f * 2.2 });
    if (Math.random() < 0.5) this.tone(f * 1.3, { at: 0.08, dur: 0.07, vol: 0.08, slide: f * 2.8 });
  }

  sonar() {
    this.tone(1250, { dur: 0.9, vol: 0.45 });
    this.tone(1250, { at: 0.45, dur: 0.7, vol: 0.14 });
    this.tone(1250, { at: 0.9, dur: 0.6, vol: 0.05 });
  }

  correct() { [523, 659, 784].forEach((f, i) => this.tone(f, { at: i * 0.07, dur: 0.18, type: 'triangle' })); }
  wrong() { this.tone(160, { dur: 0.25, type: 'sawtooth', vol: 0.5, slide: 110 }); }
  click() { this.tone(880, { dur: 0.05, type: 'square', vol: 0.2 }); }
  collect() { [988, 1319, 1568, 2093].forEach((f, i) => this.tone(f, { at: i * 0.05, dur: 0.12, vol: 0.5 })); }
  whoosh() { this.tone(220, { dur: 0.5, type: 'triangle', vol: 0.4, slide: 880 }); }
  gate() { [392, 523, 659].forEach((f) => this.tone(f, { dur: 0.5, type: 'triangle', vol: 0.4 })); }
  drop() { this.tone(600, { dur: 0.7, type: 'sawtooth', vol: 0.5, slide: 60 }); }
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, { at: i * 0.11, dur: 0.25, type: 'triangle' })); }
}

export const sfx = new Sfx();
