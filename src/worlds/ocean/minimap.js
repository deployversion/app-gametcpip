import { LAYERS } from '../../shared/content.js';
import { PLATEAUS, NODES, LINKS, DECK_HALF } from './world.js';

// A 2D overview of the whole world, drawn on a small canvas every frame.
const X0 = -128;
const X1 = 150;
const Z0 = -DECK_HALF - 4;
const Z1 = DECK_HALF + 4;

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = canvas.clientWidth || 260;
    this.h = canvas.clientHeight || 70;
    canvas.width = this.w * dpr;
    canvas.height = this.h * dpr;
    this.ctx.scale(dpr, dpr);
  }

  sx(x) {
    return ((x - X0) / (X1 - X0)) * this.w;
  }

  sy(z) {
    return ((z - Z0) / (Z1 - Z0)) * this.h;
  }

  draw({ player, heading, stations, current, orbs, ferries, routers, time }) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(4, 8, 30, 0.85)';
    ctx.fillRect(0, 0, w, h);

    // network links and routers
    ctx.strokeStyle = 'rgba(75, 225, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [a, b] of LINKS) {
      ctx.moveTo(this.sx(NODES[a][0]), this.sy(NODES[a][1]));
      ctx.lineTo(this.sx(NODES[b][0]), this.sy(NODES[b][1]));
    }
    ctx.moveTo(this.sx(-2), this.sy(0));
    ctx.lineTo(this.sx(NODES.GW[0]), this.sy(0));
    ctx.moveTo(this.sx(NODES.SW[0]), this.sy(NODES.SW[1]));
    ctx.lineTo(this.sx(44), this.sy(0));
    ctx.stroke();
    for (const [id, [x, z]] of Object.entries(NODES)) {
      const active = routers === id;
      ctx.fillStyle = active ? '#ffffff' : '#4be1ff';
      ctx.beginPath();
      ctx.arc(this.sx(x), this.sy(z), active ? 3 + Math.sin(time * 6) : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // plateaus
    for (const p of PLATEAUS) {
      const c = LAYERS[p.layer].color;
      ctx.fillStyle = `${c}55`;
      ctx.strokeStyle = c;
      const x = this.sx(p.x0);
      const y = this.sy(-DECK_HALF);
      const pw = this.sx(p.x1) - x;
      const ph = this.sy(DECK_HALF) - y;
      ctx.fillRect(x, y, pw, ph);
      ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
    }

    // orbs
    ctx.fillStyle = '#ffffffcc';
    for (const o of orbs) {
      if (o.collected) continue;
      ctx.fillRect(this.sx(o.entry.x) - 1, this.sy(o.entry.z) - 1, 2, 2);
    }

    // stations: the current one pulses
    for (const s of stations) {
      const isCurrent = s.id === current;
      ctx.fillStyle = isCurrent ? '#ffd166' : 'rgba(255,255,255,0.5)';
      const r = isCurrent ? 3 + Math.sin(time * 6) * 1.2 : 2;
      ctx.beginPath();
      ctx.arc(this.sx(s.position.x), this.sy(s.position.z), r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const f of ferries) {
      if (!f.group.visible) continue;
      ctx.strokeStyle = '#4be1ff';
      ctx.beginPath();
      ctx.arc(this.sx(f.position.x), this.sy(f.position.z), 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // the player: an arrow pointing where the packet faces
    const px = this.sx(player.x);
    const py = this.sy(player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-heading + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0b0f2a';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, 4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
