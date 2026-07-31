# MergeBlitz — Telegram Mini App (zero-cost build)

A complete, working implementation of MergeBlitz for Telegram: swipe-merge core loop with the Blitz Meter/combo/bomb-tile twist, Daily Challenge with a date-seeded board, global + daily leaderboards, and a bot that hands players straight into the game from a chat.

Everything here runs on **free tiers only**:
- **Cloudflare Workers** (bot webhook + API) — generous free tier, no credit card required to start.
- **Cloudflare KV** (leaderboard storage) — free tier.
- **GitHub Pages** (or Cloudflare Pages) for hosting the static webapp — free.
- **Telegram Bot API** — free, no cost ever.

Nothing here requires a paid plan. Total setup time: roughly 20–30 minutes.

---

## What's included

```
mergeblitz-telegram/
├── webapp/              ← the Mini App itself (plain HTML/CSS/JS, no build step)
│   ├── index.html
│   ├── style.css
│   └── src/
│       ├── engine.js     ← pure game engine (grid, merges, Blitz Meter, combos, bombs, daily seed)
│       ├── render.js     ← canvas rendering
│       ├── input.js      ← swipe/keyboard input
│       ├── telegram.js   ← Telegram WebApp SDK wrapper (theming, haptics, share)
│       ├── api.js        ← calls to the worker backend
│       └── main.js       ← wires it all together
│
└── worker/               ← Telegram bot + score/leaderboard API, one Cloudflare Worker
    ├── src/index.js
    ├── wrangler.toml
    └── package.json
```

The game engine (`engine.js`) has been unit-tested for determinism (same seed → identical board on every device, which is what makes the Daily Challenge fair) and for the meter/game-over/scoring logic. The Telegram signature-verification logic in the worker (`verifyInitData`) has been independently tested against hand-computed HMAC signatures, including tampered-data and wrong-token rejection cases.

**What's deliberately *not* included in this pass** (flagged in the original blueprint as later phases, kept out here to ship a working v1 instead of a half-built v2): Telegram Stars monetization, cosmetic skin packs, group-specific leaderboards, and the referral bonus loop. The architecture doesn't block any of these — see "Next steps" at the bottom.

---

## Step 1 — Create your bot

1. In Telegram, message **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot`, follow the prompts, choose a name and a `@username` ending in `bot`.
3. BotFather gives you a **bot token** — save it, you'll need it in Step 3.
4. Send `/setinline` to BotFather, select your bot, and reply with any placeholder text (e.g. "Share your score") — this turns on inline sharing, used by the Share button.

## Step 2 — Host the webapp (free)

Any static host works; GitHub Pages is the simplest zero-cost option.

1. Push this repo to a GitHub repository.
2. In the repo, go to **Settings → Pages**, set source to the `webapp/` folder on your default branch.
3. GitHub gives you a URL like `https://YOUR_USERNAME.github.io/YOUR_REPO/webapp/` (or `/` if you configured a `docs`-style root — adjust to however GitHub Pages serves your folder). **Copy this URL.**

*(Cloudflare Pages or Vercel work identically if you prefer — just point them at the `webapp/` folder as the site root and they'll give you a free HTTPS URL.)*

## Step 3 — Deploy the worker (free)

You'll need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and Node.js installed locally.

```bash
cd worker
npm install
npx wrangler login              # opens a browser to authorize, free account is fine

npx wrangler kv namespace create MERGEBLITZ_KV
# copy the returned "id" value into wrangler.toml's kv_namespaces[0].id

npx wrangler secret put BOT_TOKEN
# paste the bot token from Step 1 when prompted
```

Now edit `worker/wrangler.toml`:
- `WEBAPP_URL` → the URL from Step 2
- `BOT_USERNAME` → your bot's username (no `@`)

Then deploy:

```bash
npx wrangler deploy
```

This prints your worker's URL, e.g. `https://mergeblitz-bot.YOUR_SUBDOMAIN.workers.dev`. **Copy this URL.**

## Step 4 — Point the webapp at the worker

Edit `webapp/index.html`, in the config block near the top:

```html
<script>
  window.MERGEBLITZ_API_BASE = 'https://mergeblitz-bot.YOUR_SUBDOMAIN.workers.dev/api';
  window.MERGEBLITZ_BOT_USERNAME = 'your_bot_username';
</script>
```

Commit and push — GitHub Pages redeploys automatically within a minute or two.

## Step 5 — Wire the bot's webhook

Tell Telegram to send updates to your worker:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://mergeblitz-bot.YOUR_SUBDOMAIN.workers.dev/webhook"
```

You should get back `{"ok":true,"result":true,...}`.

## Step 6 — Play it

1. Open your bot in Telegram, send `/start`.
2. Tap **▶️ Play MergeBlitz** — it opens the Mini App instantly, no install.
3. Play a run. On game over, your score is submitted (signature-verified server-side) and the mini leaderboard shows.
4. Send `/leaderboard` to the bot to see the top 10 global scores as a chat message.

---

## Local testing before you deploy

```bash
# terminal 1 — serve the webapp
cd webapp && npx serve .

# terminal 2 — run the worker locally
cd worker && npx wrangler dev
```

Note: `Telegram.WebApp` features (haptics, theming, initData) only fully work inside real Telegram — outside it, `telegram.js` degrades gracefully so you can still play and test the core loop in a normal browser tab (arrow keys work for swipes).

---

## How the pieces fit together

- **`engine.js` is the only place game rules live.** It has zero dependencies on the DOM or Telegram, which is what makes it trustworthy for the Daily Challenge — the same date always produces the exact same tile sequence, verified by the determinism test in this build.
- **Scores are never trusted from the client.** Every `/api/score` submission includes Telegram's signed `initData`; the worker re-verifies that HMAC signature server-side before writing anything, using the bot token as the signing secret. A request with a missing, malformed, or tampered signature is rejected with 401.
- **Leaderboards live in Cloudflare KV** as small sorted JSON arrays per key (`lb:global`, `lb:daily:YYYY-MM-DD`) — simple, free-tier friendly, plenty fast for this scale.

---

## Next steps (not built in this pass)

- **Telegram Stars monetization**: add an `invoice`/`successful_payment` webhook branch in `worker/src/index.js` for remove-ads or cosmetic tile-skin purchases.
- **Group-local leaderboards**: `update.message.chat.id` is already available in the webhook handler — extend `updateLeaderboard`/`getLeaderboardRaw` to key by chat ID as well as globally.
- **Referral loop**: parse a `start` payload (`/start ref_<userId>`) in `handleWebhook` and award a small cosmetic bonus to both users on the referred player's first Daily Challenge completion.
- **Cosmetic tile skins**: swap `TILE_COLORS` in `render.js` for a selected palette, persisted via `Telegram.WebApp.CloudStorage`.

These were intentionally deferred from the original blueprint's Phase 4 to keep this delivery a complete, working v1 rather than a partially wired v2 — the architecture above doesn't need to change to add any of them.
