import * as THREE from 'three';

// A floating holographic routing table above the router the packet is at.
// Rows light up as the player hovers them in the panel.
const W = 640;
const ROW = 56;
const HEAD = 96;

export class RouteHologram {
  constructor(scene) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    this.sprite.visible = false;
    this.sprite.renderOrder = 5;
    scene.add(this.sprite);
    this.route = null;
    this.hover = -1;
    this.chosen = -1;
  }

  show(route, position) {
    this.route = route;
    this.hover = -1;
    this.chosen = -1;
    this.canvas.width = W;
    this.canvas.height = HEAD + route.table.length * ROW + 24;
    const scale = 7 / W;
    this.sprite.scale.set(W * scale, this.canvas.height * scale, 1);
    this.sprite.position.copy(position).add(new THREE.Vector3(0, 4.2 + this.sprite.scale.y / 2, 0));
    this.sprite.visible = true;
    this.sprite.material.opacity = 0;
    this.draw();
  }

  hide() {
    this.sprite.visible = false;
    this.route = null;
  }

  setHover(i) {
    if (!this.route || this.hover === i) return;
    this.hover = i;
    this.draw();
  }

  setChosen(i) {
    this.chosen = i;
    this.draw();
  }

  update(dt, t) {
    if (!this.sprite.visible) return;
    this.sprite.material.opacity = Math.min(0.95, this.sprite.material.opacity + dt * 2);
    this.sprite.position.y += Math.sin(t * 2) * 0.003;
  }

  draw() {
    const { ctx, canvas, route } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(6, 30, 50, 0.78)';
    ctx.strokeStyle = '#4be1ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 18);
    ctx.fill();
    ctx.stroke();
    // scanlines for the hologram look
    ctx.fillStyle = 'rgba(75, 225, 255, 0.05)';
    for (let y = 8; y < canvas.height; y += 6) ctx.fillRect(8, y, canvas.width - 16, 2);

    ctx.fillStyle = '#bfe9ff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(`${route.name} · routing table`, 26, 46);
    ctx.font = '600 20px sans-serif';
    ctx.fillStyle = '#7fb8d8';
    ctx.fillText('DESTINATION', 26, 82);
    ctx.fillText('NEXT HOP', 330, 82);

    route.table.forEach((row, i) => {
      const y = HEAD + i * ROW;
      if (i === this.chosen || i === this.hover) {
        ctx.fillStyle = i === this.chosen ? 'rgba(53, 208, 127, 0.4)' : 'rgba(255, 209, 102, 0.5)';
        ctx.fillRect(14, y, canvas.width - 28, ROW - 6);
      }
      ctx.fillStyle = i === this.chosen ? '#9fffc8' : i === this.hover ? '#ffe3a0' : '#e6f6ff';
      ctx.font = '26px monospace';
      ctx.fillText(row.dest, 26, y + 36);
      ctx.font = '24px sans-serif';
      ctx.fillText(row.hop, 330, y + 36);
    });
    this.texture.needsUpdate = true;
  }
}
