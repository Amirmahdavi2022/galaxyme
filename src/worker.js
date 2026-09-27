// Galaxyme Worker: serves the Mini App, the /api the app talks to, and the Telegram bot webhook on /tg.
// Secrets: BOT_TOKEN. Vars: CHANNEL (e.g. "@parsv2r"; empty = no membership gate).
import { GalaxyChain, RULES } from './chain.js';
export { GalaxyChain };

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const chainStub = env => env.CHAIN.get(env.CHAIN.idFromName('main'));

async function hmac(keyBytes, msg) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, typeof msg === 'string' ? enc.encode(msg) : msg);
}

// Telegram Mini App initData check: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export async function checkInitData(initData, botToken, maxAge = 86400) {
  if (!initData || !botToken) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  if (hex(await hmac(new Uint8Array(secret), dcs)) !== hash) return null;
  const age = Date.now() / 1000 - Number(p.get('auth_date') || 0);
  if (!(age < maxAge)) return null;
  try { return JSON.parse(p.get('user') || 'null'); } catch { return null; }
}

function displayName(u) {
  const clean = s => (s || '').replace(/[<>&"]/g, '').trim();
  let n = clean(u.first_name);
  const l = clean(u.last_name);
  if (l) n += ' ' + l[0] + '.';
  if (!n) n = u.username ? clean(u.username) : 'Miner ' + String(u.id).slice(-4);
  return n.slice(0, 24);
}

async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json().catch(() => ({ ok: false }));
}

let botUsername = null;
async function getBotUsername(env) {
  if (!botUsername) { const r = await tg(env, 'getMe', {}); botUsername = r.ok ? r.result.username : null; }
  return botUsername;
}

// Membership in the required channel. The bot must be an admin of the channel for Telegram to answer.
// Returns true / false, or null when Telegram could not tell us (bot not admin yet, channel typo, network).
async function isMember(env, uid) {
  if (!env.CHANNEL) return true;
  const r = await tg(env, 'getChatMember', { chat_id: env.CHANNEL, user_id: uid });
  if (!r.ok) return null;
  const s = r.result.status;
  return s === 'creator' || s === 'administrator' || s === 'member' || (s === 'restricted' && r.result.is_member === true);
}

async function webhookSecret(token) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode('galaxyme-webhook:' + token))).slice(0, 48);
}

// ---------------- bot ----------------
const WELCOME = [
  '<b>Welcome to Galaxyme</b> ✦',
  '',
  'Everyone here mines one shared chain from their phone. Every block turns into a star in the same galaxy, and how rare it is comes straight from the block hash, so nobody can fake it.',
  '',
  'Mine in 5 minute sessions, then rest for an hour. Every block pays Stardust to everyone who mined it, and the one who finds it gets the star plus a bonus.',
  '',
  'Tap below to start.',
].join('\n');

const HELP = [
  '<b>How it works</b>',
  '',
  '• Tap the core to start a 5 minute session. Keep the app open while it runs.',
  '• Your phone sends shares as proof of work. When a block is found, its Stardust is split by work, and the finder gets 10% extra and the star.',
  '• After a session you rest for an hour. You can skip the wait with Stars, or invite 3 friends for a free reset.',
  '• The Network tab shows every block, who found it and the leaderboard.',
].join('\n');

async function onBotMessage(env, origin, msg, ctx) {
  const chat = msg.chat.id;
  if (msg.successful_payment) {
    const sp = msg.successful_payment;
    const [uid, product] = (sp.invoice_payload || '').split('|');
    const res = await chainStub(env).applyPayment(Number(uid), product, sp.telegram_payment_charge_id);
    if (res.ok && !res.duplicate) {
      const p = RULES.PRODUCTS[product];
      await tg(env, 'sendMessage', { chat_id: chat, text: `Done ✦ ${p.title.toLowerCase()} is applied. Open Galaxyme to keep mining.`, reply_markup: { inline_keyboard: [[{ text: 'Open Galaxyme', web_app: { url: origin + '/' } }]] } });
    }
    return;
  }
  const text = (msg.text || '').trim();
  if (text.startsWith('/start')) {
    const arg = text.split(/\s+/)[1] || '';
    const m = /^r(\d+)$/.exec(arg);
    if (m && msg.from) await chainStub(env).registerReferral(msg.from.id, displayName(msg.from), Number(m[1]));
  }
  const button = { inline_keyboard: [[{ text: 'Open Galaxyme', web_app: { url: origin + '/' } }]] };
  await tg(env, 'sendMessage', { chat_id: chat, text: text.startsWith('/help') ? HELP : WELCOME, parse_mode: 'HTML', reply_markup: button, link_preview_options: { is_disabled: true } });
}

async function onPreCheckout(env, q) {
  const [uid, product] = (q.invoice_payload || '').split('|');
  const p = RULES.PRODUCTS[product];
  const ok = !!p && q.currency === 'XTR' && q.total_amount === p.stars && Number(uid) === q.from.id;
  await tg(env, 'answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: 'This offer changed. Open Galaxyme and try again.' });
}

// ---------------- api ----------------
async function api(req, env, url, ctx) {
  const path = url.pathname.slice(4);
  const stub = chainStub(env);

  if (path === '/network' && req.method === 'GET') {
    const user = await checkInitData(req.headers.get('x-init-data'), env.BOT_TOKEN);
    return json(await stub.network(user ? user.id : null));
  }
  if (path === '/chain' && req.method === 'GET') {
    const from = Math.max(0, Number(url.searchParams.get('from')) || 0);
    return json(await stub.chain(from, 1000));
  }

  const user = await checkInitData(req.headers.get('x-init-data'), env.BOT_TOKEN);
  if (!user) return json({ error: 'auth' }, 401);
  const uid = user.id, name = displayName(user);
  ctx.waitUntil(stub.setAppUrl(url.origin + '/'));
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

  if (path === '/me') {
    const me = await stub.me(uid, name);
    const bot = await getBotUsername(env);
    return json({ me, channel: env.CHANNEL || null, refLink: bot ? `https://t.me/${bot}?start=r${uid}` : null });
  }
  if (path === '/session/start') {
    const me = await stub.me(uid, name);
    let member = true;
    if (env.CHANNEL && me.memberUntil < Math.floor(Date.now() / 1000)) {
      const m = await isMember(env, uid);
      if (m === true) await stub.setMember(uid, Math.floor(Date.now() / 1000) + 6 * 3600);
      if (m === null) return json({ error: 'gate_unavailable', me }); // bot isn't an admin of the channel yet
      member = m;
    }
    return json(await stub.startSession(uid, name, member));
  }
  if (path === '/share') return json(await stub.submitShare(uid, body.job, body.nonce));
  if (path === '/boost/reset') return json(await stub.useReset(uid));
  if (path === '/invoice') {
    const p = RULES.PRODUCTS[body.product];
    if (!p) return json({ error: 'unknown_product' }, 400);
    const r = await tg(env, 'createInvoiceLink', {
      title: p.title, description: `Cut your Galaxyme rest time so you can mine again sooner.`,
      payload: `${uid}|${body.product}|${crypto.randomUUID().slice(0, 8)}`, currency: 'XTR', prices: [{ label: p.title, amount: p.stars }],
    });
    return r.ok ? json({ link: r.result }) : json({ error: 'invoice_failed' }, 502);
  }
  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/tg') {
      if (req.method !== 'POST' || !env.BOT_TOKEN) return new Response('not found', { status: 404 });
      if (req.headers.get('x-telegram-bot-api-secret-token') !== await webhookSecret(env.BOT_TOKEN)) return new Response('forbidden', { status: 403 });
      const update = await req.json().catch(() => null);
      if (update?.pre_checkout_query) await onPreCheckout(env, update.pre_checkout_query);
      else if (update?.message?.chat?.type === 'private') {
        if (update.message.successful_payment) await onBotMessage(env, url.origin, update.message, ctx); // must finish before we answer
        else ctx.waitUntil(onBotMessage(env, url.origin, update.message, ctx));
      }
      return new Response('ok');
    }
    if (url.pathname.startsWith('/api/')) return api(req, env, url, ctx);
    if (url.pathname === '/health') return new Response('ok');
    return env.ASSETS.fetch(req);
  },
};
