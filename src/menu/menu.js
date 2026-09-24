// The scenario menu. Deliberately tiny: no Three.js here, each world page
// loads its own 3D code only when you pick it.
import './menu.css';
import { SCENARIOS, bestKey } from '../shared/scenarios.js';

const best = (id) => {
  try {
    return Number(localStorage.getItem(bestKey(id))) || 0;
  } catch {
    return 0;
  }
};

const list = document.getElementById('scenarios');
list.innerHTML = SCENARIOS.map((s, i) => {
  const score = best(s.id);
  return `
    <li class="scenario${score ? ' done' : ''}">
      <a href="worlds/${s.world}/index.html">
        <div class="thumb" style="background-image:url(thumbs/${s.world}.jpg)">
          <span class="chapter">Chapter ${i + 1}</span>
          ${score ? `<span class="badge">✓ Best ${score}</span>` : ''}
        </div>
        <div class="body">
          <h2><span class="emoji">${s.emoji}</span> ${s.title}</h2>
          <div class="world">${s.worldName}</div>
          <p>${s.blurb}</p>
          <span class="play">${score ? 'Play again' : 'Play'} →</span>
        </div>
      </a>
    </li>`;
}).join('');

const done = SCENARIOS.filter((s) => best(s.id)).length;
document.getElementById('progress').textContent = done
  ? `You have completed ${done} of ${SCENARIOS.length} chapters.`
  : 'Start anywhere: every chapter stands on its own. Chapter 1 is a good first one.';
