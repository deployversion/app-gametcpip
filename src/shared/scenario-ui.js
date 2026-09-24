// Dresses a world page in its scenario: chapter title, story, real-life facts
// and a way back to the scenario menu. Works on every world's HTML, because
// it only relies on the #intro and #end cards they all share.
import { SCENARIO, SCENARIOS } from './scenarios.js';

const MENU_URL = '../../index.html';
const chapter = SCENARIOS.indexOf(SCENARIO) + 1;

document.title = `Packet Quest · ${SCENARIO.title}`;

const style = document.createElement('style');
style.textContent = `
  .scenario-facts { text-align: left; margin: 12px 0; padding: 10px 14px; border-radius: 10px;
    background: rgba(127,127,127,0.12); border: 1px solid rgba(127,127,127,0.25); font-size: 0.92em; }
  .scenario-facts b { display: block; margin-bottom: 4px; }
  .scenario-facts ul { margin: 0; padding-left: 1.2em; }
  .scenario-facts li { margin: 3px 0; }
  a.scenario-menu { text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
`;
document.head.append(style);

function factsBox(heading) {
  const box = document.createElement('div');
  box.className = 'scenario-facts';
  box.innerHTML = `<b>${heading}</b><ul>${SCENARIO.facts.map((f) => `<li>${f}</li>`).join('')}</ul>`;
  return box;
}

function menuLink(className) {
  const a = document.createElement('a');
  a.href = MENU_URL;
  a.className = `${className} scenario-menu`;
  a.textContent = '🗺️ All scenarios';
  return a;
}

const intro = document.querySelector('#intro .card');
if (intro) {
  const kicker = intro.querySelector('.kicker');
  if (kicker) kicker.textContent = `Chapter ${chapter} of ${SCENARIOS.length} · ${SCENARIO.title}`;
  const story = [...intro.querySelectorAll('p')].find((p) => /catpics|cat picture/i.test(p.textContent));
  if (story) story.innerHTML = SCENARIO.story;
  const actions = intro.querySelector('.actions');
  if (actions) actions.append(menuLink('secondary big'));
  // Below the buttons, so Start stays where players expect it.
  intro.append(factsBox(`${SCENARIO.emoji} ${SCENARIO.title} in real life`));
}

const end = document.querySelector('#end .card');
if (end) {
  const title = end.querySelector('h1');
  if (title) title.textContent = SCENARIO.doneTitle;
  for (const p of end.querySelectorAll('p')) {
    p.innerHTML = p.innerHTML.replace(/The cat picture now makes the same trip back to Alice\./, `Now ${SCENARIO.item} makes the same trip back to Alice.`);
  }
  const actions = end.querySelector('.actions');
  if (actions) {
    actions.before(factsBox('Did you know?'));
    actions.append(menuLink('secondary big'));
  }
}
