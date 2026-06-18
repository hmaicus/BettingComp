# Fasit backend (Cloudflare Worker + KV)

Stores the admin-settled truth (bonus answers, overrides, adjustments, rules,
phases) so every participant sees the same settlement. The admin password is
verified inside the Worker (a secret), never shipped to the browser.

## One-time deploy

All commands run from this `worker/` directory.

```sh
# 1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up

# 2. Log in (opens a browser)
npx wrangler login

# 3. Create the KV namespace, then paste the printed id into wrangler.toml
#    (replace PUT_KV_NAMESPACE_ID_HERE)
npx wrangler kv namespace create FASIT

# 4. Set the admin password (prompts for the value; this is what the admin
#    panel will ask for). Choose something only you know.
npx wrangler secret put ADMIN_PASSWORD

# 5. Deploy
npx wrangler deploy
```

`wrangler deploy` prints the public URL, e.g.
`https://bettingcomp-fasit.<your-subdomain>.workers.dev`.

## Wire it into the app

Put that URL into the `FASIT_API` constant near the top of the `<script>` in
`../index.html`, then commit + push so GitHub Pages picks it up:

```js
const FASIT_API = 'https://bettingcomp-fasit.<your-subdomain>.workers.dev';
```

When `FASIT_API` is empty the app works exactly as before (local-only); once set,
the admin panel saves to the Worker and all visitors load the shared fasit.

## Routes

- `GET /fasit` — public read, returns stored JSON (or `{}`).
- `PUT /fasit` — requires header `X-Admin-Password`; stores the body.
- `POST /verify` — returns 200/401 for the admin login check.

## Updating later

Edit `src/index.js` and run `npx wrangler deploy` again. To change the password:
`npx wrangler secret put ADMIN_PASSWORD`.
