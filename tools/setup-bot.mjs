// Points the Telegram bot at the deployed Worker: webhook, menu button, commands and profile text.
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const { CLOUDFLARE_API_TOKEN: cf, CLOUDFLARE_ACCOUNT_ID: acc, TG_BOT_TOKEN: bot } = process.env;
if (!bot) { console.error('TG_BOT_TOKEN secret is missing'); process.exit(1); }

const sub = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/workers/subdomain`, { headers: { authorization: `Bearer ${cf}` } }).then(r => r.json());
if (!sub.success) { console.error('Could not read the workers.dev subdomain', JSON.stringify(sub.errors)); process.exit(1); }
const origin = `https://galaxyme.${sub.result.subdomain}.workers.dev`;
const secret = createHash('sha256').update('galaxyme-webhook:' + bot).digest('hex').slice(0, 48);

const call = async (method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${bot}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  console.log(`${method}: ${r.ok ? 'ok' : 'FAILED ' + r.description}`);
  return r.ok;
};

// the Worker needs a moment after deploy before Telegram can reach it
for (let i = 0; i < 10; i++) { const ok = await fetch(origin + '/health').then(r => r.ok).catch(() => false); if (ok) break; await new Promise(r => setTimeout(r, 3000)); }

const results = [
  await call('setWebhook', { url: origin + '/tg', secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true }),
  await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Open Galaxyme', web_app: { url: origin + '/' } } }),
  await call('setMyCommands', { commands: [{ command: 'start', description: 'Open Galaxyme' }, { command: 'help', description: 'How mining and stars work' }] }),
  await call('setMyShortDescription', { short_description: 'Mine blocks on your phone. Every block you find becomes a star.' }),
  await call('setMyDescription', { description: 'Galaxyme is a proof-of-work chain you mine inside Telegram. Every block becomes a unique star, and its rarity comes straight from the block hash. Black holes are about 1 in 1,024.' }),
  await call('setMyName', { name: 'Galaxyme' }),
];
const info = await fetch(`https://api.telegram.org/bot${bot}/getMe`).then(r => r.json());
const summary = `### Galaxyme is live\n\n- Mini App: ${origin}/\n- Bot: @${info.result?.username}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
// setMyName is rate limited by Telegram, so it alone is allowed to fail
if (!results.slice(0, 3).every(Boolean)) process.exit(1);
