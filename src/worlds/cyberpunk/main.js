import '../../shared/scenario-ui.js';
import './style.css';
import { Game } from './game.js';

const game = new Game(document.getElementById('app'));
// Handy for debugging and automated smoke tests.
window.__game = game;
