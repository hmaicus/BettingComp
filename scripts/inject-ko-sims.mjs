// One-off: build KO_SIMS const (nick -> {slotId: {h,a,ph,pa,pso}}) from the parsed
// sims and inject/replace it in index.html. Excel order maps to app slots 72..103.
import { readFileSync, writeFileSync } from 'node:fs';

const sims = JSON.parse(readFileSync('data/knockout-sims.json', 'utf8'));
const KO = {};
for (const [nick, p] of Object.entries(sims)) {
  const bySlot = {};
  p.ko.forEach((m, i) => {
    bySlot[72 + i] = { h: m.home, a: m.away, ph: m.ph, pa: m.pa, pso: m.pso };
  });
  KO[nick] = bySlot;
}

const constText = 'const KO_SIMS = ' + JSON.stringify(KO) + ';';

let html = readFileSync('index.html', 'utf8');
const marker = '\n/* per-player knockout simulations';
if (html.includes('const KO_SIMS =')) {
  // replace existing block
  const start = html.indexOf('const KO_SIMS =');
  const end = html.indexOf(';', start) + 1;
  html = html.slice(0, start) + constText + html.slice(end);
} else {
  // insert right after the REAL_NAMES const block
  const anchor = html.indexOf('};', html.indexOf('const REAL_NAMES =')) + 2;
  const block = marker + ' (R32->Final), keyed by nickname then app slot id 72..103.\n' +
                '   Excel bracket order; slot<->fixture alignment lives on SEED.matches[].fdId. */\n' +
                constText + '\n';
  html = html.slice(0, anchor) + '\n' + block + html.slice(anchor);
}
writeFileSync('index.html', html, 'utf8');

console.log('injected KO_SIMS for', Object.keys(KO).length, 'players');
console.log('sample Zulu Napa slot 72:', JSON.stringify(KO['Zulu Napa'][72]));
console.log('sample Zulu Napa slot 103 (Final):', JSON.stringify(KO['Zulu Napa'][103]));
