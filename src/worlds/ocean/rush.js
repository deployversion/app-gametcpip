// Router Rush: a 60-second bonus game. Each round shows a random routing
// table and destination; the player picks the longest matching prefix.
import { rushQuestion, makeRng } from '../../shared/logic/rush.js';
import { cidrContains } from '../../shared/logic/net.js';
import { sfx } from './sound.js';

const $ = (sel) => document.querySelector(sel);
const DURATION = 60;
const PENALTY = 5;
const BEST_KEY = 'packetquest.rushBest';
const LEVELS = ['Level 1 · Home router', 'Level 2 · ISP router', 'Level 3 · Backbone router'];

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export class RouterRush {
  constructor({ onExit, onCorrect }) {
    this.onExit = onExit;
    this.onCorrect = onCorrect;
    this.timer = null;
    $('#rush-again').addEventListener('click', () => this.start());
    $('#rush-back').addEventListener('click', () => this.exit());
  }

  get active() {
    return !$('#rush').hidden;
  }

  start() {
    sfx.unlock();
    this.rng = makeRng();
    this.score = 0;
    this.streak = 0;
    this.correct = 0;
    this.answered = 0;
    this.timeLeft = DURATION;
    this.locked = false;
    $('#rush').hidden = false;
    $('#rush-play').hidden = false;
    $('#rush-over').hidden = true;
    this.next();
    this.paint();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(0.1), 100);
  }

  get level() {
    return Math.min(2, Math.floor(this.correct / 5));
  }

  tick(dt) {
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) this.end();
    this.paint();
  }

  paint() {
    $('#rush-time').textContent = Math.max(0, Math.ceil(this.timeLeft));
    $('#rush-streak').textContent = this.streak;
    $('#rush-score').textContent = this.score;
    $('#rush-level').textContent = LEVELS[this.level];
    $('#rush-bar').style.width = `${Math.max(0, (this.timeLeft / DURATION) * 100)}%`;
  }

  next() {
    const q = rushQuestion(this.rng, this.level);
    this.q = q;
    this.locked = false;
    $('#rush-dest').textContent = q.dest;
    $('#rush-feedback').className = 'feedback';
    $('#rush-feedback').textContent = '';
    const table = $('#rush-table');
    table.innerHTML = '<div class="row head"><span>Destination</span><span>Interface</span></div>';
    q.table.forEach((row, i) => {
      const b = document.createElement('button');
      b.className = 'row';
      b.innerHTML = `<span>${row.dest}</span><span>${row.hop}</span>`;
      b.addEventListener('click', () => this.answer(i, b));
      table.appendChild(b);
    });
  }

  answer(i, button) {
    if (this.locked) return;
    this.answered++;
    const { q } = this;
    if (i === q.answer) {
      this.correct++;
      this.streak++;
      const bonus = 1 + Math.floor(this.streak / 3);
      this.score += 10 * bonus;
      button.classList.add('right');
      sfx.correct();
      this.onCorrect?.();
      this.locked = true;
      setTimeout(() => { if (this.active && this.timeLeft > 0) this.next(); }, 350);
    } else {
      this.streak = 0;
      this.timeLeft -= PENALTY;
      sfx.wrong();
      button.classList.add('wrong');
      const winner = q.table[q.answer];
      const picked = q.table[i];
      const matches = cidrContains(picked.dest, q.dest);
      $('#rush-feedback').className = 'feedback bad';
      $('#rush-feedback').innerHTML = `<b>−${PENALTY}s.</b> ${matches
        ? `${picked.dest} matches, but ${winner.dest} is longer.`
        : `${q.dest} is not inside ${picked.dest}.`} The winner is <b>${winner.dest}</b> → ${winner.hop}.`;
      $('#rush-table').children[q.answer + 1].classList.add('reveal');
      this.locked = true;
      setTimeout(() => { if (this.active && this.timeLeft > 0) this.next(); }, 1800);
    }
    this.paint();
  }

  end() {
    clearInterval(this.timer);
    this.timeLeft = 0;
    const best = readBest();
    const isBest = this.score > best;
    if (isBest) {
      try {
        localStorage.setItem(BEST_KEY, String(this.score));
      } catch {
        // storage unavailable: best score just won't persist
      }
    }
    sfx.fanfare();
    $('#rush-play').hidden = true;
    $('#rush-over').hidden = false;
    $('#rush-final').textContent = `★ ${this.score} points`;
    $('#rush-final-detail').textContent = `${this.correct} of ${this.answered} packets routed correctly · ${isBest ? 'new best!' : `best: ${best}`}`;
  }

  exit() {
    clearInterval(this.timer);
    $('#rush').hidden = true;
    this.onExit();
  }
}
