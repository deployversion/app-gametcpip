// Attract mode: while the intro card is up, the camera glides along the
// whole journey (down the sender's stack, across the internet, up the
// server's stack) and a caption names what is below.
import * as THREE from 'three';
import { PLATEAUS } from './world.js';

const LAYER_NAMES = {
  app: '4 · Application, the Bridge',
  transport: '3 · Transport, the Cargo Bay',
  internet: '2 · Internet, the Nav Deck',
  link: '1 · Link, Engineering',
};

const LOOP_SECONDS = 90;

export class Flythrough {
  constructor() {
    const pts = [];
    // Down the sender's stack, seen from the front and a little above.
    for (const p of PLATEAUS.filter((q) => q.side === 'sender')) {
      pts.push(new THREE.Vector3((p.x0 + p.x1) / 2, p.h + 13, 24));
    }
    // Low over the internet, weaving between the routers.
    pts.push(new THREE.Vector3(10, 16, 26), new THREE.Vector3(22, 20, 30), new THREE.Vector3(36, 16, 24));
    // Up the server's stack.
    for (const p of PLATEAUS.filter((q) => q.side === 'receiver')) {
      pts.push(new THREE.Vector3((p.x0 + p.x1) / 2, p.h + 13, 24));
    }
    // Swing out wide and high to show the whole journey, then back to the start.
    pts.push(new THREE.Vector3(165, 45, -20), new THREE.Vector3(10, 85, -95), new THREE.Vector3(-150, 45, -20));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.u = 0;
    this.caption = '';
  }

  // Advances the camera and returns { pos, look, caption }.
  step(dt) {
    this.u = (this.u + dt / LOOP_SECONDS) % 1;
    const pos = this.curve.getPointAt(this.u);
    const ahead = this.curve.getPointAt((this.u + 0.025) % 1);
    const look = new THREE.Vector3(ahead.x, 0, ahead.z * 0.15);
    const plateau = PLATEAUS.find((p) => pos.x >= p.x0 - 6 && pos.x <= p.x1 + 6);
    look.y = plateau ? plateau.h : 0;
    let caption;
    if (pos.z < -10) caption = 'The whole trip: down Terra-1, across open space, up Kepler Station';
    else if (plateau) caption = `Deck ${LAYER_NAMES[plateau.layer]} · ${plateau.side === 'sender' ? 'Terra-1, Alice\'s station' : 'Kepler Station, the web server'}`;
    else if (pos.x > -2 && pos.x < 44) caption = 'Open space · relay satellites pass you from hop to hop';
    else caption = this.caption;
    this.caption = caption;
    return { pos, look, caption };
  }
}
