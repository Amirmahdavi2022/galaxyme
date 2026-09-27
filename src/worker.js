// Serves the Mini App from ./public and answers the Telegram bot on /tg.
// BOT_TOKEN is a Worker secret. The webhook secret is derived from it, so there is only one secret to manage.

async function webhookSecret(token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('galaxyme-webhook:' + token));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

const WELCOME = [
  '<b>Welcome to Galaxyme</b> ✦',
  '',
  'Your phone mines real blocks here. Every block you find turns into a star, and nobody can fake how rare it is because it comes straight from the block hash.',
  '',
  'Most blocks give a normal star. Some give giants or binary systems. About 1 in 1,024 collapses into a black hole.',
  '',
  'Tap the button, then tap the core to start mining.',
].join('\n');

const HELP = [
  '<b>How it works</b>',
  '',
  '• Tap the glowing core to mine. Keep the app open while it runs.',
  '• Each block you find becomes a star in your galaxy and pays Stardust.',
  '• Star class comes from how far below the target your hash lands. Rarer hashes, rarer stars.',
  '• The Chain tab can re-hash the whole chain on your phone to prove nothing was edited.',
  '',
  'Right now this is a testnet, so every phone runs its own chain.',
].join('\n');

async function onMessage(env, origin, msg) {
  const text = (msg.text || '').trim();
  const button = { inline_keyboard: [[{ text: 'Open Galaxyme', web_app: { url: origin + '/' } }]] };
  const body = text.startsWith('/help') ? HELP : WELCOME;
  await tg(env, 'sendMessage', { chat_id: msg.chat.id, text: body, parse_mode: 'HTML', reply_markup: button, link_preview_options: { is_disabled: true } });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/tg') {
      if (req.method !== 'POST' || !env.BOT_TOKEN) return new Response('not found', { status: 404 });
      const expected = await webhookSecret(env.BOT_TOKEN);
      if (req.headers.get('x-telegram-bot-api-secret-token') !== expected) return new Response('forbidden', { status: 403 });
      const update = await req.json().catch(() => null);
      if (update && update.message && update.message.chat && update.message.chat.type === 'private') {
        ctx.waitUntil(onMessage(env, url.origin, update.message));
      }
      return new Response('ok');
    }
    if (url.pathname === '/health') return new Response('ok');
    return env.ASSETS.fetch(req);
  },
};
