// One-off: parse data/knockout-sims.md into coded JSON keyed by app nickname.
import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync('data/knockout-sims.md', 'utf8').split('\n').filter((l) => l.trim() !== '```');

const NAME2CODE = {
  'Algeria': 'Alg', 'Argentina': 'Arg', 'Australia': 'Aus', 'Austria': 'Aut', 'Belgium': 'Bel',
  'Bosnia and Herzegovina': 'Bos', 'Brazil': 'Bra', 'Cabo Verde': 'Cab', 'Canada': 'Can',
  'Colombia': 'Col', "Cote D'Ivoire": 'Cot', 'Croatia': 'Cro', 'Curacao': 'Cur', 'Czechia': 'Cze',
  'DR Congo': 'DR', 'Ecuador': 'Ecu', 'Egypt': 'Egy', 'England': 'Eng', 'France': 'Fra',
  'Germany': 'Ger', 'Ghana': 'Gha', 'Iran': 'Ira', 'Japan': 'Jap', 'Jordan': 'Jor',
  'Korea Republic': 'Kor', 'Mexico': 'Mex', 'Morocco': 'Mor', 'Netherlands': 'Net',
  'New Zealand': 'New', 'Norway': 'Nor', 'Panama': 'Pan', 'Paraguay': 'Par', 'Portugal': 'Por',
  'Qatar': 'Qat', 'Saudi Arabia': 'Sau', 'Scotland': 'Sco', 'Senegal': 'Sen', 'South Africa': 'Sou',
  'Spain': 'Spa', 'Sweden': 'Swe', 'Switzerland': 'Swi', 'Tunisia': 'Tun', 'Türkiye': 'Tür',
  'USA': 'USA', 'Uruguay': 'Uru', 'Uzbekistan': 'Uzb',
};
const NICKMAP = { 'Andre': 'André' };
const ROUNDS = ['**Round of 32**', '**Round of 16**', '**Quarter-Finals**', '**Semi-Finals**', '**3rd Place Match**', '**Final**'];

const players = {};
let cur = null, curRound = null;
const unmapped = new Set();

for (const line of raw) {
  const ph = line.match(/^##\s*Player\s*\d+:\s*(.+)$/);
  if (ph) { let n = ph[1].trim(); n = NICKMAP[n] || n; cur = players[n] = { nick: n, ko: [] }; curRound = null; continue; }
  if (!cur) continue;
  if (ROUNDS.includes(line.trim())) { curRound = line.trim(); continue; }
  const mm = line.match(/^-\s*(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+?)(\s*\(PSO:\s*(\d+)\s*-\s*(\d+)\))?\s*$/);
  if (mm && curRound) {
    const hc = NAME2CODE[mm[1].trim()], ac = NAME2CODE[mm[4].trim()];
    if (!hc) unmapped.add(mm[1].trim());
    if (!ac) unmapped.add(mm[4].trim());
    cur.ko.push({ home: hc || null, away: ac || null, ph: +mm[2], pa: +mm[3], pso: mm[5] ? [+mm[6], +mm[7]] : null });
  }
}

console.log('players:', Object.keys(players).length);
console.log('unmapped names:', [...unmapped].join(', ') || 'none ✓');
console.log('all have 32 KO:', Object.values(players).every((p) => p.ko.length === 32));
writeFileSync('data/knockout-sims.json', JSON.stringify(players));
console.log('wrote data/knockout-sims.json');
console.log('Zulu Napa R32 #1-3:', JSON.stringify(players['Zulu Napa'].ko.slice(0, 3)));
