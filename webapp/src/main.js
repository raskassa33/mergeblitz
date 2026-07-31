// main.js — wires the engine, renderer, input, Telegram SDK, and API client together.
import { createGame, step, tickMeter, seedFromDateString, todayUTCString } from './engine.js';
import { createRenderer } from './render.js';
import { attachSwipeInput } from './input.js';
import { initTelegram, haptic, shareScore } from './telegram.js';
import { submitScore, fetchLeaderboard } from './api.js';

const canvas = document.getElementById('board');
const scoreEl = document.getElementById('score');
const meterFillEl = document.getElementById('meter-fill');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const overlayBoard = document.getElementById('overlay-leaderboard');
const shareBtn = document.getElementById('share-btn');
const retryBtn = document.getElementById('retry-btn');
const dailyBtn = document.getElementById('daily-btn');
const endlessBtn = document.getElementById('endless-btn');

initTelegram();
const renderer = createRenderer(canvas);

let mode = 'endless';
let state = null;
let lastTime = performance.now();
let submitted = false;

function newGame(selectedMode) {
  mode = selectedMode;
  const seed =
    selectedMode === 'daily'
      ? seedFromDateString(todayUTCString())
      : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  state = createGame(seed);
  submitted = false;
  overlay.classList.add('hidden');
  lastTime = performance.now();
  dailyBtn.classList.toggle('active', selectedMode === 'daily');
  endlessBtn.classList.toggle('active', selectedMode === 'endless');
}

function loop(now) {
  const dt = Math.min(now - lastTime, 100); // clamp to avoid huge jumps after tab backgrounding
  lastTime = now;
  if (state && !state.over) {
    const wasOver = state.over;
    state = tickMeter(state, dt);
    if (!wasOver && state.over) onGameOver();
  }
  render();
  requestAnimationFrame(loop);
}

function render() {
  if (!state) return;
  renderer.draw(state);
  scoreEl.textContent = state.score;
  const pct = Math.max(0, state.meterMs / state.maxMeterMs) * 100;
  meterFillEl.style.width = pct + '%';
  meterFillEl.style.background = pct < 25 ? '#ff5c5c' : 'var(--tg-accent, #7c5cff)';
}

function onSwipe(direction) {
  if (!state || state.over) return;
  const prevCombo = state.combo;
  const wasOver = state.over;
  state = step(state, direction, performance.now());
  if (state.combo > prevCombo && state.combo > 1) haptic(state.combo > 3 ? 'heavy' : 'medium');
  else haptic('light');
  if (!wasOver && state.over) onGameOver();
}

async function onGameOver() {
  if (submitted) return;
  submitted = true;
  haptic('error');
  overlayTitle.textContent = mode === 'daily' ? 'Daily Challenge complete' : 'Run over';
  overlayScore.textContent = state.score;
  overlay.classList.remove('hidden');
  overlayBoard.textContent = 'Submitting score…';

  try {
    await submitScore({
      score: state.score,
      mode,
      seedDate: mode === 'daily' ? todayUTCString() : null,
    });
    const board = await fetchLeaderboard(mode === 'daily' ? 'daily' : 'global', todayUTCString());
    renderMiniLeaderboard(board);
  } catch (e) {
    overlayBoard.textContent = 'Score saved locally (offline or backend not configured yet).';
    console.warn('submit/leaderboard failed', e);
  }
}

function renderMiniLeaderboard(board) {
  if (!Array.isArray(board) || board.length === 0) {
    overlayBoard.textContent = 'No scores yet — you\u2019re first!';
    return;
  }
  const top = board.slice(0, 5);
  overlayBoard.innerHTML =
    '<ol>' + top.map((e) => `<li>${escapeHtml(e.name)} — ${e.score}</li>`).join('') + '</ol>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

attachSwipeInput(canvas, onSwipe);
shareBtn.addEventListener('click', () => shareScore(state ? state.score : 0, window.MERGEBLITZ_BOT_USERNAME));
retryBtn.addEventListener('click', () => newGame(mode));
dailyBtn.addEventListener('click', () => newGame('daily'));
endlessBtn.addEventListener('click', () => newGame('endless'));

newGame('endless');
requestAnimationFrame(loop);
