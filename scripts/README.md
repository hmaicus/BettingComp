# Result poller — football-data.org

`poll-results.mjs` is the job that keeps match results up to date. football-data.org
has **no webhooks** and blocks browser (CORS) calls, so the only way to react "when a
result comes in" is to **poll on a schedule** and act on matches that newly flip to
`FINISHED`. The browser never touches the API (that would leak the token); this script
runs locally with the token in `.env` and writes `../results.json`, which the web app
loads on boot.

## Setup

```sh
cp .env.example .env   # then put your token in FOOTBALL_DATA_TOKEN (already filled for you)
```

Requires Node ≥ 20 (uses built-in `fetch` and `--env-file`). No dependencies to install.

## Run

```sh
npm run poll          # one poll: write results.json, log any new results
npm run poll:watch    # keep running, re-poll every POLL_INTERVAL seconds (default 120)
```

`poll:watch` is the simplest "always-on" job — leave it running during the tournament.
It remembers which matches it already reported in `scripts/.poller-state.json`, so each
finished match is announced exactly once.

## React to each new result

Set `ON_RESULT_CMD` in `.env` to run a command once per newly-finished match. It receives:
`MATCH_ID, HOME, AWAY, HOME_CODE, AWAY_CODE, HOME_SCORE, AWAY_SCORE, STAGE, UTC_DATE`.

```sh
ON_RESULT_CMD=osascript -e "display notification \"$HOME $HOME_SCORE-$AWAY_SCORE $AWAY\" with title \"VM 2026\""
```

## Run it on a schedule instead of watch (optional)

Cron, every 2 minutes (note: `npm run poll` cd's via the package dir):

```cron
*/2 * * * * cd /Users/hakonsolheim/Developer/BettingComp && /usr/local/bin/node --env-file=.env scripts/poll-results.mjs >> /tmp/wc-poll.log 2>&1
```

free tier allows ~10 requests/minute, so 2-minute polling is well within limits.

## Notes

- `results.json` is committed/served so the app can read it; `.env` and the state file are gitignored.
- Team mapping (`TLA_TO_CODE` in the script) covers all 48 WC teams. The app reuses one
  code for two teams in two spots — `Aus` = Australia **and** Austria, `Ira` = Iran **and**
  Iraq — disambiguated by the opponent. Any team it can't map is logged, never silent.
- Serve the app over http (e.g. `npx http-server`), not `file://`, or the `results.json`
  fetch is blocked.
