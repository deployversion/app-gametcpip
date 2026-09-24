import '../../shared/scenario-ui.js';
import './style.css';
import { Game } from './game.js';
import { setLabelFont } from './labels.js';

// World labels are painted once onto canvases, so wait (briefly) for the
// pixel font before building the world.
const PIXEL = '"Pixelify Sans"';
const fontReady = Promise.race([
  document.fonts.load(`700 64px ${PIXEL}`).then((faces) => {
    if (faces.length) setLabelFont(`${PIXEL}, "Segoe UI", system-ui, sans-serif`);
  }),
  new Promise((resolve) => { setTimeout(resolve, 2500); }),
]).catch(() => {});

fontReady.then(() => {
  const game = new Game(document.getElementById('app'));
  // Handy for debugging and automated smoke tests.
  window.__game = game;
});
