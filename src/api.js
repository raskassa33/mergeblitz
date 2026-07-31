// api.js — talks to the Cloudflare Worker backend.
// window.MERGEBLITZ_API_BASE must be set (see index.html config block)
// to your deployed worker's URL, e.g. "https://mergeblitz-bot.you.workers.dev/api".
import { getInitData } from './telegram.js';

function base() {
  return window.MERGEBLITZ_API_BASE || '/api';
}

export async function submitScore({ score, mode, seedDate }) {
  const initData = getInitData();
  const res = await fetch(`${base()}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, score, mode, seedDate }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`score submit failed: ${res.status} ${body}`);
  }
  return res.json();
}

export async function fetchLeaderboard(kind = 'global', date) {
  const q = kind === 'daily' && date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`${base()}/leaderboard/${kind}${q}`);
  if (!res.ok) throw new Error(`leaderboard fetch failed: ${res.status}`);
  return res.json();
}
