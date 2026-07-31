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




