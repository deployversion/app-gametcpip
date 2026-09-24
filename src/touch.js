// On-screen controls for phones and tablets: a virtual joystick on the
// left, jump and "use" buttons on the right, and pinch to zoom the camera.
// They appear on the first touch, so desktop players never see them.

const RADIUS = 52;

export class TouchControls {
  constructor({ onJump, onUse, onZoom, canvas }) {
    this.vec = { x: 0, y: 0 };
    this.active = false;
    this.pinching = false;

    const root = document.createElement('div');
    root.id = 'touch';
    root.hidden = true;
    root.innerHTML = `
      <div class="stick"><div class="knob"></div></div>
      <div class="touch-btns">
        <button class="use" aria-label="Use station">E</button>
        <button class="jump" aria-label="Jump">⤒</button>
      </div>`;
    document.body.appendChild(root);
    this.root = root;

    const stick = root.querySelector('.stick');
    const knob = root.querySelector('.knob');
    let id = null;
    let origin = null;
    const move = (e) => {
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS) {
        dx *= RADIUS / d;
        dy *= RADIUS / d;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.vec.x = dx / RADIUS;
      this.vec.y = dy / RADIUS;
    };
    const release = () => {
      id = null;
      this.vec.x = 0;
      this.vec.y = 0;
      knob.style.transform = '';
      stick.classList.remove('held');
    };
    stick.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      const r = stick.getBoundingClientRect();
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      try { stick.setPointerCapture(id); } catch { /* synthetic pointer */ }
      stick.classList.add('held');
      move(e);
      e.preventDefault();
    });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);

    const tap = (sel, fn) => root.querySelector(sel).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    tap('.jump', onJump);
    tap('.use', onUse);

    // Pinch to zoom on the 3D view.
    const touches = new Map();
    let pinch = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, e);
      if (touches.size === 2) pinch = this.spread(touches);
      this.pinching = touches.size > 1;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, e);
      if (touches.size === 2 && pinch) {
        const s = this.spread(touches);
        onZoom((pinch - s) * 0.06);
        pinch = s;
      }
    });
    const lift = (e) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
      this.pinching = touches.size > 1;
    };
    canvas.addEventListener('pointerup', lift);
    canvas.addEventListener('pointercancel', lift);

    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.enable(); }, { capture: true });
    if (window.matchMedia?.('(pointer: coarse)').matches) this.enable();
  }

  spread(touches) {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  enable() {
    if (this.active) return;
    this.active = true;
    this.root.hidden = false;
    document.body.classList.add('touch');
  }

  // Show or hide the pad (it is only useful while walking).
  setVisible(on) {
    this.root.classList.toggle('off', !on);
  }

  setUseReady(on) {
    this.root.querySelector('.use').classList.toggle('ready', on);
  }
}
