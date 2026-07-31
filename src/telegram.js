// telegram.js — thin wrapper around window.Telegram.WebApp so the rest of
// the app never touches the global directly. All functions here degrade
// gracefully when run outside Telegram (e.g. testing in a plain browser).

export function getTelegram() {
  return window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
}

export function initTelegram() {
  const tg = getTelegram();
  if (!tg) return null;
  tg.ready();
  tg.expand();
  applyTheme(tg);
  tg.onEvent('themeChanged', () => applyTheme(tg));
  return tg;
}

function applyTheme(tg) {
  const p = tg.themeParams || {};
  const root = document.documentElement.style;
  if (p.bg_color) root.setProperty('--tg-bg', '#' + p.bg_color);
  if (p.text_color) root.setProperty('--tg-text', '#' + p.text_color);
  if (p.button_color) root.setProperty('--tg-accent', '#' + p.button_color);
}

/** type: 'light'|'medium'|'heavy'|'rigid'|'soft' for impact, or 'error'|'success'|'warning' for notification */
export function haptic(type = 'light') {
  const tg = getTelegram();
  if (!tg || !tg.HapticFeedback) return;
  if (['light', 'medium', 'heavy', 'rigid', 'soft'].includes(type)) {
    tg.HapticFeedback.impactOccurred(type);
  } else {
    tg.HapticFeedback.notificationOccurred(type);
  }
}

export function getInitData() {
  const tg = getTelegram();
  return tg ? tg.initData : '';
}

/** Best-effort share: Telegram inline sharing first, then Web Share API, then clipboard. */
export function shareScore(score, botUsername) {
  const text = `I scored ${score} in MergeBlitz. Beat it \u{1F440}`;
  const url = botUsername ? `https://t.me/${botUsername}` : window.location.href;
  const tg = getTelegram();
  if (tg && tg.switchInlineQuery) {
    tg.switchInlineQuery(`score:${score}`, ['users', 'groups', 'channels']);
    return;
  }
  if (navigator.share) {
    navigator.share({ text, url }).catch(() => {});
    return;
  }
  navigator.clipboard && navigator.clipboard.writeText(`${text} ${url}`);
}
