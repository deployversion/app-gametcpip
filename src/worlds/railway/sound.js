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
    if (this.muted) this.master.gain.value = 0;
    this.startAmbient();
  }

  // A quiet generative bed: a warm drone, a soft server-room hiss and
  // sparse "data blips" whose scale changes with the layer you are on.
  startAmbient() {
    const ctx = this.ctx;
    this.amb = ctx.createGain();
    this.amb.gain.value = 0;
    this.amb.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 4);
    this.amb.connect(this.master);

    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 420;
    this.droneFilter.connect(this.amb);
    this.drones = [55, 82.4, 110.6].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 1 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 6;
      const g = ctx.createGain();
      g.gain.value = [0.35, 0.18, 0.12][i];
      o.connect(g).connect(this.droneFilter);
      o.start();
      return o;
    });
    // slow breathing on the filter
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 0.07;
    depth.gain.value = 160;
    lfo.connect(depth).connect(this.droneFilter.frequency);
    lfo.start();

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    this.hissFilter = ctx.createBiquadFilter();
    this.hissFilter.type = 'bandpass';
    this.hissFilter.frequency.value = 900;
    this.hissFilter.Q.value = 0.7;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0.02;
    hiss.connect(this.hissFilter).connect(this.hissGain).connect(this.amb);
    hiss.start();

    this.zone = 'app';
    this.blip();
  }

  blip() {
    const scales = {
      app: [523, 587, 659, 784, 880],
      transport: [392, 440, 523, 587, 659],
      internet: [659, 784, 880, 988, 1175],
      link: [262, 294, 330, 392, 440],
    };
    const notes = scales[this.zone] ?? scales.app;
    if (!this.muted && this.ctx.state === 'running') {
      const f = notes[Math.floor(Math.random() * notes.length)];
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(this.amb);
      o.start(t);
      o.stop(t + 1.5);
      if (Math.random() < 0.4) this.tone(f * 1.5, { at: 0.18, dur: 0.6, vol: 0.05 });
    }
    this.blipTimer = setTimeout(() => this.blip(), 1800 + Math.random() * 3200);
  }

  // Called every frame with the layer under the packet; tints the ambience.
  setZone(zone) {
    if (!this.amb || zone === this.zone) return;
    this.zone = zone;
    const t = this.ctx.currentTime;
    const hiss = { app: 0.012, transport: 0.02, internet: 0.03, link: 0.045 }[zone] ?? 0.02;
    const cutoff = { app: 520, transport: 440, internet: 700, link: 340 }[zone] ?? 420;
    this.hissGain.gain.setTargetAtTime(hiss, t, 1.2);
    this.droneFilter.frequency.setTargetAtTime(cutoff, t, 1.5);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.25, this.ctx.currentTime, 0.05);
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
