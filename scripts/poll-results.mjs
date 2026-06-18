#!/usr/bin/env node
/**
 * football-data.org result poller for "VM 2026 Tipping".
 *
 * football-data.org has NO webhooks and does NOT allow browser (CORS) calls,
 * so "a job that runs whenever a result comes in" means: poll on a schedule and
 * act only when a match newly flips to FINISHED. This script does exactly that.
 *
 * It fetches finished matches, maps each team to the app's 3-letter codes, and
 * writes ./results.json (same-origin, no token) which the web app loads on boot.
 * A small state file remembers which matches were already reported, so each new
 * result is logged once and can trigger an optional hook command.
 *
 * Usage:
 *   FOOTBALL_DATA_TOKEN=xxx node scripts/poll-results.mjs            # one run
 *   node --env-file=.env scripts/poll-results.mjs                    # one run, token from .env
 *   node --env-file=.env scripts/poll-results.mjs --watch            # loop forever
 *   npm run poll       /   npm run poll:watch                        # see package.json
 *
 * Env vars:
 *   FOOTBALL_DATA_TOKEN  (required) your X-Auth-Token
 *   COMPETITION          competition code, default "WC"
 *   POLL_INTERVAL        seconds between polls in --watch mode, default 120
 *   OUT_FILE             output path, default ./results.json (repo root)
 *   STATE_FILE           state path, default ./scripts/.poller-state.json
 *   ON_RESULT_CMD        optional shell command run once per NEW finished match.
 *                        Receives env: MATCH_ID, HOME, AWAY, HOME_CODE, AWAY_CODE,
 *                        HOME_SCORE, AWAY_SCORE, STAGE, UTC_DATE.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Minimal .env loader so `node scripts/poll-results.mjs` works without the
// --env-file flag. Existing process.env always wins.
async function loadDotEnv() {
  const p = resolve(ROOT, '.env');
  if (!existsSync(p)) return;
  const txt = await readFile(p, 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

// football-data.org team `tla` -> app 3-letter code (see TEAMS map in index.html).
// The app's SEED reuses one code for two teams in two cases; the opponent
// disambiguates the fixture: IRN+IRQ both -> "Ira", and AUS (Australia) +
// AUT (Austria) both -> "Aus".
const TLA_TO_CODE = {
  ALG: 'Alg', ARG: 'Arg', AUS: 'Aus', AUT: 'Aus', BEL: 'Bel', BIH: 'Bos', BRA: 'Bra',
  CAN: 'Can', CIV: 'Cot', COD: 'DR', COL: 'Col', CPV: 'Cab', CRO: 'Cro',
  CUW: 'Cur', CZE: 'Cze', ECU: 'Ecu', EGY: 'Egy', ENG: 'Eng', ESP: 'Spa',
  FRA: 'Fra', GER: 'Ger', GHA: 'Gha', HAI: 'Hai', IRN: 'Ira', IRQ: 'Ira',
  JOR: 'Jor', JPN: 'Jap', KOR: 'Kor', KSA: 'Sau', MAR: 'Mor', MEX: 'Mex',
  NED: 'Net', NOR: 'Nor', NZL: 'New', PAN: 'Pan', PAR: 'Par', POR: 'Por',
  QAT: 'Qat', RSA: 'Sou', SCO: 'Sco', SEN: 'Sen', SUI: 'Swi', SWE: 'Swe',
  TUN: 'Tun', TUR: 'Tür', URU: 'Uru', URY: 'Uru', USA: 'USA', UZB: 'Uzb',
};

const CFG = {
  token: process.env.FOOTBALL_DATA_TOKEN || '',
  comp: process.env.COMPETITION || 'WC',
  interval: Math.max(30, parseInt(process.env.POLL_INTERVAL || '120', 10)),
  outFile: resolve(ROOT, process.env.OUT_FILE || 'results.json'),
  stateFile: resolve(ROOT, process.env.STATE_FILE || 'scripts/.poller-state.json'),
  onResultCmd: process.env.ON_RESULT_CMD || '',
};

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readState() {
  try {
    return JSON.parse(await readFile(CFG.stateFile, 'utf8'));
  } catch {
    return { seen: [] };
  }
}
async function writeState(state) {
  await writeFile(CFG.stateFile, JSON.stringify(state, null, 2));
}

async function fetchFinished() {
  const url = `https://api.football-data.org/v4/competitions/${encodeURIComponent(CFG.comp)}/matches?status=FINISHED`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': CFG.token } });
  if (res.status === 429) {
    const wait = parseInt(res.headers.get('Retry-After') || '60', 10);
    throw new Error(`rate limited (HTTP 429); retry after ~${wait}s. Free tier allows 10 req/min.`);
  }
  if (res.status === 403) {
    throw new Error(`forbidden (HTTP 403) — token's plan can't access competition "${CFG.comp}".`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.matches || [];
}

function toResult(m) {
  const hs = m.score?.fullTime?.home;
  const as = m.score?.fullTime?.away;
  if (hs == null || as == null) return null;
  const homeTla = m.homeTeam?.tla;
  const awayTla = m.awayTeam?.tla;
  return {
    matchId: m.id,
    utcDate: m.utcDate,
    stage: m.stage,
    status: m.status,
    homeName: m.homeTeam?.name || null,
    awayName: m.awayTeam?.name || null,
    homeTla: homeTla || null,
    awayTla: awayTla || null,
    homeCode: TLA_TO_CODE[homeTla] ?? null,
    awayCode: TLA_TO_CODE[awayTla] ?? null,
    home: hs,
    away: as,
  };
}

function runHook(r) {
  return new Promise((done) => {
    const env = {
      ...process.env,
      MATCH_ID: String(r.matchId),
      HOME: r.homeName ?? '',
      AWAY: r.awayName ?? '',
      HOME_CODE: r.homeCode ?? '',
      AWAY_CODE: r.awayCode ?? '',
      HOME_SCORE: String(r.home),
      AWAY_SCORE: String(r.away),
      STAGE: r.stage ?? '',
      UTC_DATE: r.utcDate ?? '',
    };
    execFile('/bin/sh', ['-c', CFG.onResultCmd], { env }, (err, stdout, stderr) => {
      if (err) log('  hook error:', err.message);
      if (stdout?.trim()) log('  hook:', stdout.trim());
      if (stderr?.trim()) log('  hook(stderr):', stderr.trim());
      done();
    });
  });
}

async function pollOnce() {
  const matches = await fetchFinished();
  const results = matches.map(toResult).filter(Boolean);

  const state = await readState();
  const seen = new Set(state.seen);
  const fresh = results.filter((r) => !seen.has(r.matchId));

  // The actual "job": react to each NEW finished match.
  for (const r of fresh) {
    log(`NEW RESULT  ${r.homeName} ${r.home}-${r.away} ${r.awayName}  [${r.stage}]` +
        (r.homeCode && r.awayCode ? '' : '  (no app-code match — check TLA_TO_CODE)'));
    if (CFG.onResultCmd) await runHook(r);
    seen.add(r.matchId);
  }

  // Warn about any team we couldn't map, so it never fails silently.
  for (const r of results) {
    if (!r.homeCode) log(`  WARN unmapped team tla "${r.homeTla}" (${r.homeName})`);
    if (!r.awayCode) log(`  WARN unmapped team tla "${r.awayTla}" (${r.awayName})`);
  }

  // Only rewrite results.json when the actual results change (not just the
  // timestamp) so the Actions cron commits/redeploys only on real changes.
  const resultsJson = JSON.stringify(results);
  let prevJson = null;
  try { prevJson = JSON.stringify(JSON.parse(await readFile(CFG.outFile, 'utf8')).results); } catch {}

  if (resultsJson !== prevJson) {
    await writeFile(
      CFG.outFile,
      JSON.stringify({
        competition: CFG.comp,
        updatedAt: new Date().toISOString(),
        count: results.length,
        results,
      }, null, 2),
    );
    log(`polled: ${results.length} finished, ${fresh.length} new -> wrote ${CFG.outFile}`);
  } else {
    log(`polled: ${results.length} finished, no changes -> ${CFG.outFile} unchanged`);
  }

  state.seen = [...seen];
  await writeState(state);
  return fresh.length;
}

async function main() {
  await loadDotEnv();
  if (!CFG.token) {
    console.error('Missing FOOTBALL_DATA_TOKEN. Put it in .env or pass it inline.');
    process.exit(1);
  }
  const watch = process.argv.includes('--watch');
  log(`poller start — competition=${CFG.comp}${watch ? `, watch every ${CFG.interval}s` : ' (single run)'}`);

  if (!watch) {
    await pollOnce();
    return;
  }
  for (;;) {
    try {
      await pollOnce();
    } catch (err) {
      log('poll failed:', err.message);
    }
    await sleep(CFG.interval * 1000);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
