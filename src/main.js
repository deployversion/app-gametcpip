import './style.css';
import { Game } from './game.js';

const TIPS = [
  'Every router lowers the TTL by one. At zero the packet is thrown away.',
  'Routers pick the most specific matching route: the longest prefix wins.',
  'TCP numbers every segment so the receiver can put them back in order.',
  'The Ethernet header is replaced at every hop. The IP header travels end to end.',
  'Ports tell the server which program should get the data: 443 is HTTPS.',
];

const fill = document.getElementById('loader-fill');
const stepText = document.getElementById('loader-step');
document.getElementById('loader-tip').textContent = `Tip: ${TIPS[Math.floor(Math.random() * TIPS.length)]}`;

const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
async function step(text, pct) {
  stepText.textContent = text;
  fill.style.width = `${pct}%`;
  await frame();
}

async function boot() {
  await step('Building the layers and the internet…', 25);
  const game = new Game(document.getElementById('app'));
  // Handy for debugging and automated smoke tests.
  window.__game = game;
  await step('Warming up the shaders…', 70);
  try {
    await game.renderer.compileAsync(game.scene, game.camera);
  } catch {
    // older drivers: shaders compile on first draw instead
  }
  await step('Ready', 100);
  const loader = document.getElementById('loader');
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 600);
}

boot().catch((err) => {
  stepText.textContent = `Could not start the 3D world: ${err.message}. Try a browser with WebGL enabled.`;
  document.getElementById('loader').classList.add('failed');
  throw err;
});
