// Question generator for the Router Rush bonus mode: a random destination
// IP and a routing table in which exactly one row is the longest match.
import { longestPrefixMatch } from './net.js';

// Small seeded PRNG so tests can reproduce questions.
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rushQuestion(rng, level = 0) {
  const a = int(rng, 11, 223);
  const b = int(rng, 0, 255);
  const c = int(rng, 0, 255);
  const d = int(rng, 1, 254);
  const dest = `${a}.${b}.${c}.${d}`;

  const prefixes = ['0.0.0.0/0', `${a}.0.0.0/8`];
  if (rng() < 0.75) prefixes.push(`${a}.${b}.0.0/16`);
  if (rng() < 0.55) prefixes.push(`${a}.${b}.${c}.0/24`);
  else prefixes.push(`${a}.${b}.${(c + int(rng, 1, 100)) % 256}.0/24`);
  if (level >= 1) prefixes.push(`${(a + int(rng, 1, 100)) % 213 + 11}.0.0.0/8`);
  if (level >= 2) {
    const low = d < 128;
    const matching = rng() < 0.5;
    prefixes.push(`${a}.${b}.${c}.${(low === matching) ? 0 : 128}/25`);
  }

  const hops = shuffle(rng, ['eth0', 'eth1', 'eth2', 'eth3', 'eth4', 'eth5', 'wan0']);
  const table = shuffle(rng, [...new Set(prefixes)]).map((p, i) => ({ dest: p, hop: hops[i] }));
  const answer = longestPrefixMatch(table, dest);
  return { dest, table, answer };
}
