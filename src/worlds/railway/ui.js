import { LAYERS } from '../../shared/content.js';
import { GLOSSARY } from '../../shared/glossary.js';
import { sfx } from './sound.js';

const $ = (sel) => document.querySelector(sel);

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // never show an order puzzle already solved
  if (a.length > 1 && a.every((v, i) => v === arr[i])) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

export function pointsFor(mistakes) {
  return [100, 50, 25][mistakes] ?? 10;
}

export class UI {
  constructor({ onStart, onRestart, onInteract, onRush, onExplore, onQuality }) {
    this.panel = $('#panel');
    this.panelTitle = $('#panel-title');
    this.panelLayer = $('#panel-layer');
    this.panelBody = $('#panel-body');
    this.prompt = $('#prompt');
    this.toastEl = $('#toast');
    $('#start-btn').addEventListener('click', onStart);
    $('#restart-btn').addEventListener('click', onRestart);
    this.prompt.addEventListener('click', onInteract);
    $('#rush-btn').addEventListener('click', () => onRush('intro'));
    $('#end-rush-btn').addEventListener('click', () => onRush('end'));
    $('#explore-btn').addEventListener('click', () => onExplore('intro'));
    $('#end-explore-btn').addEventListener('click', () => onExplore('end'));
    $('#quality-btn').addEventListener('click', onQuality);
    $('#glossary-btn').addEventListener('click', () => this.toggleGlossary());
    $('#glossary-close').addEventListener('click', () => this.toggleGlossary(false));
    const mute = $('#mute-btn');
    const paintMute = () => { mute.textContent = sfx.muted ? '🔇' : '🔊'; };
    mute.addEventListener('click', () => {
      sfx.setMuted(!sfx.muted);
      paintMute();
    });
    paintMute();
    this.collected = new Set();
    this.buildLegend();
    this.renderGlossary();
  }

  setQuality(high, name = '', auto = false) {
    const b = $('#quality-btn');
    b.classList.toggle('off', !high);
    const mode = `Graphics: ${name}${auto ? ' (auto)' : ''}`;
    b.title = `${mode}. Glow ${high ? 'on (click to turn off)' : 'off (click to turn on)'}`;
  }

  // ------------------------------------------------------------ glossary
  collect(id) {
    this.collected.add(id);
    this.renderGlossary(id);
  }

  renderGlossary(freshId = null) {
    $('#orb-count').textContent = `${this.collected.size}/${GLOSSARY.length}`;
    $('#glossary-progress').textContent = this.collected.size === GLOSSARY.length
      ? 'You found every knowledge orb. Nice exploring!'
      : `${this.collected.size} of ${GLOSSARY.length} found. Walk through the glowing ? orbs to unlock more.`;
    $('#glossary-list').innerHTML = GLOSSARY.map((g) => {
      const l = LAYERS[g.layer];
      if (!this.collected.has(g.id)) {
        return `<div class="gcard locked" style="--c:${l.color}"><b>???</b>Hidden somewhere on a ${l.name} layer plateau.</div>`;
      }
      return `<div class="gcard${g.id === freshId ? ' fresh' : ''}" style="--c:${l.color}"><b>${g.term}</b>${g.text}</div>`;
    }).join('');
  }

  toggleGlossary(open = $('#glossary').hidden) {
    $('#glossary').hidden = !open;
  }

  get glossaryOpen() {
    return !$('#glossary').hidden;
  }

  buildLegend() {
    const legend = $('#legend');
    legend.innerHTML = '';
    for (const key of ['app', 'transport', 'internet', 'link']) {
      const l = LAYERS[key];
      const pill = document.createElement('div');
      pill.className = 'pill';
      pill.dataset.layer = key;
      pill.style.setProperty('--c', l.color);
      pill.innerHTML = `<span class="num">${l.num}</span>${l.name}`;
      legend.appendChild(pill);
    }
  }

  setActiveLayer(layer) {
    document.querySelectorAll('#legend .pill').forEach((p) => p.classList.toggle('active', p.dataset.layer === layer));
  }

  setScore(score, max) {
    $('#score').textContent = `${score} / ${max}`;
  }

  setObjective(text) {
    $('#objective-text').textContent = text;
  }

  showPrompt(title) {
    if (title) {
      this.prompt.innerHTML = `<kbd>E</kbd> Open <b>${title}</b>`;
      this.prompt.hidden = false;
    } else {
      this.prompt.hidden = true;
    }
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  setAttractCaption(text) {
    const el = $('#attract-caption');
    if (el.textContent !== text) el.textContent = text;
  }

  hideIntro() {
    $('#intro').hidden = true;
    $('#hud').hidden = false;
  }

  showEnd({ score, max, mistakes, seconds, results, best }) {
    const pct = score / max;
    const stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : 1;
    $('#end-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('#end-score').textContent = `${score} / ${max} points`;
    const m = Math.floor(seconds / 60);
    const s = String(Math.floor(seconds % 60)).padStart(2, '0');
    const bestText = best > score ? ` · your best: ${best}` : best === score && best > 0 ? ' · new personal best!' : '';
    $('#end-detail').textContent = `${mistakes} wrong answer${mistakes === 1 ? '' : 's'} · ${m}:${s} minutes · ${this.collected.size}/${GLOSSARY.length} orbs${bestText}`;
    const chip = (r) => `<span class="topic${r.mistakes ? ' retry' : ''}" style="--c:${LAYERS[r.layer].color}">${r.topic}</span>`;
    const retry = results.filter((r) => r.mistakes);
    $('#end-report').innerHTML = `
      <h3>What you practised</h3><div class="report-grid">${results.map(chip).join('')}</div>
      ${retry.length ? `<h3>Worth another look</h3><div class="report-grid">${retry.map(chip).join('')}</div>` : '<h3>Every topic right on the first try. Impressive!</h3>'}`;
    $('#end').hidden = false;
  }

  hideEnd() {
    $('#end').hidden = true;
  }

  // Packet anatomy: the headers you currently carry, outermost first.
  renderPacket(packet) {
    const card = $('#packet-card');
    const order = ['link', 'internet', 'transport', 'app'];
    const present = order.filter((k) => packet[k]);
    if (!present.length) {
      card.innerHTML = '<div class="empty">You are an empty engine. No cargo yet.</div>';
      return;
    }
    const outer = present[0];
    const fieldText = {
      link: (f) => `dst MAC ${f.dst}<br>src MAC ${f.src}<br>type ${f.type}`,
      internet: (f) => `dst IP ${f.dst}<br>src IP ${f.src}<br>TTL ${f.ttl} · proto ${f.proto}`,
      transport: (f) => `dst port ${f.dstPort} · src port ${f.srcPort}<br>seq ${f.seq} · ack ${f.ack}<br>flags ${f.flags}`,
      app: (f) => `${f.proto}<br><code>${f.data}</code>`,
    };
    let html = '';
    for (const k of present) {
      const l = LAYERS[k];
      html += `<div class="hdr" style="--c:${l.color}"><div class="hdr-name">${k === 'app' ? 'Data' : l.header} <span>${l.name}</span></div><div class="hdr-fields">${fieldText[k](packet[k])}</div>`;
    }
    html += '</div>'.repeat(present.length);
    if (packet.link) html += '<div class="fcs" style="--c:' + LAYERS.link.color + '">FCS checksum</div>';
    card.innerHTML = `<div class="pdu">You are a <b>${LAYERS[outer].pdu.toLowerCase()}</b></div>${html}`;
  }

  // Runs a station's steps one by one. Resolves when the last one is done.
  runStation(station, hooks) {
    const layer = LAYERS[station.layer];
    this.panel.style.setProperty('--c', station.side === 'network' ? '#4be1ff' : layer.color);
    this.panelTitle.textContent = station.title;
    if (station.side === 'network') this.panelLayer.textContent = station.router ? 'Router · Internet layer' : `Network · ${layer.name} layer`;
    else this.panelLayer.textContent = `Layer ${layer.num} · ${layer.name} · ${station.side}`;
    this.panel.hidden = false;
    document.body.classList.add('panel-open');
    return new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (i >= station.steps.length) {
          this.panel.hidden = true;
          document.body.classList.remove('panel-open');
          resolve();
          return;
        }
        const step = station.steps[i++];
        this.renderStep(step, station.steps.length, i, hooks, next);
      };
      next();
    });
  }

  renderStep(step, total, index, hooks, next) {
    const body = this.panelBody;
    body.innerHTML = '';
    body.scrollTop = 0;
    const progress = document.createElement('div');
    progress.className = 'step-progress';
    progress.innerHTML = Array.from({ length: total }, (_, k) => `<i class="${k < index ? 'on' : ''}"></i>`).join('');
    body.appendChild(progress);

    const text = document.createElement('div');
    text.className = 'step-text';
    text.innerHTML = step.text;
    body.appendChild(text);

    hooks.onEnter(step);

    const footer = document.createElement('div');
    footer.className = 'step-footer';
    const continueBtn = (label, cb) => {
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = label;
      b.addEventListener('click', () => {
        b.disabled = true;
        cb();
      });
      footer.appendChild(b);
      requestAnimationFrame(() => b.focus());
      return b;
    };
    const feedback = document.createElement('div');
    feedback.className = 'feedback';

    if (step.type === 'info') {
      body.appendChild(footer);
      continueBtn(step.button ?? 'Continue', async () => {
        await hooks.onSolve(step);
        next();
      });
      return;
    }

    let mistakes = 0;
    const finish = (why) => {
      feedback.className = 'feedback good';
      feedback.innerHTML = `<b>${['Perfect!', 'Correct!', 'Got it!'][Math.min(mistakes, 2)]} +${pointsFor(mistakes)}</b> ${why}`;
      hooks.onScore(pointsFor(mistakes), mistakes, step);
      sfx.correct();
      continueBtn('Next', async () => {
        await hooks.onSolve(step);
        next();
      });
    };

    if (step.type === 'choice') {
      const list = document.createElement('div');
      list.className = step.table ? 'options table' : 'options';
      if (step.table) {
        const head = document.createElement('div');
        head.className = 'row head';
        head.innerHTML = step.table.headers.map((h) => `<span>${h}</span>`).join('');
        list.appendChild(head);
      }
      step.options.forEach((opt) => {
        const b = document.createElement('button');
        b.className = step.table ? 'row' : 'option';
        b.innerHTML = Array.isArray(opt.label) ? opt.label.map((c) => `<span>${c}</span>`).join('') : opt.label;
        const optIndex = step.options.indexOf(opt);
        const hover = (i) => hooks.onHover?.(step, i);
        b.addEventListener('mouseenter', () => { if (!b.disabled) hover(optIndex); });
        b.addEventListener('focus', () => { if (!b.disabled) hover(optIndex); });
        b.addEventListener('mouseleave', () => hover(-1));
        b.addEventListener('click', () => {
          hooks.onPick?.(step, optIndex, !!opt.correct);
          if (opt.correct) {
            b.classList.add('right');
            list.querySelectorAll('button').forEach((x) => { x.disabled = true; });
            finish(opt.why);
          } else {
            mistakes++;
            hooks.onMistake();
            sfx.wrong();
            b.classList.add('wrong');
            b.disabled = true;
            feedback.className = 'feedback bad';
            feedback.innerHTML = `<b>Not quite.</b> ${opt.why}`;
          }
        });
        list.appendChild(b);
      });
      body.append(list, feedback, footer);
      return;
    }

    if (step.type === 'order') {
      const placed = document.createElement('ol');
      placed.className = 'ordered';
      const pool = document.createElement('div');
      pool.className = 'options';
      let pos = 0;
      shuffle(step.items).forEach((item) => {
        const b = document.createElement('button');
        b.className = 'option';
        b.textContent = item;
        b.addEventListener('click', () => {
          if (item === step.items[pos]) {
            pos++;
            const li = document.createElement('li');
            li.textContent = item;
            placed.appendChild(li);
            b.remove();
            sfx.click();
            feedback.className = 'feedback';
            feedback.textContent = '';
            if (pos === step.items.length) finish(step.why);
          } else {
            mistakes++;
            hooks.onMistake();
            sfx.wrong();
            b.classList.remove('shake');
            void b.offsetWidth;
            b.classList.add('shake');
            feedback.className = 'feedback bad';
            feedback.innerHTML = `<b>Not that one yet.</b> Which comes ${pos === 0 ? 'first' : 'next'}?`;
          }
        });
        pool.appendChild(b);
      });
      body.append(placed, pool, feedback, footer);
    }
  }
}
