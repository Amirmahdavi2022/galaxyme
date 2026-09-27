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
  await call('setWebhook', { url: origin + '/tg', secret_token: secret, allowed_updates: ['message', 'pre_checkout_query'], drop_pending_updates: true }),
  await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Open Galaxyme', web_app: { url: origin + '/' } } }),
  await call('setMyCommands', { commands: [{ command: 'start', description: 'Open Galaxyme' }, { command: 'help', description: 'How mining, sessions and rewards work' }] }),
  await call('setMyShortDescription', { short_description: 'Mine blocks on your phone. Every block you find becomes a star.' }),
  await call('setMyDescription', { description: 'Galaxyme is one shared proof-of-work chain everyone mines from Telegram. Every block becomes a star in the same galaxy, its rarity comes straight from the block hash, and the Stardust is split between everyone who mined it.' }),
  await call('setMyName', { name: 'Galaxyme' }),
];
const info = await fetch(`https://api.telegram.org/bot${bot}/getMe`).then(r => r.json());
// report whether the bot can check channel membership (it has to be an admin there)
const channel = (await import('node:fs')).readFileSync('wrangler.toml', 'utf8').match(/CHANNEL\s*=\s*"([^"]*)"/)?.[1];
if (channel) {
  const me = await fetch(`https://api.telegram.org/bot${bot}/getChatMember`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: channel, user_id: Number(bot.split(':')[0]) }) }).then(r => r.json());
  const st = me.ok ? me.result.status : 'unreachable: ' + me.description;
  console.log(st === 'administrator' ? `::notice::Bot is admin of ${channel}, membership gate is on` : `::warning::Bot is not an admin of ${channel} (${st}). Mining stays locked until it is.`);
}
console.log(`::notice::Mini App ${origin}/`);
const summary = `### Galaxyme is live\n\n- Mini App: ${origin}/\n- Bot: @${info.result?.username}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
// setMyName is rate limited by Telegram, so it alone is allowed to fail
if (!results.slice(0, 3).every(Boolean)) process.exit(1);
