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

  correct() { [523, 659, 784].forEach((f, i) => this.tone(f, { at: i * 0.07, dur: 0.18, type: 'triangle' })); }
  wrong() { this.tone(160, { dur: 0.25, type: 'sawtooth', vol: 0.5, slide: 110 }); }
  click() { this.tone(880, { dur: 0.05, type: 'square', vol: 0.2 }); }
  collect() { [988, 1319, 1568, 2093].forEach((f, i) => this.tone(f, { at: i * 0.05, dur: 0.12, vol: 0.5 })); }
  whoosh() { this.tone(220, { dur: 0.5, type: 'triangle', vol: 0.4, slide: 880 }); }
  gate() { [392, 523, 659].forEach((f) => this.tone(f, { dur: 0.5, type: 'triangle', vol: 0.4 })); }
  drop() { this.tone(600, { dur: 0.7, type: 'sawtooth', vol: 0.5, slide: 60 }); }
  // A two-tone steam whistle.
  whistle() {
    [587, 740].forEach((f) => this.tone(f, { dur: 0.7, type: 'triangle', vol: 0.18 }));
    [587, 740].forEach((f) => this.tone(f * 1.003, { at: 0.05, dur: 0.6, type: 'sine', vol: 0.12 }));
  }

  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, { at: i * 0.11, dur: 0.25, type: 'triangle' })); }
}

export const sfx = new Sfx();
