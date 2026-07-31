// index.js — MergeBlitz backend as a single Cloudflare Worker.
// Handles: Telegram bot webhook (/start, /leaderboard, inline sharing) and
// the score/leaderboard HTTP API the Mini App calls.
//
// Required bindings (see ../wrangler.toml):
//   KV namespace : MERGEBLITZ_KV
//   secret       : BOT_TOKEN        (wrangler secret put BOT_TOKEN)
//   var          : WEBAPP_URL       (HTTPS URL of the deployed webapp/ folder)
//   var          : BOT_USERNAME     (bot's @username, no @)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      if (url.pathname === '/webhook' && request.method === 'POST') {
        return handleWebhook(request, env);
      }
      if (url.pathname === '/api/score' && request.method === 'POST') {
        return handleScoreSubmit(request, env);
      }
      if (url.pathname.startsWith('/api/leaderboard/') && request.method === 'GET') {
        return handleLeaderboard(url, env);
      }
      if (url.pathname === '/') {
        return new Response('MergeBlitz worker is running.', { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error(err);
      return json({ error: 'internal error' }, 500);
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// ---------------- Telegram bot ----------------

async function tgApi(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function handleWebhook(request, env) {
  const update = await request.json();

  if (update.message && typeof update.message.text === 'string') {
    const text = update.message.text.trim();
    const chatId = update.message.chat.id;
    if (text.startsWith('/start')) {
      await sendGameButton(env, chatId);
    } else if (text.startsWith('/leaderboard')) {
      await sendTopScores(env, chatId);
    } else if (text.startsWith('/daily')) {
      await sendGameButton(env, chatId, true);
    }
  } else if (update.inline_query) {
    await handleInlineQuery(env, update.inline_query);
  }

  return new Response('ok');
}

async function sendGameButton(env, chatId, daily = false) {
  await tgApi(env, 'sendMessage', {
    chat_id: chatId,
    text: daily
      ? 'Today\u2019s Daily Challenge is live \u2014 same board for everyone. Good luck.'
      : 'Swipe. Merge. Beat the clock.\n\nTap below to play MergeBlitz \u{1F447}',
    reply_markup: {
      inline_keyboard: [[{ text: '\u25B6\uFE0F Play MergeBlitz', web_app: { url: env.WEBAPP_URL } }]],
    },
  });
}

async function sendTopScores(env, chatId) {
  const board = await getLeaderboardRaw(env, 'lb:global');
  const lines = board.slice(0, 10).map((e, i) => `${i + 1}. ${e.name} \u2014 ${e.score}`);
  await tgApi(env, 'sendMessage', {
    chat_id: chatId,
    text: lines.length ? `\u{1F3C6} Top scores:\n${lines.join('\n')}` : 'No scores yet \u2014 be the first to play!',
  });
}

async function handleInlineQuery(env, query) {
  const results = [
    {
      type: 'article',
      id: 'share',
      title: 'Share MergeBlitz',
      description: 'Swipe, merge, beat the clock.',
      input_message_content: {
        message_text: `\u{1F3AE} MergeBlitz \u2014 swipe, merge, beat the clock.\nCan you beat my score?`,
      },
      reply_markup: {
        inline_keyboard: [[{ text: '\u25B6\uFE0F Play', url: `https://t.me/${env.BOT_USERNAME}?start=shared` }]],
      },
    },
  ];
  await tgApi(env, 'answerInlineQuery', { inline_query_id: query.id, results, cache_time: 0 });
}

// ---------------- initData validation ----------------
// Per Telegram's spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// secret_key = HMAC_SHA256(bot_token, key="WebAppData")
// then verify HMAC_SHA256(data_check_string, key=secret_key) === hash

async function verifyInitData(initData, botToken) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const encoder = new TextEncoder();
  const webAppDataKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const secretKeyBytes = await crypto.subtle.sign('HMAC', webAppDataKey, encoder.encode(botToken));
  const secretKey = await crypto.subtle.importKey('raw', secretKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sigBuf = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(dataCheckString));
  const sigHex = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (sigHex !== hash) return null;

  const userRaw = params.get('user');
  return userRaw ? JSON.parse(userRaw) : null;
}

// ---------------- Score / leaderboard API ----------------

async function handleScoreSubmit(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'invalid body' }, 400);
  const { initData, score, mode, seedDate } = body;

  const user = await verifyInitData(initData, env.BOT_TOKEN);
  if (!user) return json({ error: 'invalid or missing Telegram signature' }, 401);

  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 5_000_000) {
    return json({ error: 'invalid score' }, 400);
  }

  const name = user.username ? '@' + user.username : user.first_name || 'Player';

  if (mode === 'daily' && typeof seedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(seedDate)) {
    await updateLeaderboard(env, `lb:daily:${seedDate}`, user.id, name, score);
  }
  await updateLeaderboard(env, 'lb:global', user.id, name, score);

  return json({ ok: true });
}

async function updateLeaderboard(env, listKey, userId, name, score) {
  const board = await getLeaderboardRaw(env, listKey);
  const existing = board.find((e) => e.userId === userId);
  if (existing && score <= existing.score) return; // only keep each player's best
  const filtered = board.filter((e) => e.userId !== userId);
  filtered.push({ userId, name, score });
  filtered.sort((a, b) => b.score - a.score);
  await env.MERGEBLITZ_KV.put(listKey, JSON.stringify(filtered.slice(0, 200)));
}

async function getLeaderboardRaw(env, listKey) {
  const raw = await env.MERGEBLITZ_KV.get(listKey);
  return raw ? JSON.parse(raw) : [];
}

async function handleLeaderboard(url, env) {
  const parts = url.pathname.split('/'); // '', 'api', 'leaderboard', '<kind>'
  const kind = parts[3];
  const date = url.searchParams.get('date');
  const key = kind === 'daily' && date ? `lb:daily:${date}` : 'lb:global';
  const board = await getLeaderboardRaw(env, key);
  return json(board.slice(0, 50).map((e) => ({ name: e.name, score: e.score })));
}
