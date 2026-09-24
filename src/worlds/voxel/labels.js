import * as THREE from 'three';

let family = '"Segoe UI", system-ui, sans-serif';
// Switch world labels to another font (the pixel font, once it has loaded).
export function setLabelFont(f) {
  family = f;
}

// Canvas-backed text sprite that always faces the camera.
export function makeLabel(text, { color = '#ffffff', bg = 'rgba(8,12,32,0.72)', size = 1, font = 600, border = null } = {}) {
  const lines = String(text).split('\n');
  const px = 64;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${font} ${px}px ${family}`;
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + px;
  const height = lines.length * px * 1.25 + px * 0.5;
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  ctx.font = `${font} ${px}px ${family}`;
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, canvas.width, canvas.height, px * 0.4);
    ctx.fill();
  }
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 6;
    roundRect(ctx, 3, 3, canvas.width - 6, canvas.height - 6, px * 0.4);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, px * 0.25 + px * 1.25 * (i + 0.5)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const scale = size / px;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Tileable grid texture for plateau tops.
export function gridTexture(color, repeatX, repeatY) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0d1230';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 125, 125);
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, 0); ctx.lineTo(64, 128);
  ctx.moveTo(0, 64); ctx.lineTo(128, 64);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  return tex;
}
