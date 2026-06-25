// Parse per-player group-standings predictions (winner / runner-up / best-3rd per
// group) from the .md files into GROUP_SIMS and inject the const into index.html.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const FILES = ['data/knockout-sims.md', ...readdirSync('data')
  .filter((f) => f.startsWith('gemini-code-') && f.endsWith('.md')).map((f) => 'data/' + f)];

const NAME2CODE = {
  'Algeria': 'Alg', 'Argentina': 'Arg', 'Australia': 'Aus', 'Austria': 'Aut', 'Belgium': 'Bel',
  'Bosnia and Herzegovina': 'Bos', 'Brazil': 'Bra', 'Cabo Verde': 'Cab', 'Canada': 'Can',
  'Colombia': 'Col', "Cote D'Ivoire": 'Cot', 'Croatia': 'Cro', 'Curacao': 'Cur', 'Czechia': 'Cze',
  'DR Congo': 'DR', 'Ecuador': 'Ecu', 'Egypt': 'Egy', 'England': 'Eng', 'France': 'Fra',
  'Germany': 'Ger', 'Ghana': 'Gha', 'Iran': 'Ira', 'Iraq': 'Irq', 'Japan': 'Jap', 'Jordan': 'Jor',
  'Korea Republic': 'Kor', 'Mexico': 'Mex', 'Morocco': 'Mor', 'Netherlands': 'Net',
  'New Zealand': 'New', 'Norway': 'Nor', 'Panama': 'Pan', 'Paraguay': 'Par', 'Portugal': 'Por',
  'Qatar': 'Qat', 'Saudi Arabia': 'Sau', 'Scotland': 'Sco', 'Senegal': 'Sen', 'South Africa': 'Sou',
  'Spain': 'Spa', 'Sweden': 'Swe', 'Switzerland': 'Swi', 'Tunisia': 'Tun', 'Türkiye': 'Tür',
  'USA': 'USA', 'Uruguay': 'Uru', 'Uzbekistan': 'Uzb',
};
const NICKMAP = { 'Andre': 'André' };
const code = (n) => { n = (n || '').trim(); if (!n || n === '-') return null; return NAME2CODE[n] ?? `?${n}`; };

const out = {};
const unmapped = new Set();
for (const file of FILES) {
  const text = readFileSync(file, 'utf8');
  const blocks = text.split(/^##\s*Player\s*\d+:\s*/m).slice(1);
  for (const b of blocks) {
    const nick0 = b.split('\n')[0].trim();
    const nick = NICKMAP[nick0] || nick0;
    const groups = {};
    for (const line of b.split('\n')) {
      const m = line.match(/^\|\s*\*\*([A-L])\*\*\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/);
      if (!m) continue;
      const w = code(m[2]), r = code(m[3]), t = code(m[4]);
      [w, r, t].forEach((c) => { if (c && c.startsWith('?')) unmapped.add(c.slice(1)); });
      groups[m[1]] = { w, r, t };
    }
    if (Object.keys(groups).length) out[nick] = groups;
  }
}

console.log('players:', Object.keys(out).length);
console.log('groups per player:', [...new Set(Object.values(out).map((g) => Object.keys(g).length))]);
console.log('unmapped names:', unmapped.size ? [...unmapped].join(', ') : 'none ✓');
console.log('Zulu Napa A:', JSON.stringify(out['Zulu Napa']?.A), '| Nabeel G:', JSON.stringify(out['Nabeel']?.G));

if (!unmapped.size) {
  const constText = 'const GROUP_SIMS = ' + JSON.stringify(out) + ';';
  let html = readFileSync('index.html', 'utf8');
  if (html.includes('const GROUP_SIMS =')) {
    const s = html.indexOf('const GROUP_SIMS ='); const e = html.indexOf(';', s) + 1;
    html = html.slice(0, s) + constText + html.slice(e);
  } else {
    const anchor = html.indexOf(';', html.indexOf('const KO_SIMS =')) + 1;
    html = html.slice(0, anchor) + '\n' + constText + html.slice(anchor);
  }
  writeFileSync('index.html', html, 'utf8');
  console.log('injected GROUP_SIMS');
}
